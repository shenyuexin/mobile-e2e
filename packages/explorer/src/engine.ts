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
  ExplorerConfig,
  McpToolInterface,
  ExplorationResult,
  FailureEntry,
  Frame,
  PageState,
  Action,
  PageSnapshot,
} from "./types.js";
import { PageRegistry, hashUiStructure } from "./page-registry.js";
import { createSnapshotter, createTapExecutor, generateScreenId } from "./snapshot.js";
import { prioritizeElements } from "./element-prioritizer.js";
import { createBacktracker } from "./backtrack.js";
import {
  createCircuitBreaker,
  recordPageSuccess,
  recordPageFailure,
  resetCircuit,
  isCircuitOpen,
  shouldSkipPage,
} from "./circuit-breaker.js";
import { generateReport } from "./report.js";
import { hashVisibleTexts } from "./page-registry.js";

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

/**
 * Validate that a tap led to a real page change.
 *
 * SPEC §4.1, R1-#2 — prevents infinite loops from non-navigating elements.
 * R2-E — system dialog detection with structural check + keyword threshold >=3.
 */
function validateNavigation(
  nextSnapshot: { screenId: string; uiTree: Record<string, unknown> },
  prevState: { screenId: string },
): NavValidation {
  // Check 1: screenId changed — page content is different
  if (nextSnapshot.screenId === prevState.screenId) {
    return {
      navigated: false,
      reason: "screenId unchanged — element had no navigation effect",
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
  const backtracker = createBacktracker(mcp);

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

  const stableResult = await mcp.waitForUiStable({ timeoutMs: 10000 });
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
  console.log(`[ENGINE] Home page: screenId=${initialSnapshot.screenId}, screenTitle="${initialSnapshot.screenTitle || '(empty)'}", clickable=${initialSnapshot.clickableElements.length}`);
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
  backtracker.registerPage(initialSnapshot.screenId, initialSnapshot.uiTree);
  stack[0].state = {
    screenId: initialSnapshot.screenId,
    screenTitle: initialSnapshot.screenTitle,
    structureHash: hashUiStructure(initialSnapshot.uiTree),
  };
  // Populate home page's clickable elements
  stack[0].elements = prioritizeElements(initialSnapshot.clickableElements);
  // Set app identity for the home frame
  stack[0].appId = targetAppId;
  stack[0].isExternalApp = false; // Home page is always the target app

  const startTime = Date.now();

  // --- DFS main loop ---
  while (
    stack.length > 0 &&
    visited.count < config.maxPages &&
    !hasTimedOut(config.timeoutMs, startTime) &&
    !isCircuitOpen(circuitBreaker)
  ) {
    const frame = stack[stack.length - 1]; // PEEK (don't pop)

    // Step 0: Navigate to this frame's page if needed (R2-A: backtrack recovery)
    // Lenient mode for iOS: pages often have dynamic content that changes structural hash.
    // Instead of failing hard, try to recover but continue if recovery is unreliable.
    if (frame.depth > 0 && frame.state.screenId) {
      const onExpectedPage = await backtracker.isOnExpectedPage(
        frame.state.screenId,
        frame.state.screenTitle,
        frame.state.structureHash,
      );
      if (!onExpectedPage) {
        // Try one more navigate_back to recover
        const navBackResult = await backtracker.navigateBack(frame.parentTitle);
        if (navBackResult) {
          const recoveryCheck = await backtracker.isOnExpectedPage(
            frame.state.screenId,
            frame.state.screenTitle,
            frame.state.structureHash,
          );
          if (!recoveryCheck) {
            // iOS: structural hash may change due to dynamic content (suggestions, timestamps)
            // Instead of failing hard, log warning and try to continue
            console.log(
              `[BACKTRACK-WARN] Recovery check failed for "${frame.state.screenTitle || frame.parentTitle}", continuing anyway`,
            );
            // Don't pop the frame - continue exploring from current page
            // Record as warning, not failure
          }
        } else {
          // navigate_back itself failed
          // iOS: navigate_back may fail if page structure changed
          // Instead of failing hard, log warning and continue
          console.log(
            `[BACKTRACK-WARN] navigate_back failed for "${frame.parentTitle}", continuing anyway`,
          );
          // Don't pop the frame - continue exploring from current page
        }
      }
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
      frame.elements = prioritizeElements(snapshot.clickableElements);
      frame.state = {
        screenId: snapshot.screenId,
        screenTitle: snapshot.screenTitle,
        structureHash: hashUiStructure(snapshot.uiTree),
      };
      frame.parentTitle = snapshot.screenTitle ?? frame.parentTitle;
      recordPageSuccess(circuitBreaker); // reset per-page counter for new page
    }

    // Step 2: Visit next unexplored element
    if (frame.elementIndex >= frame.elements.length) {
      // All elements explored — pop and backtrack
      stack.pop();
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
          await mcp.waitForUiStable({ timeoutMs: 5000 });
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
    frame.elementIndex++; // advance cursor (even if this one fails)

    // Retry loop for this element
    let elementRetries = 0;
    let elementResult = await tapper.tapAndWait(element, config.timeoutMs);

    while (!elementResult.success) {
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
        console.log(`[EXTERNAL-LINK] Tapped "${element.label}" — waiting 3s for potential app switch...`);
        await mcp.waitForUiStable({ timeoutMs: 3000 });

        // Capture snapshot to detect app switching
        const nextStateSnapshot = await snapshotter.captureSnapshot(config);

        // Check if app actually switched by comparing with CURRENT app identity
        const isAppSwitched = nextStateSnapshot.appId !== undefined &&
                              nextStateSnapshot.appId !== currentAppId;

        if (isAppSwitched) {
          console.log(`[APP-SWITCH] Detected: ${currentAppId} -> ${nextStateSnapshot.appId}`);
          currentAppId = nextStateSnapshot.appId; // Update current app identity
        } else {
          console.log(`[EXTERNAL-LINK] No app switch detected (stayed in ${nextStateSnapshot.appId})`);
        }

        // Mark as external app if we're not in target app
        const isExternalApp = nextStateSnapshot.appId !== undefined && 
                              nextStateSnapshot.appId !== targetAppId;
        nextStateSnapshot.isExternalApp = isExternalApp;
        nextStateSnapshot.appId = nextStateSnapshot.appId ?? `external:${element.label}`;

        console.log(`[EXTERNAL-LINK] Exploring ${isExternalApp ? 'external' : 'internal'} app page: ${nextStateSnapshot.screenTitle || '(unknown)'}`);

        // Validate we navigated somewhere
        resetCircuit(circuitBreaker);

        const externalMaxDepth = config.externalLinkMaxDepth ?? 1;
        stack.push({
          state: {
            screenId: nextStateSnapshot.screenId,
            screenTitle: nextStateSnapshot.screenTitle,
            structureHash: hashUiStructure(nextStateSnapshot.uiTree),
          } as PageState,
          depth: isExternalApp ? externalMaxDepth : frame.depth + 1,
          path: [...frame.path, element.label],
          elementIndex: 0,
          elements: [],
          parentTitle: frame.state.screenTitle ?? frame.parentTitle,
          appId: nextStateSnapshot.appId,
          isExternalApp,
        });

        continue; // Don't do further nav validation for external links
      }

      // Normal in-app navigation
      const nextStateSnapshot = await snapshotter.captureSnapshot(config);

      // Check for app switching via appId change (non-link elements that open external apps)
      const isAppSwitched = nextStateSnapshot.appId !== undefined &&
                            nextStateSnapshot.appId !== currentAppId;
      if (isAppSwitched) {
        console.log(
          `[APP-SWITCH] Detected: ${currentAppId} -> ${nextStateSnapshot.appId} (via "${element.label}")`,
        );
        currentAppId = nextStateSnapshot.appId; // Update current app identity
      }

      // Validate navigation (R1-#2, R3-G)
      const navValidation = validateNavigation(
        {
          screenId: nextStateSnapshot.screenId,
          uiTree: nextStateSnapshot.uiTree as Record<string, unknown>,
        },
        { screenId: frame.state.screenId ?? "" },
      );

      if (!navValidation.navigated && !isAppSwitched) {
        if (navValidation.shouldDismissDialog) {
          // TODO: implement handleSystemDialog
          // For now, log and skip
          console.log(`[SYSTEM-DIALOG] ${navValidation.reason}`);
        } else {
          console.log(`[NO-NAV] ${navValidation.reason}`);
        }
        // Record this as a page-level failure for circuit breaker tracking
        const pageOpen = recordPageFailure(circuitBreaker);
        if (pageOpen) {
          console.log(
            `[CIRCUIT-BREAKER] Page ${frame.state.screenId} exceeded failure threshold (${circuitBreaker.currentPageFailures}/${circuitBreaker.threshold})`,
          );
        }
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

      // Successful navigation — reset circuit breaker
      resetCircuit(circuitBreaker);

      // Determine child depth: external apps limited to config.externalLinkMaxDepth (default: 1)
      const externalMaxDepth = config.externalLinkMaxDepth ?? 1;
      const childDepth = isExternalApp
        ? externalMaxDepth
        : frame.depth + 1;

      // Push child frame for immediate exploration in next iteration
      stack.push({
        state: {
          screenId: nextStateSnapshot.screenId,
          screenTitle: nextStateSnapshot.screenTitle,
          structureHash: hashUiStructure(nextStateSnapshot.uiTree),
        } as PageState,
        depth: childDepth,
        path: [...frame.path, element.label],
        elementIndex: 0,
        elements: [],
        // Child's parent is the current frame's page title (iOS back button shows parent title)
        parentTitle: frame.state.screenTitle ?? frame.parentTitle,
        // Track app identity for app switching detection
        appId: nextStateSnapshot.appId ?? config.appId,
        isExternalApp: isAppSwitched,
      });
      
      // For external app pages, after exploration we'll use launchApp to return
      // (handled in the backtrack step below via isExternalApp flag)
      // Don't backtrack here — the child will handle return when it's done.
    }
    // If element failed, continue the while loop to try next sibling.
    // No backtrack needed — we're still on the parent page (failed tap didn't navigate).
  }

  // --- Generate report ---
  const result: ExplorationResult = {
    visited,
    failed,
    aborted: isCircuitOpen(circuitBreaker),
    abortReason: isCircuitOpen(circuitBreaker)
      ? `${circuitBreaker.consecutiveFailedPages} consecutive pages with no successful navigation — circuit breaker opened`
      : undefined,
  };

  await generateReport(
    visited.getEntries(),
    failed.getEntries(),
    config,
    {
      partial: result.aborted ?? false,
      abortReason: result.abortReason,
      durationMs: Date.now() - startTime,
    },
  );

  return result;
}
