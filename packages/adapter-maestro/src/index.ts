import {
  type ActionIntent,
  type ActionOutcomeSummary,
  type AndroidPerformancePreset,
  type CollectDebugEvidenceData,
  type CollectDebugEvidenceInput,
  type CompareAgainstBaselineData,
  type CompareAgainstBaselineInput,
  type CompleteTaskData,
  type CompleteTaskInput,
  type CaptureJsConsoleLogsData,
  type CaptureJsConsoleLogsInput,
  type JsConsoleLogSummary,
  type CaptureJsNetworkEventsData,
  type CaptureJsNetworkEventsInput,
  type DescribeCapabilitiesData,
  type DescribeCapabilitiesInput,
  type DetectInterruptionData,
  type DetectInterruptionInput,
  type CollectDiagnosticsData,
  type CollectDiagnosticsInput,
  type DebugSignalSummary,
  type EvidenceDeltaSummary,
  type ExplainLastFailureData,
  type ExplainLastFailureInput,
  type FailureAttribution,
  type FailureSignature,
  type FindSimilarFailuresData,
  type FindSimilarFailuresInput,
  type GetCrashSignalsData,
  type GetCrashSignalsInput,
  type ExecutionEvidence,
  type GetActionOutcomeData,
  type GetActionOutcomeInput,
  type GetScreenSummaryData,
  type GetScreenSummaryInput,
  type GetSessionStateData,
  type GetSessionStateInput,
  type GetLogsData,
  type GetLogsInput,
  type InspectUiData,
  type ResolveUiTargetData,
  type ResolveUiTargetInput,
  type DeviceInfo,
  type DoctorCheck,
  type DoctorInput,
  type ExecuteIntentData,
  type ExecuteIntentInput,
  type ExecuteIntentStepInput,
  type InspectUiInput,
  type InspectUiNode,
  type InspectUiSummary,
  type InstallAppInput,
  type InstallAppData,
  type LaunchAppInput,
  type LaunchAppData,
  type ListJsDebugTargetsData,
  type ListJsDebugTargetsInput,
  type JsDebugTarget,
  type JsFailureGroup,
  type JsConsoleLogEntry,
  type JsNetworkEvent,
  type JsNetworkFailureSummary,
  type JsStackFrame,
  type ListDevicesInput,
  type LogSummary,
  type MeasureAndroidPerformanceData,
  type MeasureAndroidPerformanceInput,
  type MeasureIosPerformanceData,
  type MeasureIosPerformanceInput,
  type OcrEvidence,
  type Platform,
  type PerformActionWithEvidenceData,
  type PerformActionWithEvidenceInput,
  type QueryUiData,
  type QueryUiInput,
  type QueryUiMatch,
  type RankFailureCandidatesData,
  type RankFailureCandidatesInput,
  type RecoverToKnownStateData,
  type RecoverToKnownStateInput,
  type RecordScreenData,
  type RecordScreenInput,
  type ResetAppStateData,
  type ResetAppStateInput,
  type ResetAppStateStrategy,
  type RecoverySummary,
  type ReplayLastStablePathData,
  type ReplayLastStablePathInput,
  type ReasonCode,
  type RunFlowInput,
  type RunFlowData,
  type RunnerProfile,
  type SessionTimelineEvent,
  type SupportedActionType,
  type ScreenshotInput,
  type ScreenshotData,
  type ScrollAndTapElementData,
  type ScrollAndTapElementInput,
  type ScrollAndResolveUiTargetData,
  type ScrollAndResolveUiTargetInput,
  type IosPerformanceTemplate,
  type InterruptionEvent,
  type InterruptionPolicyRuleV2,
  type TapElementData,
  type TapElementInput,
  type TapData,
  type TapInput,
  type TerminateAppInput,
  type TerminateAppData,
  type ToolResult,
  type TypeTextData,
  type TypeTextInput,
  type ClassifyInterruptionData,
  type ClassifyInterruptionInput,
  type TypeIntoElementData,
  type TypeIntoElementInput,
  type TaskStepOutcome,
  type TaskStepPlan,
  type ResolveInterruptionData,
  type ResolveInterruptionInput,
  type ResumeInterruptedActionData,
  type ResumeInterruptedActionInput,
  type ResumeCheckpoint,
  type SimilarFailure,
  type StateSummary,
  type SuggestKnownRemediationData,
  type SuggestKnownRemediationInput,
  type UiOrchestrationStepResult,
  type UiScrollDirection,
  type WaitForUiData,
  type WaitForUiInput,
  type WaitForUiMode,
  REASON_CODES,
} from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_OCR_FALLBACK_POLICY,
  MacVisionOcrProvider,
  minimumConfidenceForOcrAction,
  resolveTextTarget,
  shouldUseOcrFallback,
  verifyOcrAction,
  type OcrFallbackActionType,
} from "@mobile-e2e-mcp/adapter-vision";
import {
  appendSessionTimelineEvent,
  isHighRiskInterruptionActionAllowed,
  isToolAllowedByProfile,
  listActionRecordsForSession,
  loadAccessProfile,
  loadActionRecord,
  loadBaselineIndex,
  loadFailureIndex,
  loadInterruptionPolicyConfig,
  loadLatestActionRecordForSession,
  loadSessionRecord,
  persistActionRecord,
  persistInterruptionEvent,
  persistSessionState,
  queryTimelineAroundAction,
  recordBaselineEntry,
  recordFailureSignature,
  resolveInterruptionPlan,
  type PersistedActionRecord,
} from "@mobile-e2e-mcp/core";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildCapabilityProfile } from "./capability-model.js";
import {
  type ArtifactDirectory,
  buildArtifactsDir,
  buildDefaultDeviceId,
  DEFAULT_ANDROID_DEVICE_ID,
  DEFAULT_IOS_SIMULATOR_UDID,
  DEFAULT_FLOWS,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  isRecord,
  loadHarnessSelection,
  parseHarnessConfig,
  readNonEmptyString,
  readStringArray,
  resolveRepoPath,
  resolveSessionDefaults,
} from "./harness-config.js";
import {
  collectHarnessChecks,
  collectDiagnosticsWithRuntime,
  buildInstallCommandWithRuntime,
  buildLaunchCommandWithRuntime,
  buildResetPlanWithRuntime,
  getCrashSignalsWithRuntime,
  getLogsWithRuntime,
  getInstallArtifactSpec,
  listAvailableDevices as listAvailableDevicesRuntime,
  recordScreenWithRuntime,
  resolveInstallArtifactPath,
  summarizeInfoCheck,
  takeScreenshotWithRuntime,
  terminateAppWithRuntime,
} from "./device-runtime.js";
import {
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  buildUiTargetResolution,
  buildInspectUiSummary,
  hasQueryUiSelector,
  isWaitConditionMet,
  normalizeQueryUiSelector,
  parseAndroidUiHierarchyNodes,
  parseInspectUiSummary,
  parseIosInspectNodes,
  parseIosInspectSummary,
  queryUiNodes,
  reasonCodeForResolutionStatus,
  shouldAbortWaitForUiAfterReadFailure,
} from "./ui-model.js";
import {
  type AndroidUiSnapshot,
  type AndroidUiSnapshotFailure,
  type IosUiSnapshot,
  type IosUiSnapshotFailure,
  buildAndroidUiDumpCommands,
  buildIdbCommand,
  buildIosSwipeCommand,
  buildIosUiDescribeCommand,
  captureAndroidUiSnapshot,
  captureIosUiSnapshot,
  isAndroidUiSnapshotFailure,
  isIosUiSnapshotFailure,
  probeIdbAvailability,
  resolveIdbCliPath,
  resolveIdbCompanionPath,
} from "./ui-runtime.js";
import {
  buildResolutionNextSuggestions,
  inspectUiWithMaestroTool,
  normalizeScrollDirection,
  normalizeWaitForUiMode,
  queryUiWithMaestroTool,
  resolveUiTargetWithMaestroTool,
  reasonCodeForWaitTimeout,
  scrollAndResolveUiTargetWithMaestroTool,
  scrollAndTapElementWithMaestroTool,
  tapElementWithMaestroTool,
  tapWithMaestroTool,
  typeIntoElementWithMaestroTool,
  typeTextWithMaestroTool,
  waitForUiWithMaestroTool,
} from "./ui-tools.js";
import { classifyInterruptionFromSignals } from "./interruption-classifier.js";
import { detectInterruptionFromSummary } from "./interruption-detector.js";
import { runDoctorWithMaestro } from "./doctor-runtime.js";
import {
  performActionWithEvidenceWithMaestro as performActionWithEvidenceWithMaestroFromActionOrchestrator,
  resetInterruptionGuardTestHooksForTesting as resetInterruptionGuardTestHooksForTestingFromActionOrchestrator,
  resetOcrFallbackTestHooksForTesting as resetOcrFallbackTestHooksForTestingFromActionOrchestrator,
  setInterruptionGuardTestHooksForTesting as setInterruptionGuardTestHooksForTestingFromActionOrchestrator,
  setOcrFallbackTestHooksForTesting as setOcrFallbackTestHooksForTestingFromActionOrchestrator,
} from "./action-orchestrator.js";
import {
  installAppWithRuntime,
  launchAppWithRuntime,
} from "./app-lifecycle-tools.js";
import {
  compareAgainstBaselineWithMaestro as compareAgainstBaselineWithMaestroFromActionOutcome,
  explainLastFailureWithMaestro as explainLastFailureWithMaestroFromActionOutcome,
  findSimilarFailuresWithMaestro as findSimilarFailuresWithMaestroFromActionOutcome,
  getActionOutcomeWithMaestro as getActionOutcomeWithMaestroFromActionOutcome,
  rankFailureCandidatesWithMaestro as rankFailureCandidatesWithMaestroFromActionOutcome,
  suggestKnownRemediationWithMaestro as suggestKnownRemediationWithMaestroFromActionOutcome,
} from "./action-outcome.js";
import {
  buildInterruptionCheckpoint,
  classifyInterruptionWithMaestro as classifyInterruptionWithMaestroFromInterruptionTools,
  detectInterruptionWithMaestro as detectInterruptionWithMaestroFromInterruptionTools,
  resolveInterruptionWithMaestro as resolveInterruptionWithMaestroFromInterruptionTools,
  resumeInterruptedActionWithMaestro as resumeInterruptedActionWithMaestroFromInterruptionTools,
} from "./interruption-tools.js";
import {
  collectBasicRunResultWithRuntime,
  runFlowWithRuntime,
} from "./flow-runtime.js";
import {
  isPerfettoShellProbeAvailable as isPerfettoShellProbeAvailableFromPerformanceTools,
  measureAndroidPerformanceWithRuntime,
  measureIosPerformanceWithRuntime,
} from "./performance-tools.js";
import {
  buildLogSummary as buildLogSummaryWithSessionState,
  buildStateSummaryFromSignals as buildStateSummaryFromSignalsWithSessionState,
  getScreenSummaryWithMaestro as getScreenSummaryWithMaestroFromSessionState,
  getSessionStateWithMaestro as getSessionStateWithMaestroFromSessionState,
  summarizeStateDelta,
} from "./session-state.js";
import {
  recoverToKnownStateWithMaestro as recoverToKnownStateWithMaestroFromRecoveryTools,
  replayLastStablePathWithMaestro as replayLastStablePathWithMaestroFromRecoveryTools,
} from "./recovery-tools.js";
import {
  completeTaskWithMaestro as completeTaskWithMaestroFromTaskPlanner,
  executeIntentPlanWithMaestro as executeIntentPlanWithMaestroFromTaskPlanner,
  executeIntentWithMaestro as executeIntentWithMaestroFromTaskPlanner,
} from "./task-planner.js";
import { buildInterruptionEvent, decideInterruptionResolution } from "./interruption-resolver.js";
import { buildInterruptionTimelineEvent, buildResumeCheckpoint, hasStateDrift, pickEventSource, summarizeInterruptionDetail } from "./interruption-orchestrator.js";
import {
  buildInspectorExceptionLogEntry,
  buildJsConsoleLogSummary,
  buildJsDebugTargetSelectionNarrativeLine,
  buildJsNetworkFailureSummary,
  buildJsNetworkSuspectSentences,
  captureJsConsoleLogsWithMaestro,
  captureJsNetworkEventsWithMaestro,
  classifyDebugSignal,
  formatJsConsoleEntry,
  listJsDebugTargetsWithMaestro,
  normalizeMetroBaseUrl,
  rankJsDebugTarget,
  selectPreferredJsDebugTarget,
  selectPreferredJsDebugTargetWithReason,
} from "./js-debug.js";
import {
  buildAndroidPerformanceData,
  buildIosPerformanceData,
  buildPerformanceMarkdownReport,
  buildPerformanceNextSuggestions,
  parseTraceProcessorTsv,
  summarizeAndroidPerformance,
  summarizeIosPerformance,
} from "./performance-model.js";
import {
  DEFAULT_PERFORMANCE_DURATION_MS,
  buildAndroidPerformancePlan,
  buildIosPerformancePlan,
  buildTraceProcessorScript,
  buildTraceProcessorShellCommand,
  resolveAndroidPerformancePlanStrategy,
  resolveTraceProcessorPath,
} from "./performance-runtime.js";
import {
  buildExecutionEvidence,
  buildFailureReason,
  countNonEmptyLines,
  executeRunner,
  normalizePositiveInteger,
  shellEscape,
  toRelativePath,
  type CommandExecution,
  unrefTimer,
} from "./runtime-shared.js";

