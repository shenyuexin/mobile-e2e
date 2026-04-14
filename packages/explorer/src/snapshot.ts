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
import { hashVisibleTexts } from "./page-registry.js";
import { unwrapResult } from "./mcp-adapter.js";

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
      const uiTree = parseUiTree(inspectData);

      // Take screenshot
      const screenshotResult = await mcp.takeScreenshot();
      const screenshotPath =
        screenshotResult.status === "success" || screenshotResult.status === "partial"
          ? getScreenshotPath(screenshotResult.data as unknown as Record<string, unknown>)
          : `${DEFAULT_SCREENSHOT_DIR}/screenshot-${Date.now()}.png`;

      // Find clickable elements (needs config for destructive filtering)
      const clickableElements = findClickableElements(uiTree, config);

      // Extract app identity from UI tree (for app switching detection)
      const appId = extractAppId(uiTree) ?? config.appId;
      // Note: isExternalApp is determined in the engine by comparing
      // against the initial page's appId, NOT config.appId.
      // This is because iOS uses AXLabel (display name) not bundle ID.
      const isExternalApp = false; // Engine will override based on targetAppId comparison

      return {
        screenId: generateScreenId(uiTree),
        screenTitle: extractScreenTitle(uiTree),
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
        isExternalApp,
      };
    },

    /** Expose mcp for isOnExpectedPage check in engine. */
    mcp,
  };
}

/**
 * Parse the UI tree from inspect_ui result data.
 * The content field may be a JSON string or already-parsed object.
 */
function parseUiTree(data: Record<string, unknown>): UiHierarchy {
  // If content is a JSON string, parse it
  if (typeof data.content === "string") {
    try {
      const parsed = JSON.parse(data.content);
      return normalizeParsedContent(parsed);
    } catch {
      // Fall through to wrapper
    }
  }

  // If content is already parsed, normalize it
  if (data.content !== undefined && data.content !== null) {
    return normalizeParsedContent(data.content);
  }

  // Fallback: wrap the entire data as a root node
  return {
    className: "Root",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [],
    ...data,
  } as UiHierarchy;
}

/**
 * Normalize parsed JSON content from inspect_ui.
 * Handles both array (axe output) and object (Android output) formats.
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
 * Handles both iOS (AX*) and Android (bounds, contentDesc) naming conventions.
 */
