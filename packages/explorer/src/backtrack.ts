/**
 * Backtracking — navigate back to the parent page.
 *
 * Uses MCP `navigate_back` tool with verification via page-change validation.
 * SPEC §4.1 — page change validation after each back to prevent infinite loops.
 * Accuracy target: >=95% across >=30 operations.
 */

import type { McpToolInterface, UiHierarchy, PageState } from "./types.js";
import { generateScreenId } from "./snapshot.js";
import { hashUiStructure } from "./page-registry.js";

/**
 * Create a backtracker bound to the given MCP tool interface.
 */
export function createBacktracker(mcp: McpToolInterface) {
  // Cache of known screenId -> structureHash mappings
  const knownPages = new Map<string, string>();

  return {
    /**
     * Register a page's structure hash for later fuzzy matching.
     */
    registerPage(screenId: string, uiTree: UiHierarchy): void {
      knownPages.set(screenId, hashUiStructure(uiTree));
    },

    /**
     * Navigate back to the parent page.
     *
     * @param parentTitle — title of the parent page (used as iOS back button text)
     * @returns true if back navigation succeeded and UI stabilized.
     */
    async navigateBack(parentTitle?: string): Promise<boolean> {
      const result = await mcp.navigateBack({ parentPageTitle: parentTitle });
      if (result.status !== "success" && result.status !== "partial") {
        return false;
      }

      // Wait for UI to stabilize after back navigation
      const settleResult = await mcp.waitForUiStable({ timeoutMs: 5000 });
      if (settleResult.status !== "success" && settleResult.status !== "partial") {
        return false;
      }

      return true;
    },

    /**
     * Validate that we're on the expected page after backtracking.
     *
     * Uses a two-tier approach:
     * 1. Exact screenId match (fast path)
     * 2. Structural hash match against registered pages (fuzzy fallback)
     *
     * SPEC §4.1 — prevents infinite loops from failed backtracking.
     */
    async isOnExpectedPage(
      expectedScreenId: string,
    ): Promise<boolean> {
      const inspectResult = await mcp.inspectUi();
      if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
        return false;
      }

      const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
      if (!uiTree) return false;

      const currentScreenId = generateScreenId(uiTree);

      // Fast path: exact match
      if (currentScreenId === expectedScreenId) return true;

      // Fuzzy fallback: compare structure hashes
      const expectedStructure = knownPages.get(expectedScreenId);
      if (expectedStructure) {
        const currentStructure = hashUiStructure(uiTree);
        return currentStructure === expectedStructure;
      }

      return false;
    },
  };
}

/**
 * Parse UI tree from inspect_ui result data.
 * Mirrors the logic in snapshot.ts but kept separate to avoid circular deps.
 */
function parseUiTreeFromInspectResult(
  data: Record<string, unknown>,
): UiHierarchy | null {
  if (typeof data.content === "string") {
    try {
      const parsed = JSON.parse(data.content);
      return normalizeParsedContent(parsed);
    } catch {
      return null;
    }
  }
  if (typeof data.content === "object" && data.content !== null) {
    return normalizeParsedContent(data.content);
  }
  return null;
}

/**
 * Normalize parsed JSON content from inspect_ui.
 * Handles both array (axe output) and object (Android output) formats.
 * Mirrors snapshot.ts normalizeParsedContent.
 */
function normalizeParsedContent(content: unknown): UiHierarchy {
  // axe (iOS) returns an array of root nodes
  if (Array.isArray(content)) {
    // Wrap array in a synthetic root node
    return {
      className: "Root",
      clickable: false,
      enabled: true,
      scrollable: false,
      children: content
        .filter((c) => typeof c === "object" && c !== null)
        .map((c) => normalizeToUiHierarchy(c as Record<string, unknown>)),
    };
  }

  // Android returns a single object
  if (typeof content === "object" && content !== null) {
    return normalizeToUiHierarchy(content as Record<string, unknown>);
  }

  // Fallback
  return {
    className: "Root",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [],
  };
}

/**
 * Normalize a raw UI tree object to our UiHierarchy interface.
 * Mirrors snapshot.ts normalizeToUiHierarchy.
 */
function normalizeToUiHierarchy(
  node: Record<string, unknown>,
): UiHierarchy {
  const children = Array.isArray(node.children)
    ? node.children
        .filter((c) => typeof c === "object" && c !== null)
        .map((c) => normalizeToUiHierarchy(c as Record<string, unknown>))
    : [];

  const className =
    typeof node.className === "string" ? node.className :
    typeof node.type === "string" ? node.type :
    typeof node.role === "string" ? node.role :
    undefined;

  const text =
    typeof node.text === "string" ? node.text :
    typeof node.AXLabel === "string" ? node.AXLabel :
    typeof node.AXValue === "string" ? node.AXValue :
    undefined;

  const contentDesc =
    typeof node.contentDesc === "string" ? node.contentDesc :
    typeof node.AXUniqueId === "string" ? node.AXUniqueId :
    undefined;

  return {
    text,
    className,
    contentDesc,
    clickable: node.clickable === true,
    enabled: node.enabled !== false,
    scrollable: node.scrollable === true,
    children,
    accessibilityLabel:
      typeof node.accessibilityLabel === "string" ? node.accessibilityLabel :
      typeof node.AXLabel === "string" ? node.AXLabel :
      undefined,
    accessibilityRole:
      typeof node.accessibilityRole === "string" ? node.accessibilityRole :
      typeof node.role === "string" ? node.role :
      undefined,
    visibleTexts:
      typeof node.text === "string" ? [node.text] :
      Array.isArray(node.visibleTexts) ? node.visibleTexts as string[] :
      undefined,
    AXUniqueId: typeof node.AXUniqueId === "string" ? node.AXUniqueId : undefined,
    AXValue: typeof node.AXValue === "string" ? node.AXValue : undefined,
    elementType: typeof node.elementType === "string" ? node.elementType : className,
  };
}