export { buildCapabilityProfile } from "./capability-model.js";
export {
  buildArtifactsDir,
  buildDefaultAppId,
  buildDefaultDeviceId,
  DEFAULT_ANDROID_APP_ID,
  DEFAULT_ANDROID_DEVICE_ID,
  DEFAULT_IOS_APP_ID,
  DEFAULT_IOS_SIMULATOR_UDID,
  resolveRepoPath,
  resolveSessionDefaults,
} from "./harness-config.js";
export {
  buildInspectorExceptionLogEntry,
  buildJsConsoleLogSummary,
  buildJsDebugTargetSelectionNarrativeLine,
  buildJsNetworkFailureSummary,
  buildJsNetworkSuspectSentences,
  captureJsConsoleLogsWithMaestro,
  captureJsNetworkEventsWithMaestro,
  listJsDebugTargetsWithMaestro,
  normalizeMetroBaseUrl,
  rankJsDebugTarget,
  selectPreferredJsDebugTarget,
  selectPreferredJsDebugTargetWithReason,
};
export {
  cancelRecordSessionWithMaestro,
  endRecordSessionWithMaestro,
  getRecordSessionStatusWithMaestro,
  startRecordSessionWithMaestro,
} from "./recording-runtime.js";
export { classifyInterruptionFromSignals } from "./interruption-classifier.js";
export { detectInterruptionFromSummary } from "./interruption-detector.js";
export { buildInterruptionEvent, decideInterruptionResolution } from "./interruption-resolver.js";
export { buildInterruptionTimelineEvent, buildResumeCheckpoint, hasStateDrift, pickEventSource, summarizeInterruptionDetail } from "./interruption-orchestrator.js";
export { classifyDoctorOutcome, isDoctorCriticalFailure } from "./doctor-runtime.js";

const DEFAULT_GET_LOGS_LINES = 200;
const DEFAULT_GET_CRASH_LINES = 120;
const DEFAULT_DEBUG_PACKET_JS_TIMEOUT_MS = 1000;
const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;
const DEFAULT_RECORD_SCREEN_DURATION_MS = 15_000;
const MAX_ANDROID_SCREENRECORD_DURATION_MS = 180_000;

function sanitizeArtifactSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "session";
}

function normalizeRecordDurationMs(value: number | undefined, platform: Platform): number {
  const normalized = normalizePositiveInteger(value, DEFAULT_RECORD_SCREEN_DURATION_MS);
  if (platform === "android") {
    return Math.min(MAX_ANDROID_SCREENRECORD_DURATION_MS, normalized);
  }
  return normalized;
}

function normalizeRecordBitrateMbps(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Number(value.toFixed(2));
}

export function buildLogSummary(content: string, query?: string): LogSummary {
  return buildLogSummaryWithSessionState(content, query);
}

function mergeSignalSummaries(...summaries: Array<LogSummary | undefined>): DebugSignalSummary[] {
  const merged = new Map<string, DebugSignalSummary>();

  for (const summary of summaries) {
    if (!summary) continue;
    for (const signal of summary.topSignals) {
      const key = `${signal.category}:${signal.sample}`;
      const current = merged.get(key);
      if (current) {
        current.count += signal.count;
      } else {
        merged.set(key, { ...signal });
      }
    }
  }

  return [...merged.values()].sort((left, right) => right.count - left.count).slice(0, 10);
}

