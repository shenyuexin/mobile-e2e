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
  type InterruptionGuardTestHooks,
  type OcrFallbackTestHooks,
  performActionWithEvidenceWithMaestro as performActionWithEvidenceWithMaestroFromActionOrchestrator,
  resetInterruptionGuardTestHooksForTesting as resetInterruptionGuardTestHooksForTestingFromActionOrchestrator,
  resetOcrFallbackTestHooksForTesting as resetOcrFallbackTestHooksForTestingFromActionOrchestrator,
  setInterruptionGuardTestHooksForTesting as setInterruptionGuardTestHooksForTestingFromActionOrchestrator,
  setOcrFallbackTestHooksForTesting as setOcrFallbackTestHooksForTestingFromActionOrchestrator,
} from "./action-orchestrator.js";
import {
  installAppWithRuntime,
  launchAppWithRuntime,
  resetAppStateWithRuntime,
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
  buildDiagnosisBriefing as buildDiagnosisBriefingFromDiagnosticsTools,
  collectDebugEvidenceWithRuntime,
} from "./diagnostics-tools.js";
import {
  collectBasicRunResultWithRuntime,
  runFlowWithRuntime,
} from "./flow-runtime.js";
import {
  buildIosAppScopeNote as buildIosAppScopeNoteFromPerformanceTools,
  isPerfettoShellProbeAvailable as isPerfettoShellProbeAvailableFromPerformanceTools,
  measureAndroidPerformanceWithRuntime,
  measureIosPerformanceWithRuntime,
  shouldResolveIosAttachTarget as shouldResolveIosAttachTargetFromPerformanceTools,
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
export { buildInitialReplayProgress, buildReplayPlanFromFlowYaml, buildReplayStepsFromRecordedSteps, buildReplayStepsFromFlowYaml, type ReplayFlowImportPlan, type ReplayStep, type UnsupportedReplayFlowCommand } from "./replay-step-planner.js";
export { classifyInterruptionFromSignals } from "./interruption-classifier.js";
export { detectInterruptionFromSummary } from "./interruption-detector.js";
export { buildInterruptionEvent, decideInterruptionResolution } from "./interruption-resolver.js";
export { buildInterruptionTimelineEvent, buildResumeCheckpoint, hasStateDrift, pickEventSource, summarizeInterruptionDetail } from "./interruption-orchestrator.js";
export { classifyDoctorOutcome, isDoctorCriticalFailure } from "./doctor-runtime.js";

export function buildLogSummary(content: string, query?: string): LogSummary {
  return buildLogSummaryWithSessionState(content, query);
}

export function buildStateSummaryFromSignals(params: {
  uiSummary?: InspectUiSummary;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
}): StateSummary {
  return buildStateSummaryFromSignalsWithSessionState(params);
}

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
  return buildDiagnosisBriefingFromDiagnosticsTools(params);
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
  return resetAppStateWithRuntime(input);
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
  return collectDebugEvidenceWithRuntime(input);
}

export function isPerfettoShellProbeAvailable(execution: CommandExecution): boolean {
  return isPerfettoShellProbeAvailableFromPerformanceTools(execution);
}

export function buildIosAppScopeNote(appId?: string, attachTarget?: string): string {
  return buildIosAppScopeNoteFromPerformanceTools(appId, attachTarget);
}

export function shouldResolveIosAttachTarget(params: {
  dryRun?: boolean;
  template: IosPerformanceTemplate;
  appId?: string;
}): boolean {
  return shouldResolveIosAttachTargetFromPerformanceTools(params);
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

export { cropElementScreenshot } from "./element-screenshot.js";
