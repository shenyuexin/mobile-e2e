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

import { createBacktracker } from "./backtrack.js";
import {
	createCircuitBreaker,
	isCircuitOpen,
	recordPageFailure,
	recordPageSuccess,
	resetCircuit,
} from "./circuit-breaker.js";
import { prioritizeElements } from "./element-prioritizer.js";
import {
	attemptCancelFirstRecovery,
	buildRuleDecisionEntry,
	decideExplorerPageAction,
	FailureLog,
	handleFailure,
	hasTimedOut,
	isAndroidExplorerPlatform,
	isEditorEntryAction,
	isLowValueLeafAction,
	markSnapshotAsGated,
	pageTypeOf,
	validateNavigation,
} from "./engine-helpers.js";
import {
	compareFrameExplorationOrder,
	elementIdentity,
	isNavigationControlAction,
	isSideEffectAction,
	type SamplingState,
	shouldGateExternalAppFrame,
} from "./exploration-sampler.js";
import { returnToTargetAppFromForeignPage } from "./foreign-app-return.js";
import {
	findAncestorFrameIndex,
	reconcileStackToSnapshot,
} from "./frame-reconciler.js";
import {
	formatPageContextDecisionLog,
} from "./page-context-router.js";
import { hashUiStructure, PageRegistry } from "./page-registry.js";
import { generateReport } from "./report.js";
import {
	evaluateElementRules,
	evaluatePageRules,
	evaluateSamplingRules,
} from "./rules/rule-evaluator.js";
import {
	buildExplorerRuleRegistry,
} from "./rules/rule-registry.js";
import {
	discoverNextSegment,
	getCurrentSegmentElements,
	initScrollState,
	restoreSegment,
} from "./scroll-segment.js";
import { createSnapshotter, createTapExecutor } from "./snapshot.js";
import { createStateGraph } from "./state-graph.js";
import type {
	ExplorationResult,
	ExplorerConfig,
	Frame,
	McpToolInterface,
	PageState,
	RuleDecisionEntry,
	TransitionLifecycleSummary,
} from "./types.js";