function uniqueNonEmpty(values: Array<string | undefined>, limit = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

export function buildStateSummaryFromSignals(params: {
  uiSummary?: InspectUiSummary;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
}): StateSummary {
  return buildStateSummaryFromSignalsWithSessionState(params);
}

function buildActionOutcomeConfidence(status: ToolResult["status"], stateChanged: boolean): number {
  if (status === "success" && stateChanged) {
    return 0.95;
  }
  if (status === "success") {
    return 0.7;
  }
  if (status === "partial") {
    return 0.45;
  }
  return 0.2;
}

function buildActionabilityReview(params: {
  preStateSummary: StateSummary;
  postStateSummary: StateSummary;
  latestKnownState?: StateSummary;
  lowLevelStatus: ToolResult["status"];
  lowLevelReasonCode: ReasonCode;
  targetResolution?: {
    status?: string;
    matchCount?: number;
    obscuredByHigherRanked?: boolean;
    scoreDelta?: number;
    suggestedSelector?: string;
    visibilityHeuristics?: string[];
  };
  stateChanged: boolean;
}): string[] {
  return uniqueNonEmpty([
    params.latestKnownState ? summarizeStateDelta(params.latestKnownState, params.preStateSummary).map((item) => `stale_state_candidate:${item}`).join(";") || undefined : undefined,
    params.preStateSummary.readiness !== "ready" ? `pre_state_not_ready:${params.preStateSummary.readiness}` : undefined,
    params.preStateSummary.blockingSignals.length > 0 ? `blocking:${params.preStateSummary.blockingSignals.join(",")}` : undefined,
    params.targetResolution?.status ? `target_resolution:${params.targetResolution.status}` : undefined,
    params.targetResolution?.obscuredByHigherRanked ? "target_obscured_by_higher_ranked_candidate" : undefined,
    typeof params.targetResolution?.matchCount === "number" ? `target_match_count:${String(params.targetResolution.matchCount)}` : undefined,
    typeof params.targetResolution?.scoreDelta === "number" ? `target_score_delta:${String(params.targetResolution.scoreDelta)}` : undefined,
    params.targetResolution?.suggestedSelector ? `target_suggested_selector:${params.targetResolution.suggestedSelector}` : undefined,
    params.targetResolution?.visibilityHeuristics?.length ? `target_visibility:${params.targetResolution.visibilityHeuristics.slice(0, 3).join(",")}` : undefined,
    !params.stateChanged ? "post_state_unchanged" : undefined,
    params.lowLevelStatus !== "success" ? `low_level_status:${params.lowLevelStatus}` : undefined,
    params.lowLevelReasonCode !== REASON_CODES.ok ? `low_level_reason:${params.lowLevelReasonCode}` : undefined,
    params.postStateSummary.readiness !== "ready" ? `post_state_not_ready:${params.postStateSummary.readiness}` : undefined,
  ], 12);
}

function classifyActionFailureCategory(params: {
  finalStatus: ToolResult["status"];
  finalReasonCode: ReasonCode;
  preStateSummary: StateSummary;
  postStateSummary: StateSummary;
  lowLevelResult: ToolResult<unknown>;
  stateChanged: boolean;
  targetResolution?: { status?: string; obscuredByHigherRanked?: boolean };
}): ActionOutcomeSummary["failureCategory"] {
  if (params.finalStatus === "success" && params.stateChanged) {
    return undefined;
  }
  if (params.finalReasonCode === REASON_CODES.unsupportedOperation) {
    return "unsupported";
  }
  if (params.finalReasonCode === REASON_CODES.noMatch) {
    return "selector_missing";
  }
  if (params.finalReasonCode === REASON_CODES.ambiguousMatch) {
    return "selector_ambiguous";
  }
  if (params.targetResolution?.status === "off_screen") {
    return "selector_missing";
  }
  if (params.targetResolution?.obscuredByHigherRanked) {
    return "blocked";
  }
  if (params.targetResolution?.status === "disabled_match") {
    return "blocked";
  }
  if (params.preStateSummary.readiness === "interrupted" || params.preStateSummary.blockingSignals.length > 0) {
    return "blocked";
  }
  if (params.preStateSummary.readiness === "waiting_network" || params.preStateSummary.readiness === "waiting_ui") {
    return "waiting";
  }
  if (!params.stateChanged) {
    return "no_state_change";
  }
  return params.lowLevelResult.status === "failed" ? "transport" : "no_state_change";
}

function classifyTargetQuality(params: { failureCategory?: ActionOutcomeSummary["failureCategory"]; finalStatus: ToolResult["status"]; fallbackUsed: boolean; stateChanged: boolean }): ActionOutcomeSummary["targetQuality"] {
  if (params.failureCategory === "selector_missing" || params.failureCategory === "selector_ambiguous") {
    return "low";
  }
  if (params.finalStatus === "success" && params.stateChanged && !params.fallbackUsed) {
    return "high";
  }
  return "medium";
}

function shouldAttemptPostActionRefresh(params: {
  failureCategory?: ActionOutcomeSummary["failureCategory"];
  finalStatus: ToolResult["status"];
  stateChanged: boolean;
}): boolean {
  if (params.stateChanged) {
    return false;
  }
  if (params.finalStatus === "failed") {
    return false;
  }
  return params.failureCategory === "no_state_change" || params.failureCategory === "transport" || params.failureCategory === undefined;
}

function buildRetryRecommendations(params: {
  finalStatus: ToolResult["status"];
  stateChanged: boolean;
  postActionRefreshAttempted: boolean;
  actionabilityReview: string[];
  failureCategory?: ActionOutcomeSummary["failureCategory"];
  ocrFallbackSuggestions?: string[];
}): string[] {
  if (params.ocrFallbackSuggestions && params.ocrFallbackSuggestions.length > 0) {
    return params.ocrFallbackSuggestions;
  }

  const hasStaleSignal = params.actionabilityReview.some((item) => item.startsWith("stale_state_candidate:"));
  const hasNoopRefreshSignal = params.actionabilityReview.includes("refresh_signal:noop")
    || params.actionabilityReview.includes("post_action_refresh_no_additional_change");
  const hasBlockedSignal = params.actionabilityReview.some((item) => item.startsWith("blocking:")) || params.failureCategory === "blocked";
  const hasTargetResolution = params.actionabilityReview.find((item) => item.startsWith("target_resolution:"));
  const targetSuggestedSelector = params.actionabilityReview.find((item) => item.startsWith("target_suggested_selector:"))?.replace("target_suggested_selector:", "");
  const targetScoreDelta = params.actionabilityReview.find((item) => item.startsWith("target_score_delta:"))?.replace("target_score_delta:", "");
  const targetVisibility = params.actionabilityReview.find((item) => item.startsWith("target_visibility:"))?.replace("target_visibility:", "");

  if (params.finalStatus === "success" && params.stateChanged) {
    return [];
  }

  if (params.failureCategory === "selector_missing" || params.failureCategory === "selector_ambiguous") {
    return [
      "Retry only after refining the selector; prefer a resourceId/contentDesc-based target over broad text matching.",
      [
        hasTargetResolution ? `Current target signal: ${hasTargetResolution}.` : undefined,
        targetSuggestedSelector ? `Suggested narrowing selector: ${targetSuggestedSelector}.` : "Inspect the top candidate diff before retrying.",
        targetScoreDelta ? `Top candidate score delta: ${targetScoreDelta}.` : undefined,
        targetVisibility ? `Visibility heuristics: ${targetVisibility}.` : undefined,
      ].filter((item): item is string => Boolean(item)).join(" "),
    ];
  }

  if (hasBlockedSignal) {
    return [
      "Do not retry the same action immediately; clear the blocking dialog/error state first.",
      "Prefer wait_for_ui, recover_to_known_state, or a more specific recovery step before repeating the action.",
    ];
  }

  if (params.postActionRefreshAttempted && !params.stateChanged) {
    return [
      "Action transport completed but the screen stayed unchanged even after a follow-up refresh; retry only after changing selector, timing, or screen state.",
      hasStaleSignal
        ? "A stale-state hint was detected; refresh UI context or reacquire the target before retrying."
        : hasNoopRefreshSignal
          ? "Post-refresh remained a no-op; reacquire selector context and verify expected side effects before retrying."
          : "Prefer waiting for a more stable screen or reacquiring the target before retrying.",
    ];
  }

  if (params.finalStatus === "success" && !params.stateChanged) {
    return [
      "Action transport succeeded but no meaningful UI change was detected; verify the target side effect before retrying.",
      "If the action should navigate or update content, reacquire the target and confirm the screen is ready first.",
    ];
  }

  return [
    "Inspect the returned pre/post state summaries and action evidence before retrying the same action.",
    hasStaleSignal
      ? "A stale-state hint was detected; refresh UI context or reacquire the target before retrying."
      : "Prefer waiting or selector refinement before repeating the same action.",
  ];
}

function classifyRetryRecommendationTier(params: {
  finalStatus: ToolResult["status"];
  stateChanged: boolean;
  postActionRefreshAttempted: boolean;
  actionabilityReview: string[];
  failureCategory?: ActionOutcomeSummary["failureCategory"];
  ocrFallbackSuggestions?: string[];
}): PerformActionWithEvidenceData["retryRecommendationTier"] {
  if (params.ocrFallbackSuggestions && params.ocrFallbackSuggestions.length > 0) {
    return "inspect_only";
  }
  if (params.finalStatus === "success" && params.stateChanged) {
    return "none";
  }
  if (params.failureCategory === "selector_missing" || params.failureCategory === "selector_ambiguous") {
    return "refine_selector";
  }
  if (params.failureCategory === "blocked") {
    return "recover_first";
  }
  if (params.postActionRefreshAttempted && !params.stateChanged) {
    if (params.actionabilityReview.some((item) => item.startsWith("refresh_signal:stale_state"))
      || params.actionabilityReview.some((item) => item.startsWith("stale_state_candidate:"))
      || params.actionabilityReview.includes("refresh_signal:noop")
      || params.actionabilityReview.includes("post_action_refresh_no_additional_change")) {
      return "refresh_context";
    }
    return "wait_then_retry";
  }
  if (params.finalStatus === "success" && !params.stateChanged) {
    return "inspect_only";
  }
  return "inspect_only";
}

function buildRetryRecommendation(params: {
  tier: NonNullable<PerformActionWithEvidenceData["retryRecommendationTier"]>;
  failureCategory?: ActionOutcomeSummary["failureCategory"];
  actionabilityReview: string[];
}): NonNullable<PerformActionWithEvidenceData["retryRecommendation"]> {
  if (params.tier === "refine_selector") {
    const suggestedSelector = params.actionabilityReview.find((item) => item.startsWith("target_suggested_selector:"))?.replace("target_suggested_selector:", "");
    const scoreDelta = params.actionabilityReview.find((item) => item.startsWith("target_score_delta:"))?.replace("target_score_delta:", "");
    const visibility = params.actionabilityReview.find((item) => item.startsWith("target_visibility:"))?.replace("target_visibility:", "");
    return {
      tier: params.tier,
      reason: params.failureCategory === "selector_ambiguous"
        ? "Multiple candidates matched the selector with no clear winner."
        : "The current selector is too weak or does not identify a stable target.",
      suggestedAction: [
        "Narrow the selector using resourceId/contentDesc or the top candidate diff before retrying.",
        suggestedSelector ? `Candidate selector: ${suggestedSelector}.` : undefined,
        scoreDelta ? `Top score delta: ${scoreDelta}.` : undefined,
        visibility ? `Visibility signals: ${visibility}.` : undefined,
      ].filter((item): item is string => Boolean(item)).join(" "),
    };
  }
  if (params.tier === "wait_then_retry") {
    return {
      tier: params.tier,
      reason: "The action likely ran before the UI reached a stable ready state.",
      suggestedAction: "Wait for UI stability, then retry the same action without changing the selector.",
    };
  }
  if (params.tier === "refresh_context") {
    return {
      tier: params.tier,
      reason: params.actionabilityReview.includes("retry_tier_code:refresh_context_noop")
        ? "A follow-up refresh produced no additional state change, so blind retry is likely to repeat a no-op."
        : params.actionabilityReview.some((item) => item.startsWith("stale_state_candidate:"))
        ? "The persisted and live UI state look stale or diverged."
        : "The current UI context likely needs to be refreshed before another action.",
      suggestedAction: params.actionabilityReview.includes("retry_tier_code:refresh_context_noop")
        ? "Reacquire selector context, verify expected side effect, then retry only with a stronger target signal."
        : "Refresh the UI context, reacquire the target, and then decide whether to retry.",
    };
  }
  if (params.tier === "recover_first") {
    return {
      tier: params.tier,
      reason: "The current screen is blocked or needs bounded recovery before the action can succeed.",
      suggestedAction: "Recover the screen state or clear the blocking UI before retrying the action.",
    };
  }
  if (params.tier === "none") {
    return {
      tier: params.tier,
      reason: "No retry is recommended because the action already achieved a meaningful state change.",
      suggestedAction: "No immediate follow-up action is required.",
    };
  }
  return {
    tier: "inspect_only",
    reason: "The current evidence is insufficient for a confident retry.",
    suggestedAction: "Inspect the action packet before retrying or escalating.",
  };
}

function readResolutionSignal(data: unknown): {
  status?: string;
  matchCount?: number;
  obscuredByHigherRanked?: boolean;
  scoreDelta?: number;
  suggestedSelector?: string;
  visibilityHeuristics?: string[];
} | undefined {
  if (!isRecord(data) || !isRecord(data.resolution)) {
    return undefined;
  }
  const resolution = data.resolution;
  const bestCandidate = isRecord(resolution.bestCandidate) ? resolution.bestCandidate : undefined;
  const ambiguityDiff = isRecord(resolution.ambiguityDiff) ? resolution.ambiguityDiff : undefined;
  const suggestedSelectors = Array.isArray(ambiguityDiff?.suggestedSelectors) ? ambiguityDiff.suggestedSelectors : undefined;
  const suggestedSelector = suggestedSelectors && isRecord(suggestedSelectors[0]) ? JSON.stringify(suggestedSelectors[0]) : undefined;
  const visibilityHeuristics = Array.isArray(bestCandidate?.visibilityHeuristics)
    ? bestCandidate.visibilityHeuristics.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    status: typeof resolution.status === "string" ? resolution.status : undefined,
    matchCount: typeof resolution.matchCount === "number" ? resolution.matchCount : undefined,
    obscuredByHigherRanked: bestCandidate?.obscuredByHigherRanked === true,
    scoreDelta: typeof ambiguityDiff?.scoreDelta === "number" ? ambiguityDiff.scoreDelta : undefined,
    suggestedSelector,
    visibilityHeuristics,
  };
}

interface OcrFallbackExecutionResult {
  attempted: boolean;
  used: boolean;
  status: ToolResult["status"];
  reasonCode: ReasonCode;
  artifacts: string[];
  attempts: number;
  retryCount: number;
  nextSuggestions: string[];
  ocrEvidence?: OcrEvidence;
  postStateResult?: ToolResult<GetScreenSummaryData>;
}

interface OcrFallbackTestHooks {
  createProvider?: () => Pick<MacVisionOcrProvider, "extractTextRegions">;
  takeScreenshot?: typeof takeScreenshotWithMaestro;
  tap?: typeof tapWithMaestro;
  getScreenSummary?: typeof getScreenSummaryWithMaestro;
  now?: () => string;
}

interface InterruptionGuardTestHooks {
  resolveInterruption?: (input: ResolveInterruptionInput) => Promise<ToolResult<ResolveInterruptionData>>;
  resumeInterruptedAction?: (input: ResumeInterruptedActionInput) => Promise<ToolResult<ResumeInterruptedActionData>>;
}

let ocrFallbackTestHooks: OcrFallbackTestHooks | undefined;
let interruptionGuardTestHooks: InterruptionGuardTestHooks | undefined;

export function setOcrFallbackTestHooksForTesting(hooks: OcrFallbackTestHooks | undefined): void {
  setOcrFallbackTestHooksForTestingFromActionOrchestrator(hooks);
}

export function resetOcrFallbackTestHooksForTesting(): void {
  resetOcrFallbackTestHooksForTestingFromActionOrchestrator();
}