function normalizeToUiHierarchy(
  node: Record<string, unknown>,
): UiHierarchy {
  const children = Array.isArray(node.children)
    ? node.children
        .filter((c) => typeof c === "object" && c !== null)
        .map((c) => normalizeToUiHierarchy(c as Record<string, unknown>))
    : [];

  // Parse bounds string "[x1,y1][x2,y2]" or iOS AXFrame "{{x,y},{w,h}}"
  let frame: UiHierarchy["frame"];
  if (typeof node.bounds === "string") {
    const match = node.bounds.match(/\[([\d.]+),([\d.]+)\]\[([\d.]+),([\d.]+)\]/);
    if (match) {
      frame = {
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        width: parseFloat(match[3]) - parseFloat(match[1]),
        height: parseFloat(match[4]) - parseFloat(match[2]),
      };
    }
  }

  // iOS axe backend uses AXFrame: "{{x,y},{w,h}}"
  if (!frame && typeof node.AXFrame === "string") {
    const match = node.AXFrame.match(/\{\{([\d.]+),([\d.]+)\},\{([\d.]+),([\d.]+)\}\}/);
    if (match) {
      frame = {
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        width: parseFloat(match[3]),
        height: parseFloat(match[4]),
      };
    }
  }

  // Also use nested frame object if present (axe provides both AXFrame and frame)
  if (!frame && typeof node.frame === "object" && node.frame !== null) {
    const f = node.frame as Record<string, unknown>;
    frame = {
      x: typeof f.x === "number" ? f.x : 0,
      y: typeof f.y === "number" ? f.y : 0,
      width: typeof f.width === "number" ? f.width : 0,
      height: typeof f.height === "number" ? f.height : 0,
    };
  }

  // iOS axe field mapping: type -> className, AXLabel -> text/accessibilityLabel
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

  // iOS: enabled is usually true, clickable inferred from role/type
  const isButtonLike =
    className?.includes("Button") ||
    className?.includes("Link") ||
    className?.includes("Cell") ||
    className?.includes("Image") ||
    node.role === "AXButton" ||
    node.role === "AXLink" ||
    node.role === "AXStaticText";

  // axe doesn't set clickable — infer from role/type
  const clickable =
    node.clickable === true ||
    isButtonLike ||
    className?.includes("TextField") ||
    node.role === "AXTextField";

  return {
    index: typeof node.index === "number" ? node.index : undefined,
    depth: typeof node.depth === "number" ? node.depth : undefined,
    text,
    resourceId: typeof node.resourceId === "string" ? node.resourceId : undefined,
    className,
    packageName: typeof node.packageName === "string" ? node.packageName : undefined,
    contentDesc,
    clickable,
    enabled: node.enabled !== false,
    scrollable: node.scrollable === true,
    bounds: typeof node.bounds === "string" ? node.bounds : undefined,
    frame,
    children,
    accessibilityLabel:
      typeof node.accessibilityLabel === "string" ? node.accessibilityLabel :
      typeof node.AXLabel === "string" ? node.AXLabel :
      undefined,
    accessibilityTraits: Array.isArray(node.accessibilityTraits)
      ? node.accessibilityTraits as string[]
      : undefined,
    accessibilityRole:
      typeof node.accessibilityRole === "string" ? node.accessibilityRole :
      typeof node.role === "string" ? node.role :
      typeof node.role_description === "string" ? node.role_description :
      undefined,
    visibleTexts:
      typeof node.text === "string" ? [node.text] : Array.isArray(node.visibleTexts)
        ? node.visibleTexts as string[]
        : undefined,
    AXUniqueId: typeof node.AXUniqueId === "string" ? node.AXUniqueId : undefined,
    AXValue: typeof node.AXValue === "string" ? node.AXValue : undefined,
    elementType: typeof node.elementType === "string" ? node.elementType : (typeof node.className === "string" ? node.className : undefined),
    label: typeof node.label === "string" ? node.label : (typeof node.contentDesc === "string" ? node.contentDesc : undefined),
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

/**
 * Extract a human-readable screen title from the UI tree.
 *
 * Priority: first Heading element > first prominent text > first 3 words.
 *
 * iOS 26.0 spike: section headings are `Heading` type with UPPERCASE text.
 */
export function extractScreenTitle(uiTree: UiHierarchy): string | undefined {
  const allElements = flattenTreeFast(uiTree);

  // Priority 1: First Heading element (section title)
  for (const el of allElements) {
    if (el.className === "Heading" || el.elementType === "Heading") {
      const label = el.contentDesc || el.text || el.accessibilityLabel;
      if (label && label.length > 0) {
        return label;
      }
    }
  }

  // Priority 2: First StaticText with substantial content
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

/** Fast tree flattening for title extraction. */
function flattenTreeFast(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
  result.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTreeFast(child, result);
    }
  }
  return result;
}

/**
 * Extract the bundle ID / app identifier from the UI tree.
 * 
 * iOS axe backend provides:
 * - `AXLabel`: app display name ("Settings", "Safari")
 * - `pid`: process ID (unique per app process)
 * 
 * Android axe backend provides:
 * - `packageName`: bundle ID ("com.android.settings")
 * 
 * Strategy:
 * 1. Prefer packageName/bundleIdentifier (Android)
 * 2. For iOS, use AXLabel as app display name
 * 3. Always include pid for precise process-level identity
 * 
 * Returns the extracted app identifier, or undefined if not found.
 */
export function extractAppId(uiTree: UiHierarchy): string | undefined {
  // Root node should be an Application or similar top-level element
  const allElements = flattenTreeFast(uiTree);

  // Find the Application node (usually the first or root element)
  for (const el of allElements) {
    if (el.className === "Application" || el.elementType === "Application") {
      // Android: packageName
      const packageName = el.packageName
        || (el as any).bundleIdentifier
        || (el as any).bundleId
        || (el as any).bundle;

      // iOS: AXLabel is normalized to accessibilityLabel by normalizeToUiHierarchy
      const axLabel = el.accessibilityLabel;

      // Process ID (unique per app process, works on both iOS and Android)
      const pid = (el as any).pid;

      // Build composite app ID: prefer package name, fallback to AXLabel, then pid
      const appId = packageName || axLabel || (pid ? `pid:${pid}` : undefined);

      return appId;
    }
  }

  return undefined;
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
