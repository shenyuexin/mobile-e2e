/**
 * Snapshot collection and tap execution.
 *
 * captureSnapshot() — captures a PageSnapshot from the current device state.
 * tapAndWait() — taps an element and waits for UI stabilization.
 *
 * SPEC §4.2 — captureSnapshot(config) signature matches findClickableElements' config dependency.
 * R5-B fix: tapAndWait does NOT return nextState — engine captures a new snapshot after tap.
 */

import type {
  PageSnapshot,
  ExplorerConfig,
  ClickableTarget,
  UiHierarchy,
  McpToolInterface,
} from "./types.js";
import { findClickableElements } from "./element-prioritizer.js";
import { resolveExplorerPlatformHooks } from "./explorer-platform.js";
import { hashVisibleTexts } from "./page-registry.js";

// ---------------------------------------------------------------------------
// Snapshot capture
// ---------------------------------------------------------------------------

/** Default path for storing screenshots. */
const DEFAULT_SCREENSHOT_DIR = "./explorer-screenshots";

/**
 * Create a snapshotter bound to the given MCP tool interface.
 */
export function createSnapshotter(mcp: McpToolInterface) {
  return {
    /**
     * Capture a snapshot of the current screen state.
     *
     * SPEC §4.2 — requires config for destructive element filtering in findClickableElements.
     */
    async captureSnapshot(config: ExplorerConfig): Promise<PageSnapshot> {
      const tapStart = Date.now();

      // Inspect UI — unwrap ToolResult at the boundary
      const inspectResult = await mcp.inspectUi();
      if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
        throw new Error(
          `inspect_ui failed: ${inspectResult.reasonCode}: ${inspectResult.nextSuggestions?.join("; ")}`,
        );
      }

      // The content field contains the raw UI tree as JSON string or the structured data
      const inspectData = inspectResult.data as unknown as Record<string, unknown>;
      const platformHooks = resolveExplorerPlatformHooks(config.platform);
      const uiTree = platformHooks.parseInspectUi(inspectData, { fallbackToDataRoot: true }) as UiHierarchy;
      const pageContext = typeof inspectData.pageContext === "object" && inspectData.pageContext !== null
        ? inspectData.pageContext
        : undefined;

      // Take screenshot
      const screenshotResult = await mcp.takeScreenshot();
      const screenshotPath =
        screenshotResult.status === "success" || screenshotResult.status === "partial"
          ? getScreenshotPath(screenshotResult.data as unknown as Record<string, unknown>)
          : `${DEFAULT_SCREENSHOT_DIR}/screenshot-${Date.now()}.png`;

      // Find clickable elements (needs config for destructive filtering)
      const clickableElements = findClickableElements(uiTree, config);

      // Extract app identity from UI tree (for app switching detection)
      const appId = platformHooks.extractAppId(uiTree) ?? config.appId;
      // Note: isExternalApp is determined in the engine by comparing
      // against the initial page's appId, NOT config.appId.
      // This is because iOS uses AXLabel (display name) not bundle ID.
      const isExternalApp = false; // Engine will override based on targetAppId comparison

      return {
        screenId: generateScreenId(uiTree),
        screenTitle: platformHooks.extractScreenTitle(uiTree),
        uiTree,
        clickableElements,
        screenshotPath,
        capturedAt: new Date().toISOString(),
        arrivedFrom: null,
        viaElement: null,
        depth: 0,
        loadTimeMs: Date.now() - tapStart,
        stabilityScore: 1.0,
        appId,
        pageContext: pageContext as PageSnapshot["pageContext"],
        isExternalApp,
      };
    },

    /** Expose mcp for isOnExpectedPage check in engine. */
    mcp,
  };
}

/**
 * Get screenshot path from the MCP tool result data.
 */
function getScreenshotPath(data: Record<string, unknown>): string {
  if (typeof data.outputPath === "string") {
    return data.outputPath;
  }
  return `${DEFAULT_SCREENSHOT_DIR}/screenshot-${Date.now()}.png`;
}

/**
 * Generate a unique screen ID from the UI tree.
 * Uses the visible text content hash as the identity.
 */
export function generateScreenId(uiTree: UiHierarchy): string {
  return hashVisibleTexts(uiTree);
}

// ---------------------------------------------------------------------------
// Tap execution
// ---------------------------------------------------------------------------

/**
 * Result of a tap-and-wait operation.
 * R5-B fix: does NOT include nextState — engine captures snapshot after tap.
 */
export type TapResult =
  | { success: true; loadTimeMs: number }
  | { success: false; error: Error };

/**
 * Create a tap executor bound to the given MCP tool interface.
 */
export function createTapExecutor(mcp: McpToolInterface) {
  return {
    /**
     * Tap an element and wait for UI stabilization.
     *
     * Returns { success: true; loadTimeMs } or { success: false; error }.
     * Does NOT return nextState — the engine captures a new snapshot instead.
     */
    async tapAndWait(
      element: ClickableTarget,
      overallTimeoutMs: number,
    ): Promise<TapResult> {
      const tapStart = Date.now();

      try {
        // Build the query for tap_element
        const selector = element.selector;
        const tapArgs: Record<string, unknown> = {};
        // resourceId is supported on both iOS (AXUniqueId) and Android
        if (selector.resourceId) {
          tapArgs.resourceId = selector.resourceId;
        }
        // contentDesc maps to accessibilityLabel on iOS, content-desc on Android
        if (selector.contentDesc) {
          tapArgs.contentDesc = selector.contentDesc;
        }
        if (selector.text) {
          tapArgs.text = selector.text;
        }
        if (selector.elementType) {
          tapArgs.className = selector.elementType;
        }
        if (selector.position) {
          // Position-based tap — not directly supported by tap_element
          // but we can try with text/className fallback
        }

        // If we have no usable selector, fail early
        if (Object.keys(tapArgs).length === 0) {
          return {
            success: false,
            error: new Error(`TAP_FAILED: no usable selector for ${element.label}`),
          };
        }

        const tapResult = await mcp.tapElement(tapArgs);
        if (tapResult.status !== "success" && tapResult.status !== "partial") {
          return {
            success: false,
            error: new Error(
              `TAP_FAILED: ${tapResult.reasonCode}: ${element.label}`,
            ),
          };
        }

        // Wait for UI to stabilize after the tap
        // Timing baseline: wait_for_ui_stable takes ~1.4s on iOS 26.0
        const settleTimeoutMs = Math.min(
          5000,
          Math.max(0, overallTimeoutMs - (Date.now() - tapStart)),
        );

        if (settleTimeoutMs <= 0) {
          return {
            success: false,
            error: new Error(`TIMEOUT: no time left for UI stabilization after tapping ${element.label}`),
          };
        }

        const stableResult = await mcp.waitForUiStable({ timeoutMs: settleTimeoutMs });
        if (stableResult.status !== "success" && stableResult.status !== "partial") {
          return {
            success: false,
            error: new Error(
              `TIMEOUT: UI did not stabilize after tapping ${element.label}`,
            ),
          };
        }

        return { success: true, loadTimeMs: Date.now() - tapStart };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    },
  };
}