export function setInterruptionGuardTestHooksForTesting(hooks: InterruptionGuardTestHooks | undefined): void {
  setInterruptionGuardTestHooksForTestingFromActionOrchestrator(hooks);
}

export function resetInterruptionGuardTestHooksForTesting(): void {
  resetInterruptionGuardTestHooksForTestingFromActionOrchestrator();
}

function mapIntentToOcrActionKind(action: ActionIntent): OcrFallbackActionType | undefined {
  if (action.actionType === "tap_element") {
    return "tap";
  }
  if (action.actionType === "wait_for_ui") {
    return "assertText";
  }
  return undefined;
}

function buildOcrTargetText(action: ActionIntent): string | undefined {
  return action.text?.trim() || action.contentDesc?.trim();
}

function canAttemptOcrFallback(action: ActionIntent, deterministicResult: ToolResult<unknown>): boolean {
  if (deterministicResult.status === "success") {
    return false;
  }
  if (action.actionType !== "tap_element" && action.actionType !== "wait_for_ui") {
    return false;
  }
  return Boolean(buildOcrTargetText(action));
}

async function executeOcrFallback(params: {
  input: PerformActionWithEvidenceInput;
  platform: Platform;
  runnerProfile: RunnerProfile;
  deviceId?: string;
  appId?: string;
  preStateSummary: StateSummary;
}): Promise<OcrFallbackExecutionResult> {
  if (params.input.dryRun && !ocrFallbackTestHooks?.createProvider) {
    return {
      attempted: false,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.noMatch,
      artifacts: [],
      attempts: 0,
      retryCount: 0,
      nextSuggestions: [],
    };
  }

  const actionKind = mapIntentToOcrActionKind(params.input.action);
  const targetText = buildOcrTargetText(params.input.action);
  if (!actionKind || !targetText) {
    return {
      attempted: false,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.noMatch,
      artifacts: [],
      attempts: 0,
      retryCount: 0,
      nextSuggestions: [],
    };
  }

  const policyDecision = shouldUseOcrFallback({
    action: actionKind,
    deterministicFailed: true,
    semanticFailed: true,
    state: params.preStateSummary,
  }, DEFAULT_OCR_FALLBACK_POLICY);
  if (!policyDecision.allowed) {
    return {
      attempted: false,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.noMatch,
      artifacts: [],
      attempts: 0,
      retryCount: 0,
      nextSuggestions: policyDecision.reasons.length > 0 ? [`OCR fallback blocked: ${policyDecision.reasons.join(", ")}.`] : [],
    };
  }

  const screenshotInput: ScreenshotInput = {
    sessionId: params.input.sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    harnessConfigPath: params.input.harnessConfigPath,
    deviceId: params.deviceId,
    outputPath: path.posix.join("artifacts", "screenshots", params.input.sessionId, `${params.platform}-${params.runnerProfile}-ocr.png`),
    dryRun: params.input.dryRun,
  };
  const screenshotExecutor = ocrFallbackTestHooks?.takeScreenshot ?? takeScreenshotWithMaestro;
  const screenshotResult = await screenshotExecutor(screenshotInput);
  if (screenshotResult.status === "failed") {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: screenshotResult.reasonCode,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts,
      retryCount: 0,
      nextSuggestions: screenshotResult.nextSuggestions,
    };
  }

  const screenshotPath = path.resolve(resolveRepoPath(), screenshotResult.data.outputPath);
  const nowIsoString = ocrFallbackTestHooks?.now?.() ?? new Date().toISOString();
  const screenshotFreshDecision = shouldUseOcrFallback({
    action: actionKind,
    deterministicFailed: true,
    semanticFailed: true,
    state: params.preStateSummary,
    screenshotCapturedAt: nowIsoString,
  }, DEFAULT_OCR_FALLBACK_POLICY);
  if (!screenshotFreshDecision.allowed) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrProviderError,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts,
      retryCount: 0,
      nextSuggestions: screenshotFreshDecision.reasons.length > 0 ? [`OCR fallback blocked: ${screenshotFreshDecision.reasons.join(", ")}.`] : [],
    };
  }

  const ocrProvider = ocrFallbackTestHooks?.createProvider?.() ?? new MacVisionOcrProvider();
  let ocrOutput: Awaited<ReturnType<MacVisionOcrProvider["extractTextRegions"]>>;
  try {
    ocrOutput = await ocrProvider.extractTextRegions({
      screenshotPath,
      platform: params.platform,
      languageHints: ["en-US", "zh-Hans"],
    });
  } catch (error) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrProviderError,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: [error instanceof Error ? error.message : "OCR provider execution failed."],
    };
  }

  let resolverResult = resolveTextTarget({
    targetText,
    blocks: ocrOutput.blocks,
    maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail,
  });
  if (!resolverResult.matched) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: resolverResult.candidates.length > 1 ? REASON_CODES.ocrAmbiguousTarget : REASON_CODES.ocrNoMatch,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: ["OCR fallback could not resolve a unique text target from the screenshot."],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        candidateCount: resolverResult.candidates.length,
        screenshotPath: screenshotResult.data.outputPath,
        fallbackReason: resolverResult.candidates.length > 1 ? REASON_CODES.ocrAmbiguousTarget : REASON_CODES.ocrNoMatch,
        postVerificationResult: "not_run",
      },
    };
  }

  const threshold = minimumConfidenceForOcrAction(actionKind, DEFAULT_OCR_FALLBACK_POLICY);
  const selectedConfidence = resolverResult.bestCandidate?.confidence ?? resolverResult.confidence;
  if (selectedConfidence < threshold) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrLowConfidence,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: ["OCR fallback found the target text but confidence did not pass the policy threshold."],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        matchedText: resolverResult.bestCandidate?.text,
        candidateCount: resolverResult.candidates.length,
        matchType: resolverResult.matchType,
        ocrConfidence: selectedConfidence,
        screenshotPath: screenshotResult.data.outputPath,
        selectedBounds: resolverResult.bestCandidate?.bounds,
        fallbackReason: REASON_CODES.ocrLowConfidence,
        postVerificationResult: "not_run",
      },
    };
  }

  if (actionKind === "assertText") {
    return {
      attempted: true,
      used: true,
      status: "success",
      reasonCode: REASON_CODES.ok,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: [],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        matchedText: resolverResult.bestCandidate?.text,
        candidateCount: resolverResult.candidates.length,
        matchType: resolverResult.matchType,
        ocrConfidence: selectedConfidence,
        screenshotPath: screenshotResult.data.outputPath,
        selectedBounds: resolverResult.bestCandidate?.bounds,
        postVerificationResult: "not_run",
      },
    };
  }

  let tapAttempts = 0;
  let performedTapAttempts = 0;
  let postStateResult: ToolResult<GetScreenSummaryData> | undefined;
  let verificationResult: ReturnType<typeof verifyOcrAction> | undefined;

  while (tapAttempts <= DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount && resolverResult.bestCandidate) {
    performedTapAttempts += 1;
    const tapExecutor = ocrFallbackTestHooks?.tap ?? tapWithMaestro;
    const tapResult = await tapExecutor({
      sessionId: params.input.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.input.harnessConfigPath,
      deviceId: params.deviceId,
      x: Math.round((resolverResult.bestCandidate.bounds.left + resolverResult.bestCandidate.bounds.right) / 2),
      y: Math.round((resolverResult.bestCandidate.bounds.top + resolverResult.bestCandidate.bounds.bottom) / 2),
      dryRun: params.input.dryRun,
    });
    if (tapResult.status === "failed") {
      return {
        attempted: true,
        used: false,
        status: tapResult.status,
        reasonCode: tapResult.reasonCode,
        artifacts: screenshotResult.artifacts,
        attempts: screenshotResult.attempts + tapResult.attempts,
        retryCount: Math.max(0, performedTapAttempts - 1),
        nextSuggestions: tapResult.nextSuggestions,
      };
    }

    const screenSummaryExecutor = ocrFallbackTestHooks?.getScreenSummary ?? getScreenSummaryWithMaestro;
    postStateResult = await screenSummaryExecutor({
      sessionId: params.input.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.input.harnessConfigPath,
      deviceId: params.deviceId,
      appId: params.appId,
      includeDebugSignals: params.input.includeDebugSignals ?? true,
      dryRun: params.input.dryRun,
    });
    verificationResult = verifyOcrAction({
      targetText,
      preState: params.preStateSummary,
      postState: postStateResult.data.screenSummary,
    });
    if (verificationResult.verified) {
      return {
        attempted: true,
        used: true,
        status: "success",
        reasonCode: REASON_CODES.ok,
        artifacts: Array.from(new Set([...screenshotResult.artifacts, ...postStateResult.artifacts])),
        attempts: screenshotResult.attempts + tapResult.attempts + postStateResult.attempts,
        retryCount: Math.max(0, performedTapAttempts - 1),
        nextSuggestions: [],
        postStateResult,
        ocrEvidence: {
          provider: ocrOutput.provider,
          engine: ocrOutput.engine,
          model: ocrOutput.model,
          durationMs: ocrOutput.durationMs,
          matchedText: resolverResult.bestCandidate.text,
          candidateCount: resolverResult.candidates.length,
          matchType: resolverResult.matchType,
          ocrConfidence: selectedConfidence,
          screenshotPath: screenshotResult.data.outputPath,
          selectedBounds: resolverResult.bestCandidate.bounds,
          postVerificationResult: "passed",
        },
      };
    }
    tapAttempts += 1;
    if (tapAttempts <= DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount) {
      resolverResult = resolveTextTarget({
        targetText,
        blocks: ocrOutput.blocks,
        fuzzy: false,
        maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail,
      });
    }
  }

  return {
    attempted: true,
    used: false,
    status: "failed",
    reasonCode: REASON_CODES.ocrPostVerifyFailed,
    artifacts: Array.from(new Set([...screenshotResult.artifacts, ...(postStateResult?.artifacts ?? [])])),
    attempts: screenshotResult.attempts + (postStateResult?.attempts ?? 0) + 1,
    retryCount: Math.max(0, performedTapAttempts - 1),
    nextSuggestions: [verificationResult?.summary ?? "OCR fallback tap did not produce the expected post-action state."],
    postStateResult,
    ocrEvidence: {
      provider: ocrOutput.provider,
      engine: ocrOutput.engine,
      model: ocrOutput.model,
      durationMs: ocrOutput.durationMs,
      matchedText: resolverResult.bestCandidate?.text,
      candidateCount: resolverResult.candidates.length,
      matchType: resolverResult.matchType,
      ocrConfidence: selectedConfidence,
      screenshotPath: screenshotResult.data.outputPath,
      selectedBounds: resolverResult.bestCandidate?.bounds,
      fallbackReason: REASON_CODES.ocrPostVerifyFailed,
      postVerificationResult: "failed",
    },
  };
}

