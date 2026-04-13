/**
 * Backtracking — navigate back to the parent page.
 *
 * Uses MCP `navigate_back` tool with verification via page-change validation.
 * SPEC §4.1 — page change validation after each back to prevent infinite loops.
 * Accuracy target: >=95% across >=30 operations.
 */

import type { McpToolInterface, UiHierarchy, PageState } from "./types.js";
import { generateScreenId } from "./snapshot.js";

/**
 * Create a backtracker bound to the given MCP tool interface.
 */
export function createBacktracker(mcp: McpToolInterface) {
  return {
    /**
     * Navigate back to the parent page.
     *
     * Returns true if back navigation succeeded and UI stabilized.
     * Does NOT verify page change — the engine validates via screenId comparison.
     */
    async navigateBack(): Promise<boolean> {
      const result = await mcp.navigateBack();
      if (result.status !== "success" && result.status !== "partial") {
        return false;
      }

      // Wait for UI to stabilize after back navigation
      // Timing baseline: wait_for_ui_stable takes ~1.4s on iOS 26.0
      const settleResult = await mcp.waitForUiStable({ timeoutMs: 5000 });
      if (settleResult.status !== "success" && settleResult.status !== "partial") {
        return false;
      }

      return true;
    },

    /**
     * Validate that we're on the expected page after backtracking.
     *
     * Compares the current screen ID with the expected one.
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
      return currentScreenId === expectedScreenId;
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
      return JSON.parse(data.content) as UiHierarchy;
    } catch {
      return null;
    }
  }
  if (typeof data.content === "object" && data.content !== null) {
    return data.content as UiHierarchy;
  }
  return null;
}
