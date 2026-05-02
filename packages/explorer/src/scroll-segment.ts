/**
 * Scroll-segment helpers for progressive scroll-aware DFS.
 *
 * This module is a pure helper called by the engine; it does not push/pop
 * frames or register state graph transitions.
 */

import { findClickableElements, flattenTree, prioritizeElements } from "./element-prioritizer.js";
import { buildRuleDecisionEntry } from "./engine-helpers.js";
import { resolveExplorerPlatformHooks } from "./explorer-platform.js";
import { evaluateElementRules } from "./rules/rule-evaluator.js";
import { buildExplorerRuleRegistry } from "./rules/rule-registry.js";
import type { ClickableTarget, ExplorerConfig, Frame, McpToolInterface, PageSnapshot, RuleDecisionEntry, UiHierarchy } from "./types.js";

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
  snapshot?: PageSnapshot;
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
  snapshot: PageSnapshot,
  config: ExplorerConfig,
): { skip: boolean; decision?: RuleDecisionEntry } {
  const registry = buildExplorerRuleRegistry(config);
  const ruleDecision = evaluateElementRules(registry, {
    path: frame.path,
    depth: frame.depth,
    mode: config.mode,
    platform: config.platform,
    snapshot,
    element: target,
  });
  if (ruleDecision.matched) {
    return {
      skip: true,
      decision: buildRuleDecisionEntry(ruleDecision, {
        path: frame.path,
        snapshot,
        element: target,
      }),
    };
  }

  if (!config.skipElements || config.skipElements.length === 0) {
    return { skip: false };
  }

  const screenTitle = snapshot.screenTitle;
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
      return { skip: true };
    }

    if (match.elementLabelPattern) {
      try {
        const pattern = new RegExp(match.elementLabelPattern, "i");
        if (pattern.test(target.label)) {
          return { skip: true };
        }
      } catch {
        // Ignore invalid user regex and fall through.
      }
    }
  }

  return { skip: false };
}

function buildSegmentElements(snapshot: PageSnapshot, frame: Frame, config: ExplorerConfig): { elements: ClickableTarget[]; ruleDecisions: RuleDecisionEntry[] } {
  const ruleDecisions: RuleDecisionEntry[] = [];
  const elements = prioritizeElements(findClickableElements(snapshot.uiTree, config))
    .sort(compareExplorationOrder)
    .filter((target) => {
      const result = shouldSkipElement(target, frame, snapshot, config);
      if (result.decision) {
        ruleDecisions.push(result.decision);
      }
      return !result.skip;
    });
  return { elements, ruleDecisions };
}

export function computePageFingerprint(snapshot: PageSnapshot): string {
  const type = snapshot.pageContext?.type ?? "unknown";
  const title = snapshot.screenTitle ?? snapshot.screenId ?? "unknown";
  return `${snapshot.appId}::${type}::${title}`;
}

function isIosExplorerPlatform(platform: ExplorerConfig["platform"]): boolean {
  return platform === "ios-simulator" || platform === "ios-device";
}

function isPageLikeForScrollFallback(snapshot: PageSnapshot): boolean {
  const pageType = snapshot.pageContext?.type;
  if (!pageType) {
    return true;
  }
  return !["dialog", "form", "search", "search_mode", "modal", "overlay"].includes(pageType);
}

function shouldArmIosGroupBackedScrollFallback(
  config: ExplorerConfig,
  snapshot: PageSnapshot,
  flattenedNodes: UiHierarchy[],
  visibleElements: number,
): boolean {
  if (!isIosExplorerPlatform(config.platform)) {
    return false;
  }
  if (visibleElements <= 0) {
    return false;
  }
  if (!isPageLikeForScrollFallback(snapshot)) {
    return false;
  }
  return flattenedNodes.some((node) => node.className === "Group" || node.elementType === "Group")
    || hasMoreMeaningfulVisibleSignalsThanQueuedElements(snapshot, visibleElements);
}

function normalizeVisibleSignal(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isMeaningfulVisibleSignal(value: string, snapshot: PageSnapshot): boolean {
  const normalized = normalizeVisibleSignal(value);
  if (normalized.length === 0) {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return false;
  }
  if (normalized === normalizeVisibleSignal(snapshot.screenTitle ?? "")) {
    return false;
  }
  if (normalized === "settings") {
    return false;
  }
  return true;
}

function hasMoreMeaningfulVisibleSignalsThanQueuedElements(
  snapshot: PageSnapshot,
  visibleElements: number,
): boolean {
  const signals = snapshot.pageContext?.visibleSignals ?? [];
  if (signals.length === 0) {
    return false;
  }

  const meaningfulSignals = new Set(
    signals
      .filter((signal) => isMeaningfulVisibleSignal(signal, snapshot))
      .map(normalizeVisibleSignal),
  );

  return meaningfulSignals.size > visibleElements;
}

export function initScrollState(
  frame: Frame,
  snapshot: PageSnapshot,
  config: ExplorerConfig,
): void {
  const flattenedNodes = flattenTree(snapshot.uiTree);
  const visibleElements = frame.elements.length > 0
    ? frame.elements.length
    : snapshot.clickableElements.length;
  const hasScrollable = flattenedNodes.some(n => n.scrollable);
  const fallbackArmed = !hasScrollable && shouldArmIosGroupBackedScrollFallback(
    config,
    snapshot,
    flattenedNodes,
    visibleElements,
  );
  if (!hasScrollable && !fallbackArmed) {
    if (visibleElements >= 8) {
      const containerTypes = Array.from(new Set(
        flattenedNodes
          .map(node => node.className ?? node.elementType ?? node.accessibilityRole)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      )).slice(0, 8);
      console.log(
        `[SCROLL-STATE] Not initialized for "${snapshot.screenTitle ?? snapshot.screenId}" — ` +
        `no scrollable container detected, visibleElements=${visibleElements}, ` +
        `containerTypes=${JSON.stringify(containerTypes)}`,
      );
    }
    return;
  }

  const builtSegment = frame.elements.length > 0
    ? { elements: frame.elements, ruleDecisions: snapshot.ruleDecisions ?? [] }
    : buildSegmentElements(snapshot, frame, config);
  const elements = builtSegment.elements;
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
    ruleDecisions: builtSegment.ruleDecisions,
  };
  snapshot.ruleDecisions = builtSegment.ruleDecisions;

  console.log(
    `[SCROLL-STATE] Initialized for "${snapshot.screenTitle}"${fallbackArmed ? " via iOS Group fallback" : ""} — ` +
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

  const scrollResult = await mcp.scrollOnly({ direction: "up", distance: "medium" });
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

  const builtSegment = buildSegmentElements(postSnapshot, frame, config);
  const allElements = builtSegment.elements;
  postSnapshot.ruleDecisions = builtSegment.ruleDecisions;
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
  ss.ruleDecisions = [...(ss.ruleDecisions ?? []), ...builtSegment.ruleDecisions];

  console.log(
    `[SCROLL-SEGMENT] Segment ${ss.segmentIndex}: +${newElements.length} new elements ` +
    `(total unique: ${ss.seenKeys.size})`,
  );
  return { success: true, newElements, isLastSegment: false, snapshot: postSnapshot };
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
    const scrollResult = await mcp.scrollOnly({ direction: "up", distance: "medium" });
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