function summarizeStateTransition(preState?: StateSummary, postState?: StateSummary): string {
  if (!preState && !postState) {
    return "State transition is unknown.";
  }
  if (!preState && postState) {
    return `Observed new state ${postState.screenTitle ?? postState.appPhase}.`;
  }
  if (preState && !postState) {
    return `Lost state visibility after action from ${preState.screenTitle ?? preState.appPhase}.`;
  }
  const changes: string[] = [];
  if (preState?.screenTitle !== postState?.screenTitle) {
    changes.push(`screen ${preState?.screenTitle ?? "<unknown>"} -> ${postState?.screenTitle ?? "<unknown>"}`);
  }
  if (preState?.appPhase !== postState?.appPhase) {
    changes.push(`phase ${preState?.appPhase ?? "unknown"} -> ${postState?.appPhase ?? "unknown"}`);
  }
  if (preState?.readiness !== postState?.readiness) {
    changes.push(`readiness ${preState?.readiness ?? "unknown"} -> ${postState?.readiness ?? "unknown"}`);
  }
  const preBlocking = preState?.blockingSignals.join(",") ?? "";
  const postBlocking = postState?.blockingSignals.join(",") ?? "";
  if (preBlocking !== postBlocking) {
    changes.push(`blocking [${preBlocking}] -> [${postBlocking}]`);
  }
  return changes.length > 0 ? changes.join("; ") : "No visible state change detected.";
}

function buildActionEvidenceDelta(params: {
  preState?: StateSummary;
  postState?: StateSummary;
  preLogSummary?: LogSummary;
  postLogSummary?: LogSummary;
  preCrashSummary?: LogSummary;
  postCrashSummary?: LogSummary;
}): EvidenceDeltaSummary {
  const runtimeSignalsBefore = mergeSignalSummaries(params.preLogSummary, params.preCrashSummary).map((item) => item.sample);
  const runtimeSignalsAfter = mergeSignalSummaries(params.postLogSummary, params.postCrashSummary).map((item) => item.sample);
  const newSignals = runtimeSignalsAfter.filter((item) => !runtimeSignalsBefore.includes(item));
  return {
    uiDiffSummary: summarizeStateTransition(params.preState, params.postState),
    logDeltaSummary: newSignals.length > 0 ? `New runtime signals: ${newSignals.slice(0, 3).join(" | ")}` : "No new high-confidence runtime signals after action.",
    runtimeDeltaSummary: newSignals.length > 0 ? newSignals.slice(0, 3).join(" | ") : "No new runtime delta detected.",
    networkDeltaSummary: undefined,
  };
}

async function executeIntentWithMaestro(
  params: {
    sessionId: string;
    platform: Platform;
    runnerProfile: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    dryRun?: boolean;
  },
  action: ActionIntent,
): Promise<ToolResult<TapElementData | TypeIntoElementData | WaitForUiData | LaunchAppData | TerminateAppData>> {
  return executeIntentWithMaestroFromTaskPlanner(params, action, {
    tapElementWithMaestro,
    typeIntoElementWithMaestro,
    waitForUiWithMaestro,
    launchAppWithMaestro,
    terminateAppWithMaestro,
  });
}

function inferCandidateActionTypes(intent: string): SupportedActionType[] {
  const lower = intent.toLowerCase();
  const candidates: SupportedActionType[] = [];
  if (lower.includes("launch") || lower.includes("open") || lower.includes("启动") || lower.includes("打开")) {
    candidates.push("launch_app");
  }
  if (lower.includes("type") || lower.includes("input") || lower.includes("输入")) {
    candidates.push("type_into_element");
  }
  if (lower.includes("wait") || lower.includes("等待") || lower.includes("visible") || lower.includes("出现")) {
    candidates.push("wait_for_ui");
  }
  if (lower.includes("terminate") || lower.includes("close") || lower.includes("kill") || lower.includes("关闭") || lower.includes("退出")) {
    candidates.push("terminate_app");
  }
  if (candidates.length === 0) {
    candidates.push("tap_element");
  }
  return candidates;
}

function buildActionIntentFromStep(step: ExecuteIntentStepInput): { action: ActionIntent; decision: string; candidates: SupportedActionType[] } {
  const candidates = inferCandidateActionTypes(step.intent);
  const selectedActionType = step.actionType ?? candidates[0];
  return {
    action: {
      actionType: selectedActionType,
      resourceId: step.resourceId,
      contentDesc: step.contentDesc,
      text: step.text,
      className: step.className,
      clickable: step.clickable,
      limit: step.limit,
      value: step.value,
      appId: step.appId,
      launchUrl: step.launchUrl,
      timeoutMs: step.timeoutMs,
      intervalMs: step.intervalMs,
      waitUntil: step.waitUntil,
    },
    decision: step.actionType
      ? `Selected explicit actionType '${step.actionType}'.`
      : `Inferred actionType '${selectedActionType}' from intent keywords.`,
    candidates,
  };
}

export async function executeIntentPlanWithMaestro(
  input: ExecuteIntentInput,
): Promise<ToolResult<ExecuteIntentData>> {
  return executeIntentPlanWithMaestroFromTaskPlanner(input, {
    performActionWithEvidenceWithMaestro,
  });
}

export async function completeTaskWithMaestro(
  input: CompleteTaskInput,
): Promise<ToolResult<CompleteTaskData>> {
  return completeTaskWithMaestroFromTaskPlanner(input, {
    performActionWithEvidenceWithMaestro,
  });
}

function buildDebugNarrative(params: {
  appId?: string;
  appFilterApplied: boolean;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  jsNetworkSummary?: JsNetworkFailureSummary;
  includeDiagnostics: boolean;
  diagnosticsArtifacts: number;
}): string[] {
  const narrative: string[] = [];

  if (params.appId) {
    narrative.push(params.appFilterApplied
      ? `Evidence capture is scoped to app ${params.appId}.`
      : `Evidence capture is not app-scoped yet for ${params.appId}; results may include device-wide noise.`);
  }

  if (params.crashSummary && params.crashSummary.topSignals.length > 0) {
    const topCrash = params.crashSummary.topSignals[0];
    narrative.push(`Crash evidence is present: ${topCrash.category} appears ${String(topCrash.count)} time(s).`);
  } else {
    narrative.push("No high-confidence crash signals were detected in the captured crash evidence.");
  }

  if (params.logSummary) {
    narrative.push(`Log capture scanned ${String(params.logSummary.totalLines)} lines and flagged ${String(params.logSummary.sampleLines.length)} interesting lines for AI review.`);
  }

  if (params.jsNetworkSummary && params.jsNetworkSummary.failedRequestCount > 0) {
    narrative.push(...buildJsNetworkSuspectSentences(params.jsNetworkSummary));
  }

  if (params.includeDiagnostics) {
    narrative.push(`Diagnostics bundle capture is included with ${String(params.diagnosticsArtifacts)} artifact path(s). Use it only if logs and crash summaries are insufficient.`);
  }

  return narrative;
}

function buildSuspectAreas(params: {
  crashSummary?: LogSummary;
  logSummary?: LogSummary;
  jsConsoleSummary?: JsConsoleLogSummary;
  jsNetworkSummary?: JsNetworkFailureSummary;
  jsConsoleLogs?: JsConsoleLogEntry[];
  environmentIssue?: string;
}): string[] {
  const suspects: string[] = [];

  if (params.environmentIssue) {
    suspects.push(`Environment suspect: ${params.environmentIssue}`);
  }

  const topCrash = params.crashSummary?.topSignals[0];
  if (topCrash) {
    suspects.push(`Crash suspect: ${topCrash.sample}`);
  }

  const topLog = params.logSummary?.topSignals[0];
  if (topLog && (!topCrash || topLog.sample !== topCrash.sample)) {
    suspects.push(`Runtime log suspect: ${topLog.sample}`);
  }

  if ((params.jsConsoleSummary?.exceptionCount ?? 0) > 0) {
    const firstException = params.jsConsoleLogs?.find((entry) => entry.level === "exception");
    suspects.push(firstException
      ? `JS exception suspect: ${firstException.exceptionType ?? "Exception"} at ${firstException.sourceUrl ?? "<unknown>"}:${String(firstException.lineNumber ?? 0)}:${String(firstException.columnNumber ?? 0)}.`
      : `JS exception suspect: ${String(params.jsConsoleSummary?.exceptionCount ?? 0)} inspector exception event(s) captured.`);
  }

  const topNetworkStatus = params.jsNetworkSummary?.statusGroups[0];
  if (params.jsNetworkSummary && (topNetworkStatus || params.jsNetworkSummary.errorGroups[0])) {
    suspects.push(...buildJsNetworkSuspectSentences(params.jsNetworkSummary));
  }

  return suspects.slice(0, 5);
}

export function buildDiagnosisBriefing(params: {
  status: ToolResult["status"];
  reasonCode: ReasonCode;
  appId?: string;
  suspectAreas: string[];
  jsDebugTargetId?: string;
  jsConsoleLogCount?: number;
  jsNetworkEventCount?: number;
  retryRecommendationTier?: PerformActionWithEvidenceData["retryRecommendationTier"];
  retryRecommendation?: PerformActionWithEvidenceData["retryRecommendation"];
}): string[] {
  const briefing: string[] = [];

  if (params.appId) {
    briefing.push(`Target app: ${params.appId}.`);
  }

  if (params.suspectAreas.length > 0) {
    briefing.push(...params.suspectAreas.slice(0, 3));
  }

  if (params.jsDebugTargetId) {
    briefing.push(`JS inspector target: ${params.jsDebugTargetId}.`);
  }

  if ((params.jsConsoleLogCount ?? 0) > 0 || (params.jsNetworkEventCount ?? 0) > 0) {
    briefing.push(`JS evidence captured: ${String(params.jsConsoleLogCount ?? 0)} console event(s), ${String(params.jsNetworkEventCount ?? 0)} network event(s).`);
  }

  if (params.retryRecommendationTier && params.retryRecommendationTier !== "none") {
    briefing.push(`Recommended next-action tier: ${params.retryRecommendationTier}.`);
  }
  if (params.retryRecommendation) {
    briefing.push(`Recommended follow-up: ${params.retryRecommendation.suggestedAction}`);
  }

  if (params.status !== "success") {
    briefing.push(`Current packet status is ${params.status} (${params.reasonCode}).`);
  }

  return briefing.slice(0, 5);
}

function prioritizeSuggestionBuckets(...buckets: string[][]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    for (const item of bucket) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }
  }
  return ordered.slice(0, 5);
}

