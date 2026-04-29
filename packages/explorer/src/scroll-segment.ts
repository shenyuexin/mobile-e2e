/**
 * Scroll-segment helpers for progressive scroll-aware DFS.
 *
 * This module is a pure helper called by the engine; it does not push/pop
 * frames or register state graph transitions.
 */

import { findClickableElements, flattenTree, prioritizeElements } from "./element-prioritizer.js";
import { resolveExplorerPlatformHooks } from "./explorer-platform.js";
import type { ClickableTarget, ExplorerConfig, Frame, McpToolInterface, PageSnapshot, UiHierarchy } from "./types.js";

const SIDE_EFFECT_PATTERNS = [
  /delete/i,
  /remove/i,
  /erase/i,
  /reset/i,
  /factory reset/i,
  /sign out/i,
  /logout/i,
  /turn off/i,
  /disable/i,
  /disconnect/i,
  /forget/i,
  /unsubscribe/i,
  /cancel plan/i,
  /deactivate/i,
  /pay/i,
  /purchase/i,
  /buy/i,
  /submit/i,
  /confirm/i,
  /save/i,
  /apply/i,
  /^ok$/i,
  /^done$/i,
  /^allow$/i,
  /^yes$/i,
];

const NAVIGATION_CONTROL_PATTERNS = [
  /^back$/i,
  /^cancel$/i,
  /^close$/i,
  /^done$/i,
  /^ok$/i,
  /^not now$/i,
  /^later$/i,
  /^skip$/i,
  /^dismiss$/i,
  /^x$/i,
  /^✕$/i,
  /^×$/i,
  /^xmark$/i,
];

function getClickableTargetKey(target: ClickableTarget): string {
  const semanticParts = [...new Set([
    target.selector.contentDesc,
    target.selector.text,
    target.label,
  ].filter(Boolean))];

  if (semanticParts.length > 0) {
    return semanticParts.join("|");
  }

  return [
    target.selector.resourceId,
  ]
    .filter(Boolean)
    .join("|");
}

export interface SegmentDiscoveryResult {
  success: boolean;
  newElements?: ClickableTarget[];
  isLastSegment?: boolean;
}

const DEFAULT_MAX_SEGMENTS = 10;
const DEFAULT_MAX_RESTORE_ATTEMPTS = 3;

function normalizeSegmentValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSideEffectAction(label: string): boolean {
  return SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(label));
}

function isNavigationControlAction(label: string): boolean {
  return NAVIGATION_CONTROL_PATTERNS.some((pattern) => pattern.test(label.trim()));
}

function compareExplorationOrder(a: ClickableTarget, b: ClickableTarget): number {
  const aIsDeferred = isNavigationControlAction(a.label) || isSideEffectAction(a.label);
  const bIsDeferred = isNavigationControlAction(b.label) || isSideEffectAction(b.label);
  if (aIsDeferred === bIsDeferred) return 0;
  return aIsDeferred ? 1 : -1;
}

function shouldSkipElement(
  target: ClickableTarget,
  frame: Frame,
  screenTitle: string | undefined,
  config: ExplorerConfig,
): boolean {
  if (!config.skipElements || config.skipElements.length === 0) {
    return false;
  }

  const normalizedLabel = normalizeSegmentValue(target.label);
  for (const rule of config.skipElements) {
    const { match } = rule;
    if (match.screenTitle && screenTitle) {
      const normalizedScreenTitle = normalizeSegmentValue(screenTitle);
      if (!normalizedScreenTitle.includes(normalizeSegmentValue(match.screenTitle))) {
        continue;
      }
    }

    if (match.pathPrefix && match.pathPrefix.length > 0) {
      if (frame.path.length < match.pathPrefix.length) {
        continue;
      }

      let pathMatches = true;
      for (let index = 0; index < match.pathPrefix.length; index += 1) {
        const framePart = normalizeSegmentValue(frame.path[index]);
        const rulePart = normalizeSegmentValue(match.pathPrefix[index]);
        if (!(framePart === rulePart || framePart.endsWith(`.${rulePart}`) || framePart.includes(rulePart))) {
          pathMatches = false;
          break;
        }
      }
      if (!pathMatches) {
        continue;
      }
    }

    if (match.elementLabel && normalizedLabel.includes(normalizeSegmentValue(match.elementLabel))) {
      return true;
    }

    if (match.elementLabelPattern) {
      try {
        const pattern = new RegExp(match.elementLabelPattern, "i");
        if (pattern.test(target.label)) {
          return true;
        }
      } catch {
        // Ignore invalid user regex and fall through.
      }
    }
  }

  return false;
}