export { FailureLog } from "./engine-helpers.js";

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
	const backtracker = createBacktracker(mcp, config.platform, config.appId);
	const stateGraph = createStateGraph();
	const ruleRegistry = buildExplorerRuleRegistry(config);

	// --- Sampling state (high-fanout collection pages) ---
	const samplingState: SamplingState = {
		appliedPages: new Set(),
		skippedChildren: 0,
		details: {},
	};
	const actionSuccessBudget = new Map<string, number>();
	const actionSuccessLimit = Math.max(
		0,
		config.maxActionSuccessesPerContext ?? 1,
	);
	const actionBudgetKey = (frame: Frame, label: string): string =>
		[
			frame.appId ?? config.appId,
			frame.state.screenId ?? frame.state.screenTitle ?? frame.path.join(" > "),
			label.trim().replace(/\s+/g, " ").toLowerCase(),
		].join("::");
	const isBudgetedAction = (label: string): boolean =>
		isEditorEntryAction(label) || isSideEffectAction(label);
	const hasActionBudget = (frame: Frame, label: string): boolean => {
		if (!isBudgetedAction(label)) {
			return true;
		}
		if (actionSuccessLimit <= 0) {
			return false;
		}
		return (actionSuccessBudget.get(actionBudgetKey(frame, label)) ?? 0) < actionSuccessLimit;
	};
	const recordActionBudgetSuccess = (frame: Frame, label: string): void => {
		if (!isBudgetedAction(label) || actionSuccessLimit <= 0) {
			return;
		}
		const key = actionBudgetKey(frame, label);
		actionSuccessBudget.set(key, (actionSuccessBudget.get(key) ?? 0) + 1);
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
	let initialSnapshot = await snapshotter.captureSnapshot(config);
	console.log(
		`[ENGINE] Home page: screenId=${initialSnapshot.screenId}, screenTitle="${initialSnapshot.screenTitle || "(empty)"}", clickable=${initialSnapshot.clickableElements.length}, pageType=${pageTypeOf(initialSnapshot)}`,
	);
	if (initialSnapshot.clickableElements.length > 0) {
		const first = initialSnapshot.clickableElements[0];
		console.log(
			`[ENGINE] First element: label="${first.label}", elementType="${first.elementType}"`,
		);
		// Print all clickable element labels
		for (const el of initialSnapshot.clickableElements.slice(0, 15)) {
			console.log(
				`  clickable: "${el.label.slice(0, 40)}" (${el.elementType})`,
			);
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

	const captureAndReconcileVisiblePage = async (options?: {
		allowRootReset?: boolean;
	}): Promise<Frame | undefined> => {
		const snapshot = await snapshotter.captureSnapshot(config);
		backtracker.registerPage(snapshot.screenId, snapshot.uiTree);
		const resumedFrame = reconcileStackToSnapshot(
			stack,
			snapshot,
			targetAppId,
			options,
		);
		if (resumedFrame) {
			currentAppId = snapshot.appId ?? resumedFrame.appId ?? currentAppId;
		}
		return resumedFrame;
	};

	const initialPageAction = decideExplorerPageAction(
		initialSnapshot,
		config,
		ruleRegistry,
		0,
		[],
	);
	if (initialPageAction.type === "gated") {
		console.log(formatPageContextDecisionLog(initialPageAction));
		markSnapshotAsGated(
			initialSnapshot,
			initialPageAction,
			`pageContext:${initialPageAction.ruleFamily ?? "heuristic"}`,
		);

		if (initialPageAction.recoveryMethod === "cancel-first") {
			await attemptCancelFirstRecovery(mcp);
			const recoveredSnapshot = await snapshotter.captureSnapshot(config);
			if (recoveredSnapshot.screenId !== initialSnapshot.screenId) {
				initialSnapshot = recoveredSnapshot;
			}
		}
	}

	visited.register({ alreadyVisited: false }, initialSnapshot, []);
	const initialStructureHash = hashUiStructure(initialSnapshot.uiTree);
	let currentStateNode = stateGraph.registerState(
		initialSnapshot,
		initialStructureHash,
	);
	backtracker.registerPage(initialSnapshot.screenId, initialSnapshot.uiTree);
	stack[0].state = {
		screenId: initialSnapshot.screenId,
		screenTitle: initialSnapshot.screenTitle,
		pageContextType: pageTypeOf(initialSnapshot),
		structureHash: initialStructureHash,
	};
	const homeElements = prioritizeElements(initialSnapshot.clickableElements);
	const initialRuleDecisions: RuleDecisionEntry[] = [];
	stack[0].elements = homeElements.filter((el) => {
		const ruleDecision = evaluateElementRules(ruleRegistry, {
				path: [],
				depth: 0,
				mode: config.mode,
				platform: config.platform,
				snapshot: initialSnapshot,
				element: el,
			});
		if (!ruleDecision.matched) {
			return true;
		}
		const entry = buildRuleDecisionEntry(ruleDecision, {
			path: [],
			snapshot: initialSnapshot,
			element: el,
		});
		if (entry) {
			initialRuleDecisions.push(entry);
		}
		return false;
	});
	initialSnapshot.ruleDecisions = initialRuleDecisions;
	// Set app identity for the home frame
	stack[0].appId = targetAppId;
	stack[0].isExternalApp = false; // Home page is always the target app
	// Initialize scroll state on the root frame
	initScrollState(stack[0], initialSnapshot, config);
	visited.updatePageMetadata(initialSnapshot);

	const startTime = Date.now();
	let recoveryAbortReason: string | undefined;
	const transitionLifecycle: TransitionLifecycleSummary = {
		actionSent: 0,
		postStateObserved: 0,
		transitionCommitted: 0,
		transitionRejected: 0,
	};

	const areFramesExhausted = (frames: Frame[]): boolean =>
		frames.every(
			(candidate) =>
				candidate.elementIndex >= getCurrentSegmentElements(candidate).length,
		);

	// --- DFS main loop ---
	while (
		stack.length > 0 &&
		visited.count < config.maxPages &&
		!hasTimedOut(config.timeoutMs, startTime) &&
		!isCircuitOpen(circuitBreaker)
	) {
		const frame = stack[stack.length - 1]; // PEEK (don't pop)
		let currentSegmentElements = getCurrentSegmentElements(frame);
		console.log(
			`[FRAME-LOOP] depth=${frame.depth}, stack=${stack.length}, cursor=${frame.elementIndex}/${currentSegmentElements.length}, ` +
				`frameTitle="${frame.state.screenTitle ?? "(none)"}", frameScreenId="${frame.state.screenId ?? "(none)"}"` +
				(frame.scrollState
					? `, segment=${frame.scrollState.segmentIndex}/${frame.scrollState.segments.length}`
					: ""),
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
				const resumedAfterRecovery =
					isAndroidExplorerPlatform(config.platform) &&
					(recovered || frame.isExternalApp)
						? await captureAndReconcileVisiblePage()
						: undefined;
				if (resumedAfterRecovery && resumedAfterRecovery !== frame) {
					console.log(
						`[FRAME-GUARD] recovered by reconciling to ancestor "${resumedAfterRecovery.state.screenTitle ?? resumedAfterRecovery.state.screenId ?? "(unknown)"}"`,
					);
					continue;
				}
				const alignedAfterRecovery = recovered
					? await backtracker.isOnExpectedPage(
							frame.state.screenId,
							frame.state.screenTitle,
							frame.state.structureHash,
						)
					: false;

				if (!alignedAfterRecovery) {
					if (
						frame.depth === 0 &&
						frame.elementIndex >= frame.elements.length
					) {
						console.log(
							`[FRAME-GUARD] Home page elements exhausted. Exploration complete.`,
						);
						break;
					}

					const exhaustedTail =
						frame.depth > 0 &&
						frame.elementIndex >= getCurrentSegmentElements(frame).length &&
						areFramesExhausted(stack.slice(0, -1));
					if (exhaustedTail) {
						console.log(
							`[FRAME-GUARD] mismatch after exhausted tail; dropping frame depth=${frame.depth} ` +
								`title="${frame.state.screenTitle ?? "(unknown)"}" without recording failure`,
						);
						stack.pop();
						continue;
					}

					failed.record({
						pageScreenId: frame.state.screenId ?? "unknown",
						elementLabel:
							frame.state.screenTitle ?? frame.parentTitle ?? "resume-frame",
						failureType: "BACKTRACK_MISMATCH",
						retryCount: recovered ? 1 : 0,
						errorMessage: `ensureFrameAligned mismatch for "${frame.state.screenTitle || frame.parentTitle || "unknown"}"`,
						depth: frame.depth,
						path: frame.path,
					});

					if (frame.depth === 0) {
						console.log(
							`[FRAME-GUARD] Home page recovery failed. Attempting launch_app to restart...`,
						);
						try {
							const expectedHomeScreenId = frame.state.screenId;
							const expectedHomeTitle = frame.state.screenTitle;
							const expectedHomeStructureHash = frame.state.structureHash;
							await mcp.launchApp({ appId: config.appId });
							await mcp.waitForUiStable({ timeoutMs: 3000 });

							const returnSnapshot = await snapshotter.captureSnapshot(config);
							console.log(
								`[FRAME-GUARD] launchApp returned to: ${returnSnapshot.screenTitle || "(unknown)"}`,
							);

							const alignedAfterLaunch = await backtracker.isOnExpectedPage(
								expectedHomeScreenId ?? "unknown",
								expectedHomeTitle,
								expectedHomeStructureHash,
							);
							if (!alignedAfterLaunch) {
								console.log(
									`[FRAME-GUARD] launchApp did not restore home page. Aborting.`,
								);
								recoveryAbortReason = `Home recovery failed: launchApp did not restore expected page`;
								break;
							}
							frame.state = {
								screenId: returnSnapshot.screenId,
								screenTitle: returnSnapshot.screenTitle,
								structureHash: hashUiStructure(returnSnapshot.uiTree),
							};
							backtracker.registerPage(
								returnSnapshot.screenId,
								returnSnapshot.uiTree,
							);
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
		// UNLESS the root frame was reset (e.g., after recovery) and has no elements
		if (frame.elementIndex === 0 && frame.elements.length === 0) {
			const snapshot = await snapshotter.captureSnapshot(config);
			const dedupResult = await visited.dedup(snapshot, frame.path);
			if (dedupResult.alreadyVisited) {
				if (dedupResult.warning === "same-screen-different-path") {
					const aliasSnapshot = {
						...snapshot,
						screenId: `${snapshot.screenId}:alias:${visited.count + 1}`,
						explorationStatus: "reached-not-expanded" as const,
						stoppedByPolicy: "dedup:same-screen-different-path",
						ruleFamily: "dedup_alias",
					};
					visited.register({ alreadyVisited: false }, aliasSnapshot, frame.path);
				}
				stack.pop();
				if (frame.depth > 0) {
					const recovered = await backtracker.navigateBack(frame.parentTitle);
					const resumedFrame =
						recovered && isAndroidExplorerPlatform(config.platform)
							? await captureAndReconcileVisiblePage()
							: undefined;
					if (resumedFrame) {
						console.log(
							`[DEDUP-RETURN] Reconciled stack to page "${resumedFrame.state.screenTitle ?? resumedFrame.state.screenId ?? "(unknown)"}" at depth=${resumedFrame.depth}`,
						);
					}
					if (frame.isExternalApp) {
						currentAppId = targetAppId;
					}
				}
				continue;
			}

			const pageAction = decideExplorerPageAction(
				snapshot,
				config,
				ruleRegistry,
				frame.depth,
				frame.path,
			);
			if (pageAction.type === "gated") {
				console.log(
					`[PAGE-CONTEXT] gated page at depth=${frame.depth}, title="${snapshot.screenTitle ?? snapshot.screenId}", ` +
						`reason="${pageAction.reason}"`,
				);
				markSnapshotAsGated(
					snapshot,
					pageAction,
					`pageContext:${pageAction.ruleFamily ?? "heuristic"}`,
				);
				visited.register(dedupResult, snapshot, frame.path);
				backtracker.registerPage(snapshot.screenId, snapshot.uiTree);
				currentStateNode = stateGraph.registerState(
					snapshot,
					hashUiStructure(snapshot.uiTree),
				);
				recordPageSuccess(circuitBreaker);
				stack.pop();
				if (frame.depth > 0) {
					await backtracker.navigateBack(frame.parentTitle);
					if (frame.isExternalApp) {
						currentAppId = targetAppId;
					}
				}
				continue;
			}

			visited.register(dedupResult, snapshot, frame.path);
			backtracker.registerPage(snapshot.screenId, snapshot.uiTree);
			const rawElements = prioritizeElements(snapshot.clickableElements).sort(
				(a, b) => compareFrameExplorationOrder(a, b, frame),
			);
			const frameRuleDecisions: RuleDecisionEntry[] = [];
			frame.elements = rawElements.filter((el) => {
				const ruleDecision = evaluateElementRules(ruleRegistry, {
						path: frame.path,
						depth: frame.depth,
						mode: config.mode,
						platform: config.platform,
						snapshot,
						element: el,
					});
				if (ruleDecision.matched) {
					const entry = buildRuleDecisionEntry(ruleDecision, {
						path: frame.path,
						snapshot,
						element: el,
					});
					if (entry) {
						frameRuleDecisions.push(entry);
					}
					return false;
				}
				return !isLowValueLeafAction(snapshot.screenTitle, el.label);
			});
			snapshot.ruleDecisions = frameRuleDecisions;
			const skippedCount = rawElements.length - frame.elements.length;
			console.log(
				`[FRAME-ELEMENTS] depth=${frame.depth}, title="${snapshot.screenTitle ?? snapshot.screenId ?? "(unknown)"}", ` +
					`count=${frame.elements.length}, labels=${JSON.stringify(frame.elements.map((candidate) => candidate.label))}` +
					(skippedCount > 0 ? `, skipped=${skippedCount}` : ""),
			);
			frame.state = {
				screenId: snapshot.screenId,
				screenTitle: snapshot.screenTitle,
				pageContextType: pageTypeOf(snapshot),
				structureHash: hashUiStructure(snapshot.uiTree),
			};
			currentStateNode = stateGraph.registerState(
				snapshot,
				frame.state.structureHash ?? "",
			);
			recordPageSuccess(circuitBreaker); // reset per-page counter for new page

			// --- Sampling check: high-fanout collection pages (smoke mode) ---
			const matchedRule = evaluateSamplingRules(ruleRegistry, {
				path: frame.path,
				depth: frame.depth,
				mode: config.mode,
				platform: config.platform,
				snapshot,
			});
			console.log(
				`[SAMPLING-DEBUG] path=[${frame.path.join(", ")}], title="${frame.state.screenTitle}", mode="${config.mode}", rules=${ruleRegistry.rules.length}, matched=${matchedRule.matched ? "yes" : "no"}`,
			);
			if (
				matchedRule.matched &&
				matchedRule.sampling?.strategy === "representative-child"
			) {
				snapshot.ruleDecision = buildRuleDecisionEntry(matchedRule, {
					path: frame.path,
					snapshot,
				});
				visited.updatePageMetadata(snapshot);
				const maxChildren = matchedRule.sampling.maxChildrenToValidate ?? 1;
				const excludePatterns = matchedRule.sampling.excludeActions ?? [];
				const hasExclude = excludePatterns.length > 0;

				// Filter out side-effect actions and explicitly excluded patterns
				const safeElements = frame.elements.filter((el) => {
					if (
						hasExclude &&
						excludePatterns.some((p) => new RegExp(p, "i").test(el.label))
					) {
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
					const selectedKeys = new Set(
						selectedElements.map((el) => elementIdentity(el)),
					);
					const skippedLabels = safeElements
						.filter((el) => !selectedKeys.has(elementIdentity(el)))
						.map((el) => el.label);
					const originalCount = safeElements.length;

					frame.elements = prioritizeElements(selectedElements);
					samplingState.appliedPages.add(frame.state.screenId ?? "unknown");
					samplingState.skippedChildren +=
						originalCount - frame.elements.length;
					samplingState.details[frame.state.screenId ?? "unknown"] = {
						screenTitle: frame.state.screenTitle,
						totalChildren: originalCount,
						exploredChildren: frame.elements.length,
						skippedChildren: skippedLabels.length,
						exploredLabels: selectedElements.map((el) => el.label),
						skippedLabels,
					};
					console.log(
						`[SAMPLING] Rule matched: "${matchedRule.ruleId ?? "unknown"}" — ` +
							`reducing ${originalCount} children to ${frame.elements.length} representative(s)`,
					);
				}
			}

			// Initialize scroll state after frame.elements is set
			initScrollState(frame, snapshot, config);
			visited.updatePageMetadata(snapshot);
			currentSegmentElements = getCurrentSegmentElements(frame);

			if (shouldGateExternalAppFrame(frame, config.externalLinkMaxDepth ?? 1)) {
				console.log(
					`[APP-SWITCH] Foreign app page at depth=${frame.depth}, title="${snapshot.screenTitle ?? snapshot.screenId}" — ` +
						`marking as reached-not-expanded (foreign_app_boundary)`,
				);
				markSnapshotAsGated(
					snapshot,
					{
						type: "gated",
						reason: `foreign app ${snapshot.appId ?? "(unknown)"} detected — target-app-only exploration rule`,
						recoveryMethod: "backtrack-cancel-first",
						ruleFamily: "foreign_app_boundary",
					},
					"singleTargetAppPolicy:foreign-app",
				);
				visited.updatePageMetadata(snapshot);
				stack.pop();
				if (frame.depth > 0) {
					// Navigate back to parent frame. If parent is also a foreign app but within
					// externalLinkMaxDepth, we stay in the foreign app chain. If parent is the
					// target app or a foreign app beyond the limit, returnToTargetAppFromForeignPage
					// will handle the full return.
					const parentFrame = stack[stack.length - 1];
					const parentIsWithinLimit =
						parentFrame &&
						!shouldGateExternalAppFrame(
							parentFrame,
							config.externalLinkMaxDepth ?? 1,
						);

					if (parentIsWithinLimit) {
						// Parent is within externalLinkMaxDepth — navigate back to it
						await backtracker.navigateBack(frame.parentTitle);
						const resumedFrame = await captureAndReconcileVisiblePage();
						if (resumedFrame) {
							console.log(
								`[APP-SWITCH] Returned to parent page "${resumedFrame.state.screenTitle ?? resumedFrame.state.screenId ?? "(unknown)"}" at depth=${resumedFrame.depth}`,
							);
						}
					} else {
						// Parent is target app or beyond limit — return to target app
						const result = await returnToTargetAppFromForeignPage({
							appId: config.appId,
							targetAppId,
							platform: config.platform,
							getCurrentAppId: () => currentAppId,
							setCurrentAppId: (appId) => {
								currentAppId = appId;
							},
							navigateBack: async () => {
								await backtracker.navigateBack();
							},
							launchApp: async (args) => {
								await mcp.launchApp(args);
							},
							waitForUiStable: async (args) => {
								await mcp.waitForUiStable(args);
							},
							captureAndReconcileVisiblePage,
							requireTargetAppMatch: true,
						});
						currentAppId = result.currentAppId;
					}
				}
				continue;
			}
		}

		// Step 2: Visit next unexplored element
		const liveContextForPlan = await backtracker.getCurrentPageContext();
		const currentLabelForPlan =
			liveContextForPlan.title ?? liveContextForPlan.screenId ?? "(unknown)";

		if (frame.elementIndex >= currentSegmentElements.length) {
			// Current segment exhausted — try scroll discovery before popping
			if (frame.scrollState?.enabled) {
				const segResult = await discoverNextSegment(mcp, frame, config);
				if (segResult.snapshot) {
					visited.updatePageMetadata(segResult.snapshot);
				}
				if (
					segResult.success &&
					segResult.newElements &&
					segResult.newElements.length > 0
				) {
					frame.elementIndex = 0;
					console.log(
						`[SCROLL-SEGMENT] Exploring segment ${frame.scrollState.segmentIndex} ` +
							`with ${segResult.newElements.length} elements`,
					);
					continue;
				}
				// No more segments — fall through to normal pop
				console.log(
					`[SCROLL-SEGMENT] No more segments for "${frame.state.screenTitle ?? "(none)"}"`,
				);
			}

			const expectedAfterAction = frame.parentTitle ?? "(root)";
			console.log(
				`[FRAME-PLAN] depth=${frame.depth}, stack=${stack.length}, cursor=${frame.elementIndex}/${currentSegmentElements.length}, ` +
					`current="${currentLabelForPlan}", expected="${expectedAfterAction}", nextAction=pop frame and backtrack`,
			);

			// All elements explored — pop and backtrack
			stack.pop();
			console.log(
				`[POP] Frame "${frame.state.screenTitle || "(none)"}" all ${frame.elements.length} elements explored. Stack now: ${stack.length}`,
			);
			if (stack.length > 0) {
				const newFrame = stack[stack.length - 1];
				console.log(
					`[POP] Next frame: depth=${newFrame.depth}, cursor=${newFrame.elementIndex}/${newFrame.elements.length}, title="${newFrame.state.screenTitle || "(none)"}"`,
				);
			}
			if (frame.elements.length > 0) {
				// Check if this page had any successful navigations
				// If not, increment consecutive failed pages
				// (tracked via circuit breaker state)
			}

			// Handle return from external app pages (can't use navigate_back across apps)
			if (frame.isExternalApp) {
				const result = await returnToTargetAppFromForeignPage({
					appId: config.appId,
					targetAppId,
					platform: config.platform,
					getCurrentAppId: () => currentAppId,
					setCurrentAppId: (appId) => {
						currentAppId = appId;
					},
					navigateBack: async () => {
						await backtracker.navigateBack();
					},
					launchApp: async (args) => {
						await mcp.launchApp(args);
					},
					waitForUiStable: async (args) => {
						await mcp.waitForUiStable(args);
					},
					captureAndReconcileVisiblePage,
					navigateBackToParentOnLaunchFailure: async () => {
						await backtracker.navigateBack(frame.parentTitle);
					},
				});
				currentAppId = result.currentAppId;

				if (result.resumedBySystemBack) {
					continue;
				}

				console.log(
					`[APP-SWITCH] Returned to ${currentAppId} — launchApp preserves app state`,
				);
				if (result.resumedFrame) {
					console.log(
						`[APP-SWITCH] Reconciled stack to page "${result.resumedFrame.state.screenTitle || "(unknown)"}" at depth=${result.resumedFrame.depth}`,
					);
				}
			} else if (frame.depth > 0) {
				// Normal in-app backtrack
				const recovered = await backtracker.navigateBack(frame.parentTitle);
				const resumedFrame =
					recovered && isAndroidExplorerPlatform(config.platform)
						? await captureAndReconcileVisiblePage()
						: undefined;
				if (resumedFrame) {
					console.log(
						`[POP-RETURN] Reconciled stack to page "${resumedFrame.state.screenTitle ?? resumedFrame.state.screenId ?? "(unknown)"}" at depth=${resumedFrame.depth}`,
					);
				}
			}
			continue;
		}

		// Skip elements known to be no-ops (screenId unchanged on previous attempt)
		while (frame.elementIndex < currentSegmentElements.length) {
			const candidate = currentSegmentElements[frame.elementIndex];
			if (frame.noOpElements?.has(candidate.label)) {
				console.log(
					`[NO-OP-SKIP] skipping known no-op element "${candidate.label.slice(0, 40)}" ` +
						`at index=${frame.elementIndex}/${currentSegmentElements.length}`,
				);
				frame.elementIndex++;
				continue;
			}
			if (!hasActionBudget(frame, candidate.label)) {
				console.log(
					`[ACTION-BUDGET-SKIP] skipping "${candidate.label.slice(0, 40)}" ` +
						`on "${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}" after ` +
						`${actionSuccessLimit} successful action(s) in this context`,
				);
				frame.elementIndex++;
				continue;
			}
			break;
		}

		if (frame.elementIndex >= currentSegmentElements.length) {
			continue;
		}

		const element = currentSegmentElements[frame.elementIndex];
		const expectedAfterAction = element.label.slice(0, 50);

		// Restore scroll segment visibility before tapping (if needed)
		if (frame.scrollState && frame.scrollState.segmentIndex > 0) {
			const restored = await restoreSegment(mcp, frame, config);
			if (!restored) {
				console.log(
					`[SCROLL-RESTORE] Giving up on segment ${frame.scrollState.segmentIndex} — ` +
						`skipping remaining elements`,
				);
				frame.elementIndex = currentSegmentElements.length;
				continue;
			}
		}

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
			recordActionBudgetSuccess(frame, element.label);

			// For external links, wait for app switch then detect it
			const isExternalLink = element.isExternalLink ?? false;

			if (isExternalLink) {
				console.log(
					`[EXTERNAL-LINK] Tapped "${element.label}" — waiting 2s for potential app switch...`,
				);
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
				const isAppSwitched =
					nextStateSnapshot.appId !== undefined &&
					nextStateSnapshot.appId !== currentAppId;

				if (isAppSwitched) {
					console.log(
						`[APP-SWITCH] In external app — immediately launching target app to return...`,
					);
					await mcp.launchApp({ appId: config.appId });
					await mcp.waitForUiStable({ timeoutMs: 2000 });
					currentAppId = targetAppId; // ← Correct: back to target app

					const returnSnapshot = await snapshotter.captureSnapshot(config);
					backtracker.registerPage(
						returnSnapshot.screenId,
						returnSnapshot.uiTree,
					);
					const resumedFrame = reconcileStackToSnapshot(
						stack,
						returnSnapshot,
						targetAppId,
					);
					if (resumedFrame) {
						console.log(
							`[EXTERNAL-LINK] Reconciled stack to page "${resumedFrame.state.screenTitle || "(unknown)"}" at depth=${resumedFrame.depth}`,
						);
					}
				} else {
					console.log(
						`[EXTERNAL-LINK] No app switch detected (stayed in ${nextStateSnapshot.appId})`,
					);
				}

				// Mark as external app if we're not in target app
				const isExternalApp =
					nextStateSnapshot.appId !== undefined &&
					nextStateSnapshot.appId !== targetAppId;
				nextStateSnapshot.isExternalApp = isExternalApp;
				nextStateSnapshot.appId =
					nextStateSnapshot.appId ?? `external:${element.label}`;

				// Only mark metadata when we actually switched to an external app
				if (isExternalApp) {
					nextStateSnapshot.explorationStatus = 'reached-not-expanded';
					nextStateSnapshot.stoppedByPolicy = 'externalLinkPolicy:skip';
					nextStateSnapshot.ruleFamily = 'foreign_app_boundary';
					nextStateSnapshot.recoveryMethod = 'launch-app-return';
				}

				console.log(
					`[EXTERNAL-LINK] External link detected. Returning immediately...`,
				);

				// Record this external link visit in the report
				visited.register({ alreadyVisited: false }, nextStateSnapshot, [
					...frame.path,
					element.label,
				]);

				// Do NOT push child frame for external app.
				// Just continue from the current frame — it will pop naturally.
				console.log(
					`[EXTERNAL-LINK] External link recorded, continuing from current frame`,
				);
				console.log(
					`[EXTERNAL-LINK] Current frame after: title="${frame.state.screenTitle}", elements=${frame.elements.length}, cursor=${frame.elementIndex}/${frame.elements.length}`,
				);
				// Log remaining elements
				for (let i = frame.elementIndex; i < frame.elements.length; i++) {
					console.log(
						`[EXTERNAL-LINK] Remaining element[${i}]: "${frame.elements[i].label.slice(0, 40)}"`,
					);
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

			const pageAction = decideExplorerPageAction(
				nextStateSnapshot,
				config,
				ruleRegistry,
				frame.depth + 1,
				[...frame.path, element.label],
			);
			if (pageAction.type === "gated") {
				console.log(
					`[PAGE-CONTEXT] gated page after tap "${element.label.slice(0, 40)}": ` +
						`title="${nextStateSnapshot.screenTitle ?? nextStateSnapshot.screenId}", reason="${pageAction.reason}"`,
				);
				markSnapshotAsGated(
					nextStateSnapshot,
					pageAction,
					`pageContext:${pageAction.ruleFamily ?? "heuristic"}`,
				);

				visited.register({ alreadyVisited: false }, nextStateSnapshot, [
					...frame.path,
					element.label,
				]);
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

				let recoveredViaCancel = false;
				if (pageAction.recoveryMethod === "cancel-first") {
					recoveredViaCancel = await attemptCancelFirstRecovery(mcp);
					if (recoveredViaCancel) {
						const resumedFrame = await captureAndReconcileVisiblePage({
							allowRootReset: false,
						});
						if (resumedFrame) {
							console.log(
								`[PAGE-CONTEXT] cancel-first recovered to "${resumedFrame.state.screenTitle ?? resumedFrame.state.screenId ?? "(unknown)"}" at depth=${resumedFrame.depth}`,
							);
							continue;
						}
						console.log(
							`[PAGE-CONTEXT] cancel-first landed on intermediate page not in stack; ` +
								`falling through to navigateBack for chained recovery`,
						);
					}
				}
				await backtracker.navigateBack(
					frame.state.screenTitle ?? frame.parentTitle,
				);
				continue;
			}

			const statefulRuleDecision = evaluatePageRules(ruleRegistry, {
				path: [...frame.path, element.label],
				depth: frame.depth + 1,
				mode: config.mode,
				platform: config.platform,
				snapshot: nextStateSnapshot,
			});
			if (statefulRuleDecision.matched && statefulRuleDecision.category === "stateful-form") {
				console.log(
					`[STATEFUL-SKIP] Reached stateful form-entry branch "${nextStateSnapshot.screenTitle ?? element.label}"; ` +
						`recording visit without expansion`,
				);
				nextStateSnapshot.explorationStatus = "reached-not-expanded";
				nextStateSnapshot.stoppedByPolicy = `statefulFormPolicy:${config.statefulFormPolicy ?? "skip"}`;
				nextStateSnapshot.ruleFamily = "stateful_form_entry";
				nextStateSnapshot.recoveryMethod = "backtrack-cancel-first";
				nextStateSnapshot.ruleDecision = buildRuleDecisionEntry(statefulRuleDecision, {
					path: [...frame.path, element.label],
					snapshot: nextStateSnapshot,
					element,
				});

				visited.register({ alreadyVisited: false }, nextStateSnapshot, [
					...frame.path,
					element.label,
				]);
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

				await backtracker.navigateBack(
					frame.state.screenTitle ?? frame.parentTitle,
				);
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
			const isAppSwitched =
				navValidation.navigated &&
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
					if (
						frame.scrollState?.enabled &&
						frame.elementIndex >= currentSegmentElements.length
					) {
						console.log(
							`[PAGE-SKIP] Skipping remaining visible segment elements on "${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}" after repeated non-navigation actions; preserving scroll discovery`,
						);
						frame.elementIndex = currentSegmentElements.length;
					} else {
						console.log(
							`[PAGE-SKIP] Skipping remaining elements on "${frame.state.screenTitle ?? frame.state.screenId ?? "(unknown)"}" after repeated non-navigation actions`,
						);
						frame.elementIndex = frame.elements.length;
					}
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
				// Track no-op elements to skip them on future visits to this frame
				if (
					navValidation.reason?.includes("screenId unchanged") ||
					navValidation.reason?.includes("screen title unchanged")
				) {
					if (!frame.noOpElements) {
						frame.noOpElements = new Set();
					}
					frame.noOpElements.add(element.label);
				}
				continue; // element didn't lead anywhere — try next sibling
			}

			// Check for app switching (US-002) — mark as external if not in target app
			const isExternalApp =
				isAppSwitched ||
				(nextStateSnapshot.appId !== undefined &&
					nextStateSnapshot.appId !== targetAppId);
			if (isExternalApp) {
				console.log(
					`[APP-SWITCH] In external app: ${nextStateSnapshot.appId} (via "${element.label}") — will explore via DFS with isExternalApp flag`,
				);
				nextStateSnapshot.isExternalApp = true;
			}

			const nextStateStructureHash = hashUiStructure(nextStateSnapshot.uiTree);

			const ancestorFrameIndex = findAncestorFrameIndex(
				stack,
				nextStateSnapshot,
			);

			if (ancestorFrameIndex === stack.length - 1) {
				const logPrefix = element.isPseudoNavigation
					? "[PSEUDO-NAV]"
					: "[SCREEN-DRIFT]";
				console.log(
					`${logPrefix} "${element.label}" changed state on "${frame.state.screenTitle ?? "(unknown)"}" ` +
						`without page transition — updating current frame instead of pushing child`,
				);
				frame.state.screenId = nextStateSnapshot.screenId;
				frame.state.structureHash = nextStateStructureHash;
				transitionLifecycle.transitionCommitted += 1;
				stateGraph.registerTransition({
					from: currentStateNode.id,
					to: currentStateNode.id,
					kind: "forward",
					intentLabel: element.label,
					committed: true,
					attempts: elementRetries + 1,
				});
				continue;
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
				resumedFrame.appId =
					nextStateSnapshot.appId ?? resumedFrame.appId ?? config.appId;
				resumedFrame.isExternalApp = false;

				backtracker.registerPage(
					nextStateSnapshot.screenId,
					nextStateSnapshot.uiTree,
				);

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

			resetCircuit(circuitBreaker);

			// Determine child depth: foreign app pages use normal DFS depth progression
			// (they are gated as reached-not-expanded in the snapshot phase)
			const childDepth = frame.depth + 1;

			// Push child frame for immediate exploration in next iteration
			console.log(
				`[FRAME-PUSH] Creating child frame for "${nextStateSnapshot.screenTitle}", parentTitle="${frame.state.screenTitle ?? frame.parentTitle}", parentFrameTitle="${frame.state.screenTitle}"`,
			);
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
				parentTitle: frame.state.screenTitle ?? frame.parentTitle,
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
		} else {
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
		abortReason:
			recoveryAbortReason ??
			(isCircuitOpen(circuitBreaker)
				? `${circuitBreaker.consecutiveFailedPages} consecutive pages with no successful navigation — circuit breaker opened`
				: undefined),
		sampling:
			samplingState.appliedPages.size > 0
				? {
						appliedPages: [...samplingState.appliedPages],
						skippedChildren: samplingState.skippedChildren,
						details: samplingState.details,
					}
				: undefined,
		transitionLifecycle,
		stateGraph: stateGraph.getSummary(),
	};

	await generateReport(visited.getEntries(), failed.getEntries(), config, {
		partial: result.aborted ?? false,
		abortReason: result.abortReason,
		durationMs: Date.now() - startTime,
		sampling: result.sampling,
		transitionLifecycle: result.transitionLifecycle,
		stateGraph: result.stateGraph,
	});

	return result;
}
