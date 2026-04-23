/**
 * DFS Exploration Engine — per-element immediate exploration.
 *
 * SPEC §4.1 v3.0 — CORRECTED iterative DFS with peek-based stack and elementIndex cursor.
 * This fixes the sibling exploration bug where elements were tapped on wrong pages.
 *
 * Key invariants:
 * - PEEK (don't pop) the top frame to decide what to do
 * - Advance elementIndex cursor BEFORE attempting a tap
 * - After successful tap: push child frame, explore in NEXT iteration
 * - Child frame backtracks when DONE (all elements explored)
 * - Per-element immediate exploration: tap -> explore child -> backtrack -> next sibling
 *
 * R1-#2: Page-change validation after every tap to prevent infinite loops.
 * R1-#4: Circuit breaker counts per-PAGE failures (not per-element).
 * R2-E: System dialog detection with structural accessibilityRole check + keyword threshold >=3.
 */

import type {
  Action,
  ClickableTarget,
  ExplorerConfig,
  ExplorationResult,
  FailureEntry,
  Frame,
  McpToolInterface,
  PageSnapshot,
  PageState,
  SamplingRule,
  TransitionLifecycleSummary,
} from "./types.js";
import { PageRegistry, hashUiStructure } from "./page-registry.js";
import { createSnapshotter, createTapExecutor } from "./snapshot.js";
import { prioritizeElements } from "./element-prioritizer.js";
import { createBacktracker } from "./backtrack.js";
import { createStateGraph } from "./state-graph.js";
import {
  createCircuitBreaker,
  recordPageSuccess,
  recordPageFailure,
  resetCircuit,
  isCircuitOpen,
} from "./circuit-breaker.js";
import { generateReport } from "./report.js";
import { decidePageContextAction } from "./page-context-router.js";
import { decideHeuristicPageAction } from "./page-context-heuristic.js";

// ---------------------------------------------------------------------------
// Sampling helpers — high-fanout collection page representative-child flow
// SPEC: explorer-high-fanout-list-sampling
// ---------------------------------------------------------------------------

/** Side-effect action labels that should not be selected as representatives. */
const SIDE_EFFECT_PATTERNS = [
  /download/i,
  /install/i,
  /purchase/i,
  /buy/i,
  /delete/i,
  /remove/i,
  /erase/i,
  /reset/i,
  /sign\s*out/i,
  /log\s*out/i,
];

const NAVIGATION_CONTROL_PATTERNS = [
  /^back$/i,
  /^cancel$/i,
  /^done$/i,
  /^close$/i,
  /^xmark$/i,
];

function isSideEffectAction(label: string): boolean {
  return SIDE_EFFECT_PATTERNS.some((p) => p.test(label));
}

function isNavigationControlAction(label: string): boolean {
  return NAVIGATION_CONTROL_PATTERNS.some((p) => p.test(label.trim()));
}

function compareExplorationOrder(a: ClickableTarget, b: ClickableTarget): number {
  const aIsNav = isNavigationControlAction(a.label) || isSideEffectAction(a.label);
  const bIsNav = isNavigationControlAction(b.label) || isSideEffectAction(b.label);
  if (aIsNav === bIsNav) return 0;
  return aIsNav ? 1 : -1;
}

/**
 * Check if a sampling rule matches the current frame state.
 * Matching priority: screenId > pathPrefix > screenTitle.
 */
function matchSamplingRule(
  rules: SamplingRule[] | undefined,
  framePath: string[],
  screenTitle: string | undefined,
  screenId: string | undefined,
  mode: string,
): SamplingRule | undefined {
  if (!rules || rules.length === 0) return undefined;

  for (const rule of rules) {
    if (rule.mode && rule.mode !== mode) continue;
    const m = rule.match;

    // Priority 1: screenId match
    if (m.screenId && screenId && m.screenId === screenId) return rule;

    // Priority 2: pathPrefix exact-depth match.
    // Rules apply only at the exact declared node, not descendants.
    // Example: [General, Fonts, System Fonts] matches exactly that node,
    // but must NOT match [General, Fonts] or
    // [General, Fonts, System Fonts, Academy Engraved LET].
    if (m.pathPrefix && m.pathPrefix.length > 0) {
      const prefix = m.pathPrefix;
      if (framePath.length === prefix.length) {
        let matches = true;
        for (let i = 0; i < prefix.length; i++) {
          const framePart = normalizeSamplingPathSegment(framePath[i]);
          const rulePart = normalizeSamplingPathSegment(prefix[i]);
          // Support iOS resource-id segment matches like
          // "com.apple.settings.general" vs "general".
          if (!(framePart === rulePart || framePart.endsWith(`.${rulePart}`))) {
            matches = false;
            break;
          }
        }
        if (matches) return rule;
      }
    }

    // Priority 3: screenTitle match
    if (m.screenTitle && screenTitle && m.screenTitle === screenTitle) return rule;
  }

  return undefined;
}

function normalizeSamplingPathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sampling state tracked during exploration. */
interface SamplingState {
  /** Pages where sampling was applied (screenId set). */
  appliedPages: Set<string>;
  /** Total children skipped due to sampling. */
  skippedChildren: number;
  /** Per-page sampling details for report transparency. */
  details: Record<string, {
    screenTitle?: string;
    totalChildren: number;
    exploredChildren: number;
    skippedChildren: number;
    exploredLabels: string[];
    skippedLabels: string[];
  }>;
}

function elementIdentity(element: ClickableTarget): string {
  return `${element.label}::${JSON.stringify(element.selector)}`;
}

// ---------------------------------------------------------------------------
// Failure log
// ---------------------------------------------------------------------------

/** In-memory failure log collection. */
export class FailureLog {
  private entries: FailureEntry[] = [];

  /** Record a new failure entry. */
  record(entry: FailureEntry): void {
    this.entries.push(entry);
  }