function buildSegmentElements(uiTree: UiHierarchy, frame: Frame, config: ExplorerConfig): ClickableTarget[] {
  return prioritizeElements(findClickableElements(uiTree, config))
    .sort(compareExplorationOrder)
    .filter((target) => !shouldSkipElement(target, frame, frame.state.screenTitle, config));
}

export function computePageFingerprint(snapshot: PageSnapshot): string {
  const type = snapshot.pageContext?.type ?? "unknown";
  const title = snapshot.screenTitle ?? snapshot.screenId ?? "unknown";
  return `${snapshot.appId}::${type}::${title}`;
}

export function initScrollState(
  frame: Frame,
  snapshot: PageSnapshot,
  config: ExplorerConfig,
): void {
  const hasScrollable = flattenTree(snapshot.uiTree).some(n => n.scrollable);
  if (!hasScrollable) {
    return;
  }

  const elements = frame.elements.length > 0
    ? frame.elements
    : buildSegmentElements(snapshot.uiTree, frame, config);
  const seenKeys = new Set(elements.map(getClickableTargetKey).filter(Boolean));

  frame.scrollState = {
    enabled: true,
    segmentIndex: 0,
    segments: [elements],
    seenKeys,
    pageFingerprint: computePageFingerprint(snapshot),
    maxSegments: DEFAULT_MAX_SEGMENTS,
    restoreAttempts: 0,
    maxRestoreAttempts: DEFAULT_MAX_RESTORE_ATTEMPTS,
  };

  console.log(
    `[SCROLL-STATE] Initialized for "${snapshot.screenTitle}" — ` +
    `${elements.length} elements in segment 0, fingerprint=${frame.scrollState.pageFingerprint}`,
  );
}

export function getCurrentSegmentElements(frame: Frame): ClickableTarget[] {
  if (!frame.scrollState || frame.scrollState.segments.length === 0) {
    return frame.elements;
  }
  return frame.scrollState.segments[frame.scrollState.segmentIndex] ?? [];
}

export async function discoverNextSegment(
  mcp: McpToolInterface,
  frame: Frame,
  config: ExplorerConfig,
): Promise<SegmentDiscoveryResult> {
  if (!frame.scrollState?.enabled) {
    return { success: false, isLastSegment: true };
  }

  const ss = frame.scrollState;
  if (ss.segmentIndex + 1 >= ss.maxSegments) {
    console.log(`[SCROLL-SEGMENT] maxSegments (${ss.maxSegments}) reached`);
    return { success: false, isLastSegment: true };
  }

  const platformHooks = resolveExplorerPlatformHooks(config.platform);

  const scrollResult = await mcp.scrollOnly({ direction: "down", distance: "medium" });
  if (scrollResult.status !== "success" && scrollResult.status !== "partial") {
    console.log(`[SCROLL-SEGMENT] scrollOnly failed: ${scrollResult.reasonCode}`);
    return { success: false, isLastSegment: true };
  }

  await mcp.waitForUiStable({ timeoutMs: 3000 });

  const inspectResult = await mcp.inspectUi({ appId: config.appId });
  if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
    return { success: false, isLastSegment: true };
  }

  const inspectData = inspectResult.data as unknown as Record<string, unknown>;
  const uiTree = platformHooks.parseInspectUi(inspectData, { fallbackToDataRoot: true }) as UiHierarchy;

  const pageContext = typeof inspectData.pageContext === "object" && inspectData.pageContext !== null
    ? inspectData.pageContext
    : undefined;
  const appId = platformHooks.extractAppId(uiTree) ?? config.appId;
  const postSnapshot: PageSnapshot = {
    screenId: "",
    screenTitle: platformHooks.extractScreenTitle(uiTree),
    pageContext: pageContext as PageSnapshot["pageContext"],
    uiTree,
    clickableElements: [],
    screenshotPath: "",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: frame.depth,
    loadTimeMs: 0,
    stabilityScore: 1.0,
    appId,
    isExternalApp: false,
  };
  const newFingerprint = computePageFingerprint(postSnapshot);

  if (newFingerprint !== ss.pageFingerprint) {
    console.log(
      `[SCROLL-SEGMENT] Page fingerprint changed: ${ss.pageFingerprint} → ${newFingerprint}. Stopping.`,
    );
    return { success: false, isLastSegment: true };
  }

  const allElements = buildSegmentElements(uiTree, frame, config);
  const newElements = allElements.filter(e => {
    const key = getClickableTargetKey(e);
    return key && !ss.seenKeys.has(key);
  });

  if (newElements.length === 0) {
    console.log(`[SCROLL-SEGMENT] No new elements after scroll — bottom reached.`);
    return { success: false, isLastSegment: true };
  }

  for (const el of newElements) {
    const key = getClickableTargetKey(el);
    if (key) ss.seenKeys.add(key);
  }
  ss.segmentIndex += 1;
  ss.segments.push(newElements);
  ss.restoreAttempts = 0;

  console.log(
    `[SCROLL-SEGMENT] Segment ${ss.segmentIndex}: +${newElements.length} new elements ` +
    `(total unique: ${ss.seenKeys.size})`,
  );
  return { success: true, newElements, isLastSegment: false };
}

