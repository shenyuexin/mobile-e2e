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

  const isSuccessfulBackResult = (result: Awaited<ReturnType<McpToolInterface["navigateBack"]>>): boolean => {
    if (result.status !== "success" && result.status !== "partial") {
      return false;
    }

    const data = (result.data ?? {}) as unknown as Record<string, unknown>;
    if (data.stateChanged === false) {
      return false;
    }

    if (data.pageTreeHashUnchanged === true) {
      return false;
    }

    return true;
  };

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
      const candidateTitles = parentTitle && parentTitle !== "Back"
        ? ["Back", parentTitle]
        : [parentTitle];

      const waitForSettle = async (): Promise<boolean> => {
        const settleResult = await mcp.waitForUiStable({ timeoutMs: 3000 });
        return settleResult.status === "success" || settleResult.status === "partial";
      };

      for (const candidateTitle of candidateTitles) {
        const result = await mcp.navigateBack({ parentPageTitle: candidateTitle });
        if (!isSuccessfulBackResult(result)) {
          continue;
        }

        if (!(await waitForSettle())) {
          return false;
        }

        return true;
      }

      // Some iOS Settings pages expose a generic "Back" button that works with
      // tap_element but not via navigate_back selector routing.
      const genericBackTap = await mcp.tapElement({ contentDesc: "Back" });
      if (genericBackTap.status === "success" || genericBackTap.status === "partial") {
        return waitForSettle();
      }

      return false;
    },

    /**
     * Validate that we're on the expected page after backtracking.
     *
     * Uses a multi-tier approach for robust validation:
     * 1. Exact screenId match (fast path, text-based)
     * 2. Screen title + structural hash match (stable, ignores dynamic text)
     * 3. Structural hash alone (fallback for pages without titles)
     *
     * SPEC §4.1 — prevents infinite loops from failed backtracking.
     * iOS fix: iOS Settings pages often have dynamic text (timestamps, loading),
     * so structural hash is more reliable for page identity.
     */
    async isOnExpectedPage(
      expectedScreenId: string,
      expectedScreenTitle?: string,
      expectedStructureHash?: string,
    ): Promise<boolean> {
      const inspectResult = await mcp.inspectUi();
      if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
        return false;
      }

      const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
      if (!uiTree) return false;

      const currentScreenId = generateScreenId(uiTree);

      // Tier 1: exact text-based match (fast path)
      if (currentScreenId === expectedScreenId) return true;

      // Tier 2: screen title + structural hash (stable for pages with dynamic text)
      if (expectedScreenTitle && expectedStructureHash) {
        const currentTitle = extractScreenTitleFromUiTree(uiTree);
        const currentStructure = hashUiStructure(uiTree);
        if (currentTitle === expectedScreenTitle && currentStructure === expectedStructureHash) {
          return true;
        }
      }

      // Tier 3: structural hash alone (fallback)
      if (expectedStructureHash) {
        const currentStructure = hashUiStructure(uiTree);
        if (currentStructure === expectedStructureHash) {
          return true;
        }
      }

      // Tier 4: normalized title-only fallback (for dynamic pages where hashes drift)
      if (expectedScreenTitle) {
        const currentTitle = extractScreenTitleFromUiTree(uiTree);
        if (
          currentTitle &&
          normalizeTitle(currentTitle) === normalizeTitle(expectedScreenTitle)
        ) {
          return true;
        }
      }

      return false;
    },
  };
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Extract screen title from UI tree (mirrors snapshot.ts extractScreenTitle).
 */
function extractScreenTitleFromUiTree(uiTree: UiHierarchy): string | undefined {
  function flatten(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
    result.push(node);
    if (node.children) {
      for (const child of node.children) {
        flatten(child, result);
      }
    }
    return result;
  }
  
  const allElements = flatten(uiTree);
  
  // Priority 1: First Heading
  for (const el of allElements) {
    if (el.className === "Heading" || el.elementType === "Heading") {
      const label = el.contentDesc || el.text || el.accessibilityLabel;
      if (label && label.length > 0) return label;
    }
  }
  
  // Priority 2: First substantial StaticText
  for (const el of allElements) {
    if (el.className === "StaticText" || el.elementType === "StaticText") {
      const label = el.contentDesc || el.text || el.accessibilityLabel;
      if (label && label.length > 2 && label.length < 50) {
        return label.split(" ").slice(0, 3).join(" ");
      }
    }
  }
  
  return undefined;
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