function buildActionPacketSignalSuggestions(actionabilityReview?: string[]): string[] {
  if (!actionabilityReview || actionabilityReview.length === 0) {
    return [];
  }
  const selector = actionabilityReview.find((item) => item.startsWith("target_suggested_selector:"))?.replace("target_suggested_selector:", "");
  const scoreDelta = actionabilityReview.find((item) => item.startsWith("target_score_delta:"))?.replace("target_score_delta:", "");
  const visibility = actionabilityReview.find((item) => item.startsWith("target_visibility:"))?.replace("target_visibility:", "");
  const refreshCode = actionabilityReview.find((item) => item.startsWith("retry_tier_code:"))?.replace("retry_tier_code:", "");

  return [
    selector ? `Action packet selector candidate: ${selector}.` : undefined,
    scoreDelta ? `Action packet selector score delta: ${scoreDelta}.` : undefined,
    visibility ? `Action packet visibility signals: ${visibility}.` : undefined,
    refreshCode ? `Action packet refresh retry code: ${refreshCode}.` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function buildDebugNextSuggestions(params: {
  reasonCode: ReasonCode;
  suspectAreas: string[];
  includeDiagnostics: boolean;
  jsDebugTargetId?: string;
  jsConsoleLogCount?: number;
  jsNetworkEventCount?: number;
}): string[] {
  const suggestions: string[] = [];

  if (params.reasonCode === REASON_CODES.deviceUnavailable) {
    suggestions.push("Restore device or simulator connectivity first, then re-run collect_debug_evidence.");
  }
  if (params.reasonCode === REASON_CODES.configurationError && !params.jsDebugTargetId) {
    suggestions.push("Start Metro or Expo dev server, then re-run collect_debug_evidence to include JS inspector evidence.");
  }
  if (params.suspectAreas.some((item) => item.toLowerCase().includes("network suspect"))) {
    suggestions.push("Inspect the failing API host and response path first; network evidence is the strongest current clue.");
  }
  if (params.suspectAreas.some((item) => item.toLowerCase().includes("js exception suspect"))) {
    suggestions.push("Inspect the reported JS exception source and top stack frame before reading the full raw logs.");
  }
  if (params.suspectAreas.some((item) => item.toLowerCase().includes("crash suspect"))) {
    suggestions.push("Inspect the top crash suspect in the crash artifact before escalating to heavier diagnostics.");
  }
  if (params.includeDiagnostics) {
    suggestions.push("Diagnostics capture is already enabled; use the bundle only after exhausting the summarized clues.");
  } else if ((params.jsConsoleLogCount ?? 0) === 0 && (params.jsNetworkEventCount ?? 0) === 0) {
    suggestions.push("Use the debug evidence summary first; escalate to collect_diagnostics only when the summarized native clues are still inconclusive.");
  }

  return [...new Set(suggestions)].slice(0, 5);
}


async function listRelativeFiles(rootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const output: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await listRelativeFiles(entryPath);
        for (const item of nested) {
          output.push(path.posix.join(entry.name, item));
        }
      } else {
        output.push(entry.name);
      }
    }

    return output.sort();
  } catch {
    return [];
  }
}

interface RelativeFileEntry {
  relativePath: string;
  absolutePath: string;
  mtimeMs: number;
}

async function listRelativeFileEntries(rootPath: string, prefix = ""): Promise<RelativeFileEntry[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const output: RelativeFileEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        output.push(...(await listRelativeFileEntries(entryPath, relativePath)));
      } else {
        const metadata = await stat(entryPath);
        output.push({ relativePath, absolutePath: entryPath, mtimeMs: metadata.mtimeMs });
      }
    }

    return output.sort((left, right) => right.mtimeMs - left.mtimeMs);
  } catch {
    return [];
  }
}

async function listArtifacts(rootPath: string, repoRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listArtifacts(entryPath, repoRoot)));
      } else {
        files.push(toRelativePath(repoRoot, entryPath));
      }
    }

    return files.sort();
  } catch {
    return [];
  }
}

export async function describeCapabilitiesWithMaestro(
  input: DescribeCapabilitiesInput,
): Promise<ToolResult<DescribeCapabilitiesData>> {
  const startTime = Date.now();
  const sessionId = input.sessionId ?? `capabilities-${Date.now()}`;
  const runnerProfile = input.runnerProfile ?? null;
  const capabilities = buildCapabilityProfile(input.platform, runnerProfile);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      platform: input.platform,
      runnerProfile,
      capabilities,
    },
    nextSuggestions: ["Use the returned capability profile to pick tools before invoking platform-specific UI actions."],
  };
}

export async function getScreenSummaryWithMaestro(
  input: GetScreenSummaryInput,
): Promise<ToolResult<GetScreenSummaryData>> {
  return getScreenSummaryWithMaestroFromSessionState(input);
}

export async function getSessionStateWithMaestro(
  input: GetSessionStateInput,
): Promise<ToolResult<GetSessionStateData>> {
  return getSessionStateWithMaestroFromSessionState(input);
}

export async function detectInterruptionWithMaestro(
  input: DetectInterruptionInput,
): Promise<ToolResult<DetectInterruptionData>> {
  return detectInterruptionWithMaestroFromInterruptionTools(input);
}

export async function classifyInterruptionWithMaestro(
  input: ClassifyInterruptionInput,
): Promise<ToolResult<ClassifyInterruptionData>> {
  return classifyInterruptionWithMaestroFromInterruptionTools(input);
}

function isInterruptionGuardPassed(status: ResolveInterruptionData["status"] | undefined): boolean {
  return status === "resolved" || status === "not_needed";
}

export async function resolveInterruptionWithMaestro(
  input: ResolveInterruptionInput,
): Promise<ToolResult<ResolveInterruptionData>> {
  return resolveInterruptionWithMaestroFromInterruptionTools(input);
}

export async function resumeInterruptedActionWithMaestro(
  input: ResumeInterruptedActionInput,
): Promise<ToolResult<ResumeInterruptedActionData>> {
  return resumeInterruptedActionWithMaestroFromInterruptionTools(input, {
    executeIntentWithMaestro,
  });
}

export async function performActionWithEvidenceWithMaestro(
  input: PerformActionWithEvidenceInput,
): Promise<ToolResult<PerformActionWithEvidenceData>> {
  return performActionWithEvidenceWithMaestroFromActionOrchestrator(input, {
    executeIntentWithMaestro,
  });
}

export async function getActionOutcomeWithMaestro(
  input: GetActionOutcomeInput,
): Promise<ToolResult<GetActionOutcomeData>> {
  return getActionOutcomeWithMaestroFromActionOutcome(input);
}