export async function restoreSegment(
  mcp: McpToolInterface,
  frame: Frame,
  config: ExplorerConfig,
): Promise<boolean> {
  if (!frame.scrollState?.enabled) {
    return true;
  }

  const ss = frame.scrollState;
  if (ss.segmentIndex === 0) {
    return true;
  }

  const platformHooks = resolveExplorerPlatformHooks(config.platform);

  const inspectResult = await mcp.inspectUi({ appId: config.appId });
  if (inspectResult.status === "success" || inspectResult.status === "partial") {
    const data = inspectResult.data as unknown as Record<string, unknown>;
    const uiTree = platformHooks.parseInspectUi(data, { fallbackToDataRoot: true }) as UiHierarchy;
    const currentElements = findClickableElements(uiTree, config);
    const expectedFirstElement = ss.segments[ss.segmentIndex]?.[0];
    if (
      expectedFirstElement &&
      currentElements.some(e => getClickableTargetKey(e) === getClickableTargetKey(expectedFirstElement))
    ) {
      ss.restoreAttempts = 0;
      console.log(`[SCROLL-RESTORE] Already at segment ${ss.segmentIndex}`);
      return true;
    }
  }

  console.log(`[SCROLL-RESTORE] Restoring to segment ${ss.segmentIndex}`);

  for (let i = 0; i < ss.segmentIndex; i++) {
    const scrollResult = await mcp.scrollOnly({ direction: "down", distance: "medium" });
    if (scrollResult.status !== "success" && scrollResult.status !== "partial") {
      return false;
    }
    await mcp.waitForUiStable({ timeoutMs: 2000 });
  }

  const verifyResult = await mcp.inspectUi({ appId: config.appId });
  if (verifyResult.status === "success" || verifyResult.status === "partial") {
    const data = verifyResult.data as unknown as Record<string, unknown>;
    const uiTree = platformHooks.parseInspectUi(data, { fallbackToDataRoot: true }) as UiHierarchy;
    const currentElements = findClickableElements(uiTree, config);
    const expectedFirstElement = ss.segments[ss.segmentIndex]?.[0];
    if (
      expectedFirstElement &&
      currentElements.some(e => getClickableTargetKey(e) === getClickableTargetKey(expectedFirstElement))
    ) {
      ss.restoreAttempts = 0;
      console.log(`[SCROLL-RESTORE] Successfully restored to segment ${ss.segmentIndex}`);
      return true;
    }
  }

  ss.restoreAttempts += 1;
  if (ss.restoreAttempts >= ss.maxRestoreAttempts) {
    console.log(
      `[SCROLL-RESTORE] maxRestoreAttempts (${ss.maxRestoreAttempts}) exceeded — ` +
      `abandoning segment ${ss.segmentIndex}`,
    );
  }
  console.log(`[SCROLL-RESTORE] Failed to restore segment ${ss.segmentIndex}`);
  return false;
}