  /** Get all failure entries. */
  getEntries(): FailureEntry[] {
    return [...this.entries];
  }
}

// ---------------------------------------------------------------------------
// Navigation validation
// ---------------------------------------------------------------------------

/** Result of navigation validation. */
type NavValidation =
  | { navigated: true; isModalOverlay?: boolean }
  | { navigated: false; reason: string; shouldDismissDialog?: boolean };

type ExplorerPageAction = {
  type: "dfs" | "gated";
  reason: string;
  isInterruption?: boolean;
  interruptionType?: string;
  recoveryMethod?: string;
  ruleFamily?: string;
};

function decideExplorerPageAction(
  snapshot: PageSnapshot,
  config: ExplorerConfig,
): ExplorerPageAction {
  const routerDecision = decidePageContextAction(snapshot.pageContext, config);
  switch (routerDecision.type) {
    case "dfs":
      return {
        type: "dfs",
        reason: routerDecision.reason,
        isInterruption: routerDecision.isInterruption,
        interruptionType: routerDecision.interruptionType,
        recoveryMethod: routerDecision.recoveryMethod,
        ruleFamily: routerDecision.ruleFamily,
      };
    case "gated":
      return {
        type: "gated",
        reason: routerDecision.reason,
        isInterruption: routerDecision.isInterruption,
        interruptionType: routerDecision.interruptionType,
        recoveryMethod: routerDecision.recoveryMethod,
        ruleFamily: routerDecision.ruleFamily,
      };
    case "defer-to-heuristic":
      break;
  }
  return decideHeuristicPageAction(snapshot);
}

function markSnapshotAsGated(
  snapshot: PageSnapshot,
  decision: ExplorerPageAction,
  policy: string,
): void {
  snapshot.explorationStatus = "reached-not-expanded";
  snapshot.stoppedByPolicy = policy;
  snapshot.ruleFamily = decision.ruleFamily;
  snapshot.recoveryMethod = decision.recoveryMethod ?? "backtrack-cancel-first";
}

function normalizeNavText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function pageTypeOf(snapshot: { pageContext?: { type?: string } } | undefined): string {
  return snapshot?.pageContext?.type ?? "unknown";
}

function matchesStatefulKeyword(value: string | undefined, keywords: string[]): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return keywords.some((keyword) => normalized.includes(keyword));
}

function isStatefulFormEntry(
  element: ClickableTarget,
  snapshot: PageSnapshot,
  config: ExplorerConfig,
): boolean {
  if ((config.statefulFormPolicy ?? "skip") === "allow") {
    return false;
  }

  const title = snapshot.screenTitle?.trim().toLowerCase() ?? "";
  const label = element.label.trim().toLowerCase();
  const entryKeywords = ["create", "add", "manage", "choose", "select"];
  const domainKeywords = ["address", "shipping", "payment", "profile", "account", "location"];

  const hasEntrySignal = matchesStatefulKeyword(title, entryKeywords) || matchesStatefulKeyword(label, entryKeywords);
  const hasDomainSignal = matchesStatefulKeyword(title, domainKeywords) || matchesStatefulKeyword(label, domainKeywords);

  return hasEntrySignal && hasDomainSignal;
}

/**
 * Validate that a tap led to a real page change.
 *
 * SPEC §4.1, R1-#2 — prevents infinite loops from non-navigating elements.
 * R2-E — system dialog detection with structural check + keyword threshold >=3.
 */
function validateNavigation(
  nextSnapshot: { screenId: string; screenTitle?: string; uiTree: Record<string, unknown> },
  prevState: { screenId: string; screenTitle?: string },
  actionLabel?: string,
): NavValidation {
  // Check 1: screenId changed — page content is different
  if (nextSnapshot.screenId === prevState.screenId) {
    return {
      navigated: false,
      reason: "screenId unchanged — element had no navigation effect",
    };
  }

  const nextTitle = normalizeNavText(nextSnapshot.screenTitle);
  const prevTitle = normalizeNavText(prevState.screenTitle);
  const action = normalizeNavText(actionLabel);
  if (nextTitle && prevTitle && nextTitle === prevTitle && action === prevTitle) {
    return {
      navigated: false,
      reason: "screen title unchanged after tapping page-title-like element — treating as self-loop",
    };
  }

  // Check 2: detect system dialogs (permission requests, update prompts, etc.)
  if (isSystemDialog(nextSnapshot)) {
    return {
      navigated: false,
      reason: "system dialog detected — will dismiss and retry",
      shouldDismissDialog: true,
    };
  }

  // Check 3: depth increased but content is nearly identical — possible modal overlay
  // (Note: we don't have prevState.depth here, so this check is simplified)
  // In the engine, this would be checked separately if needed.

  return { navigated: true };
}

/**
 * Detect system-level dialogs that block exploration.
 *
 * R2-E: Structural check first (accessibilityRole), then keyword fallback with threshold >=3.
 */
function isSystemDialog(snapshot: { uiTree: Record<string, unknown> }): boolean {
  const uiTree = snapshot.uiTree;

  // Structural check (primary): look for alert/modal role in the UI tree
  const elements = collectAllElements(uiTree);
  const hasAlertRole = elements.some(
    (el) =>
      el.accessibilityRole === "alert" ||
      el.accessibilityRole === "SystemAlert" ||
      (el as Record<string, unknown>).elementType === "Alert" ||
      (el as Record<string, unknown>).elementType === "Sheet" ||
      (el as Record<string, unknown>).className === "Alert" ||
      (el as Record<string, unknown>).className === "Sheet",
  );
  if (hasAlertRole) return true; // structural confidence — no keyword needed

  // Keyword fallback (secondary): check for dialog-like text patterns
  // Requires >=3 keywords to reduce false positives (R2-E)
  const allText = elements
    .map((el) => {
      const label =
        (el as Record<string, unknown>).contentDesc ||
        (el as Record<string, unknown>).accessibilityLabel ||
        (el as Record<string, unknown>).label ||
        (el as Record<string, unknown>).text ||
        "";
      return typeof label === "string" ? label : "";
    })
    .join(" ");

  const dialogKeywords = [
    "Would Like to Send",
    "Allow",
    "Don't Allow",
    "Allow ACCESS to use",
    "While Using the App",
    "Update Available",
    "Not Now",
    "Remind Me Later",
    "Sign in to iCloud",
    "OK",
    "Cancel",
    "Allow Once",
  ];
  const matched = dialogKeywords.filter((kw) => allText.includes(kw));
  return matched.length >= 3;
}