function buildFailureAttribution(params: {
  outcome: ActionOutcomeSummary;
  evidenceDelta?: EvidenceDeltaSummary;
  surroundingEvents?: SessionTimelineEvent[];
}): FailureAttribution {
  const postState = params.outcome.postState;
  const delta = params.evidenceDelta;
  const candidateCauses: string[] = [];
  let affectedLayer: FailureAttribution["affectedLayer"] = "unknown";
  let mostLikelyCause = "The current evidence is too weak to assign a precise cause.";
  let recommendedNextProbe = "Capture another bounded action with evidence to strengthen the timeline window.";
  let recommendedRecovery = "Retry only after confirming the current state is stable.";

  if (postState?.blockingSignals.some((signal) => signal === "permission_prompt" || signal === "dialog_actions")) {
    affectedLayer = "interruption";
    mostLikelyCause = `Blocking UI interruption detected: ${postState.blockingSignals.join(", ")}.`;
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect the latest screen summary for blocking dialog text and action buttons.";
    recommendedRecovery = "Dismiss the interruption or grant the required permission, then replay the bounded action.";
  } else if ((delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("crash") || (delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("anr")) {
    affectedLayer = "crash";
    mostLikelyCause = delta?.runtimeDeltaSummary ?? "Crash-like runtime signal detected after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect crash-signal artifacts captured around the action window.";
    recommendedRecovery = "Relaunch the app before retrying the same action.";
  } else if ((delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("network") || (delta?.logDeltaSummary ?? "").toLowerCase().includes("http")) {
    affectedLayer = "network";
    mostLikelyCause = delta?.logDeltaSummary ?? "New network-related signal detected after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect JS/network deltas and backend response status around the action.";
    recommendedRecovery = "Wait for network readiness or retry after the dependent request stabilizes.";
  } else if ((delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("exception") || (delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("runtime")) {
    affectedLayer = "runtime";
    mostLikelyCause = delta?.runtimeDeltaSummary ?? "Runtime exception-like signal detected after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect runtime and JS console deltas after the action.";
    recommendedRecovery = "Stabilize the runtime error before retrying the same path.";
  } else if (!params.outcome.stateChanged && ["tap_element", "type_into_element", "wait_for_ui"].includes(params.outcome.actionType)) {
    affectedLayer = params.outcome.outcome === "partial" ? "ui_locator" : "ui_state";
    mostLikelyCause = params.outcome.outcome === "partial"
      ? "The selector-driven action did not execute fully, so locator ambiguity or unsupported resolution is most likely."
      : "The selector resolved but the app state did not change after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect the pre/post screen summaries and selector resolution outcome for the bounded action.";
    recommendedRecovery = "Refine the selector or wait for a more stable screen before retrying.";
  }

  for (const event of params.surroundingEvents ?? []) {
    if (event.type !== "action_outcome_recorded" && event.detail) {
      candidateCauses.push(event.detail);
    }
  }

  return {
    affectedLayer,
    mostLikelyCause,
    candidateCauses: uniqueNonEmpty(candidateCauses, 5),
    missingEvidence: params.outcome.preState && params.outcome.postState ? [] : ["pre/post state summaries are incomplete"],
    recommendedNextProbe,
    recommendedRecovery,
  };
}

export async function explainLastFailureWithMaestro(
  input: ExplainLastFailureInput,
): Promise<ToolResult<ExplainLastFailureData>> {
  return explainLastFailureWithMaestroFromActionOutcome(input);
}

export async function rankFailureCandidatesWithMaestro(
  input: RankFailureCandidatesInput,
): Promise<ToolResult<RankFailureCandidatesData>> {
  return rankFailureCandidatesWithMaestroFromActionOutcome(input);
}

function buildRecoveryTimelineEvent(summary: RecoverySummary, artifacts: string[]): SessionTimelineEvent {
  return {
    eventId: `recovery-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    type: "recovery_attempted",
    detail: summary.note,
    eventType: "recovery",
    layer: "action",
    summary: `${summary.strategy} -> ${summary.recovered ? "recovered" : "not_recovered"}`,
    artifactRefs: artifacts,
    stateSummary: summary.stateAfter ?? summary.stateBefore,
  };
}

const HIGH_RISK_REPLAY_KEYWORDS = ["pay", "payment", "purchase", "buy", "checkout", "order", "delete", "remove", "send", "submit", "confirm"];

function isHighRiskReplayIntent(intent?: ActionIntent): boolean {
  if (!intent) {
    return false;
  }

  const haystacks = [intent.resourceId, intent.contentDesc, intent.text, intent.value, intent.appId]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return haystacks.some((value) => HIGH_RISK_REPLAY_KEYWORDS.some((keyword) => value.includes(keyword)));
}

function canReplayPersistedAction(record: PersistedActionRecord): boolean {
  if (isHighRiskReplayIntent(record.intent)) {
    return false;
  }

  if (record.intent) {
    return true;
  }

  return ["wait_for_ui", "launch_app", "terminate_app"].includes(record.outcome.actionType);
}

function topRuntimeSignal(delta?: EvidenceDeltaSummary): string | undefined {
  return delta?.runtimeDeltaSummary ?? delta?.logDeltaSummary;
}

function buildFailureSignature(params: {
  outcome: ActionOutcomeSummary;
  attribution: FailureAttribution;
  evidenceDelta?: EvidenceDeltaSummary;
}): FailureSignature {
  return {
    actionType: params.outcome.actionType,
    screenId: params.outcome.postState?.screenId ?? params.outcome.preState?.screenId,
    affectedLayer: params.attribution.affectedLayer,
    topSignal: topRuntimeSignal(params.evidenceDelta),
    interruptionCategory: params.outcome.postState?.blockingSignals[0],
  };
}

function scoreSimilarFailure(left: FailureSignature, right: FailureSignature): number {
  let score = 0;
  if (left.actionType === right.actionType) score += 3;
  if (left.affectedLayer === right.affectedLayer) score += 3;
  if (left.screenId && left.screenId === right.screenId) score += 2;
  if (left.interruptionCategory && left.interruptionCategory === right.interruptionCategory) score += 1;
  if (left.topSignal && right.topSignal && left.topSignal === right.topSignal) score += 2;
  return score;
}

export async function recoverToKnownStateWithMaestro(
  input: RecoverToKnownStateInput,
): Promise<ToolResult<RecoverToKnownStateData>> {
  return recoverToKnownStateWithMaestroFromRecoveryTools(input, {
    getSessionStateWithMaestro,
    launchAppWithMaestro,
    performActionWithEvidenceWithMaestro,
  });
}

export async function replayLastStablePathWithMaestro(
  input: ReplayLastStablePathInput,
): Promise<ToolResult<ReplayLastStablePathData>> {
  return replayLastStablePathWithMaestroFromRecoveryTools(input, {
    getSessionStateWithMaestro,
    launchAppWithMaestro,
    performActionWithEvidenceWithMaestro,
  });
}

export async function findSimilarFailuresWithMaestro(
  input: FindSimilarFailuresInput,
): Promise<ToolResult<FindSimilarFailuresData>> {
  return findSimilarFailuresWithMaestroFromActionOutcome(input);
}

export async function compareAgainstBaselineWithMaestro(
  input: CompareAgainstBaselineInput,
): Promise<ToolResult<CompareAgainstBaselineData>> {
  return compareAgainstBaselineWithMaestroFromActionOutcome(input);
}

export async function suggestKnownRemediationWithMaestro(
  input: SuggestKnownRemediationInput,
): Promise<ToolResult<SuggestKnownRemediationData>> {
  return suggestKnownRemediationWithMaestroFromActionOutcome(input);
}

export async function collectBasicRunResult(params: {
  repoRoot: string;
  sessionId: string;
  durationMs: number;
  attempts: number;
  artifactsDir: ArtifactDirectory;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  command: string[];
  dryRun: boolean;
  execution?: CommandExecution;
  unsupportedCustomFlow?: boolean;
}): Promise<ToolResult<RunFlowData>> {
  return collectBasicRunResultWithRuntime(params);
}

export async function runFlowWithMaestro(input: RunFlowInput): Promise<ToolResult<RunFlowData>> {
  return runFlowWithRuntime(input);
}

export async function listAvailableDevices(
  input: ListDevicesInput = {},
): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>> {
  const startTime = Date.now();
  const sessionId = `device-scan-${Date.now()}`;
  const repoRoot = resolveRepoPath();
  const result = await listAvailableDevicesRuntime(repoRoot, input.includeUnavailable ?? false);

  return {
    status: result.status,
    reasonCode: result.reasonCode,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      android: result.android,
      ios: result.ios,
    },
    nextSuggestions: result.nextSuggestions,
  };
}

export async function typeTextWithMaestro(input: TypeTextInput): Promise<ToolResult<TypeTextData>> {
  return typeTextWithMaestroTool(input);
}

export async function resolveUiTargetWithMaestro(input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>> {
  return resolveUiTargetWithMaestroTool(input);
}

export async function tapElementWithMaestro(input: TapElementInput): Promise<ToolResult<TapElementData>> {
  return tapElementWithMaestroTool(input);
}

export async function typeIntoElementWithMaestro(input: TypeIntoElementInput): Promise<ToolResult<TypeIntoElementData>> {
  return typeIntoElementWithMaestroTool(input);
}

export async function scrollAndTapElementWithMaestro(input: ScrollAndTapElementInput): Promise<ToolResult<ScrollAndTapElementData>> {
  return scrollAndTapElementWithMaestroTool(input);
}

export async function waitForUiWithMaestro(input: WaitForUiInput): Promise<ToolResult<WaitForUiData>> {
  return waitForUiWithMaestroTool(input);
}

export async function scrollAndResolveUiTargetWithMaestro(input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>> {
  return scrollAndResolveUiTargetWithMaestroTool(input);
}

export async function tapWithMaestro(input: TapInput): Promise<ToolResult<TapData>> {
  return tapWithMaestroTool(input);
}

export async function inspectUiWithMaestro(input: InspectUiInput): Promise<ToolResult<InspectUiData>> {
  return inspectUiWithMaestroTool(input);
}

export async function queryUiWithMaestro(input: QueryUiInput): Promise<ToolResult<QueryUiData>> {
  return queryUiWithMaestroTool(input);
}

export async function terminateAppWithMaestro(input: TerminateAppInput): Promise<ToolResult<TerminateAppData>> {
  return terminateAppWithRuntime(input);
}

export async function takeScreenshotWithMaestro(input: ScreenshotInput): Promise<ToolResult<ScreenshotData>> {
  return takeScreenshotWithRuntime(input);
}

export async function recordScreenWithMaestro(input: RecordScreenInput): Promise<ToolResult<RecordScreenData>> {
  return recordScreenWithRuntime(input);
}

export async function resetAppStateWithMaestro(input: ResetAppStateInput): Promise<ToolResult<ResetAppStateData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        strategy: input.strategy ?? "clear_data",
        appId: input.appId,
        artifactPath: input.artifactPath,
        commandLabels: [],
        commands: [],
        exitCode: null,
        supportLevel: "full",
      },
      nextSuggestions: ["Provide platform explicitly, or call reset_app_state with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const appId = input.appId ?? selection.appId;
  const strategy: ResetAppStateStrategy = input.strategy ?? "clear_data";
  const artifactPath = resolveInstallArtifactPath(repoRoot, runnerProfile, input.artifactPath);
  const targetAppId = appId ?? "";
  const resetPlan = buildResetPlanWithRuntime(platform, {
    strategy,
    deviceId,
    appId: targetAppId,
    artifactPath,
  });
  const commandLabels = [...resetPlan.commandLabels];
  const commands = [...resetPlan.commands];

  if (resetPlan.unsupportedReason) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        strategy,
        appId,
        artifactPath,
        commandLabels,
        commands,
        exitCode: null,
        supportLevel: resetPlan.supportLevel,
      },
      nextSuggestions: [resetPlan.unsupportedReason],
    };
  }

  if (!appId && strategy !== "keychain_reset") {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        strategy,
        appId,
        artifactPath,
        commandLabels,
        commands,
        exitCode: null,
        supportLevel: "full",
      },
      nextSuggestions: ["Provide appId or configure app_id in harness config before calling reset_app_state."],
    };
  }
  if (strategy === "uninstall_reinstall") {
    if (!artifactPath || !existsSync(artifactPath)) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: Boolean(input.dryRun),
          runnerProfile,
          strategy,
          appId,
          artifactPath,
          commandLabels,
          commands,
          exitCode: null,
          supportLevel: "full",
        },
        nextSuggestions: ["Provide a valid artifactPath or set runner-specific artifact environment variable before uninstall_reinstall."],
      };
    }
  }

  const supportLevel: "full" | "partial" = resetPlan.supportLevel;

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        strategy,
        appId,
        artifactPath,
        commandLabels,
        commands,
        exitCode: 0,
        supportLevel,
      },
      nextSuggestions: ["Run reset_app_state without dryRun to execute the reset strategy on the target device/simulator."],
    };
  }

  for (const command of commands) {
    const execution = await executeRunner(command, repoRoot, process.env);
    if (execution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(execution.stderr, execution.exitCode),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          strategy,
          appId,
          artifactPath,
          commandLabels,
          commands,
          exitCode: execution.exitCode,
          supportLevel,
        },
        nextSuggestions: ["Reset command failed. Verify device availability, appId/artifactPath, and simulator/device state before retrying reset_app_state."],
      };
    }
  }

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      strategy,
      appId,
      artifactPath,
      commandLabels,
      commands,
      exitCode: 0,
      supportLevel,
    },
    nextSuggestions: [],
  };
}

export async function getLogsWithMaestro(input: GetLogsInput): Promise<ToolResult<GetLogsData>> {
  return getLogsWithRuntime(input);
}

export async function getCrashSignalsWithMaestro(input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>> {
  return getCrashSignalsWithRuntime(input);
}

export async function collectDiagnosticsWithMaestro(input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>> {
  return collectDiagnosticsWithRuntime(input);
}

export async function collectDebugEvidenceWithMaestro(input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        outputPath: input.outputPath ?? path.posix.join("artifacts", "debug-evidence", input.sessionId, "unknown.md"),
        supportLevel: "partial",
        appId: input.appId,
        diagnosisBriefing: ["Missing platform context"],
        suspectAreas: ["configuration"],
        interestingSignals: [],
        evidencePaths: [],
        evidenceCount: 0,
        narrative: ["Platform was not provided and could not be inferred from session context."],
      },
      nextSuggestions: ["Provide platform explicitly, or call collect_debug_evidence with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.md`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const logOutputPath = path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.logs.txt`);
  const crashOutputPath = path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.crash.txt`);
  const diagnosticsOutputPath = input.platform === "android"
    ? path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.diagnostics.zip`)
    : path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.diagnostics`);
  const effectiveAppId = input.appId ?? selection.appId;
  const includeJsInspector = input.includeJsInspector ?? true;
  const jsInspectorTimeoutMs = normalizePositiveInteger(input.jsInspectorTimeoutMs, DEFAULT_DEBUG_PACKET_JS_TIMEOUT_MS);
  const effectiveMetroBaseUrl = normalizeMetroBaseUrl(input.metroBaseUrl);
  const discoveredTargetsResult = includeJsInspector && !input.targetId && !input.webSocketDebuggerUrl
    ? await listJsDebugTargetsWithMaestro({ sessionId: input.sessionId, metroBaseUrl: input.metroBaseUrl, timeoutMs: jsInspectorTimeoutMs, dryRun: input.dryRun })
    : undefined;
  const discoveredSelection = discoveredTargetsResult?.status === "success"
    ? selectPreferredJsDebugTargetWithReason(discoveredTargetsResult.data.targets)
    : undefined;
  const discoveredTarget = discoveredSelection?.target;
  const effectiveTargetId = input.targetId ?? discoveredTarget?.id;
  const effectiveWebSocketDebuggerUrl = input.webSocketDebuggerUrl ?? discoveredTarget?.webSocketDebuggerUrl;

  const logsResult = await getLogsWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    appId: effectiveAppId,
    outputPath: logOutputPath,
    lines: input.logLines,
    sinceSeconds: input.sinceSeconds,
    query: input.query,
    dryRun: input.dryRun,
  });
  const crashResult = await getCrashSignalsWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    appId: effectiveAppId,
    outputPath: crashOutputPath,
    lines: input.logLines,
    dryRun: input.dryRun,
  });
  const diagnosticsResult = input.includeDiagnostics
    ? await collectDiagnosticsWithMaestro({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      outputPath: diagnosticsOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;
  const jsConsoleResult = includeJsInspector
    ? await captureJsConsoleLogsWithMaestro({
      sessionId: input.sessionId,
      metroBaseUrl: undefined,
      targetId: effectiveTargetId,
      webSocketDebuggerUrl: effectiveWebSocketDebuggerUrl,
      maxLogs: input.logLines,
      timeoutMs: jsInspectorTimeoutMs,
      dryRun: input.dryRun,
    })
    : undefined;
  const jsNetworkResult = includeJsInspector
    ? await captureJsNetworkEventsWithMaestro({
      sessionId: input.sessionId,
      metroBaseUrl: undefined,
      targetId: effectiveTargetId,
      webSocketDebuggerUrl: effectiveWebSocketDebuggerUrl,
      maxEvents: input.logLines,
      timeoutMs: jsInspectorTimeoutMs,
      failuresOnly: true,
      dryRun: input.dryRun,
    })
    : undefined;

  const evidencePaths = [
    ...logsResult.artifacts,
    ...crashResult.artifacts,
    ...(diagnosticsResult?.artifacts ?? []),
  ];
  const environmentIssue = logsResult.reasonCode === REASON_CODES.deviceUnavailable || crashResult.reasonCode === REASON_CODES.deviceUnavailable
    ? "device or simulator connectivity prevented native evidence capture"
    : jsConsoleResult?.reasonCode === REASON_CODES.configurationError || jsNetworkResult?.reasonCode === REASON_CODES.configurationError
      ? "Metro inspector was unavailable for JS evidence capture"
      : undefined;
  const interestingSignals = mergeSignalSummaries(logsResult.data.summary, crashResult.data.summary);
  const suspectAreas = buildSuspectAreas({
    crashSummary: crashResult.data.summary,
    logSummary: logsResult.data.summary,
    jsConsoleSummary: jsConsoleResult?.data.summary,
    jsNetworkSummary: jsNetworkResult?.data.summary,
    jsConsoleLogs: jsConsoleResult?.data.logs,
    environmentIssue,
  });
  const narrative = buildDebugNarrative({
    appId: effectiveAppId,
    appFilterApplied: logsResult.data.appFilterApplied,
    logSummary: logsResult.data.summary,
    crashSummary: crashResult.data.summary,
    jsNetworkSummary: jsNetworkResult?.data.summary,
    includeDiagnostics: Boolean(input.includeDiagnostics),
    diagnosticsArtifacts: diagnosticsResult?.data.artifactCount ?? 0,
  });
  if (jsConsoleResult) {
    narrative.push(jsConsoleResult.status === "success"
      ? `JS console snapshot collected ${String(jsConsoleResult.data.collectedCount)} event(s).`
      : "JS console snapshot was unavailable; check Metro inspector availability.");
  }
  if (jsNetworkResult) {
    narrative.push(jsNetworkResult.status === "success"
      ? `JS network snapshot collected ${String(jsNetworkResult.data.collectedCount)} event(s).`
      : "JS network snapshot was unavailable; check Metro inspector availability.");
  }
  if (includeJsInspector && discoveredTargetsResult) {
    narrative.push(buildJsDebugTargetSelectionNarrativeLine(discoveredTarget, discoveredSelection?.reason));
  }

  const jsConsoleOk = !jsConsoleResult || jsConsoleResult.status === "success";
  const jsNetworkOk = !jsNetworkResult || jsNetworkResult.status === "success";
  const allSucceeded = logsResult.status === "success" && crashResult.status === "success" && (!diagnosticsResult || diagnosticsResult.status === "success") && jsConsoleOk && jsNetworkOk;
  const anySucceeded = logsResult.status === "success" || crashResult.status === "success" || diagnosticsResult?.status === "success" || jsConsoleResult?.status === "success" || jsNetworkResult?.status === "success";
  const status = allSucceeded ? "success" : anySucceeded ? "partial" : "failed";
  const reasonCode = allSucceeded
    ? REASON_CODES.ok
    : logsResult.reasonCode !== REASON_CODES.ok
        ? logsResult.reasonCode
        : crashResult.reasonCode !== REASON_CODES.ok
          ? crashResult.reasonCode
          : diagnosticsResult?.reasonCode ?? jsConsoleResult?.reasonCode ?? jsNetworkResult?.reasonCode ?? REASON_CODES.adapterError;
  if (suspectAreas.length === 0) {
    if (reasonCode === REASON_CODES.deviceUnavailable) {
      suspectAreas.push("Environment suspect: device or simulator connectivity prevented evidence capture.");
    } else if (reasonCode === REASON_CODES.configurationError) {
      suspectAreas.push("Environment suspect: Metro inspector or local debug configuration prevented JS evidence capture.");
    }
  }
  const diagnosisBriefing = buildDiagnosisBriefing({
    status,
    reasonCode,
    appId: effectiveAppId,
    suspectAreas,
    jsDebugTargetId: effectiveTargetId,
    jsConsoleLogCount: jsConsoleResult?.data.collectedCount,
    jsNetworkEventCount: jsNetworkResult?.data.collectedCount,
  });
  const nextSuggestions = buildDebugNextSuggestions({
    reasonCode,
    suspectAreas,
    includeDiagnostics: Boolean(input.includeDiagnostics),
    jsDebugTargetId: effectiveTargetId,
    jsConsoleLogCount: jsConsoleResult?.data.collectedCount,
    jsNetworkEventCount: jsNetworkResult?.data.collectedCount,
  });
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (!input.dryRun) {
    const report = [
      "# Debug Evidence Summary",
      `- Platform: ${input.platform}`,
      `- Runner profile: ${runnerProfile}`,
      `- App: ${effectiveAppId ?? "<unknown>"}`,
      `- Query: ${input.query ?? "<none>"}`,
      `- JS inspector enabled: ${includeJsInspector ? "yes" : "no"}`,
      `- JS target: ${effectiveTargetId ?? "<none>"}`,
      "",
      "## Diagnosis Briefing",
      ...(diagnosisBriefing.length > 0 ? diagnosisBriefing.map((line) => `- ${line}`) : ["- <no briefing available>"]),
      "",
      "## Narrative",
      ...narrative.map((line) => `- ${line}`),
      "",
      "## JS Console Events",
      ...(jsConsoleResult?.data.logs?.length ? jsConsoleResult.data.logs.map(formatJsConsoleEntry) : ["- <no JS console events captured>"]),
      "",
      "## JS Network Events",
      ...(jsNetworkResult?.data.events?.length ? jsNetworkResult.data.events.map((entry) => `- [${entry.status ?? "pending"}] ${entry.method ?? "GET"} ${entry.url ?? "<unknown>"}${entry.errorText ? ` :: ${entry.errorText}` : ""}`) : ["- <no JS network events captured>"]),
      "",
      "## Top Signals",
      ...(interestingSignals.length > 0 ? interestingSignals.map((signal) => `- [${signal.category}] x${String(signal.count)} ${signal.sample}`) : ["- <no interesting signals detected>"]),
      "",
      "## Suspect Areas",
      ...(suspectAreas.length > 0 ? suspectAreas.map((item) => `- ${item}`) : ["- <no prioritized suspects yet>"]),
      "",
      "## Evidence Paths",
      ...(evidencePaths.length > 0 ? evidencePaths.map((item) => `- ${item}`) : ["- <no evidence paths recorded>"]),
    ].join(String.fromCharCode(10)) + String.fromCharCode(10);
    await writeFile(absoluteOutputPath, report, "utf8");
  }

  const summaryArtifactPath = input.dryRun ? [] : [relativeOutputPath];

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [...summaryArtifactPath, ...evidencePaths],
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      outputPath: relativeOutputPath,
      supportLevel: "full",
      appId: effectiveAppId,
      jsDebugMetroBaseUrl: includeJsInspector ? effectiveMetroBaseUrl : undefined,
      jsDebugTargetEndpoint: discoveredTargetsResult?.data.endpoint,
      jsDebugTargetCandidateCount: discoveredTargetsResult?.data.targetCount,
      jsDebugTargetId: effectiveTargetId,
      jsDebugTargetTitle: discoveredTarget?.title,
      jsDebugTargetSelectionReason: discoveredSelection?.reason,
      logSummary: logsResult.data.summary,
      crashSummary: crashResult.data.summary,
      jsConsoleLogCount: jsConsoleResult?.data.collectedCount,
      jsNetworkEventCount: jsNetworkResult?.data.collectedCount,
      jsConsoleSummary: jsConsoleResult?.data.summary,
      jsNetworkSummary: jsNetworkResult?.data.summary,
      diagnosisBriefing,
      suspectAreas,
      interestingSignals,
      evidencePaths: [...summaryArtifactPath, ...evidencePaths],
      evidenceCount: summaryArtifactPath.length + evidencePaths.length,
      evidence: [
        ...summaryArtifactPath.map((artifactPath) => buildExecutionEvidence("debug_summary", artifactPath, "full", "Generated summarized debug evidence report.")),
        ...(logsResult.data.evidence ?? []),
        ...(crashResult.data.evidence ?? []),
        ...(diagnosticsResult?.data.evidence ?? []),
        ...(jsConsoleResult?.data.logs?.length ? [buildExecutionEvidence("log", "metro://console-snapshot", "partial", "Captured JS console snapshot from Metro inspector.")] : []),
        ...(jsNetworkResult?.data.events?.length ? [buildExecutionEvidence("log", "metro://network-snapshot", "partial", "Captured JS network snapshot from Metro inspector.")] : []),
      ],
      narrative,
    },
    nextSuggestions: status === "success" ? [] : nextSuggestions,
  };
}

export function isPerfettoShellProbeAvailable(execution: CommandExecution): boolean {
  return isPerfettoShellProbeAvailableFromPerformanceTools(execution);
}

export async function measureAndroidPerformanceWithMaestro(input: MeasureAndroidPerformanceInput): Promise<ToolResult<MeasureAndroidPerformanceData>> {
  return measureAndroidPerformanceWithRuntime(input);
}

export async function measureIosPerformanceWithMaestro(input: MeasureIosPerformanceInput): Promise<ToolResult<MeasureIosPerformanceData>> {
  return measureIosPerformanceWithRuntime(input);
}

export async function launchAppWithMaestro(input: LaunchAppInput): Promise<ToolResult<LaunchAppData>> {
  return launchAppWithRuntime(input);
}

export async function installAppWithMaestro(input: InstallAppInput): Promise<ToolResult<InstallAppData>> {
  return installAppWithRuntime(input);
}

export async function runDoctor(
  input: DoctorInput = {},
): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] }; guidance: Array<{ dependency: string; status: "pass" | "warn" | "fail"; platformScope: "android" | "ios" | "cross"; installCommands: string[]; verifyCommands: string[]; envHints: string[] }> }>> {
  return runDoctorWithMaestro(input);
}