/** Collect all elements from a UI tree (flat traversal). */
function collectAllElements(
  node: Record<string, unknown>,
  result: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  result.push(node);
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === "object" && child !== null) {
        collectAllElements(child as Record<string, unknown>, result);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

/**
 * Determine the action to take on failure based on the configured strategy.
 */
function handleFailure(
  _err: Error,
  strategy: ExplorerConfig["failureStrategy"],
  retries: number,
): Action {
  switch (strategy) {
    case "retry-3":
      if (retries < 3) return "retry";
      return "skip";
    case "skip":
      return "skip";
    case "handoff":
      return "handoff";
  }
}

/** Check if the exploration has timed out. */
function hasTimedOut(timeoutMs: number, startTime: number): boolean {
  return Date.now() - startTime >= timeoutMs;
}

// ---------------------------------------------------------------------------
// Main explore function
// ---------------------------------------------------------------------------

/**
 * Run a full DFS exploration of the target app.
 *
 * @param config - Explorer configuration
 * @param mcp - MCP tool interface for all device interactions
 * @returns ExplorationResult with visited pages and failure log
 */
export async function explore(
  config: ExplorerConfig,
  mcp: McpToolInterface,
): Promise<ExplorationResult> {
  const visited = new PageRegistry();
  const failed = new FailureLog();
  const circuitBreaker = createCircuitBreaker();

  // CORRECTED: peek-based stack with elementIndex cursor (SPEC §4.1 v3.0, R2-A)
  const stack: Frame[] = [
    {
      state: {} as PageState,
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
    },
  ];

  const snapshotter = createSnapshotter(mcp);
  const tapper = createTapExecutor(mcp);
  const backtracker = createBacktracker(mcp, config.platform);
  const stateGraph = createStateGraph();

  // --- Sampling state (high-fanout collection pages) ---
  const samplingState: SamplingState = {
    appliedPages: new Set(),
    skippedChildren: 0,
    details: {},
  };

  // --- App launch ---
  const launchResult = await mcp.launchApp({ appId: config.appId });
  if (launchResult.status !== "success" && launchResult.status !== "partial") {
    failed.record({
      pageScreenId: "app-launch",
      elementLabel: config.appId,
      failureType: "CRASH",
      retryCount: 0,
      errorMessage: `launch_app failed: ${launchResult.reasonCode}`,
      depth: 0,
      path: [],
    });
    return {
      visited,
      failed,
      aborted: true,
      abortReason: "App launch failed",
    };
  }

  const stableResult = await mcp.waitForUiStable({ timeoutMs: 5000 });
  if (stableResult.status !== "success" && stableResult.status !== "partial") {
    failed.record({
      pageScreenId: "post-launch",
      elementLabel: "wait_for_ui_stable",
      failureType: "TIMEOUT",
      retryCount: 0,
      errorMessage: "UI did not stabilize after app launch",
      depth: 0,
      path: [],
    });
    return {
      visited,
      failed,
      aborted: true,
      abortReason: "UI did not stabilize after launch",
    };
  }

  // Initial snapshot
  const initialSnapshot = await snapshotter.captureSnapshot(config);
  console.log(
    `[ENGINE] Home page: screenId=${initialSnapshot.screenId}, screenTitle="${initialSnapshot.screenTitle || '(empty)'}", clickable=${initialSnapshot.clickableElements.length}, pageType=${pageTypeOf(initialSnapshot)}`,
  );
  if (initialSnapshot.clickableElements.length > 0) {
    const first = initialSnapshot.clickableElements[0];
    console.log(`[ENGINE] First element: label="${first.label}", elementType="${first.elementType}"`);
    // Print all clickable element labels
    for (const el of initialSnapshot.clickableElements.slice(0, 15)) {
      console.log(`  clickable: "${el.label.slice(0, 40)}" (${el.elementType})`);
    }
  }
  
  // Record the target app identity for app switching detection.
  // iOS uses AXLabel (display name like "Settings"), Android uses bundle ID.
  // This comparison works universally because we compare the extracted identity
  // from the UI tree, not the config.appId (which may differ in format).
  const targetAppId = initialSnapshot.appId ?? config.appId;
  console.log(`[ENGINE] Target app identity: ${targetAppId}`);
  
  // Track current app identity — updated on each navigation.
  // App switch handling only triggers when this value changes.
  let currentAppId = targetAppId;
  
  visited.register({ alreadyVisited: false }, initialSnapshot, []);
  const initialStructureHash = hashUiStructure(initialSnapshot.uiTree);
  let currentStateNode = stateGraph.registerState(initialSnapshot, initialStructureHash);
  backtracker.registerPage(initialSnapshot.screenId, initialSnapshot.uiTree);
  stack[0].state = {
    screenId: initialSnapshot.screenId,
    screenTitle: initialSnapshot.screenTitle,
    pageContextType: pageTypeOf(initialSnapshot),
    structureHash: initialStructureHash,
  };
  // Populate home page's clickable elements
  stack[0].elements = prioritizeElements(initialSnapshot.clickableElements);
  // Set app identity for the home frame
  stack[0].appId = targetAppId;
  stack[0].isExternalApp = false; // Home page is always the target app

  const startTime = Date.now();
  let recoveryAbortReason: string | undefined;
  const transitionLifecycle: TransitionLifecycleSummary = {
    actionSent: 0,
    postStateObserved: 0,
    transitionCommitted: 0,
    transitionRejected: 0,
  };

  // --- DFS main loop ---
  while (
    stack.length > 0 &&
    visited.count < config.maxPages &&
    !hasTimedOut(config.timeoutMs, startTime) &&
    !isCircuitOpen(circuitBreaker)
  ) {
    const frame = stack[stack.length - 1]; // PEEK (don't pop)
    console.log(
      `[FRAME-LOOP] depth=${frame.depth}, stack=${stack.length}, cursor=${frame.elementIndex}/${frame.elements.length}, ` +
      `frameTitle="${frame.state.screenTitle ?? "(none)"}", frameScreenId="${frame.state.screenId ?? "(none)"}"`,
    );

    // Step 0: ensure frame-state is aligned with the currently visible page
    // before attempting the next tap. If still mismatched after one bounded
    // recovery attempt, do not advance cursor.
    if (frame.state.screenId) {
      const alignedBeforeTap = await backtracker.isOnExpectedPage(
        frame.state.screenId,
        frame.state.screenTitle,
        frame.state.structureHash,
      );

      if (!alignedBeforeTap) {
        console.log(
          `[FRAME-GUARD] mismatch detected before tap: expected="${frame.state.screenTitle ?? frame.state.screenId}", ` +
          `parent="${frame.parentTitle ?? "(none)"}"`,
        );

        const recovered = await backtracker.navigateBack(frame.parentTitle);
        const alignedAfterRecovery = recovered
          ? await backtracker.isOnExpectedPage(
            frame.state.screenId,
            frame.state.screenTitle,
            frame.state.structureHash,
          )
          : false;

        if (!alignedAfterRecovery) {
          failed.record({
            pageScreenId: frame.state.screenId ?? "unknown",
            elementLabel: frame.state.screenTitle ?? frame.parentTitle ?? "resume-frame",
            failureType: "BACKTRACK_MISMATCH",
            retryCount: recovered ? 1 : 0,
            errorMessage: `ensureFrameAligned mismatch for "${frame.state.screenTitle || frame.parentTitle || "unknown"}"`,
            depth: frame.depth,
            path: frame.path,
          });

          if (frame.depth === 0) {
            if (frame.elementIndex >= frame.elements.length) {
              console.log(
                `[FRAME-GUARD] Home page elements exhausted. Exploration complete.`,
              );
              break;
            }

            console.log(
              `[FRAME-GUARD] Home page recovery failed. Attempting launch_app to restart...`,
            );
            try {
              await mcp.launchApp({ appId: config.appId });
              await mcp.waitForUiStable({ timeoutMs: 3000 });

              const returnSnapshot = await snapshotter.captureSnapshot(config);
              console.log(
                `[FRAME-GUARD] launchApp returned to: ${returnSnapshot.screenTitle || "(unknown)"}`,
              );

              frame.state = {
                screenId: returnSnapshot.screenId,
                screenTitle: returnSnapshot.screenTitle,
                structureHash: hashUiStructure(returnSnapshot.uiTree),
              };
              backtracker.registerPage(returnSnapshot.screenId, returnSnapshot.uiTree);

              const alignedAfterLaunch = await backtracker.isOnExpectedPage(
                frame.state.screenId ?? "unknown",
                frame.state.screenTitle,
                frame.state.structureHash,
              );
              if (!alignedAfterLaunch) {
                console.log(
                  `[FRAME-GUARD] launchApp did not restore home page. Aborting.`,
                );
                recoveryAbortReason = `Home recovery failed: launchApp did not restore expected page`;
                break;
              }
              console.log(
                `[FRAME-GUARD] Home page recovered via launchApp. Continuing exploration.`,
              );
            } catch (err) {
              console.log(`[FRAME-GUARD] launchApp failed: ${err}. Aborting.`);
              stateGraph.registerTransition({
                from: currentStateNode.id,
                kind: "home",
                intentLabel: "home-recovery",
                committed: false,
                attempts: recovered ? 1 : 0,
                failureReason: "ensureFrameAligned mismatch",
              });
              recoveryAbortReason = `Home recovery failed at "${frame.state.screenTitle || "unknown"}"`;
              break;
            }
          }

          console.log(
            `[FRAME-GUARD] BACKTRACK_MISMATCH, popping frame depth=${frame.depth} title="${frame.state.screenTitle ?? "(unknown)"}"`,
          );
          stack.pop();
          continue;
        }

        console.log(
          `[FRAME-GUARD] recovered frame alignment for "${frame.state.screenTitle ?? frame.state.screenId}"`,
        );
      }
    }

    if (recoveryAbortReason) {
      break;
    }

    // Step 1: Snapshot (only on first visit, elementIndex === 0)
    // Skip for depth=0 home page — already snapshotted before the loop
    if (frame.elementIndex === 0 && frame.depth > 0) {
      const snapshot = await snapshotter.captureSnapshot(config);
      const dedupResult = await visited.dedup(snapshot);
      if (dedupResult.alreadyVisited) {
        stack.pop();
        if (frame.depth > 0) {
          await backtracker.navigateBack(frame.parentTitle);
        }
        continue;
      }
      visited.register(dedupResult, snapshot, frame.path);
      backtracker.registerPage(snapshot.screenId, snapshot.uiTree);
      frame.elements = prioritizeElements(snapshot.clickableElements).sort(compareExplorationOrder);
      console.log(
        `[FRAME-ELEMENTS] depth=${frame.depth}, title="${snapshot.screenTitle ?? snapshot.screenId ?? "(unknown)"}", ` +
        `count=${frame.elements.length}, labels=${JSON.stringify(frame.elements.map((candidate) => candidate.label))}`,
      );
      frame.state = {
        screenId: snapshot.screenId,
        screenTitle: snapshot.screenTitle,
        pageContextType: pageTypeOf(snapshot),
        structureHash: hashUiStructure(snapshot.uiTree),
      };
      currentStateNode = stateGraph.registerState(snapshot, frame.state.structureHash ?? "");
      recordPageSuccess(circuitBreaker); // reset per-page counter for new page

      const pageAction = decideExplorerPageAction(snapshot, config);
      if (pageAction.type === "gated") {
        console.log(
          `[PAGE-CONTEXT] gated page at depth=${frame.depth}, title="${snapshot.screenTitle ?? snapshot.screenId}", ` +
          `reason="${pageAction.reason}"`,
        );
        markSnapshotAsGated(snapshot, pageAction, `pageContext:${pageAction.ruleFamily ?? "heuristic"}`);
        stack.pop();
        if (frame.depth > 0) {
          await backtracker.navigateBack(frame.parentTitle);
        }
        continue;
      }

      // --- Sampling check: high-fanout collection pages (smoke mode) ---
      const matchedRule = matchSamplingRule(
        config.samplingRules,
        frame.path,
        frame.state.screenTitle,
        frame.state.screenId,
        config.mode,
      );
      console.log(`[SAMPLING-DEBUG] path=[${frame.path.join(", ")}], title="${frame.state.screenTitle}", mode="${config.mode}", rules=${config.samplingRules?.length ?? 0}, matched=${matchedRule ? "yes" : "no"}`);
      if (matchedRule && matchedRule.strategy === "representative-child") {
        const maxChildren = matchedRule.maxChildrenToValidate ?? 1;
        const excludePatterns = matchedRule.excludeActions ?? [];
        const hasExclude = excludePatterns.length > 0;

        // Filter out side-effect actions and explicitly excluded patterns
        const safeElements = frame.elements.filter((el) => {
          if (hasExclude && excludePatterns.some((p) => new RegExp(p, "i").test(el.label))) {
            return false;
          }
          if (isSideEffectAction(el.label)) {
            return false;
          }
          if (isNavigationControlAction(el.label)) {
            return false;
          }
          return true;
        });

        if (safeElements.length > 0) {
          const selectedElements = safeElements.slice(0, maxChildren);
          const selectedKeys = new Set(selectedElements.map((el) => elementIdentity(el)));
          const skippedLabels = safeElements
            .filter((el) => !selectedKeys.has(elementIdentity(el)))
            .map((el) => el.label);
          const originalCount = safeElements.length;

          frame.elements = prioritizeElements(selectedElements);
          samplingState.appliedPages.add(frame.state.screenId ?? "unknown");
          samplingState.skippedChildren += originalCount - frame.elements.length;
          samplingState.details[frame.state.screenId ?? "unknown"] = {
            screenTitle: frame.state.screenTitle,
            totalChildren: originalCount,
            exploredChildren: frame.elements.length,
            skippedChildren: skippedLabels.length,
            exploredLabels: selectedElements.map((el) => el.label),
            skippedLabels,
          };
          console.log(
            `[SAMPLING] Rule matched: "${matchedRule.match.pathPrefix?.join(" > ") || matchedRule.match.screenTitle || "unknown"}" — ` +
            `reducing ${originalCount} children to ${frame.elements.length} representative(s)`,
          );
        }
      }
    }

    // Step 2: Visit next unexplored element
    const liveContextForPlan = await backtracker.getCurrentPageContext();
    const currentLabelForPlan = liveContextForPlan.title ?? liveContextForPlan.screenId ?? "(unknown)";

    if (frame.elementIndex >= frame.elements.length) {
      const expectedAfterAction = frame.parentTitle ?? "(root)";
      console.log(
        `[FRAME-PLAN] depth=${frame.depth}, stack=${stack.length}, cursor=${frame.elementIndex}/${frame.elements.length}, ` +
        `current="${currentLabelForPlan}", expected="${expectedAfterAction}", nextAction=pop frame and backtrack`,
      );

      // All elements explored — pop and backtrack
      stack.pop();
      console.log(`[POP] Frame "${frame.state.screenTitle || '(none)'}" all ${frame.elements.length} elements explored. Stack now: ${stack.length}`);
      if (stack.length > 0) {
        const newFrame = stack[stack.length - 1];
        console.log(`[POP] Next frame: depth=${newFrame.depth}, cursor=${newFrame.elementIndex}/${newFrame.elements.length}, title="${newFrame.state.screenTitle || '(none)'}"`);
      }
      if (frame.elements.length > 0) {
        // Check if this page had any successful navigations
        // If not, increment consecutive failed pages
        // (tracked via circuit breaker state)
      }
      
      // Handle return from external app pages (can't use navigate_back across apps)
      if (frame.isExternalApp) {
        console.log(`[APP-SWITCH] Returning to target app ${config.appId} via launchApp...`);
        try {
          await mcp.launchApp({ appId: config.appId });
          await mcp.waitForUiStable({ timeoutMs: 3000 });
          // Update current app identity since we're back in target app
          currentAppId = targetAppId;
          console.log(`[APP-SWITCH] Returned to ${currentAppId} — launchApp preserves app state`);
          
          // Capture new snapshot to see what page we're on
          const returnSnapshot = await snapshotter.captureSnapshot(config);
          console.log(`[APP-SWITCH] Current page after return: ${returnSnapshot.screenTitle || '(unknown)'}`);
          
          // Re-register this page in backtracker with current structure
          backtracker.registerPage(returnSnapshot.screenId, returnSnapshot.uiTree);
          
          // Update frame state to match current page
          frame.state = {
            screenId: returnSnapshot.screenId,
            screenTitle: returnSnapshot.screenTitle,
            structureHash: hashUiStructure(returnSnapshot.uiTree),
          };
          
          // Mark frame as no longer external
          frame.isExternalApp = false;
          frame.appId = returnSnapshot.appId ?? config.appId;
        } catch (err) {
          console.log(`[APP-SWITCH] launchApp failed, falling back to navigateBack: ${err}`);
          await backtracker.navigateBack(frame.parentTitle);
        }
      } else if (frame.depth > 0) {
        // Normal in-app backtrack
        await backtracker.navigateBack(frame.parentTitle);
      }
      continue;
    }

    const element = frame.elements[frame.elementIndex];
    const expectedAfterAction = element.label.slice(0, 50);
    console.log(
      `[FRAME-PLAN] depth=${frame.depth}, stack=${stack.length}, cursor=${frame.elementIndex}/${frame.elements.length}, ` +
      `current="${currentLabelForPlan}", expected="${expectedAfterAction}", nextAction=tap "${expectedAfterAction}"`,
    );
    console.log(
      `[FRAME-NEXT] current="${currentLabelForPlan}", expected="${expectedAfterAction}", action=tap "${expectedAfterAction}"`,
    );

    frame.elementIndex++; // advance cursor (even if this one fails)
    console.log(
      `[ACTION-START] action=tap_element, label="${element.label.slice(0, 40)}", ` +
      `from="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
      `expected="${expectedAfterAction}", ` +
      `selector=${JSON.stringify(element.selector)}`,
    );
    transitionLifecycle.actionSent += 1;

    // Retry loop for this element
    let elementRetries = 0;
    let elementResult = await tapper.tapAndWait(element, config.timeoutMs);

    while (!elementResult.success) {
      console.log(
        `[ACTION-RESULT] action=tap_element, label="${element.label.slice(0, 40)}", ` +
        `expected="${expectedAfterAction}", ` +
        `status=failed, from="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
        `reason="${elementResult.error.message}"`,
      );
      failed.record({
        pageScreenId: frame.state.screenId ?? "unknown",
        elementLabel: element.label,
        failureType: elementResult.error.message.includes("TIMEOUT")
          ? "TIMEOUT"
          : "TAP_FAILED",
        retryCount: elementRetries,
        errorMessage: elementResult.error.message,
        depth: frame.depth,
        path: frame.path,
      });

      const action = handleFailure(
        elementResult.error,
        config.failureStrategy,
        elementRetries,
      );

      if (action === "abort") {
        break;
      }
      if (action === "retry") {
        elementRetries++;
        elementResult = await tapper.tapAndWait(element, config.timeoutMs);
        continue;
      }
      if (action === "handoff") {
        await mcp.requestManualHandoff();
        elementResult = await tapper.tapAndWait(element, config.timeoutMs);
        if (elementResult.success) break;
        continue;
      }
      // action === 'skip'
      break;
    }

    if (elementResult.success) {
      // For external links, wait for app switch then detect it
      const isExternalLink = element.isExternalLink ?? false;

      if (isExternalLink) {
        console.log(`[EXTERNAL-LINK] Tapped "${element.label}" — waiting 2s for potential app switch...`);
        await mcp.waitForUiStable({ timeoutMs: 2000 });

        // Capture snapshot to detect app switching
        const nextStateSnapshot = await snapshotter.captureSnapshot(config);
        transitionLifecycle.postStateObserved += 1;
        console.log(
          `[ACTION-RESULT] action=tap_element, label="${element.label.slice(0, 40)}", ` +
          `expected="${expectedAfterAction}", ` +
          `status=success, from="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
          `to="${nextStateSnapshot.screenTitle ?? nextStateSnapshot.screenId}"`,
        );

        // Check if app actually switched by comparing with CURRENT app identity
        const isAppSwitched = nextStateSnapshot.appId !== undefined &&
                              nextStateSnapshot.appId !== currentAppId;

        if (isAppSwitched) {
          console.log(`[APP-SWITCH] In external app — immediately launching target app to return...`);
          await mcp.launchApp({ appId: config.appId });
          await mcp.waitForUiStable({ timeoutMs: 2000 });
          currentAppId = targetAppId; // ← Correct: back to target app
        } else {
          console.log(`[EXTERNAL-LINK] No app switch detected (stayed in ${nextStateSnapshot.appId})`);
        }

        // Mark as external app if we're not in target app
        const isExternalApp = nextStateSnapshot.appId !== undefined && 
                              nextStateSnapshot.appId !== targetAppId;
        nextStateSnapshot.isExternalApp = isExternalApp;
        nextStateSnapshot.appId = nextStateSnapshot.appId ?? `external:${element.label}`;

        console.log(`[EXTERNAL-LINK] External link detected. Returning immediately...`);

        // Record this external link visit in the report
        visited.register({ alreadyVisited: false }, nextStateSnapshot, [...frame.path, element.label]);

        // Do NOT push child frame for external app.
        // Just continue from the current frame — it will pop naturally.
        console.log(`[EXTERNAL-LINK] External link recorded, continuing from current frame`);
        console.log(`[EXTERNAL-LINK] Current frame after: title="${frame.state.screenTitle}", elements=${frame.elements.length}, cursor=${frame.elementIndex}/${frame.elements.length}`);
        // Log remaining elements
        for (let i = frame.elementIndex; i < frame.elements.length; i++) {
          console.log(`[EXTERNAL-LINK] Remaining element[${i}]: "${frame.elements[i].label.slice(0, 40)}"`);
        }
        transitionLifecycle.transitionCommitted += 1;
        stateGraph.registerTransition({
          from: currentStateNode.id,
          kind: "forward",
          intentLabel: element.label,
          committed: true,
          attempts: elementRetries + 1,
        });
        continue;
      }

      // Normal in-app navigation
      const nextStateSnapshot = await snapshotter.captureSnapshot(config);
      transitionLifecycle.postStateObserved += 1;
      console.log(
        `[ACTION-RESULT] action=tap_element, label="${element.label.slice(0, 40)}", ` +
        `expected="${expectedAfterAction}", ` +
        `status=success, from="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
        `to="${nextStateSnapshot.screenTitle ?? nextStateSnapshot.screenId}"`,
      );

      const pageAction = decideExplorerPageAction(nextStateSnapshot, config);
      if (pageAction.type === "gated") {
        console.log(
          `[PAGE-CONTEXT] gated page after tap "${element.label.slice(0, 40)}": ` +
          `title="${nextStateSnapshot.screenTitle ?? nextStateSnapshot.screenId}", reason="${pageAction.reason}"`,
        );
        markSnapshotAsGated(nextStateSnapshot, pageAction, `pageContext:${pageAction.ruleFamily ?? "heuristic"}`);

        visited.register({ alreadyVisited: false }, nextStateSnapshot, [...frame.path, element.label]);
        transitionLifecycle.transitionCommitted += 1;
        const gatedStateNode = stateGraph.registerState(
          nextStateSnapshot,
          hashUiStructure(nextStateSnapshot.uiTree),
        );
        stateGraph.registerTransition({
          from: currentStateNode.id,
          to: gatedStateNode.id,
          kind: "cancel",
          intentLabel: element.label,
          committed: true,
          attempts: elementRetries + 1,
        });
        currentStateNode = gatedStateNode;

        await backtracker.navigateBack(frame.state.screenTitle ?? frame.parentTitle);
        continue;
      }

      if (isStatefulFormEntry(element, nextStateSnapshot, config)) {
        console.log(
          `[STATEFUL-SKIP] Reached stateful form-entry branch "${nextStateSnapshot.screenTitle ?? element.label}"; ` +
          `recording visit without expansion`,
        );
        nextStateSnapshot.explorationStatus = "reached-not-expanded";
        nextStateSnapshot.stoppedByPolicy = `statefulFormPolicy:${config.statefulFormPolicy ?? "skip"}`;
        nextStateSnapshot.ruleFamily = "stateful_form_entry";
        nextStateSnapshot.recoveryMethod = "backtrack-cancel-first";

        visited.register({ alreadyVisited: false }, nextStateSnapshot, [...frame.path, element.label]);
        transitionLifecycle.transitionCommitted += 1;
        const gatedStateNode = stateGraph.registerState(
          nextStateSnapshot,
          hashUiStructure(nextStateSnapshot.uiTree),
        );
        stateGraph.registerTransition({
          from: currentStateNode.id,
          to: gatedStateNode.id,
          kind: "cancel",
          intentLabel: element.label,
          committed: true,
          attempts: elementRetries + 1,
        });
        currentStateNode = gatedStateNode;

        await backtracker.navigateBack(frame.state.screenTitle ?? frame.parentTitle);
        continue;
      }

      // Validate navigation (R1-#2, R3-G)
      const navValidation = validateNavigation(
        {
          screenId: nextStateSnapshot.screenId,
          screenTitle: nextStateSnapshot.screenTitle,
          uiTree: nextStateSnapshot.uiTree as Record<string, unknown>,
        },
        {
          screenId: frame.state.screenId ?? "",
          screenTitle: frame.state.screenTitle,
        },
        element.label,
      );

      // Check for app switching via appId change — only when the page actually navigated.
      // This prevents false positives when stale currentAppId differs from the current page.
      const isAppSwitched = navValidation.navigated &&
                            nextStateSnapshot.appId !== undefined &&
                            nextStateSnapshot.appId !== currentAppId;
      if (isAppSwitched) {
        console.log(
          `[APP-SWITCH] Detected: ${currentAppId} -> ${nextStateSnapshot.appId} (via "${element.label}")`,
        );
        currentAppId = nextStateSnapshot.appId ?? currentAppId; // Update current app identity
      }

      if (!navValidation.navigated) {
        if (navValidation.shouldDismissDialog) {
          console.log(
            `[ACTION-RESULT] action=tap_element, label="${element.label.slice(0, 40)}", ` +
            `expected="${expectedAfterAction}", ` +
            `status=partial, from="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
            `to="${nextStateSnapshot.screenTitle ?? nextStateSnapshot.screenId}", reason="${navValidation.reason}"`,
          );
        } else {
          console.log(
            `[ACTION-RESULT] action=tap_element, label="${element.label.slice(0, 40)}", ` +
            `expected="${expectedAfterAction}", ` +
            `status=partial, from="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
            `to="${nextStateSnapshot.screenTitle ?? nextStateSnapshot.screenId}", reason="${navValidation.reason}"`,
          );
        }
        // Record this as a page-level failure for circuit breaker tracking
        const pageOpen = recordPageFailure(circuitBreaker);
        if (pageOpen) {
          console.log(
            `[CIRCUIT-BREAKER] Page ${frame.state.screenId} exceeded failure threshold (${circuitBreaker.currentPageFailures}/${circuitBreaker.threshold})`,
          );
        }
        transitionLifecycle.transitionRejected += 1;
        stateGraph.registerTransition({
          from: currentStateNode.id,
          kind: "forward",
          intentLabel: element.label,
          committed: false,
          attempts: elementRetries + 1,
          failureReason: navValidation.reason,
        });
        continue; // element didn't lead anywhere — try next sibling
      }

      // Check for app switching (US-002) — mark as external if not in target app
      const isExternalApp = isAppSwitched ||
        (nextStateSnapshot.appId !== undefined && nextStateSnapshot.appId !== targetAppId);
      if (isExternalApp) {
        console.log(
          `[APP-SWITCH] In external app: ${nextStateSnapshot.appId} (via "${element.label}")`,
        );
        nextStateSnapshot.isExternalApp = true;
      }

      const nextStateStructureHash = hashUiStructure(nextStateSnapshot.uiTree);

      // If a tap lands on an already active ancestor frame, treat it as an
      // in-flow back transition and collapse stale descendants immediately.
      // This prevents recovery loops like Academy -> System Fonts where we
      // would otherwise keep the child frame alive and fail BACKTRACK_MISMATCH.
      let ancestorFrameIndex = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        const sameScreen = stack[i].state.screenId === nextStateSnapshot.screenId;
        const sameAppIdentity =
          nextStateSnapshot.appId === undefined ||
          stack[i].appId === undefined ||
          stack[i].appId === nextStateSnapshot.appId;
        if (sameScreen && sameAppIdentity) {
          ancestorFrameIndex = i;
          break;
        }
      }
      if (ancestorFrameIndex >= 0 && ancestorFrameIndex < stack.length - 1) {
        const remainingSiblingLabels = frame.elements
          .slice(frame.elementIndex)
          .map((candidate) => candidate.label);
        console.log(
          `[FRAME-RESUME-CONTEXT] frameTitle="${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}", ` +
          `cursor=${frame.elementIndex}/${frame.elements.length}, remainingLabels=${JSON.stringify(remainingSiblingLabels)}`,
        );
        console.log(
          `[FRAME-RESUME] "${element.label}" returned to ancestor frame depth=${ancestorFrameIndex} ` +
          `title="${stack[ancestorFrameIndex].state.screenTitle ?? "(none)"}"`,
        );

        resetCircuit(circuitBreaker);

        while (stack.length - 1 > ancestorFrameIndex) {
          stack.pop();
        }

        const resumedFrame = stack[ancestorFrameIndex];
        resumedFrame.state = {
          screenId: nextStateSnapshot.screenId,
          screenTitle: nextStateSnapshot.screenTitle,
          structureHash: nextStateStructureHash,
        };
        resumedFrame.appId = nextStateSnapshot.appId ?? resumedFrame.appId ?? config.appId;
        resumedFrame.isExternalApp = false;

        backtracker.registerPage(nextStateSnapshot.screenId, nextStateSnapshot.uiTree);

        transitionLifecycle.transitionCommitted += 1;
        const resumedStateNode = stateGraph.registerState(
          nextStateSnapshot,
          nextStateStructureHash,
        );
        stateGraph.registerTransition({
          from: currentStateNode.id,
          to: resumedStateNode.id,
          kind: "back",
          intentLabel: element.label,
          committed: true,
          attempts: elementRetries + 1,
        });
        currentStateNode = resumedStateNode;
        continue;
      }

      // Successful navigation — reset circuit breaker
      resetCircuit(circuitBreaker);

      // Determine child depth: external apps limited to config.externalLinkMaxDepth (default: 1)
      const externalMaxDepth = config.externalLinkMaxDepth ?? 1;
      const childDepth = isExternalApp
        ? externalMaxDepth
        : frame.depth + 1;

      // Push child frame for immediate exploration in next iteration
      console.log(`[FRAME-PUSH] Creating child frame for "${nextStateSnapshot.screenTitle}", parentTitle="${frame.state.screenTitle ?? frame.parentTitle}", parentFrameTitle="${frame.state.screenTitle}"`);
      stack.push({
        state: {
          screenId: nextStateSnapshot.screenId,
          screenTitle: nextStateSnapshot.screenTitle,
          structureHash: nextStateStructureHash,
        } as PageState,
        depth: childDepth,
        path: [...frame.path, element.label],
        elementIndex: 0,
        elements: [],
        // Child's parent is the current frame's page title (iOS back button shows parent title)
        parentTitle: frame.state.screenTitle ?? frame.parentTitle,
        // Track app identity for app switching detection
        appId: nextStateSnapshot.appId ?? config.appId,
        isExternalApp,
      });
      transitionLifecycle.transitionCommitted += 1;
      const nextStateNode = stateGraph.registerState(
        nextStateSnapshot,
        nextStateStructureHash,
      );
      stateGraph.registerTransition({
        from: currentStateNode.id,
        to: nextStateNode.id,
        kind: "forward",
        intentLabel: element.label,
        committed: true,
        attempts: elementRetries + 1,
      });
      currentStateNode = nextStateNode;
      
      // For external app pages, after exploration we'll use launchApp to return
      // (handled in the backtrack step below via isExternalApp flag)
      // Don't backtrack here — the child will handle return when it's done.
    }
    else {
      transitionLifecycle.transitionRejected += 1;
      stateGraph.registerTransition({
        from: currentStateNode.id,
        kind: "forward",
        intentLabel: element.label,
        committed: false,
        attempts: elementRetries + 1,
        failureReason: "tap-and-wait failed",
      });
    }
    // If element failed, continue the while loop to try next sibling.
    // No backtrack needed — we're still on the parent page (failed tap didn't navigate).
  }

  // --- Generate report ---
  const result: ExplorationResult = {
    visited,
    failed,
    aborted: isCircuitOpen(circuitBreaker) || Boolean(recoveryAbortReason),
    abortReason: recoveryAbortReason
      ?? (isCircuitOpen(circuitBreaker)
        ? `${circuitBreaker.consecutiveFailedPages} consecutive pages with no successful navigation — circuit breaker opened`
        : undefined),
    sampling: samplingState.appliedPages.size > 0
      ? {
          appliedPages: [...samplingState.appliedPages],
          skippedChildren: samplingState.skippedChildren,
          details: samplingState.details,
        }
      : undefined,
    transitionLifecycle,
    stateGraph: stateGraph.getSummary(),
  };

  await generateReport(
    visited.getEntries(),
    failed.getEntries(),
    config,
    {
      partial: result.aborted ?? false,
      abortReason: result.abortReason,
      durationMs: Date.now() - startTime,
      sampling: result.sampling,
      transitionLifecycle: result.transitionLifecycle,
      stateGraph: result.stateGraph,
    },
  );

  return result;
}
