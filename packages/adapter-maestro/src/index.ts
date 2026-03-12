import {
  type ActionIntent,
  type ActionOutcomeSummary,
  type AndroidPerformancePreset,
  type CollectDebugEvidenceData,
  type CollectDebugEvidenceInput,
  type CompareAgainstBaselineData,
  type CompareAgainstBaselineInput,
  type CaptureJsConsoleLogsData,
  type CaptureJsConsoleLogsInput,
  type JsConsoleLogSummary,
  type CaptureJsNetworkEventsData,
  type CaptureJsNetworkEventsInput,
  type DescribeCapabilitiesData,
  type DescribeCapabilitiesInput,
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
  type InspectUiInput,
  type InspectUiNode,
  type InspectUiSummary,
  type InstallAppInput,
  type LaunchAppInput,
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
  type RecoverySummary,
  type ReplayLastStablePathData,
  type ReplayLastStablePathInput,
  type ReasonCode,
  type RunFlowInput,
  type RunnerProfile,
  type SessionTimelineEvent,
  type ScreenshotInput,
  type ScrollAndTapElementData,
  type ScrollAndTapElementInput,
  type ScrollAndResolveUiTargetData,
  type ScrollAndResolveUiTargetInput,
  type IosPerformanceTemplate,
  type TapElementData,
  type TapElementInput,
  type TapInput,
  type TerminateAppInput,
  type ToolResult,
  type TypeTextInput,
  type TypeIntoElementData,
  type TypeIntoElementInput,
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
import { listActionRecordsForSession, loadActionRecord, loadBaselineIndex, loadFailureIndex, loadLatestActionRecordForSession, loadSessionRecord, recordBaselineEntry, recordFailureSignature, persistActionRecord, persistSessionState, queryTimelineAroundAction, type PersistedActionRecord } from "@mobile-e2e-mcp/core";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildCapabilityProfile } from "./capability-model.js";
import {
  type ArtifactDirectory,
  buildArtifactsDir,
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
  type CollectDiagnosticsCapture,
  type GetCrashSignalsCapture,
  type GetLogsCapture,
  buildCollectDiagnosticsCapture,
  buildGetCrashSignalsCapture,
  buildGetLogsCapture,
  buildIosLogPredicateForApp,
  collectHarnessChecks,
  getInstallArtifactSpec,
  listAvailableDevices as listAvailableDevicesRuntime,
  resolveAndroidAppPid,
  resolveInstallArtifactPath,
  summarizeInfoCheck,
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
  normalizeScrollDirection,
  normalizeWaitForUiMode,
  reasonCodeForWaitTimeout,
} from "./ui-tools.js";
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
export { buildArtifactsDir, resolveRepoPath, resolveSessionDefaults } from "./harness-config.js";
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

const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const DEFAULT_WAIT_INTERVAL_MS = 500;
const DEFAULT_GET_LOGS_LINES = 200;
const DEFAULT_GET_CRASH_LINES = 120;
const DEFAULT_DEBUG_PACKET_JS_TIMEOUT_MS = 1000;
const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;
const DEFAULT_SCROLL_MAX_SWIPES = 3;
const DEFAULT_SCROLL_DURATION_MS = 250;

function shouldContinueScrollResolution(status: string): boolean {
  return status === "no_match" || status === "off_screen";
}
const DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES = 2;

interface TypeTextData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  text: string;
  command: string[];
  exitCode: number | null;
}

interface TapData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  x: number;
  y: number;
  command: string[];
  exitCode: number | null;
}

interface ScreenshotData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
  evidence?: ExecutionEvidence[];
}

interface TerminateAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  appId: string;
  command: string[];
  exitCode: number | null;
}

interface LaunchAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  appId: string;
  launchUrl?: string;
  launchCommand: string[];
  exitCode: number | null;
}

interface InstallAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  artifactPath?: string;
  installCommand: string[];
  exitCode: number | null;
}

interface BasicRunData {
  dryRun: boolean;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  artifactsDir: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  command: string[];
  exitCode: number | null;
  summaryLine?: string;
}


function isInterestingDebugLine(line: string): boolean {
  const normalized = line.toLowerCase();
  if (
    line.startsWith("#")
    || normalized.includes("<no crash entries found>")
    || normalized.includes("<no crash snippets collected>")
    || normalized.includes("/library/logs/crashreporter")
    || normalized.endsWith("crashreporter")
  ) {
    return false;
  }
  return normalized.includes("fatal")
    || normalized.includes("exception")
    || normalized.includes("error")
    || normalized.includes("crash")
    || normalized.includes("anr")
    || normalized.includes("timeout")
    || normalized.includes("failed")
    || normalized.includes("unable to");
}

export function buildLogSummary(content: string, query?: string): LogSummary {
  const lines = content.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean);
  const queryText = query?.trim();
  const queryLower = queryText?.toLowerCase();
  const matchedLines = queryLower ? lines.filter((line) => line.toLowerCase().includes(queryLower)) : lines;
  const interestingLines = matchedLines.filter(isInterestingDebugLine);
  const bucket = new Map<string, DebugSignalSummary>();

  for (const line of interestingLines) {
    const category = classifyDebugSignal(line);
    const key = `${category}:${line}`;
    const current = bucket.get(key);
    if (current) {
      current.count += 1;
    } else {
      bucket.set(key, { category, count: 1, sample: line });
    }
  }

  const topSignals = [...bucket.values()]
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
    .slice(0, 8);
  const sampleLines = interestingLines.slice(0, 8);

  return {
    totalLines: lines.length,
    matchedLines: matchedLines.length,
    query: queryText,
    topSignals,
    sampleLines,
  };
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

function toScreenId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : undefined;
}

function detectBlockingSignals(visibleTexts: string[], candidateActions: string[]): string[] {
  const signals = new Set<string>();
  const combined = [...visibleTexts, ...candidateActions].map((value) => value.toLowerCase());

  for (const value of combined) {
    if (value.includes("allow") || value.includes("permission") || value.includes("while using") || value.includes("don\'t allow")) {
      signals.add("permission_prompt");
    }
    if (value.includes("loading") || value.includes("please wait") || value.includes("signing in") || value.includes("progress")) {
      signals.add("loading_indicator");
    }
    if (value.includes("offline") || value.includes("network") || value.includes("connection") || value.includes("timeout")) {
      signals.add("network_instability");
    }
    if (value.includes("try again") || value.includes("retry") || value.includes("failed") || value.includes("error")) {
      signals.add("error_state");
    }
    if (value.includes("empty") || value.includes("no items") || value.includes("no results") || value.includes("nothing here")) {
      signals.add("empty_state");
    }
    if (value.includes("cancel") || value.includes("not now") || value.includes("ok") || value.includes("open settings")) {
      signals.add("dialog_actions");
    }
  }

  return [...signals].slice(0, 6);
}

function buildRecentFailures(logSummary?: LogSummary, crashSummary?: LogSummary): string[] {
  return uniqueNonEmpty([
    ...(crashSummary?.topSignals.map((signal) => signal.sample) ?? []),
    ...(logSummary?.topSignals.map((signal) => signal.sample) ?? []),
  ], 5);
}

function inferPageHints(visibleTexts: string[], candidateActions: string[]): string[] {
  const normalized = [...visibleTexts, ...candidateActions].map((value) => value.toLowerCase());
  const hints = new Set<string>();
  for (const value of normalized) {
    if (value.includes("login") || value.includes("sign in") || value.includes("password") || value.includes("email")) {
      hints.add("authentication");
    }
    if (value.includes("category") || value.includes("mobile phones") || value.includes("search")) {
      hints.add("catalog");
    }
    if (value.includes("details") || value.includes("description") || value.includes("add to cart")) {
      hints.add("detail");
    }
    if (value.includes("empty") || value.includes("no results") || value.includes("nothing here")) {
      hints.add("empty");
    }
  }
  return [...hints].slice(0, 5);
}

function buildStateConfidence(params: { appPhase: StateSummary["appPhase"]; readiness: StateSummary["readiness"]; uiSummary?: InspectUiSummary; blockingSignals: string[]; recentFailures: string[] }): number {
  let confidence = (params.uiSummary?.totalNodes ?? 0) > 0 ? 0.55 : 0.2;
  if (params.appPhase !== "unknown") confidence += 0.15;
  if (params.readiness !== "unknown") confidence += 0.1;
  if (params.blockingSignals.length > 0) confidence += 0.1;
  if (params.recentFailures.length > 0) confidence += 0.05;
  return Math.max(0.1, Math.min(0.98, Number(confidence.toFixed(2))));
}

function summarizeStateDelta(previous: StateSummary | undefined, current: StateSummary): string[] {
  if (!previous) {
    return [];
  }
  return uniqueNonEmpty([
    previous.appPhase !== current.appPhase ? `appPhase:${previous.appPhase}->${current.appPhase}` : undefined,
    previous.readiness !== current.readiness ? `readiness:${previous.readiness}->${current.readiness}` : undefined,
    JSON.stringify(previous.blockingSignals ?? []) !== JSON.stringify(current.blockingSignals ?? []) ? `blockingSignals:${(previous.blockingSignals ?? []).join(",")}->${(current.blockingSignals ?? []).join(",")}` : undefined,
    previous.screenTitle !== current.screenTitle ? `screenTitle:${previous.screenTitle ?? "unknown"}->${current.screenTitle ?? "unknown"}` : undefined,
    previous.screenId !== current.screenId ? `screenId:${previous.screenId ?? "unknown"}->${current.screenId ?? "unknown"}` : undefined,
  ], 6);
}

export function buildStateSummaryFromSignals(params: {
  uiSummary?: InspectUiSummary;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
}): StateSummary {
  const sampleNodes = params.uiSummary?.sampleNodes ?? [];
  const visibleTexts = uniqueNonEmpty(sampleNodes.flatMap((node) => [node.text, node.contentDesc]));
  const candidateActions = uniqueNonEmpty(sampleNodes.filter((node) => node.clickable).flatMap((node) => [node.text, node.contentDesc, node.resourceId]));
  const blockingSignals = detectBlockingSignals(visibleTexts, candidateActions);
  const recentFailures = buildRecentFailures(params.logSummary, params.crashSummary);
  const pageHints = inferPageHints(visibleTexts, candidateActions);
  const topCrash = params.crashSummary?.topSignals[0]?.sample?.toLowerCase();
  const topLog = params.logSummary?.topSignals[0]?.sample?.toLowerCase();
  const hasCrash = Boolean(topCrash && (topCrash.includes("crash") || topCrash.includes("fatal") || topCrash.includes("anr")));
  const hasLoading = blockingSignals.includes("loading_indicator");
  const hasInterruption = blockingSignals.includes("permission_prompt") || blockingSignals.includes("dialog_actions");
  const hasNetworkInstability = blockingSignals.includes("network_instability") || Boolean(topLog && (topLog.includes("network") || topLog.includes("http") || topLog.includes("timeout")));
  const hasErrorState = blockingSignals.includes("error_state") || Boolean(topLog && (topLog.includes("failed") || topLog.includes("error") || topLog.includes("exception")));
  const hasEmptyState = blockingSignals.includes("empty_state") || pageHints.includes("empty");
  const appPhase = hasCrash
    ? "crashed"
    : hasInterruption || hasErrorState
      ? "blocked"
      : pageHints.includes("authentication")
        ? "authentication"
        : pageHints.includes("detail")
          ? "detail"
          : pageHints.includes("catalog")
            ? "catalog"
            : hasEmptyState
              ? "empty"
      : hasLoading
        ? "loading"
        : (params.uiSummary?.totalNodes ?? 0) > 0
          ? "ready"
          : "unknown";
  const readiness = hasInterruption
    ? "interrupted"
    : hasLoading
      ? (hasNetworkInstability || recentFailures.some((value) => value.toLowerCase().includes("http")) ? "waiting_network" : "waiting_ui")
      : hasNetworkInstability
        ? "waiting_network"
      : appPhase === "ready"
        ? "ready"
        : "unknown";
  const screenTitle = visibleTexts[0] ?? candidateActions[0];
  const derivedSignals = uniqueNonEmpty([
    hasCrash ? "crash_signal" : undefined,
    hasLoading ? "loading_indicator" : undefined,
    hasInterruption ? "interruption_signal" : undefined,
    hasNetworkInstability ? "network_instability" : undefined,
    hasErrorState ? "error_state" : undefined,
    hasEmptyState ? "empty_state" : undefined,
    ...pageHints.map((hint) => `page_hint:${hint}`),
  ], 8);
  const stateConfidence = buildStateConfidence({
    appPhase,
    readiness,
    uiSummary: params.uiSummary,
    blockingSignals,
    recentFailures,
  });

  return {
    screenId: toScreenId(screenTitle ?? visibleTexts.join("-")),
    screenTitle,
    appPhase,
    readiness,
    blockingSignals,
    stateConfidence,
    pageHints,
    derivedSignals,
    visibleTargetCount: params.uiSummary?.clickableNodes,
    candidateActions,
    recentFailures,
    topVisibleTexts: visibleTexts,
  };
}

function buildSessionStateTimelineEvent(params: {
  screenSummary: StateSummary;
  artifacts: string[];
  dryRun: boolean;
}): SessionTimelineEvent {
  const timestamp = new Date().toISOString();
  return {
    eventId: `state-summary-${Date.now()}`,
    timestamp,
    type: "state_summary_captured",
    detail: params.dryRun ? "Captured session state summary in dry-run mode." : "Captured session state summary.",
    eventType: "state_summary",
    layer: "state",
    summary: params.screenSummary.screenTitle ?? params.screenSummary.appPhase,
    artifactRefs: params.artifacts,
    stateSummary: params.screenSummary,
    evidenceCompleteness: {
      level: params.artifacts.length >= 3 ? "complete" : params.artifacts.length > 0 ? "partial" : "missing",
      capturedKinds: params.artifacts.map((artifactPath) => artifactPath.includes("ui-dumps") ? "ui_dump" : artifactPath.includes("logs") ? "log" : artifactPath.includes("crash") ? "crash_signal" : "debug_summary"),
      missingEvidence: params.artifacts.length >= 3 ? [] : ["ui/log/crash evidence is not fully populated"],
    },
  };
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
  targetResolution?: { status?: string; matchCount?: number; obscuredByHigherRanked?: boolean };
  stateChanged: boolean;
}): string[] {
  return uniqueNonEmpty([
    params.latestKnownState ? summarizeStateDelta(params.latestKnownState, params.preStateSummary).map((item) => `stale_state_candidate:${item}`).join(";") || undefined : undefined,
    params.preStateSummary.readiness !== "ready" ? `pre_state_not_ready:${params.preStateSummary.readiness}` : undefined,
    params.preStateSummary.blockingSignals.length > 0 ? `blocking:${params.preStateSummary.blockingSignals.join(",")}` : undefined,
    params.targetResolution?.status ? `target_resolution:${params.targetResolution.status}` : undefined,
    params.targetResolution?.obscuredByHigherRanked ? "target_obscured_by_higher_ranked_candidate" : undefined,
    typeof params.targetResolution?.matchCount === "number" ? `target_match_count:${String(params.targetResolution.matchCount)}` : undefined,
    !params.stateChanged ? "post_state_unchanged" : undefined,
    params.lowLevelStatus !== "success" ? `low_level_status:${params.lowLevelStatus}` : undefined,
    params.lowLevelReasonCode !== REASON_CODES.ok ? `low_level_reason:${params.lowLevelReasonCode}` : undefined,
    params.postStateSummary.readiness !== "ready" ? `post_state_not_ready:${params.postStateSummary.readiness}` : undefined,
  ], 8);
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

function readResolutionSignal(data: unknown): { status?: string; matchCount?: number; obscuredByHigherRanked?: boolean } | undefined {
  if (!isRecord(data) || !isRecord(data.resolution)) {
    return undefined;
  }
  const resolution = data.resolution;
  const bestCandidate = isRecord(resolution.bestCandidate) ? resolution.bestCandidate : undefined;
  return {
    status: typeof resolution.status === "string" ? resolution.status : undefined,
    matchCount: typeof resolution.matchCount === "number" ? resolution.matchCount : undefined,
    obscuredByHigherRanked: bestCandidate?.obscuredByHigherRanked === true,
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

let ocrFallbackTestHooks: OcrFallbackTestHooks | undefined;

export function setOcrFallbackTestHooksForTesting(hooks: OcrFallbackTestHooks | undefined): void {
  ocrFallbackTestHooks = hooks;
}

export function resetOcrFallbackTestHooksForTesting(): void {
  ocrFallbackTestHooks = undefined;
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
  if (action.actionType === "tap_element") {
    return tapElementWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
      limit: action.limit,
      dryRun: params.dryRun,
    });
  }
  if (action.actionType === "type_into_element") {
    return typeIntoElementWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
      limit: action.limit,
      value: action.value ?? "",
      dryRun: params.dryRun,
    });
  }
  if (action.actionType === "wait_for_ui") {
    return waitForUiWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
      limit: action.limit,
      timeoutMs: action.timeoutMs,
      intervalMs: action.intervalMs,
      waitUntil: action.waitUntil,
      dryRun: params.dryRun,
    });
  }
  if (action.actionType === "launch_app") {
    return launchAppWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      appId: action.appId ?? params.appId,
      launchUrl: action.launchUrl,
      dryRun: params.dryRun,
    });
  }
  return terminateAppWithMaestro({
    sessionId: params.sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    harnessConfigPath: params.harnessConfigPath,
    deviceId: params.deviceId,
    appId: action.appId ?? params.appId,
    dryRun: params.dryRun,
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

  if (params.status !== "success") {
    briefing.push(`Current packet status is ${params.status} (${params.reasonCode}).`);
  }

  return briefing.slice(0, 5);
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
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const inspectResult = await inspectUiWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    dryRun: input.dryRun,
  });
  const includeDebugSignals = input.includeDebugSignals ?? false;
  const logOutputPath = path.posix.join("artifacts", "state-summaries", input.sessionId, `${input.platform}-${runnerProfile}.logs.txt`);
  const crashOutputPath = path.posix.join("artifacts", "state-summaries", input.sessionId, `${input.platform}-${runnerProfile}.crash.txt`);
  const logResult = includeDebugSignals
    ? await getLogsWithMaestro({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      outputPath: logOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;
  const crashResult = includeDebugSignals
    ? await getCrashSignalsWithMaestro({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      outputPath: crashOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;
  const screenSummary = buildStateSummaryFromSignals({
    uiSummary: inspectResult.data.summary,
    logSummary: logResult?.data.summary,
    crashSummary: crashResult?.data.summary,
  });
  const artifacts = Array.from(new Set([...inspectResult.artifacts, ...(logResult?.artifacts ?? []), ...(crashResult?.artifacts ?? [])]));
  const evidence = [
    ...(inspectResult.data.evidence ?? []),
    ...(logResult?.data.evidence ?? []),
    ...(crashResult?.data.evidence ?? []),
  ];
  const status = inspectResult.status === "failed"
    ? "failed"
    : ((logResult?.status === "failed" || crashResult?.status === "failed") ? "partial" : inspectResult.status);
  const reasonCode = inspectResult.status === "failed"
    ? inspectResult.reasonCode
    : logResult?.status === "failed"
      ? logResult.reasonCode
      : crashResult?.status === "failed"
        ? crashResult.reasonCode
        : inspectResult.reasonCode;

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1 + (logResult?.attempts ?? 0) + (crashResult?.attempts ?? 0),
    artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      outputPath: inspectResult.data.outputPath,
      command: inspectResult.data.command,
      exitCode: inspectResult.data.exitCode,
      supportLevel: inspectResult.data.supportLevel,
      summarySource: includeDebugSignals ? "ui_and_debug_signals" : "ui_only",
      screenSummary,
      evidence: evidence.length > 0 ? evidence : undefined,
      content: inspectResult.data.content,
      uiSummary: inspectResult.data.summary,
      logSummary: logResult?.data.summary,
      crashSummary: crashResult?.data.summary,
    },
    nextSuggestions: Array.from(new Set([
      ...inspectResult.nextSuggestions,
      ...(logResult?.nextSuggestions ?? []),
      ...(crashResult?.nextSuggestions ?? []),
    ])).slice(0, 5),
  };
}

export async function getSessionStateWithMaestro(
  input: GetSessionStateInput,
): Promise<ToolResult<GetSessionStateData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        platform: "android",
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        sessionRecordFound: false,
        state: {
          appPhase: "unknown",
          readiness: "unknown",
          blockingSignals: [],
        },
        capabilities: buildCapabilityProfile("android", input.runnerProfile ?? DEFAULT_RUNNER_PROFILE),
        screenSummary: {
          appPhase: "unknown",
          readiness: "unknown",
          blockingSignals: [],
        },
      },
      nextSuggestions: ["Provide platform explicitly or call start_session first so get_session_state can infer session defaults."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const screenSummaryResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: true,
    dryRun: input.dryRun,
  });
  const capabilities = buildCapabilityProfile(platform, runnerProfile);
  const persisted = sessionRecord && screenSummaryResult.status !== "failed"
    ? await persistSessionState(
      repoRoot,
      input.sessionId,
      screenSummaryResult.data.screenSummary,
      buildSessionStateTimelineEvent({
        screenSummary: screenSummaryResult.data.screenSummary,
        artifacts: screenSummaryResult.artifacts,
        dryRun: Boolean(input.dryRun),
      }),
      screenSummaryResult.artifacts,
    )
    : { updated: false as const, relativePath: undefined };
  const artifacts = persisted.relativePath
    ? Array.from(new Set([persisted.relativePath, ...screenSummaryResult.artifacts]))
    : screenSummaryResult.artifacts;
  const latestKnownStateDelta = summarizeStateDelta(sessionRecord?.session.latestStateSummary, screenSummaryResult.data.screenSummary);

  return {
    status: screenSummaryResult.status,
    reasonCode: screenSummaryResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: screenSummaryResult.attempts,
    artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      platform,
      runnerProfile,
      sessionRecordFound: Boolean(sessionRecord),
      state: screenSummaryResult.data.screenSummary,
      latestKnownState: sessionRecord?.session.latestStateSummary,
      latestKnownStateDelta: latestKnownStateDelta.length > 0 ? latestKnownStateDelta : undefined,
      capabilities,
      screenSummary: screenSummaryResult.data.screenSummary,
      logSummary: screenSummaryResult.data.logSummary,
      crashSummary: screenSummaryResult.data.crashSummary,
      evidence: screenSummaryResult.data.evidence,
    },
    nextSuggestions: sessionRecord
      ? screenSummaryResult.nextSuggestions
      : Array.from(new Set([
        "start_session before long-running execution if you want state snapshots persisted across tools.",
        ...screenSummaryResult.nextSuggestions,
      ])).slice(0, 5),
  };
}

export async function performActionWithEvidenceWithMaestro(
  input: PerformActionWithEvidenceInput,
): Promise<ToolResult<PerformActionWithEvidenceData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: false,
        outcome: {
          actionId: `action-${randomUUID()}`,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.1,
          outcome: "unknown",
        },
        evidenceDelta: { uiDiffSummary: "Action was not executed because platform could not be resolved." },
        lowLevelStatus: "failed",
        lowLevelReasonCode: REASON_CODES.configurationError,
      },
      nextSuggestions: ["Provide platform explicitly or start a session before calling perform_action_with_evidence."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const preStateResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: input.includeDebugSignals ?? true,
    dryRun: input.dryRun,
  });
  const lowLevelResult = await executeIntentWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    dryRun: input.dryRun,
  }, input.action);
  const preStateSummary = preStateResult.data.screenSummary;
  const ocrFallbackResult = canAttemptOcrFallback(input.action, lowLevelResult)
    ? await executeOcrFallback({
      input,
      platform,
      runnerProfile,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      preStateSummary,
    })
    : undefined;
  const finalStatus = ocrFallbackResult?.attempted ? ocrFallbackResult.status : lowLevelResult.status;
  const finalReasonCode = ocrFallbackResult?.attempted ? ocrFallbackResult.reasonCode : lowLevelResult.reasonCode;
  const fallbackUsed = Boolean(ocrFallbackResult?.used);
  const postStateResult = ocrFallbackResult?.postStateResult ?? await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: input.includeDebugSignals ?? true,
    dryRun: input.dryRun,
  });
  let postStateSummary = postStateResult.data.screenSummary;
  let stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
  const actionId = `action-${randomUUID()}`;
  const targetResolution = readResolutionSignal(lowLevelResult.data);
  let evidenceDelta = buildActionEvidenceDelta({
    preState: preStateSummary,
    postState: postStateSummary,
    preLogSummary: preStateResult.data.logSummary,
    postLogSummary: postStateResult.data.logSummary,
    preCrashSummary: preStateResult.data.crashSummary,
    postCrashSummary: postStateResult.data.crashSummary,
  });
  let failureCategory = classifyActionFailureCategory({
    finalStatus,
    finalReasonCode,
    preStateSummary,
    postStateSummary,
    lowLevelResult,
    stateChanged,
    targetResolution,
  });
  let postActionRefreshAttempted = false;
  let refreshedPostStateSummary: StateSummary | undefined;
  if (shouldAttemptPostActionRefresh({ failureCategory, finalStatus, stateChanged })) {
    postActionRefreshAttempted = true;
    const refreshedPostStateResult = await getScreenSummaryWithMaestro({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      includeDebugSignals: input.includeDebugSignals ?? true,
      dryRun: input.dryRun,
    });
    refreshedPostStateSummary = refreshedPostStateResult.data.screenSummary;
    if (JSON.stringify(postStateSummary) !== JSON.stringify(refreshedPostStateSummary)) {
      postStateSummary = refreshedPostStateSummary;
      stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
      evidenceDelta = buildActionEvidenceDelta({
        preState: preStateSummary,
        postState: postStateSummary,
        preLogSummary: preStateResult.data.logSummary,
        postLogSummary: refreshedPostStateResult.data.logSummary,
        preCrashSummary: preStateResult.data.crashSummary,
        postCrashSummary: refreshedPostStateResult.data.crashSummary,
      });
      failureCategory = classifyActionFailureCategory({
        finalStatus,
        finalReasonCode,
        preStateSummary,
        postStateSummary,
        lowLevelResult,
        stateChanged,
        targetResolution,
      });
    }
  }
  const outcome: ActionOutcomeSummary = {
    actionId,
    actionType: input.action.actionType,
    resolutionStrategy: fallbackUsed ? "ocr" : "deterministic",
    preState: preStateSummary,
    postState: postStateSummary,
    stateChanged,
    fallbackUsed,
    retryCount: ocrFallbackResult?.retryCount ?? 0,
    targetQuality: classifyTargetQuality({
      failureCategory,
      finalStatus,
      fallbackUsed,
      stateChanged,
    }),
    failureCategory,
    confidence: ocrFallbackResult?.ocrEvidence?.ocrConfidence ?? buildActionOutcomeConfidence(finalStatus, stateChanged),
    ocrEvidence: ocrFallbackResult?.ocrEvidence,
    outcome: finalStatus === "success" ? "success" : finalStatus === "partial" ? "partial" : "failed",
  };
  const evidence = [
    ...(preStateResult.data.evidence ?? []),
    ...(postStateResult.data.evidence ?? []),
  ];
  const artifacts = Array.from(new Set([
    ...preStateResult.artifacts,
    ...lowLevelResult.artifacts,
    ...(ocrFallbackResult?.artifacts ?? []),
    ...postStateResult.artifacts,
  ]));
  const actionEvent: SessionTimelineEvent = {
    eventId: actionId,
    timestamp: new Date().toISOString(),
    type: "action_outcome_recorded",
    detail: evidenceDelta.uiDiffSummary,
    eventType: "action_outcome",
    actionId,
    layer: "action",
    summary: `${input.action.actionType} -> ${outcome.outcome}`,
    artifactRefs: artifacts,
    stateSummary: postStateSummary,
    evidenceCompleteness: {
      level: artifacts.length >= 3 ? "complete" : artifacts.length > 0 ? "partial" : "missing",
      capturedKinds: evidence.map((item) => item.kind),
      missingEvidence: artifacts.length > 0 ? [] : ["pre/post evidence was not captured"],
    },
  };

  const persistedSessionState = sessionRecord
    ? await persistSessionState(repoRoot, input.sessionId, postStateSummary, actionEvent, artifacts)
    : undefined;
  const persistedAction = await persistActionRecord(repoRoot, {
    actionId,
    sessionId: input.sessionId,
    intent: input.action,
    outcome,
      evidenceDelta,
      evidence,
      lowLevelStatus: finalStatus,
      lowLevelReasonCode: finalReasonCode,
      updatedAt: new Date().toISOString(),
    });
  if (outcome.outcome === "success") {
    await recordBaselineEntry(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      actionType: outcome.actionType,
      screenId: outcome.postState?.screenId ?? outcome.preState?.screenId,
      updatedAt: new Date().toISOString(),
    });
  }
  const allArtifacts = persistedAction.relativePath ? [persistedAction.relativePath, ...artifacts] : artifacts;
  const actionabilityReview = buildActionabilityReview({
    preStateSummary,
    postStateSummary,
    latestKnownState: sessionRecord?.session.latestStateSummary,
    lowLevelStatus: finalStatus,
    lowLevelReasonCode: finalReasonCode,
    targetResolution,
    stateChanged,
  });
  if (postActionRefreshAttempted) {
    actionabilityReview.unshift(
      refreshedPostStateSummary && JSON.stringify(postStateResult.data.screenSummary) !== JSON.stringify(refreshedPostStateSummary)
        ? "post_action_refresh_detected_additional_state_change"
        : "post_action_refresh_no_additional_change",
    );
  }

  return {
    status: finalStatus,
    reasonCode: finalReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: allArtifacts,
    data: {
      sessionRecordFound: Boolean(sessionRecord),
      outcome,
      evidenceDelta,
      preStateSummary,
      postStateSummary,
      postActionRefreshAttempted: postActionRefreshAttempted || undefined,
      actionabilityReview,
      lowLevelStatus: finalStatus,
      lowLevelReasonCode: finalReasonCode,
      evidence,
      sessionAuditPath: persistedSessionState?.auditPath,
    },
    nextSuggestions: finalStatus === "success"
      ? stateChanged
        ? []
        : ["Action transport succeeded but the app state did not change; inspect selector quality or blocking UI state."]
      : ocrFallbackResult?.nextSuggestions.length
        ? ocrFallbackResult.nextSuggestions
        : ["Inspect the returned pre/post state summaries and action evidence before retrying the same action."],
  };
}

export async function getActionOutcomeWithMaestro(
  input: GetActionOutcomeInput,
): Promise<ToolResult<GetActionOutcomeData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const record = await loadActionRecord(repoRoot, input.actionId);
  const found = Boolean(record) && (input.sessionId === undefined || record?.sessionId === input.sessionId);

  return {
    status: found ? "success" : "failed",
    reasonCode: found ? REASON_CODES.ok : REASON_CODES.configurationError,
    sessionId: input.sessionId ?? record?.sessionId ?? input.actionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: found ? [`artifacts/actions/${input.actionId}.json`] : [],
    data: found
      ? {
        found: true,
        actionId: input.actionId,
        sessionId: record?.sessionId,
        outcome: record?.outcome,
        evidenceDelta: record?.evidenceDelta,
        evidence: record?.evidence,
        lowLevelStatus: record?.lowLevelStatus,
        lowLevelReasonCode: record?.lowLevelReasonCode,
      }
      : {
        found: false,
        actionId: input.actionId,
        sessionId: input.sessionId,
      },
    nextSuggestions: found ? [] : ["Use perform_action_with_evidence first, then retrieve the action record by actionId."],
  };
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
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const lastActionEvent = sessionRecord?.session.timeline.filter((event) => event.type === "action_outcome_recorded").slice(-1)[0];
  const fallbackActionRecord = !lastActionEvent?.actionId ? await loadLatestActionRecordForSession(repoRoot, input.sessionId) : undefined;
  const resolvedActionId = lastActionEvent?.actionId ?? fallbackActionRecord?.actionId;

  if (!resolvedActionId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false },
      nextSuggestions: ["Run perform_action_with_evidence first so the session contains an attributable action window."],
    };
  }

  const record = fallbackActionRecord ?? await loadActionRecord(repoRoot, resolvedActionId);
  if (!record) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
        data: { found: false, actionId: resolvedActionId },
      nextSuggestions: ["The session references an actionId without a persisted action record; rerun the bounded action."],
    };
  }

  const timelineWindow = sessionRecord ? await queryTimelineAroundAction(repoRoot, input.sessionId, resolvedActionId) : { surroundingEvents: [] };
  const attribution = buildFailureAttribution({
    outcome: record.outcome,
    evidenceDelta: record.evidenceDelta,
    surroundingEvents: timelineWindow.surroundingEvents,
  });
  await recordFailureSignature(repoRoot, {
    actionId: resolvedActionId,
    sessionId: input.sessionId,
    signature: buildFailureSignature({
      outcome: record.outcome,
      attribution,
      evidenceDelta: record.evidenceDelta,
    }),
    remediation: [attribution.recommendedRecovery, attribution.recommendedNextProbe].filter((value): value is string => Boolean(value)),
    updatedAt: new Date().toISOString(),
  });
  const status = record.outcome.outcome === "success" ? "partial" : "success";

  return {
    status,
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [`artifacts/actions/${resolvedActionId}.json`],
    data: {
      found: true,
      actionId: resolvedActionId,
      outcome: record.outcome,
      attribution,
    },
    nextSuggestions: status === "success" ? [] : ["The last recorded action succeeded; use rank_failure_candidates only when the latest action window is actually problematic."],
  };
}

export async function rankFailureCandidatesWithMaestro(
  input: RankFailureCandidatesInput,
): Promise<ToolResult<RankFailureCandidatesData>> {
  const explained = await explainLastFailureWithMaestro({ sessionId: input.sessionId });
  if (explained.status === "failed") {
    return {
      status: "failed",
      reasonCode: explained.reasonCode,
      sessionId: input.sessionId,
      durationMs: explained.durationMs,
      attempts: 1,
      artifacts: explained.artifacts,
      data: { found: false, candidates: [] },
      nextSuggestions: explained.nextSuggestions,
    };
  }

  const primary = explained.data.attribution;
  const candidates: FailureAttribution[] = primary
    ? [
      primary,
      {
        ...primary,
        affectedLayer: primary.affectedLayer === "unknown" ? "ui_state" : "unknown",
        mostLikelyCause: primary.affectedLayer === "unknown" ? "No strong signal exists, but unchanged UI suggests a stale app state candidate." : "Unknown remains plausible because evidence is still incomplete.",
      },
    ]
    : [];

  return {
    status: explained.status,
    reasonCode: explained.reasonCode,
    sessionId: input.sessionId,
    durationMs: explained.durationMs,
    attempts: 1,
    artifacts: explained.artifacts,
    data: {
      found: Boolean(primary),
      actionId: explained.data.actionId,
      candidates,
    },
    nextSuggestions: explained.nextSuggestions,
  };
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
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;
  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { summary: { strategy: "none", recovered: false, note: "Platform could not be resolved for recovery." } },
      nextSuggestions: ["Provide platform explicitly or start a session before invoking recover_to_known_state."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const before = await getSessionStateWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    dryRun: input.dryRun,
  });
  let strategy: RecoverySummary["strategy"] = "none";
  let note = "State is already considered ready enough; no bounded recovery was required.";
  let artifacts = [...before.artifacts];
  let status: ToolResult["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;

  if (before.data.state.appPhase === "crashed" || before.data.state.blockingSignals.includes("error_state")) {
    strategy = "relaunch_app";
    const result = await launchAppWithMaestro({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      dryRun: input.dryRun,
    });
    artifacts = Array.from(new Set([...artifacts, ...result.artifacts]));
    status = result.status;
    reasonCode = result.reasonCode;
    note = "Recovery relaunched the app because the session looked crashed or error-blocked.";
  } else if (before.data.state.readiness === "waiting_network" || before.data.state.readiness === "waiting_ui" || before.data.state.appPhase === "loading") {
    strategy = "wait_until_ready";
    note = "Recovery re-sampled session state waiting for the screen to stabilize.";
  }

  const after = await getSessionStateWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    dryRun: input.dryRun,
  });
  artifacts = Array.from(new Set([...artifacts, ...after.artifacts]));
  const recovered = after.data.state.readiness === "ready" || after.data.state.appPhase === "ready";
  const summary: RecoverySummary = {
    strategy,
    recovered,
    note,
    stateBefore: before.data.state,
    stateAfter: after.data.state,
  };

  if (sessionRecord) {
    await persistSessionState(repoRoot, input.sessionId, after.data.state, buildRecoveryTimelineEvent(summary, artifacts), artifacts);
  }

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts,
    data: { summary },
    nextSuggestions: recovered ? [] : ["Recovery stopped at a deterministic boundary; inspect the latest state summary before escalating."],
  };
}

export async function replayLastStablePathWithMaestro(
  input: ReplayLastStablePathInput,
): Promise<ToolResult<ReplayLastStablePathData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;
  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { summary: { strategy: "replay_last_successful_action", recovered: false, note: "Platform could not be resolved for replay." } },
      nextSuggestions: ["Provide platform explicitly or start a session before invoking replay_last_stable_path."],
    };
  }

  const stableRecord = (await listActionRecordsForSession(repoRoot, input.sessionId)).find((record: { outcome: ActionOutcomeSummary }) => record.outcome.outcome === "success");
  if (!stableRecord) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { summary: { strategy: "replay_last_successful_action", recovered: false, note: "No stable successful action was recorded for this session." } },
      nextSuggestions: ["Record at least one successful perform_action_with_evidence step before replaying a stable path."],
    };
  }

  if (!canReplayPersistedAction(stableRecord)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        summary: {
          strategy: "replay_last_successful_action",
          recovered: false,
          note: "The last successful action is considered too risky for bounded auto replay.",
          replayedActionId: stableRecord.actionId,
        },
      },
      nextSuggestions: ["Only low-side-effect actions can be replayed automatically; inspect the prior action manually instead."],
    };
  }

  const replayed = await performActionWithEvidenceWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    action: {
      actionType: stableRecord.intent?.actionType ?? stableRecord.outcome.actionType,
      resourceId: stableRecord.intent?.resourceId ?? stableRecord.outcome.postState?.screenId,
      contentDesc: stableRecord.intent?.contentDesc,
      text: stableRecord.intent?.text,
      className: stableRecord.intent?.className,
      clickable: stableRecord.intent?.clickable,
      limit: stableRecord.intent?.limit,
      value: stableRecord.intent?.value,
      appId: stableRecord.intent?.appId,
      launchUrl: stableRecord.intent?.launchUrl,
      timeoutMs: stableRecord.intent?.timeoutMs,
      intervalMs: stableRecord.intent?.intervalMs,
      waitUntil: stableRecord.intent?.waitUntil,
    },
    dryRun: input.dryRun,
  });
  const summary: RecoverySummary = {
    strategy: "replay_last_successful_action",
    recovered: replayed.status !== "failed",
    note: "Recovery replayed the last successful bounded action from local session history.",
    stateBefore: stableRecord.outcome.preState,
    stateAfter: replayed.data.postStateSummary,
    replayedActionId: stableRecord.actionId,
  };

  return {
    status: replayed.status,
    reasonCode: replayed.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: replayed.artifacts,
    data: { summary, replayedOutcome: replayed.data.outcome },
    nextSuggestions: replayed.nextSuggestions,
  };
}

export async function findSimilarFailuresWithMaestro(
  input: FindSimilarFailuresInput,
): Promise<ToolResult<FindSimilarFailuresData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const actionId = input.actionId ?? (await loadLatestActionRecordForSession(repoRoot, input.sessionId))?.actionId;
  if (!actionId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false, similarFailures: [] },
      nextSuggestions: ["Explain or record a failed action first so a failure signature exists."],
    };
  }

  const explained = await explainLastFailureWithMaestro({ sessionId: input.sessionId });
  const signature = explained.data.attribution && explained.data.outcome
    ? buildFailureSignature({ outcome: explained.data.outcome, attribution: explained.data.attribution, evidenceDelta: (await loadActionRecord(repoRoot, actionId))?.evidenceDelta })
    : undefined;
  const failureIndex = await loadFailureIndex(repoRoot);
  const similarFailures: SimilarFailure[] = signature
    ? failureIndex
      .filter((entry) => entry.actionId !== actionId)
      .map((entry) => ({
        actionId: entry.actionId,
        sessionId: entry.sessionId,
        signature: entry.signature,
        matchScore: scoreSimilarFailure(signature, entry.signature),
      }))
      .filter((entry) => entry.matchScore > 0)
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, 5)
    : [];

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { found: Boolean(signature), actionId, signature, similarFailures },
    nextSuggestions: similarFailures.length > 0 ? [] : ["No strong similar failures were indexed yet; build more local history or inspect the baseline diff next."],
  };
}

export async function compareAgainstBaselineWithMaestro(
  input: CompareAgainstBaselineInput,
): Promise<ToolResult<CompareAgainstBaselineData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const current = input.actionId ? await loadActionRecord(repoRoot, input.actionId) : await loadLatestActionRecordForSession(repoRoot, input.sessionId);
  if (!current) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false },
      nextSuggestions: ["Record an action outcome before comparing it against a baseline."],
    };
  }

  const baselines = await loadBaselineIndex(repoRoot);
  const baseline = baselines.find((entry) => entry.actionType === current.outcome.actionType && entry.actionId !== current.actionId);
  const differences: string[] = [];
  if (baseline) {
    if ((current.outcome.postState?.screenId ?? current.outcome.preState?.screenId) !== baseline.screenId) {
      differences.push(`screen ${current.outcome.postState?.screenId ?? current.outcome.preState?.screenId ?? "unknown"} != ${baseline.screenId ?? "unknown"}`);
    }
    if (current.outcome.outcome !== "success") {
      differences.push(`outcome ${current.outcome.outcome} differs from successful baseline`);
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
      found: Boolean(baseline),
      actionId: current.actionId,
      comparison: {
        baselineActionId: baseline?.actionId,
        comparedActionId: current.actionId,
        differences,
        matched: differences.length === 0 && Boolean(baseline),
      },
    },
    nextSuggestions: baseline ? [] : ["No successful baseline exists yet for this action type; create one by recording a successful bounded action."],
  };
}

export async function suggestKnownRemediationWithMaestro(
  input: SuggestKnownRemediationInput,
): Promise<ToolResult<SuggestKnownRemediationData>> {
  const similar = await findSimilarFailuresWithMaestro({ sessionId: input.sessionId, actionId: input.actionId });
  const baseline = await compareAgainstBaselineWithMaestro({ sessionId: input.sessionId, actionId: input.actionId });
  const repoRoot = resolveRepoPath();
  const failureIndex = await loadFailureIndex(repoRoot);
  const actionId = similar.data.actionId ?? baseline.data.actionId;
  const indexedRemediation = actionId ? failureIndex.find((entry) => entry.actionId === actionId)?.remediation ?? [] : [];
  const remediation = uniqueNonEmpty([
    ...indexedRemediation,
    ...(similar.data.similarFailures.length > 0 ? ["This failure resembles previous incidents; inspect the closest matching signature before changing selectors."] : []),
    ...(baseline.data.comparison?.differences.length ? ["Current action diverges from a successful baseline; inspect the listed differences first."] : []),
  ], 5);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: {
      found: remediation.length > 0,
      actionId,
      remediation,
    },
    nextSuggestions: remediation.length > 0 ? [] : ["No known remediation was indexed yet; explain the failure first to seed local memory."],
  };
}

function readSummaryLine(stdout?: string): string | undefined {
  if (!stdout) {
    return undefined;
  }

  const carriageReturn = String.fromCharCode(13);
  const lineFeed = String.fromCharCode(10);
  const normalized = stdout.replaceAll(carriageReturn, "");
  const lines = normalized.split(lineFeed).filter(Boolean);
  return lines.at(-1);
}

async function readRunCounts(artifactsDir: string): Promise<{ totalRuns: number; passedRuns: number; failedRuns: number }> {
  try {
    const entries = await readdir(artifactsDir, { withFileTypes: true });
    let totalRuns = 0;
    let passedRuns = 0;
    let failedRuns = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("run-")) {
        continue;
      }

      totalRuns += 1;
      const resultPath = path.join(artifactsDir, entry.name, "result.txt");
      try {
        const result = (await readFile(resultPath, "utf8")).trim();
        if (result === "PASS") {
          passedRuns += 1;
        } else {
          failedRuns += 1;
        }
      } catch {
        failedRuns += 1;
      }
    }

    return { totalRuns, passedRuns, failedRuns };
  } catch {
    return { totalRuns: 0, passedRuns: 0, failedRuns: 0 };
  }
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
}): Promise<ToolResult<BasicRunData>> {
  const { totalRuns, passedRuns, failedRuns } = await readRunCounts(params.artifactsDir.absolutePath);
  const artifacts = await listArtifacts(params.artifactsDir.absolutePath, params.repoRoot);

  let status: ToolResult<BasicRunData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  const nextSuggestions: string[] = [];

  if (params.unsupportedCustomFlow) {
    status = "partial";
    reasonCode = REASON_CODES.unsupportedOperation;
    nextSuggestions.push("The selected runner profile bundles predefined flows. Omit flowPath or pass a custom runnerScript if you need exact single-flow control.");
  } else if (params.dryRun) {
    nextSuggestions.push("Run the same command without --dry-run to execute the underlying sample runner.");
  } else if (params.execution && params.execution.exitCode !== 0) {
    status = "failed";
    reasonCode = buildFailureReason(params.execution.stderr, params.execution.exitCode);
    nextSuggestions.push("Check command.stderr.log and command.stdout.log under the artifacts directory for the runner failure details.");
    if (reasonCode === REASON_CODES.configurationError) {
      nextSuggestions.push("The current app install failed. Remove the installed app or provide a newer build artifact before retrying.");
    }
  } else if (totalRuns === 0) {
    status = "partial";
    reasonCode = REASON_CODES.adapterError;
    nextSuggestions.push("The runner completed without producing run-* results. Verify the selected script still writes artifacts in the expected layout.");
  } else if (failedRuns > 0) {
    status = "failed";
    reasonCode = REASON_CODES.flowFailed;
    nextSuggestions.push("Inspect per-run result.txt and maestro.out artifacts to determine why the sample flow failed.");
  }

  if (params.configuredFlows.length > 1) {
    nextSuggestions.push("This runner profile executes a bundled validation set defined in configs/harness/sample-harness.yaml.");
  }

  return {
    status,
    reasonCode,
    sessionId: params.sessionId,
    durationMs: params.durationMs,
    attempts: params.attempts,
    artifacts,
    data: {
      dryRun: params.dryRun,
      harnessConfigPath: params.harnessConfigPath,
      runnerProfile: params.runnerProfile,
      runnerScript: params.runnerScript,
      flowPath: params.flowPath,
      requestedFlowPath: params.requestedFlowPath,
      configuredFlows: params.configuredFlows,
      artifactsDir: params.artifactsDir.relativePath,
      totalRuns,
      passedRuns,
      failedRuns,
      command: params.command,
      exitCode: params.execution?.exitCode ?? 0,
      summaryLine: readSummaryLine(params.execution?.stdout),
    },
    nextSuggestions,
  };
}

export async function runFlowWithMaestro(input: RunFlowInput): Promise<ToolResult<BasicRunData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const harnessConfigPath = input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, harnessConfigPath);
  const requestedFlowPath = input.flowPath;
  const unsupportedCustomFlow = Boolean(
    !input.runnerScript && requestedFlowPath && (selection.configuredFlows.length > 1 || !selection.configuredFlows.includes(requestedFlowPath)),
  );
  const effectiveFlowPath = requestedFlowPath ?? selection.configuredFlows[0];
  const runnerScript = input.runnerScript ?? selection.runnerScript;
  const artifactsDir = buildArtifactsDir(
    repoRoot,
    input.sessionId,
    input.platform,
    runnerProfile,
    input.artifactRoot ?? selection.artifactRoot,
  );
  const absoluteRunnerScript = path.resolve(repoRoot, runnerScript);
  const runCount = input.runCount ?? selection.runCountDefault;
  const command = ["bash", toRelativePath(repoRoot, absoluteRunnerScript), String(runCount)];

  await mkdir(artifactsDir.absolutePath, { recursive: true });

  if (unsupportedCustomFlow || input.dryRun) {
    return collectBasicRunResult({
      repoRoot,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifactsDir,
      harnessConfigPath,
      runnerProfile,
      runnerScript,
      flowPath: effectiveFlowPath,
      requestedFlowPath,
      configuredFlows: selection.configuredFlows,
      command,
      dryRun: Boolean(input.dryRun),
      unsupportedCustomFlow,
    });
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(input.env ?? {}),
    OUT_DIR: artifactsDir.absolutePath,
    APP_ID: input.appId ?? selection.appId,
    FLOW: path.resolve(repoRoot, effectiveFlowPath),
  };

  if (input.platform === "android") {
    env.DEVICE_ID = input.deviceId ?? selection.deviceId ?? "emulator-5554";
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  } else {
    env.SIM_UDID = input.deviceId ?? selection.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  }

  const execution = await executeRunner(["bash", absoluteRunnerScript, String(runCount)], repoRoot, env);

  await writeFile(path.join(artifactsDir.absolutePath, "command.stdout.log"), execution.stdout, "utf8");
  await writeFile(path.join(artifactsDir.absolutePath, "command.stderr.log"), execution.stderr, "utf8");

  return collectBasicRunResult({
    repoRoot,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifactsDir,
    harnessConfigPath,
    runnerProfile,
    runnerScript,
    flowPath: effectiveFlowPath,
    requestedFlowPath,
    configuredFlows: selection.configuredFlows,
    command,
    dryRun: false,
    execution,
  });
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

function summarizeDeviceCheck(name: string, count: number): DoctorCheck {
  if (count > 0) {
    return {
      name,
      status: "pass",
      detail: `${String(count)} available device(s) detected.`,
    };
  }

  return {
    name,
    status: "warn",
    detail: "No available devices detected.",
  };
}

async function checkCommandVersion(repoRoot: string, command: string, args: string[], label: string): Promise<DoctorCheck> {
  try {
    const result = await executeRunner([command, ...args], repoRoot, process.env);
    return result.exitCode === 0
      ? summarizeInfoCheck(label, "pass", result.stdout.trim() || `${label} is available.`)
      : summarizeInfoCheck(label, "fail", result.stderr.trim() || `${label} returned exit code ${String(result.exitCode)}.`);
  } catch (error) {
    return summarizeInfoCheck(label, "fail", error instanceof Error ? error.message : String(error));
  }
}

async function checkTcpReachability(label: string, host: string, port: number): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeoutMs = 1500;

    const finish = (status: DoctorCheck["status"], detail: string) => {
      socket.destroy();
      resolve(summarizeInfoCheck(label, status, detail));
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("pass", `${host}:${String(port)} is reachable.`));
    socket.once("timeout", () => finish("warn", `${host}:${String(port)} did not respond within ${String(timeoutMs)}ms.`));
    socket.once("error", (error) => finish("warn", error.message));
  });
}

async function checkAdbReverseMappings(label: string, deviceId: string, mappings: string[], repoRoot: string): Promise<DoctorCheck> {
  if (mappings.length === 0) {
    return summarizeInfoCheck(label, "pass", "No adb reverse mappings configured.");
  }

  try {
    const result = await executeRunner(["adb", "-s", deviceId, "reverse", "--list"], repoRoot, process.env);
    if (result.exitCode !== 0) {
      return summarizeInfoCheck(label, "warn", "adb reverse mappings could not be inspected.");
    }

    const lines = result.stdout
      .replaceAll(String.fromCharCode(13), "")
      .split(String.fromCharCode(10))
      .filter(Boolean);

    const missing = mappings.filter((mapping) => {
      const parts = mapping.split(/\s+/).filter(Boolean);
      return !lines.some((line) => parts.every((part) => line.includes(part)));
    });

    return missing.length === 0
      ? summarizeInfoCheck(label, "pass", `Configured adb reverse mappings are active for ${deviceId}.`)
      : summarizeInfoCheck(label, "warn", `Missing adb reverse mapping(s) for ${deviceId}: ${missing.join(", ")}`);
  } catch {
    return summarizeInfoCheck(label, "warn", "adb reverse mappings could not be inspected.");
  }
}

function summarizeFileCheck(name: string, filePath: string): DoctorCheck {
  const exists = existsSync(filePath);
  return {
    name,
    status: exists ? "pass" : "fail",
    detail: exists ? `${filePath} exists.` : `${filePath} is missing.`,
  };
}

function summarizeOptionalArtifactCheck(name: string, artifactPath: string, kind: "file" | "directory"): DoctorCheck {
  const exists = kind === "directory" ? existsSync(artifactPath) : existsSync(artifactPath);
  return {
    name,
    status: exists ? "pass" : "warn",
    detail: exists
      ? `${artifactPath} is available for installation.`
      : `${artifactPath} is not present. The runner can still proceed if the app is already installed or an override env is provided.`,
  };
}

function collectArtifactChecks(repoRoot: string): DoctorCheck[] {
  return (["native_android", "native_ios", "flutter_android"] as RunnerProfile[]).map((profile) => {
    const spec = getInstallArtifactSpec(profile);
    const artifactPath = resolveInstallArtifactPath(repoRoot, profile);
    return summarizeOptionalArtifactCheck(
      `${profile} artifact`,
      artifactPath ?? `No artifact path configured for ${profile}`,
      spec?.kind ?? "file",
    );
  });
}

async function collectRuntimeStateChecks(repoRoot: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const androidState = await executeRunner(["adb", "-s", process.env.DEVICE_ID ?? "emulator-5554", "get-state"], repoRoot, process.env);
    checks.push(
      summarizeInfoCheck(
        "android target state",
        androidState.exitCode === 0 && androidState.stdout.trim() === "device" ? "pass" : "warn",
        androidState.exitCode === 0 ? `Android target state: ${androidState.stdout.trim() || "unknown"}` : "Android target state could not be confirmed.",
      ),
    );
  } catch {
    checks.push(summarizeInfoCheck("android target state", "warn", "Android target state could not be confirmed."));
  }

  try {
    const iosBoot = await executeRunner(["xcrun", "simctl", "bootstatus", process.env.SIM_UDID ?? "ADA078B9-3C6B-4875-8B85-A7789F368816", "-b"], repoRoot, process.env);
    checks.push(
      summarizeInfoCheck(
        "ios target boot status",
        iosBoot.exitCode === 0 ? "pass" : "warn",
        iosBoot.exitCode === 0 ? "Selected iOS simulator is booted." : "Selected iOS simulator is not booted.",
      ),
    );
  } catch {
    checks.push(summarizeInfoCheck("ios target boot status", "warn", "Selected iOS simulator is not booted."));
  }

  return checks;
}

async function collectPerformanceEnvironmentChecks(repoRoot: string, androidDevices: DeviceInfo[]): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const resolvedTraceProcessorPath = resolveTraceProcessorPath();
    if (!resolvedTraceProcessorPath) {
      checks.push(summarizeInfoCheck("trace_processor path", "fail", "trace_processor was not found on PATH and no known fallback location was detected."));
    } else {
      checks.push(summarizeInfoCheck("trace_processor path", "pass", `Using trace_processor at ${resolvedTraceProcessorPath}.`));
    }
  } catch (error) {
    checks.push(summarizeInfoCheck("trace_processor path", "fail", error instanceof Error ? error.message : String(error)));
  }

  const selectedAndroidDeviceId = process.env.DEVICE_ID ?? androidDevices.find((device) => device.available)?.id;
  if (!selectedAndroidDeviceId) {
    checks.push(summarizeInfoCheck("android perfetto", "warn", "No available Android device is selected, so Perfetto device checks were skipped."));
    return checks;
  }

  const perfettoAvailability = await runCommandSafely(["adb", "-s", selectedAndroidDeviceId, "shell", "sh", "-lc", "command -v perfetto || which perfetto || echo missing"], repoRoot);
  const perfettoPath = perfettoAvailability.stdout.trim();
  const perfettoVersion = await runCommandSafely(["adb", "-s", selectedAndroidDeviceId, "shell", "perfetto", "--version"], repoRoot);
  const perfettoAvailable = isPerfettoShellProbeAvailable(perfettoAvailability) || isPerfettoVersionProbeAvailable(perfettoVersion);
  checks.push(summarizeInfoCheck(
    "android perfetto",
    perfettoAvailable ? "pass" : "warn",
    isPerfettoShellProbeAvailable(perfettoAvailability)
      ? `Android device ${selectedAndroidDeviceId} exposes perfetto at ${perfettoPath}.`
      : isPerfettoVersionProbeAvailable(perfettoVersion)
        ? `Android device ${selectedAndroidDeviceId} runs perfetto successfully, but shell path probing did not return a stable executable path.`
        : `Android device ${selectedAndroidDeviceId} did not expose perfetto through path probing or version execution.`,
  ));

  const sdkLevel = await resolveAndroidSdkLevel(repoRoot, selectedAndroidDeviceId);
  const strategy = resolveAndroidPerformancePlanStrategy(sdkLevel);
  const strategyDetail = sdkLevel === undefined
    ? `Android SDK level could not be detected; defaulting performance capture strategy to config via ${strategy.configTransport} and trace pull via ${strategy.tracePullMode}.`
    : `Android SDK ${String(sdkLevel)} uses config via ${strategy.configTransport} and trace pull via ${strategy.tracePullMode}.`;
  checks.push(summarizeInfoCheck("android perfetto strategy", sdkLevel === undefined ? "warn" : "pass", strategyDetail));

  if (strategy.configTransport === "remote_file") {
    const configProbe = await runCommandSafely([
      "adb", "-s", selectedAndroidDeviceId, "shell", "sh", "-lc",
      `touch ${shellEscape("/data/misc/perfetto-configs/.mcp_perfetto_probe")} && rm ${shellEscape("/data/misc/perfetto-configs/.mcp_perfetto_probe")} && printf ready`,
    ], repoRoot);
    checks.push(summarizeInfoCheck(
      "android perfetto config readiness",
      configProbe.exitCode === 0 && configProbe.stdout.includes("ready") ? "pass" : "warn",
      configProbe.exitCode === 0 && configProbe.stdout.includes("ready")
        ? "Selected Android device can write to the Perfetto config directory."
        : "Selected Android device could not verify write access to the Perfetto config directory.",
    ));
  } else {
    const stdinProbe = await runCommandSafely(["sh", "-lc", "printf ready"], repoRoot);
    checks.push(summarizeInfoCheck(
      "android perfetto config readiness",
      "warn",
      stdinProbe.exitCode === 0 && stdinProbe.stdout.includes("ready")
        ? "Host shell can compose stdin-based Perfetto commands, but adb/device-side stdin acceptance is not pre-validated by doctor."
        : "Host shell could not verify even the local precondition for stdin-based Perfetto command composition.",
    ));
  }

  if (strategy.tracePullMode === "adb_pull") {
    const traceProbe = await runCommandSafely([
      "adb", "-s", selectedAndroidDeviceId, "shell", "sh", "-lc",
      `touch ${shellEscape("/data/misc/perfetto-traces/.mcp_perfetto_probe")} && rm ${shellEscape("/data/misc/perfetto-traces/.mcp_perfetto_probe")} && printf ready`,
    ], repoRoot);
    checks.push(summarizeInfoCheck(
      "android perfetto trace transfer",
      traceProbe.exitCode === 0 && traceProbe.stdout.includes("ready") ? "pass" : "warn",
      traceProbe.exitCode === 0 && traceProbe.stdout.includes("ready")
        ? "Selected Android device can stage trace files in the expected Perfetto trace directory."
        : "Selected Android device could not verify trace staging in the expected Perfetto trace directory.",
    ));
  } else {
    const execOutProbe = await runCommandSafely(["adb", "-s", selectedAndroidDeviceId, "exec-out", "sh", "-lc", "printf ready"], repoRoot);
    checks.push(summarizeInfoCheck(
      "android perfetto trace transfer",
      execOutProbe.exitCode === 0 && execOutProbe.stdout.includes("ready") ? "pass" : "warn",
      execOutProbe.exitCode === 0 && execOutProbe.stdout.includes("ready")
        ? "Selected Android device supports exec-out style trace extraction."
        : "Selected Android device could not verify exec-out style trace extraction.",
    ));
  }

  return checks;
}

async function collectIosPerformanceEnvironmentChecks(repoRoot: string, iosDevices: DeviceInfo[]): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const selectedIosDeviceId = process.env.SIM_UDID ?? iosDevices.find((device) => device.available)?.id;
  if (!selectedIosDeviceId) {
    checks.push(summarizeInfoCheck("ios performance templates", "warn", "No available iOS simulator is selected, so template-specific performance guidance was skipped."));
    return checks;
  }

  checks.push(summarizeInfoCheck(
    "ios performance templates",
    "pass",
    "Time Profiler is real-validated on simulator. Allocations can be real-validated when the target app is attached by pid. Animation Hitches remains platform-limited on the current simulator/runtime and should be treated as device-preferred.",
  ));

  checks.push(summarizeInfoCheck(
    "ios performance recommendation",
    "pass",
    "Prefer Time Profiler by default on simulator. Prefer Allocations only when you can attach to a running app by pid. Avoid Animation Hitches on simulator unless you are only checking functional wiring; use a physical device for trustworthy hitch analysis.",
  ));

  const appId = process.env.IOS_APP_ID;
  if (!appId) {
    checks.push(summarizeInfoCheck(
      "ios memory attach readiness",
      "warn",
      "Allocations is most reliable when the target app can be attached by pid. Set IOS_APP_ID (or pass appId at runtime) if you want doctor to preflight that path.",
    ));
    return checks;
  }

  const processId = await resolveIosSimulatorProcessId(repoRoot, selectedIosDeviceId, appId);
  checks.push(summarizeInfoCheck(
    "ios memory attach readiness",
    processId ? "pass" : "warn",
    processId
      ? `Allocations can attach to ${appId} on simulator ${selectedIosDeviceId} using pid ${processId}.`
      : `Allocations could not resolve a running pid for ${appId} on simulator ${selectedIosDeviceId}; the tool will need to launch the app or may fall back to unsupported all-process capture.`,
  ));

  return checks;
}

async function collectInstallStateChecks(repoRoot: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const androidPackage = await executeRunner(["adb", "-s", process.env.DEVICE_ID ?? "emulator-5554", "shell", "pm", "path", "com.epam.mobitru"], repoRoot, process.env);
    checks.push({
      name: "native_android install state",
      status: androidPackage.exitCode === 0 && androidPackage.stdout.includes("package:") ? "pass" : "warn",
      detail:
        androidPackage.exitCode === 0 && androidPackage.stdout.includes("package:")
          ? "com.epam.mobitru is installed on the selected Android device."
          : "com.epam.mobitru is not confirmed as installed on the selected Android device.",
    });
  } catch {
    checks.push({
      name: "native_android install state",
      status: "warn",
      detail: "Android install state could not be verified.",
    });
  }

  try {
    const flutterPackage = await executeRunner(["adb", "-s", process.env.DEVICE_ID ?? "emulator-5554", "shell", "pm", "path", "com.epam.mobitru"], repoRoot, process.env);
    checks.push({
      name: "flutter_android install state",
      status: flutterPackage.exitCode === 0 && flutterPackage.stdout.includes("package:") ? "pass" : "warn",
      detail:
        flutterPackage.exitCode === 0 && flutterPackage.stdout.includes("package:")
          ? "Flutter Android app id is installed on the selected Android device."
          : "Flutter Android app id is not confirmed as installed on the selected Android device.",
    });
  } catch {
    checks.push({
      name: "flutter_android install state",
      status: "warn",
      detail: "Flutter Android install state could not be verified.",
    });
  }

  try {
    const iosPackage = await executeRunner(
      ["xcrun", "simctl", "get_app_container", process.env.SIM_UDID ?? "ADA078B9-3C6B-4875-8B85-A7789F368816", "com.epam.mobitru.demoapp"],
      repoRoot,
      process.env,
    );
    checks.push({
      name: "native_ios install state",
      status: iosPackage.exitCode === 0 ? "pass" : "warn",
      detail:
        iosPackage.exitCode === 0
          ? "com.epam.mobitru.demoapp is installed on the selected iOS simulator."
          : "com.epam.mobitru.demoapp is not confirmed as installed on the selected iOS simulator.",
    });
  } catch {
    checks.push({
      name: "native_ios install state",
      status: "warn",
      detail: "iOS install state could not be verified.",
    });
  }

  try {
    const artifactRoot = path.resolve(repoRoot, "artifacts");
    if (existsSync(artifactRoot)) {
      const artifactFiles = await listArtifacts(artifactRoot, repoRoot);
      const errorLogs = artifactFiles.filter((filePath) => filePath.endsWith("command.stderr.log"));
      let detectedConflict = false;

      for (const relativePath of errorLogs) {
        const absolutePath = path.resolve(repoRoot, relativePath);
        const content = (await readFile(absolutePath, "utf8")).toLowerCase();
        if (content.includes("install_failed_version_downgrade")) {
          checks.push({
            name: "android install conflict signal",
            status: "warn",
            detail: `Detected INSTALL_FAILED_VERSION_DOWNGRADE in ${relativePath}. Installed app may be newer than the artifact being deployed.`,
          });
          detectedConflict = true;
          break;
        }
        if (
          content.includes("install_failed_update_incompatible") ||
          content.includes("signatures do not match") ||
          content.includes("signature") && content.includes("incompatible") ||
          content.includes("certificate") && content.includes("mismatch")
        ) {
          checks.push({
            name: "android install conflict signal",
            status: "warn",
            detail: `Detected a signature or certificate install conflict in ${relativePath}. You may need to manually uninstall the existing app before installing a differently signed build.`,
          });
          detectedConflict = true;
          break;
        }
      }

      if (!detectedConflict) {
        checks.push({
          name: "android install conflict signal",
          status: "pass",
          detail: "No recent Android install conflict signal was detected in recorded stderr logs.",
        });
      }
    }
  } catch {
    checks.push({
      name: "android install conflict signal",
      status: "warn",
      detail: "Recent Android install conflict logs could not be inspected.",
    });
  }

  return checks;
}

export async function typeTextWithMaestro(input: TypeTextInput): Promise<ToolResult<TypeTextData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");

  const command = input.platform === "ios"
    ? buildIdbCommand(["ui", "text", input.text, "--udid", deviceId])
    : ["adb", "-s", deviceId, "shell", "input", "text", input.text.replaceAll(" ", "%s")];
  if (input.dryRun) {
    return {
      status: input.platform === "ios" ? "success" : "partial",
      reasonCode: input.platform === "ios" ? REASON_CODES.ok : REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, text: input.text, command, exitCode: 0 },
      nextSuggestions: [input.platform === "ios" ? "Run type_text without dryRun to perform iOS simulator text entry through idb." : "Run type_text without dryRun to perform Android text entry."],
    };
  }

  if (input.platform === "ios") {
    const idbProbe = await probeIdbAvailability(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, text: input.text, command, exitCode: idbProbe?.exitCode ?? null },
        nextSuggestions: ["iOS type_text requires idb. Install fb-idb and idb_companion, or set IDB_CLI_PATH/IDB_COMPANION_PATH before retrying."],
      };
    }
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, text: input.text, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : [input.platform === "ios" ? "Check the selected simulator, focused element, and idb companion availability before retrying type_text." : "Check Android device state and focused input field before retrying type_text."],
  };
}

export async function resolveUiTargetWithMaestro(input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });

  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
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
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, input.platform === "android" ? "full" : "partial"),
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling resolve_ui_target."],
    };
  }

  if (input.platform === "ios") {
    const deviceId = input.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    const idbCommand = buildIosUiDescribeCommand(deviceId);
    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["resolve_ui_target dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to resolve against the current simulator hierarchy."],
      };
    }

    const snapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          query,
          command: snapshot.command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    const result = { query, ...snapshot.queryResult };
    const resolution = buildUiTargetResolution(query, result, "full");
    return {
      status: resolution.status === "resolved" ? "success" : "partial",
      reasonCode: resolution.status === "resolved" ? REASON_CODES.ok : reasonCodeForResolutionStatus(resolution.status),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: snapshot.execution.exitCode === 0 ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        result,
        resolution,
        supportLevel: "full",
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions: resolution.status === "resolved"
        ? []
        : buildResolutionNextSuggestions(resolution.status, "resolve_ui_target"),
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["resolve_ui_target dry-run only previews the capture command. Run it without --dry-run to resolve against the live Android hierarchy."],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
  if (isAndroidUiSnapshotFailure(snapshot)) {
    return {
      status: "failed",
      reasonCode: snapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.outputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [snapshot.message],
    };
  }

  if (snapshot.readExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(snapshot.readExecution.stderr, snapshot.readExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.readExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["Could not read the Android UI hierarchy before resolving the target. Check device state and retry."],
    };
  }

  const result = { query, ...snapshot.queryResult };
  const resolution = buildUiTargetResolution(query, result, "full");
  return {
    status: resolution.status === "resolved" ? "success" : "partial",
    reasonCode: reasonCodeForResolutionStatus(resolution.status),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: snapshot.relativeOutputPath,
      query,
      command: snapshot.command,
      exitCode: snapshot.readExecution.exitCode,
      result,
      resolution,
      supportLevel: "full",
      content: snapshot.readExecution.stdout,
      summary: snapshot.summary,
    },
    nextSuggestions: resolution.status === "resolved"
      ? []
      : buildResolutionNextSuggestions(resolution.status, "resolve_ui_target"),
  };
}

export async function tapElementWithMaestro(input: TapElementInput): Promise<ToolResult<TapElementData>> {
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const resolveResult = await resolveUiTargetWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  const query = resolveResult.data.query;

  if (resolveResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        matchCount: resolveResult.data.resolution.matchCount,
        resolution: resolveResult.data.resolution,
        matchedNode: resolveResult.data.resolution.matchedNode,
        resolvedBounds: resolveResult.data.resolution.resolvedBounds,
        resolvedX: resolveResult.data.resolution.resolvedPoint?.x,
        resolvedY: resolveResult.data.resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  const resolution = resolveResult.data.resolution;
  if (input.dryRun && (resolution.status === "unsupported" || resolution.status === "not_executed")) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: ["tap_element dry-run does not resolve live UI selectors. Run resolve_ui_target or tap_element without --dry-run to resolve against the current hierarchy."],
    };
  }
  if (resolveResult.status !== "success" || !resolution.resolvedPoint || !resolution.resolvedBounds || !resolution.matchedNode) {
    return {
      status: "partial",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(resolution.status, "tap_element"),
    };
  }

  const tapResult = await tapWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });
  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + tapResult.attempts,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query,
      matchCount: resolution.matchCount,
      resolution,
      matchedNode: resolution.matchedNode,
      resolvedBounds: resolution.resolvedBounds,
      resolvedX: resolution.resolvedPoint.x,
      resolvedY: resolution.resolvedPoint.y,
      command: tapResult.data.command,
      exitCode: tapResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}

export async function typeIntoElementWithMaestro(input: TypeIntoElementInput): Promise<ToolResult<TypeIntoElementData>> {
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const resolveResult = await resolveUiTargetWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  const query = resolveResult.data.query;
  const resolution = resolveResult.data.resolution;

  if (resolveResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: resolveResult.data.command.length > 0 ? [resolveResult.data.command] : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  if (input.dryRun && (resolution.status === "unsupported" || resolution.status === "not_executed")) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: resolveResult.data.command.length > 0 ? [resolveResult.data.command] : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: ["type_into_element dry-run does not resolve live UI selectors. Run resolve_ui_target or type_into_element without --dry-run to resolve against the current hierarchy."],
    };
  }

  if (resolveResult.status !== "success" || !resolution.resolvedPoint) {
    return {
      status: "partial",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(resolution.status, "type_into_element"),
    };
  }

  const focusResult = await tapWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });
  const typeResult = await typeTextWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    text: input.value,
    dryRun: input.dryRun,
  });
  const commands = [focusResult.data.command, typeResult.data.command];

  if (focusResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: REASON_CODES.actionFocusFailed,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: resolveResult.attempts + focusResult.attempts,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands,
        exitCode: focusResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: focusResult.nextSuggestions,
    };
  }

  return {
    status: typeResult.status,
    reasonCode: typeResult.status === "success" ? REASON_CODES.ok : REASON_CODES.actionTypeFailed,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + focusResult.attempts + typeResult.attempts,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query,
      value: input.value,
      resolution,
      commands,
      exitCode: typeResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: typeResult.nextSuggestions,
  };
}

export async function scrollAndTapElementWithMaestro(input: ScrollAndTapElementInput): Promise<ToolResult<ScrollAndTapElementData>> {
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const stepResults: UiOrchestrationStepResult[] = [];
  const resolveResult = await scrollAndResolveUiTargetWithMaestro(input);

  stepResults.push({ step: "scroll_resolve", status: resolveResult.status, reasonCode: resolveResult.reasonCode, note: resolveResult.nextSuggestions[0] });
  if (resolveResult.status !== "success") {
    return {
      status: resolveResult.status,
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: resolveResult.attempts,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query: resolveResult.data.query,
        maxSwipes: resolveResult.data.maxSwipes,
        swipeDirection: resolveResult.data.swipeDirection,
        swipeDurationMs: resolveResult.data.swipeDurationMs,
        stepResults,
        resolveResult: resolveResult.data,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  const tapResult = await tapElementWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  stepResults.push({ step: "tap", status: tapResult.status, reasonCode: tapResult.reasonCode, note: tapResult.nextSuggestions[0] });
  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + tapResult.attempts,
    artifacts: [...resolveResult.artifacts, ...tapResult.artifacts],
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query: resolveResult.data.query,
      maxSwipes: resolveResult.data.maxSwipes,
      swipeDirection: resolveResult.data.swipeDirection,
      swipeDurationMs: resolveResult.data.swipeDurationMs,
      stepResults,
      resolveResult: resolveResult.data,
      tapResult: tapResult.data,
      supportLevel: tapResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}

export async function waitForUiWithMaestro(input: WaitForUiInput): Promise<ToolResult<WaitForUiData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
  const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? Math.floor(input.timeoutMs) : DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs = typeof input.intervalMs === "number" && input.intervalMs > 0 ? Math.floor(input.intervalMs) : DEFAULT_WAIT_INTERVAL_MS;
  const waitUntil = normalizeWaitForUiMode(input.waitUntil);
  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
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
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling wait_for_ui."],
    };
  }

  if (input.platform === "ios") {
    const deviceId = input.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    const idbCommand = buildIosUiDescribeCommand(deviceId);
    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls: 0,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: ["wait_for_ui dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to poll the current simulator hierarchy."],
      };
    }

    let polls = 0;
    let lastSnapshot: IosUiSnapshot | IosUiSnapshotFailure | undefined;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      polls += 1;
      lastSnapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
      if (!isIosUiSnapshotFailure(lastSnapshot) && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)) {
        return {
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.execution.exitCode,
            result: { query, ...lastSnapshot.queryResult },
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: [],
        };
      }
      if (Date.now() < deadline) {
        await delay(intervalMs);
      }
    }

    if (lastSnapshot && isIosUiSnapshotFailure(lastSnapshot)) {
      return {
        status: "failed",
        reasonCode: lastSnapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.outputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [lastSnapshot.message],
      };
    }

    const timeoutSnapshot = lastSnapshot && !isIosUiSnapshotFailure(lastSnapshot) ? lastSnapshot : undefined;
    const result = timeoutSnapshot ? { query, ...timeoutSnapshot.queryResult } : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
    return {
      status: "partial",
      reasonCode: reasonCodeForWaitTimeout(waitUntil),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: timeoutSnapshot ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: timeoutSnapshot?.command ?? idbCommand,
        exitCode: timeoutSnapshot?.execution.exitCode ?? null,
        result,
        supportLevel: "full",
        content: timeoutSnapshot?.execution.stdout,
        summary: timeoutSnapshot?.summary,
      },
      nextSuggestions: [`Timed out waiting for iOS UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`],
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["wait_for_ui dry-run only previews the capture command. Run it without --dry-run to poll the live Android hierarchy."],
    };
  }

  let polls = 0;
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;
  let consecutiveCaptureFailures = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    polls += 1;
    lastSnapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      consecutiveCaptureFailures += 1;
      if (shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: consecutiveCaptureFailures, maxConsecutiveFailures: DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES })) {
        return {
          status: "failed",
          reasonCode: lastSnapshot.reasonCode,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.outputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [`Android UI hierarchy capture failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`],
        };
      }
    } else if (lastSnapshot.readExecution.exitCode !== 0) {
      consecutiveCaptureFailures += 1;
      if (shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: consecutiveCaptureFailures, maxConsecutiveFailures: DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES })) {
        return {
          status: "failed",
          reasonCode: buildFailureReason(lastSnapshot.readExecution.stderr, lastSnapshot.readExecution.exitCode),
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.readExecution.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [`Android UI hierarchy reads failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`],
        };
      }
    } else {
      consecutiveCaptureFailures = 0;
    }
    if (!isAndroidUiSnapshotFailure(lastSnapshot) && lastSnapshot.readExecution.exitCode === 0 && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, ...lastSnapshot.queryResult },
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: [],
      };
    }
    if (Date.now() < deadline) {
      await delay(intervalMs);
    }
  }

  if (lastSnapshot && isAndroidUiSnapshotFailure(lastSnapshot)) {
    return {
      status: "failed",
      reasonCode: lastSnapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: lastSnapshot.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: lastSnapshot.command,
        exitCode: lastSnapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: [lastSnapshot.message],
    };
  }

  const timeoutSnapshot = !lastSnapshot || isAndroidUiSnapshotFailure(lastSnapshot)
    ? undefined
    : lastSnapshot;
  const result = timeoutSnapshot ? { query, ...timeoutSnapshot.queryResult } : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
  return {
    status: "partial",
    reasonCode: reasonCodeForWaitTimeout(waitUntil),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: polls,
    artifacts: timeoutSnapshot ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
      query,
      timeoutMs,
      intervalMs,
      waitUntil,
      polls,
      command: timeoutSnapshot?.command ?? command,
      exitCode: timeoutSnapshot?.readExecution.exitCode ?? null,
      result,
      supportLevel: "full",
      content: timeoutSnapshot?.readExecution.stdout,
      summary: timeoutSnapshot?.summary,
    },
    nextSuggestions: [`Timed out waiting for Android UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`],
  };
}

export async function scrollAndResolveUiTargetWithMaestro(input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
  const maxSwipes = typeof input.maxSwipes === "number" && input.maxSwipes >= 0 ? Math.floor(input.maxSwipes) : DEFAULT_SCROLL_MAX_SWIPES;
  const swipeDurationMs = typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0 ? Math.floor(input.swipeDurationMs) : DEFAULT_SCROLL_DURATION_MS;
  const swipeDirection = normalizeScrollDirection(input.swipeDirection);
  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
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
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, input.platform === "android" ? "full" : "partial"),
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling scroll_and_resolve_ui_target."],
    };
  }

  if (input.platform === "ios") {
    const deviceId = input.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    const previewSwipe = buildScrollSwipeCoordinates([], swipeDirection, swipeDurationMs);
    const previewSwipeCommand = buildIosSwipeCommand(deviceId, previewSwipe);

    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed: 0,
          commandHistory: [buildIosUiDescribeCommand(deviceId), previewSwipeCommand],
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["scroll_and_resolve_ui_target dry-run only previews iOS hierarchy capture and swipe commands. Run it without --dry-run to resolve against the current simulator hierarchy."],
      };
    }

    let swipesPerformed = 0;
    const commandHistory: string[][] = [];
    let lastSnapshot: IosUiSnapshot | IosUiSnapshotFailure | undefined;

    while (swipesPerformed <= maxSwipes) {
      lastSnapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
      if (isIosUiSnapshotFailure(lastSnapshot)) {
        return {
          status: "failed",
          reasonCode: lastSnapshot.reasonCode,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.outputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory: [...commandHistory, lastSnapshot.command],
            exitCode: lastSnapshot.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            resolution: buildNonExecutedUiTargetResolution(query, "full"),
            supportLevel: "full",
          },
          nextSuggestions: [lastSnapshot.message],
        };
      }

      commandHistory.push(lastSnapshot.command);
      const result = { query, ...lastSnapshot.queryResult };
      const resolution = buildUiTargetResolution(query, result, "full");
      if (!shouldContinueScrollResolution(resolution.status)) {
        return {
          status: resolution.status === "resolved" ? "success" : "partial",
          reasonCode: reasonCodeForResolutionStatus(resolution.status),
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory,
            exitCode: lastSnapshot.execution.exitCode,
            result,
            resolution,
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: resolution.status === "resolved" ? [] : buildResolutionNextSuggestions(resolution.status, "scroll_and_resolve_ui_target", resolution),
        };
      }

      if (swipesPerformed === maxSwipes) {
        return {
          status: "partial",
          reasonCode: REASON_CODES.noMatch,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory,
            exitCode: lastSnapshot.execution.exitCode,
            result,
            resolution,
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: resolution.status === "off_screen"
            ? ["Reached maxSwipes while the best iOS match stayed off-screen. Keep scrolling, change swipe direction, or refine the selector toward visible content."]
            : ["Reached maxSwipes without finding a matching iOS target. Narrow the selector or increase maxSwipes."],
        };
      }

      const swipe = buildScrollSwipeCoordinates(lastSnapshot.nodes, swipeDirection, swipeDurationMs);
      const swipeCommand = buildIosSwipeCommand(deviceId, swipe);
      commandHistory.push(swipeCommand);
      const swipeExecution = await executeRunner(swipeCommand, repoRoot, process.env);
      if (swipeExecution.exitCode !== 0) {
        return {
          status: "failed",
          reasonCode: REASON_CODES.actionScrollFailed,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory,
            exitCode: swipeExecution.exitCode,
            result,
            resolution,
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: ["iOS swipe failed while searching for the target. Check simulator state and idb availability before retrying scroll_and_resolve_ui_target."],
        };
      }

      swipesPerformed += 1;
    }
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const previewSwipe = buildScrollSwipeCoordinates([], swipeDirection, swipeDurationMs);
  const previewSwipeCommand = ["adb", "-s", deviceId, "shell", "input", "swipe", String(previewSwipe.start.x), String(previewSwipe.start.y), String(previewSwipe.end.x), String(previewSwipe.end.y), String(previewSwipe.durationMs)];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [[...dumpCommand, ...readCommand], previewSwipeCommand],
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["scroll_and_resolve_ui_target dry-run only previews capture and swipe commands. Run it without --dry-run to resolve against the live Android hierarchy."],
    };
  }

  let swipesPerformed = 0;
  const commandHistory: string[][] = [];
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;

  while (swipesPerformed <= maxSwipes) {
    lastSnapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      return {
        status: "failed",
        reasonCode: lastSnapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.outputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory: [...commandHistory, lastSnapshot.command],
          exitCode: lastSnapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [lastSnapshot.message],
      };
    }

    commandHistory.push(lastSnapshot.command);
    if (lastSnapshot.readExecution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(lastSnapshot.readExecution.stderr, lastSnapshot.readExecution.exitCode),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["Could not read the Android UI hierarchy while scrolling for target resolution. Check device state and retry."],
      };
    }

    const result = { query, ...lastSnapshot.queryResult };
    const resolution = buildUiTargetResolution(query, result, "full");
    if (!shouldContinueScrollResolution(resolution.status)) {
      return {
        status: resolution.status === "resolved" ? "success" : "partial",
        reasonCode: reasonCodeForResolutionStatus(resolution.status),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: resolution.status === "resolved" ? [] : buildResolutionNextSuggestions(resolution.status, "scroll_and_resolve_ui_target", resolution),
      };
    }

    if (swipesPerformed === maxSwipes) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.noMatch,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: resolution.status === "off_screen"
          ? ["Reached maxSwipes while the best Android match stayed off-screen. Keep scrolling, change swipe direction, or refine the selector toward visible content."]
          : ["Reached maxSwipes without finding a matching Android target. Narrow the selector or increase maxSwipes."],
      };
    }

    const swipe = buildScrollSwipeCoordinates(lastSnapshot.nodes, swipeDirection, swipeDurationMs);
    const swipeCommand = ["adb", "-s", deviceId, "shell", "input", "swipe", String(swipe.start.x), String(swipe.start.y), String(swipe.end.x), String(swipe.end.y), String(swipe.durationMs)];
    commandHistory.push(swipeCommand);
    const swipeExecution = await executeRunner(swipeCommand, repoRoot, process.env);
    if (swipeExecution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.actionScrollFailed,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: swipeExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: ["Android swipe failed while searching for the target. Check device state and retry scroll_and_resolve_ui_target."],
      };
    }

    swipesPerformed += 1;
  }

  return {
    status: "partial",
    reasonCode: REASON_CODES.noMatch,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: swipesPerformed + 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: defaultOutputPath,
      query,
      maxSwipes,
      swipeDirection,
      swipeDurationMs,
      swipesPerformed,
      commandHistory,
      exitCode: null,
      result: { query, totalMatches: 0, matches: [] },
      resolution: buildUiTargetResolution(query, { query, totalMatches: 0, matches: [] }, "full"),
      supportLevel: "full",
    },
    nextSuggestions: ["Reached the end of scroll_and_resolve_ui_target without a resolvable Android match."],
  };
}

export async function tapWithMaestro(input: TapInput): Promise<ToolResult<TapData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");

  const command = input.platform === "ios"
    ? buildIdbCommand(["ui", "tap", String(input.x), String(input.y), "--udid", deviceId])
    : ["adb", "-s", deviceId, "shell", "input", "tap", String(input.x), String(input.y)];
  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, x: input.x, y: input.y, command, exitCode: 0 },
      nextSuggestions: [input.platform === "ios" ? "Run tap without dryRun to perform the actual iOS simulator coordinate tap through idb." : "Run tap without dryRun to perform the actual Android coordinate tap."],
    };
  }

  if (input.platform === "ios") {
    const idbProbe = await probeIdbAvailability(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, x: input.x, y: input.y, command, exitCode: idbProbe?.exitCode ?? null },
        nextSuggestions: ["iOS tap requires idb. Install fb-idb and idb_companion, or set IDB_CLI_PATH/IDB_COMPANION_PATH before retrying."],
      };
    }
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, x: input.x, y: input.y, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : [input.platform === "ios" ? "Check the selected simulator coordinates and idb companion availability before retrying tap." : "Check Android device state and coordinates before retrying tap."],
  };
}

export async function inspectUiWithMaestro(input: InspectUiInput): Promise<ToolResult<InspectUiData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  if (input.platform === "ios") {
    const iosRelativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.json`);
    const iosAbsoluteOutputPath = path.resolve(repoRoot, iosRelativeOutputPath);
    const idbCommand = buildIosUiDescribeCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: true, runnerProfile, outputPath: iosRelativeOutputPath, command: idbCommand, exitCode: 0, supportLevel: "partial", evidence: [buildExecutionEvidence("ui_dump", iosRelativeOutputPath, "partial", "Planned iOS UI hierarchy artifact path.")], platformSupportNote: "iOS inspect_ui captures hierarchy through idb; query and action parity remain partial." },
        nextSuggestions: ["Run inspect_ui without dryRun to capture an actual iOS hierarchy dump through idb."],
      };
    }

    const idbProbe = await probeIdbAvailability(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, outputPath: iosRelativeOutputPath, command: idbCommand, exitCode: idbProbe?.exitCode ?? null, supportLevel: "partial", platformSupportNote: "iOS inspect_ui depends on idb availability in the local environment." },
        nextSuggestions: ["iOS inspect_ui in this repo requires idb. Install idb-companion and fb-idb, then retry inspect_ui."],
      };
    }

    await mkdir(path.dirname(iosAbsoluteOutputPath), { recursive: true });
    const idbExecution = await executeRunner(idbCommand, repoRoot, process.env);
    if (idbExecution.exitCode === 0) {
      await writeFile(iosAbsoluteOutputPath, idbExecution.stdout, "utf8");
    }

    return {
      status: idbExecution.exitCode === 0 ? "success" : "partial",
      reasonCode: idbExecution.exitCode === 0 ? REASON_CODES.ok : REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: idbExecution.exitCode === 0 ? [toRelativePath(repoRoot, iosAbsoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: iosRelativeOutputPath,
        command: idbCommand,
        exitCode: idbExecution.exitCode,
        supportLevel: "partial",
        evidence: idbExecution.exitCode === 0 ? [buildExecutionEvidence("ui_dump", iosRelativeOutputPath, "partial", "Captured iOS UI hierarchy artifact.")] : undefined,
        platformSupportNote: "iOS inspect_ui can capture hierarchy artifacts, but downstream query/action tooling is still partial compared with Android.",
        content: idbExecution.exitCode === 0 ? idbExecution.stdout : undefined,
        summary: idbExecution.exitCode === 0 ? parseIosInspectSummary(idbExecution.stdout) : undefined,
      },
      nextSuggestions: idbExecution.exitCode === 0 ? [] : ["Ensure idb companion is available for the selected simulator and retry inspect_ui."],
    };
  }

  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
        artifacts: [],
        data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command: [...dumpCommand, ...readCommand], exitCode: 0, supportLevel: "full", evidence: [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Planned Android UI hierarchy artifact path.")] },
      nextSuggestions: ["Run inspect_ui without dryRun to capture an actual Android hierarchy dump."],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command: dumpCommand, exitCode: dumpExecution.exitCode, supportLevel: "full" },
      nextSuggestions: ["Check Android device state and ensure uiautomator dump is permitted before retrying inspect_ui."],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: readExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: readExecution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      command: readCommand,
      exitCode: readExecution.exitCode,
      supportLevel: "full",
      evidence: readExecution.exitCode === 0 ? [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Captured Android UI hierarchy artifact.")] : undefined,
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary: readExecution.exitCode === 0 ? parseInspectUiSummary(readExecution.stdout) : undefined,
    },
    nextSuggestions: readExecution.exitCode === 0 ? [] : ["Check Android device state before retrying inspect_ui."],
  };
}

export async function queryUiWithMaestro(input: QueryUiInput): Promise<ToolResult<QueryUiData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });

  if (!hasQueryUiSelector(query)) {
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
        outputPath: input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`),
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one query selector: resourceId, contentDesc, text, className, or clickable."],
    };
  }

  if (input.platform === "ios") {
    const iosRelativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.json`);
    const idbCommand = buildIosUiDescribeCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: iosRelativeOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: ["Run query_ui without dryRun to capture an iOS hierarchy artifact and evaluate structured selector matches."],
      };
    }

    const snapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          query,
          command: snapshot.command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    const result = { query, ...snapshot.queryResult };
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        result,
        supportLevel: "full",
        evidence: [buildExecutionEvidence("ui_dump", snapshot.relativeOutputPath, "full", "Captured iOS hierarchy artifact for selector matching.")],
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions: result.totalMatches === 0
        ? ["No iOS nodes matched the provided selectors. Broaden the query or inspect the captured hierarchy artifact."]
        : query.limit !== undefined && result.totalMatches > result.matches.length
          ? ["More iOS nodes matched than were returned. Increase query limit or narrow the selector."]
          : [],
    };
  }

  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

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
        outputPath: relativeOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
        evidence: [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Planned Android query_ui hierarchy artifact path.")],
      },
      nextSuggestions: ["Run query_ui without dryRun to capture an Android hierarchy dump and return matched nodes."],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        query,
        command,
        exitCode: dumpExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["Check Android device state and ensure uiautomator dump is permitted before retrying query_ui."],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  const nodes = readExecution.exitCode === 0 ? parseAndroidUiHierarchyNodes(readExecution.stdout) : [];
  const summary = readExecution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = readExecution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: readExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: readExecution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      query,
      command,
      exitCode: readExecution.exitCode,
      result: { query, ...queryResult },
      supportLevel: "full",
      evidence: readExecution.exitCode === 0 ? [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Captured Android query_ui hierarchy artifact.")] : undefined,
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary,
    },
    nextSuggestions: readExecution.exitCode !== 0
      ? ["Check Android device state before retrying query_ui."]
      : queryResult.totalMatches === 0
        ? ["No Android nodes matched the provided selectors. Broaden the query or run inspect_ui to review nearby nodes."]
        : query.limit !== undefined && queryResult.totalMatches > queryResult.matches.length
          ? ["More Android nodes matched than were returned. Increase query limit or narrow the selector."]
        : [],
  };
}

export async function terminateAppWithMaestro(input: TerminateAppInput): Promise<ToolResult<TerminateAppData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const appId = input.appId ?? selection.appId;
  const command = input.platform === "android"
    ? ["adb", "-s", deviceId, "shell", "am", "force-stop", appId]
    : ["xcrun", "simctl", "terminate", deviceId, appId];

  if (input.dryRun) {
    return { status: "success", reasonCode: REASON_CODES.ok, sessionId: input.sessionId, durationMs: Date.now() - startTime, attempts: 1, artifacts: [], data: { dryRun: true, runnerProfile, appId, command, exitCode: 0 }, nextSuggestions: ["Run terminate_app without dryRun to stop the target app."] };
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, appId, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check device state and appId before retrying terminate_app."],
  };
}

export async function takeScreenshotWithMaestro(input: ScreenshotInput): Promise<ToolResult<ScreenshotData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "screenshots", input.sessionId, `${input.platform}-${runnerProfile}.png`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const command = input.platform === "android"
    ? ["adb", "-s", deviceId, "exec-out", "screencap", "-p"]
    : ["xcrun", "simctl", "io", deviceId, "screenshot", absoluteOutputPath];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command, exitCode: 0, evidence: [buildExecutionEvidence("screenshot", relativeOutputPath, input.platform === "android" ? "full" : "partial", "Planned screenshot artifact path.")] },
      nextSuggestions: ["Run take_screenshot without dryRun to capture an actual screenshot."],
    };
  }

  if (input.platform === "android") {
    const execution = await new Promise<CommandExecution>((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      const stdoutChunks: Buffer[] = [];
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", async (exitCode) => {
        await writeFile(absoluteOutputPath, Buffer.concat(stdoutChunks));
        resolve({ exitCode, stdout: absoluteOutputPath, stderr });
      });
    });
    return {
      status: execution.exitCode === 0 ? "success" : "failed",
      reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [toRelativePath(repoRoot, absoluteOutputPath)],
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command, exitCode: execution.exitCode, evidence: [buildExecutionEvidence("screenshot", relativeOutputPath, "full", "Captured Android screenshot artifact.")] },
      nextSuggestions: execution.exitCode === 0 ? [] : ["Check device state before retrying take_screenshot."],
    };
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: execution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command, exitCode: execution.exitCode, evidence: execution.exitCode === 0 ? [buildExecutionEvidence("screenshot", relativeOutputPath, "full", "Captured iOS screenshot artifact.")] : undefined },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check simulator boot state before retrying take_screenshot."],
  };
}

export async function getLogsWithMaestro(input: GetLogsInput): Promise<ToolResult<GetLogsData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const appId = input.appId ?? selection.appId;
  let capture = buildGetLogsCapture(repoRoot, input, runnerProfile, deviceId, appId, false);

  if (appId) {
    if (input.platform === "android" && !input.dryRun) {
      const pid = await resolveAndroidAppPid(repoRoot, deviceId, appId);
      if (pid) {
        capture = {
          ...capture,
          command: ["adb", "-s", deviceId, "logcat", "--pid", pid, "-d", "-t", String(capture.linesRequested ?? DEFAULT_GET_LOGS_LINES)],
          appFilterApplied: true,
        };
      }
    }

    if (input.platform === "ios") {
      const predicate = buildIosLogPredicateForApp(appId);
      capture = {
        ...capture,
        command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(capture.sinceSeconds)}s`, "--predicate", predicate],
        appFilterApplied: true,
      };
    }
  }

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });

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
        outputPath: capture.relativeOutputPath,
        command: capture.command,
        exitCode: 0,
        supportLevel: capture.supportLevel,
        lineCount: 0,
        linesRequested: capture.linesRequested,
        sinceSeconds: capture.sinceSeconds,
        appId,
        appFilterApplied: capture.appFilterApplied,
        evidence: [buildExecutionEvidence("log", capture.relativeOutputPath, capture.supportLevel, "Planned log capture artifact path.")],
        query: input.query,
        summary: buildLogSummary("", input.query),
      },
      nextSuggestions: ["Run get_logs without dryRun to capture live device or simulator logs."],
    };
  }

  const execution = await executeRunner(capture.command, repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
  if (execution.exitCode === 0) {
    await writeFile(capture.absoluteOutputPath, execution.stdout, "utf8");
  }

  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: execution.exitCode === 0 ? [toRelativePath(repoRoot, capture.absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: capture.relativeOutputPath,
      command: capture.command,
      exitCode: execution.exitCode,
      supportLevel: capture.supportLevel,
      lineCount: execution.exitCode === 0 ? countNonEmptyLines(execution.stdout) : 0,
      linesRequested: capture.linesRequested,
      sinceSeconds: capture.sinceSeconds,
      appId,
      appFilterApplied: capture.appFilterApplied,
      evidence: execution.exitCode === 0 ? [buildExecutionEvidence("log", capture.relativeOutputPath, capture.supportLevel, "Captured log artifact.")] : undefined,
      query: input.query,
      content: execution.exitCode === 0 ? execution.stdout : undefined,
      summary: execution.exitCode === 0 ? buildLogSummary(execution.stdout, input.query) : undefined,
    },
    nextSuggestions: execution.exitCode === 0
      ? []
      : [input.platform === "android"
        ? "Check adb connectivity and the selected Android device before retrying get_logs."
        : "Check simulator boot state and log access permissions before retrying get_logs."],
  };
}

export async function getCrashSignalsWithMaestro(input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const appId = input.appId ?? selection.appId;
  const capture = buildGetCrashSignalsCapture(repoRoot, input, runnerProfile, deviceId);

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });

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
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: 0,
        supportLevel: capture.supportLevel,
        signalCount: 0,
        linesRequested: capture.linesRequested,
        appId,
        entries: [],
        evidence: [buildExecutionEvidence("crash_signal", capture.relativeOutputPath, capture.supportLevel, "Planned crash-signal artifact path.")],
        summary: buildLogSummary(""),
      },
      nextSuggestions: ["Run get_crash_signals without dryRun to capture live crash and ANR evidence."],
    };
  }

    if (input.platform === "android") {
    const pid = appId ? await resolveAndroidAppPid(repoRoot, deviceId, appId) : undefined;
    const [baseCrashCommand, anrCommand] = capture.commands;
    const crashCommand = pid
      ? ["adb", "-s", deviceId, "logcat", "--pid", pid, "-d", "-b", "crash", "-t", String(capture.linesRequested)]
      : baseCrashCommand;
    const crashExecution = await executeRunner(crashCommand, repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
    const anrExecution = await executeRunner(anrCommand, repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
    const entries = anrExecution.exitCode === 0
      ? anrExecution.stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean)
      : [];
    const contentSections = [
      "# Android crash log buffer",
      crashExecution.stdout.trim(),
      "",
      "# Android ANR entries",
      entries.join(String.fromCharCode(10)),
    ];
    const content = contentSections.join(String.fromCharCode(10)).trim() + String.fromCharCode(10);
    const exitCode = crashExecution.exitCode !== 0 ? crashExecution.exitCode : anrExecution.exitCode;

    if (exitCode === 0) {
      await writeFile(capture.absoluteOutputPath, content, "utf8");
    }

    return {
      status: exitCode === 0 ? "success" : "failed",
      reasonCode: exitCode === 0 ? REASON_CODES.ok : buildFailureReason(crashExecution.stderr || anrExecution.stderr, exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: exitCode === 0 ? [toRelativePath(repoRoot, capture.absoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: [crashCommand, anrCommand],
        exitCode,
        supportLevel: capture.supportLevel,
        signalCount: entries.length + countNonEmptyLines(crashExecution.stdout),
        linesRequested: capture.linesRequested,
        appId,
        entries,
        evidence: exitCode === 0 ? [buildExecutionEvidence("crash_signal", capture.relativeOutputPath, capture.supportLevel, "Captured crash-signal artifact.")] : undefined,
        content: exitCode === 0 ? content : undefined,
        summary: exitCode === 0 ? buildLogSummary(content) : undefined,
      },
      nextSuggestions: exitCode === 0 ? [] : ["Check adb connectivity and the selected Android device before retrying get_crash_signals."],
    };
  }

  const homeExecution = await executeRunner(capture.commands[0], repoRoot, process.env);
  if (homeExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(homeExecution.stderr, homeExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: homeExecution.exitCode,
        supportLevel: capture.supportLevel,
        signalCount: 0,
        linesRequested: capture.linesRequested,
        appId,
        entries: [],
        evidence: undefined,
        summary: buildLogSummary(""),
      },
      nextSuggestions: ["Check simulator boot state before retrying get_crash_signals."],
    };
  }

  const simulatorHome = homeExecution.stdout.trim();
  const crashRoot = path.join(simulatorHome, "Library", "Logs", "CrashReporter");
  const crashEntries = await listRelativeFileEntries(crashRoot);
  const filteredCrashEntries = appId
    ? crashEntries.filter((entry) => entry.relativePath.toLowerCase().includes(appId.toLowerCase()) || entry.absolutePath.toLowerCase().includes(appId.toLowerCase()))
    : crashEntries;
  const selectedCrashEntries = filteredCrashEntries.slice(0, 3);
  const entries = selectedCrashEntries.map((entry) => entry.relativePath);
  const crashSnippets: string[] = [];

  for (const entry of selectedCrashEntries) {
    const snippet = await readFile(entry.absolutePath, "utf8").catch(() => "");
    if (snippet.trim().length > 0) {
      crashSnippets.push(`## ${entry.relativePath}`);
      crashSnippets.push(...snippet.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).slice(0, 80));
      crashSnippets.push("");
    }
  }

  const content = [
    "# iOS simulator crash reporter root",
    crashRoot,
    "",
    "# Crash reporter entries",
    entries.length > 0 ? entries.join(String.fromCharCode(10)) : "<no crash entries found>",
    "",
    "# Crash reporter snippets",
    crashSnippets.length > 0 ? crashSnippets.join(String.fromCharCode(10)) : "<no crash snippets collected>",
  ].join(String.fromCharCode(10)) + String.fromCharCode(10);
  await writeFile(capture.absoluteOutputPath, content, "utf8");

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [toRelativePath(repoRoot, capture.absoluteOutputPath)],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: capture.relativeOutputPath,
      commands: capture.commands,
      exitCode: homeExecution.exitCode,
      supportLevel: capture.supportLevel,
      signalCount: filteredCrashEntries.length,
      linesRequested: capture.linesRequested,
      appId,
      entries,
      evidence: [buildExecutionEvidence("crash_signal", capture.relativeOutputPath, capture.supportLevel, "Captured crash-signal artifact.")],
      content,
      summary: buildLogSummary(content),
    },
    nextSuggestions: filteredCrashEntries.length === 0 ? ["No simulator crash reporter files were found for the current scope. Re-run after reproducing a crash or broaden the app filter."] : [],
  };
}

export async function collectDiagnosticsWithMaestro(input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const capture = buildCollectDiagnosticsCapture(repoRoot, input, runnerProfile, deviceId);

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });
  if (input.platform === "ios") {
    await mkdir(capture.absoluteOutputPath, { recursive: true });
  }

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
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: 0,
        supportLevel: capture.supportLevel,
        artifactCount: 0,
        artifacts: [],
        evidence: [buildExecutionEvidence("diagnostics_bundle", capture.relativeOutputPath, capture.supportLevel, "Planned diagnostics bundle output path.")],
      },
      nextSuggestions: ["Run collect_diagnostics without dryRun to capture a real Android bugreport or iOS simulator diagnostics bundle."],
    };
  }

  const execution = await executeRunner(capture.commands[0], repoRoot, process.env);
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
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: execution.exitCode,
        supportLevel: capture.supportLevel,
        artifactCount: 0,
        artifacts: [],
        evidence: undefined,
      },
      nextSuggestions: [input.platform === "android"
        ? "Check adb connectivity and available device storage before retrying collect_diagnostics."
        : "Check simulator boot state before retrying collect_diagnostics."],
    };
  }

  const collectedArtifacts = input.platform === "android"
    ? [toRelativePath(repoRoot, capture.absoluteOutputPath)]
    : await listArtifacts(capture.absoluteOutputPath, repoRoot);
  const artifacts = [capture.relativeOutputPath];

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts,
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: capture.relativeOutputPath,
      commands: capture.commands,
      exitCode: execution.exitCode,
      supportLevel: capture.supportLevel,
      artifactCount: collectedArtifacts.length,
      artifacts,
      evidence: artifacts.map((artifactPath) => buildExecutionEvidence("diagnostics_bundle", artifactPath, capture.supportLevel, "Captured diagnostics bundle or diagnostics root artifact.")),
    },
    nextSuggestions: [],
  };
}

export async function collectDebugEvidenceWithMaestro(input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>> {
  const startTime = Date.now();
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

function buildPerformanceEvidence(artifactPaths: string[], supportLevel: "full" | "partial", planned = false): ExecutionEvidence[] {
  return artifactPaths.map((artifactPath) => {
    const lower = artifactPath.toLowerCase();
    if (lower.endsWith(".trace") || lower.endsWith(".perfetto-trace")) {
      return buildExecutionEvidence("performance_trace", artifactPath, supportLevel, planned ? "Planned performance trace artifact path." : "Captured performance trace artifact.");
    }
    if (lower.endsWith(".xml") || lower.endsWith(".txt") || lower.endsWith(".pbtx")) {
      return buildExecutionEvidence("performance_export", artifactPath, supportLevel, planned ? "Planned performance export or raw analysis artifact path." : "Captured performance export or raw analysis artifact.");
    }
    return buildExecutionEvidence("performance_summary", artifactPath, supportLevel, planned ? "Planned performance summary artifact path." : "Generated performance summary artifact.");
  });
}

async function runTraceProcessorScript(params: {
  repoRoot: string;
  traceProcessorPath: string;
  tracePath: string;
  sqlPath: string;
  statements: string[];
  timeoutMs?: number;
}): Promise<CommandExecution> {
  await writeFile(params.sqlPath, buildTraceProcessorScript(params.statements), "utf8");
  return runCommandSafely(
    buildTraceProcessorShellCommand(params.traceProcessorPath, params.tracePath, params.sqlPath),
    params.repoRoot,
    params.timeoutMs,
  );
}

async function runCommandSafely(command: string[], repoRoot: string, timeoutMs = DEFAULT_DEVICE_COMMAND_TIMEOUT_MS): Promise<CommandExecution> {
  try {
    return await executeRunner(command, repoRoot, process.env, { timeoutMs });
  } catch (error) {
    return {
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkCommandAvailable(repoRoot: string, command: string[], timeoutMs = DEFAULT_DEVICE_COMMAND_TIMEOUT_MS): Promise<CommandExecution> {
  return runCommandSafely(command, repoRoot, timeoutMs);
}

function reasonCodeForExecution(execution: CommandExecution): ReasonCode {
  if (execution.exitCode === null && execution.stderr.includes("Command timed out after")) {
    return REASON_CODES.timeout;
  }
  return buildFailureReason(`${execution.stderr}\n${execution.stdout}`, execution.exitCode);
}

async function resolveAndroidSdkLevel(repoRoot: string, deviceId: string): Promise<number | undefined> {
  const execution = await runCommandSafely(["adb", "-s", deviceId, "shell", "getprop", "ro.build.version.sdk"], repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS);
  if (execution.exitCode !== 0) {
    return undefined;
  }
  const parsed = Number.parseInt(execution.stdout.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function resolveIosSimulatorProcessId(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  const execution = await runCommandSafely([
    "xcrun",
    "simctl",
    "spawn",
    deviceId,
    "launchctl",
    "list",
  ], repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS);
  if (execution.exitCode !== 0) {
    return undefined;
  }
  const lines = execution.stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
  const match = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.includes(appId));
  if (!match) {
    return undefined;
  }
  const pid = match.split(String.fromCharCode(9))[0]?.trim();
  return pid && /^\d+$/.test(pid) ? pid : undefined;
}

async function launchIosSimulatorApp(repoRoot: string, deviceId: string, appId: string): Promise<CommandExecution> {
  return runCommandSafely([
    "xcrun",
    "simctl",
    "launch",
    deviceId,
    appId,
  ], repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS);
}

export function isPerfettoShellProbeAvailable(execution: CommandExecution): boolean {
  const output = execution.stdout.trim();
  return execution.exitCode === 0 && output.length > 0 && output !== "missing";
}

function isPerfettoVersionProbeAvailable(execution: CommandExecution): boolean {
  const combinedOutput = `${execution.stdout}\n${execution.stderr}`.trim();
  return execution.exitCode === 0 && combinedOutput.toLowerCase().includes("perfetto");
}

export function isDoctorCriticalFailure(check: DoctorCheck): boolean {
  return [
    "node",
    "pnpm",
    "python3",
    "adb",
    "xcrun simctl",
    "maestro",
    "sample harness config",
  ].includes(check.name);
}

export function classifyDoctorOutcome(checks: DoctorCheck[]): { status: ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>['status']; reasonCode: ReasonCode } {
  if (checks.some((check) => check.status === "fail" && isDoctorCriticalFailure(check))) {
    return { status: "failed", reasonCode: REASON_CODES.configurationError };
  }
  if (checks.some((check) => check.status !== "pass")) {
    return { status: "partial", reasonCode: REASON_CODES.deviceUnavailable };
  }
  return { status: "success", reasonCode: REASON_CODES.ok };
}

function buildAndroidPerformancePresetSuggestion(preset: AndroidPerformancePreset): string {
  if (preset === "startup") {
    return "Inspect startup slices and launch-related frame work in the trace next.";
  }
  if (preset === "scroll") {
    return "Inspect frame timeline and UI thread slices around the scroll window next.";
  }
  if (preset === "interaction") {
    return "Inspect the heaviest UI and RenderThread slices in the sampled interaction next.";
  }
  return "Inspect the summary and raw trace together to narrow CPU vs jank vs memory next.";
}

export async function measureAndroidPerformanceWithMaestro(input: MeasureAndroidPerformanceInput): Promise<ToolResult<MeasureAndroidPerformanceData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, "android", runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const appId = input.appId ?? selection.appId;
  const androidSdkLevel = input.dryRun ? undefined : await resolveAndroidSdkLevel(repoRoot, deviceId);
  const plan = buildAndroidPerformancePlan({ ...input, appId }, runnerProfile, deviceId, androidSdkLevel);
  const supportLevel: "full" = "full";

  await mkdir(path.resolve(repoRoot, plan.outputPath), { recursive: true });
  if (plan.artifacts.configPath) {
    await writeFile(path.resolve(repoRoot, plan.artifacts.configPath), plan.configContent, "utf8");
  }

  const plannedArtifactPaths = [
    plan.artifacts.configPath,
    plan.artifacts.tracePath,
    plan.artifacts.rawAnalysisPath,
    plan.artifacts.summaryPath,
    plan.artifacts.reportPath,
  ].filter((value): value is string => Boolean(value));
  const plannedEvidence = buildPerformanceEvidence(plannedArtifactPaths, supportLevel, true);

  if (input.dryRun) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: true,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: 0,
      supportLevel,
      artifactPaths: plannedArtifactPaths,
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plannedEvidence,
    });
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: [
        "Run measure_android_performance without dryRun to capture a live Perfetto trace.",
        "Install trace_processor on the host before running the Android performance MVP analysis path.",
        `Android SDK strategy preview: ${plan.androidSdkLevel === undefined ? "undetected" : `SDK ${String(plan.androidSdkLevel)}`}, config via ${plan.configTransport}, trace pull via ${plan.tracePullMode}.`,
      ],
    };
  }

  let traceProcessorPath: string | undefined;
  try {
    traceProcessorPath = resolveTraceProcessorPath();
  } catch (error) {
    traceProcessorPath = undefined;
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: null,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [error instanceof Error ? error.message : String(error)],
    };
  }
  if (!traceProcessorPath) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: null,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [
        "Install trace_processor on the host or set TRACE_PROCESSOR_PATH before retrying measure_android_performance.",
      ],
    };
  }
  const traceProcessorProbe = await checkCommandAvailable(repoRoot, [traceProcessorPath, "--help"]);
  if (traceProcessorProbe.exitCode !== 0) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: traceProcessorProbe.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [
        "Install trace_processor on the host and ensure it is on PATH before retrying measure_android_performance.",
      ],
    };
  }

  const perfettoProbe = await checkCommandAvailable(repoRoot, plan.steps[0].command);
  if (!isPerfettoShellProbeAvailable(perfettoProbe)) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: perfettoProbe.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: buildFailureReason(`${perfettoProbe.stderr}\n${perfettoProbe.stdout}`, perfettoProbe.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [
        "Ensure the Android device is connected and that the device-side perfetto binary is available before retrying.",
      ],
    };
  }

  const pushExecution = plan.configTransport === "remote_file"
    ? await runCommandSafely(plan.steps[1].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS)
    : { exitCode: 0, stdout: "Config will be streamed over stdin.", stderr: "" };
  if (pushExecution.exitCode !== 0) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: pushExecution.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: buildFailureReason(pushExecution.stderr, pushExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: ["Failed to push the Perfetto config to the device. Check adb connectivity and retry."],
    };
  }

  const recordExecution = await runCommandSafely(plan.steps[2].command, repoRoot, plan.durationMs + 15000);
  if (recordExecution.exitCode !== 0) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: recordExecution.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: recordExecution.exitCode === null ? "failed" : "failed",
      reasonCode: reasonCodeForExecution(recordExecution),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: ["Perfetto trace capture did not complete cleanly. Check device health and retry the sampled window."],
    };
  }

  const pullExecution = await runCommandSafely(plan.steps[3].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS);
  const traceArtifacts = [plan.artifacts.configPath, plan.artifacts.tracePath].filter((value): value is string => Boolean(value));
  if (pullExecution.exitCode !== 0 || !plan.artifacts.tracePath) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: pullExecution.exitCode,
      supportLevel,
      artifactPaths: traceArtifacts,
      artifactsByKind: plan.artifacts,
      summary,
      evidence: buildPerformanceEvidence(traceArtifacts, supportLevel),
    });
    return {
      status: "partial",
      reasonCode: buildFailureReason(pullExecution.stderr, pullExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: traceArtifacts,
      data,
      nextSuggestions: ["Trace capture may have succeeded on-device, but the trace could not be pulled locally. Inspect adb pull permissions and retry."],
    };
  }

  const analysisCommandLabels = [...plan.steps.map((step) => step.label)];
  const analysisCommands = [...plan.steps.map((step) => step.command)];
  const tablesOutputPath = plan.traceProcessorScripts.tables;
  const tablesExecution = await runTraceProcessorScript({
    repoRoot,
    traceProcessorPath,
    tracePath: path.resolve(repoRoot, plan.artifacts.tracePath),
    sqlPath: path.resolve(repoRoot, tablesOutputPath),
    statements: ["SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"],
    timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
  });
  analysisCommandLabels.push("trace_processor_tables");
  analysisCommands.push(buildTraceProcessorShellCommand(traceProcessorPath, path.resolve(repoRoot, plan.artifacts.tracePath), path.resolve(repoRoot, tablesOutputPath)));
  const artifactPaths = [...traceArtifacts];
  let status: ToolResult<MeasureAndroidPerformanceData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  let tableNames: string[] = [];
  let cpuRows: string[][] | undefined;
  let hotspotRows: string[][] | undefined;
  let frameRows: string[][] | undefined;
  let memoryRows: string[][] | undefined;
  let cpuSource: "sched" | "thread_state" | undefined;
  let frameSource: "actual_frame_timeline_slice" | "slice_name_heuristic" | undefined;
  let memorySource: "process_counter_track" | "counter_track_heuristic" | undefined;
  const analysisSections: string[] = [];
  if (tablesExecution.exitCode === 0) {
    tableNames = parseTraceProcessorTsv(tablesExecution.stdout).map((row) => row[0] ?? "").filter(Boolean);
    analysisSections.push("# tables", tablesExecution.stdout.trim(), "");
    const queryRuns: Array<{ key: "cpu" | "hotspots" | "frame" | "memory"; statements: string[][] }> = [
      {
        key: "cpu",
        statements: [
          [`SELECT COALESCE(process.name, '<unknown>'), ROUND(SUM(CAST(sched.dur AS FLOAT)) / 1000000.0, 2) FROM sched JOIN thread USING (utid) LEFT JOIN process USING (upid) WHERE sched.dur > 0 GROUP BY COALESCE(process.name, '<unknown>') ORDER BY SUM(sched.dur) DESC LIMIT 5;`],
          [`SELECT COALESCE(process.name, '<unknown>'), ROUND(SUM(CAST(thread_state.dur AS FLOAT)) / 1000000.0, 2) FROM thread_state JOIN thread USING (utid) LEFT JOIN process USING (upid) WHERE thread_state.dur > 0 AND lower(thread_state.state) = 'running' GROUP BY COALESCE(process.name, '<unknown>') ORDER BY SUM(thread_state.dur) DESC LIMIT 5;`],
        ],
      },
      {
        key: "hotspots",
        statements: [
          [
            `SELECT COALESCE(process.name, '<unknown>'), slice.name, ROUND(SUM(CAST(slice.dur AS FLOAT)) / 1000000.0, 2), COUNT(*) FROM slice LEFT JOIN thread_track ON slice.track_id = thread_track.id LEFT JOIN thread USING (utid) LEFT JOIN process USING (upid) WHERE slice.dur > 0 AND slice.name IS NOT NULL GROUP BY COALESCE(process.name, '<unknown>'), slice.name ORDER BY CASE WHEN ${appId ? `(process.name = ${JSON.stringify(appId)} OR process.name LIKE ${JSON.stringify(`${appId}:%`)})` : "0"} THEN 0 ELSE 1 END, SUM(slice.dur) DESC LIMIT 8;`,
          ],
          ["SELECT '<unknown>', name, ROUND(SUM(CAST(dur AS FLOAT)) / 1000000.0, 2), COUNT(*) FROM slice WHERE dur > 0 AND name IS NOT NULL GROUP BY name ORDER BY SUM(dur) DESC LIMIT 8;"],
        ],
      },
      {
        key: "frame",
        statements: [
          ["SELECT SUM(CASE WHEN dur > 16666666 THEN 1 ELSE 0 END), SUM(CASE WHEN dur > 700000000 THEN 1 ELSE 0 END), ROUND(AVG(CAST(dur AS FLOAT)) / 1000000.0, 2), ROUND(MAX(CAST(dur AS FLOAT)) / 1000000.0, 2) FROM actual_frame_timeline_slice;"],
          ["SELECT SUM(CASE WHEN dur > 16666666 THEN 1 ELSE 0 END), SUM(CASE WHEN dur > 700000000 THEN 1 ELSE 0 END), ROUND(AVG(CAST(dur AS FLOAT)) / 1000000.0, 2), ROUND(MAX(CAST(dur AS FLOAT)) / 1000000.0, 2) FROM slice WHERE dur > 0 AND name IS NOT NULL AND (lower(name) LIKE '%frame%' OR lower(name) LIKE '%choreographer%' OR lower(name) LIKE '%vsync%' OR lower(name) LIKE '%drawframe%');"],
        ],
      },
      {
        key: "memory",
        statements: [
          [`SELECT ROUND(MIN(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)) - MIN(CAST(counter.value AS FLOAT)), 2) FROM counter JOIN process_counter_track ON counter.track_id = process_counter_track.id LEFT JOIN process ON process_counter_track.upid = process.upid WHERE lower(process_counter_track.name) LIKE '%rss%'${appId ? ` AND (process.name = ${JSON.stringify(appId)} OR process.name LIKE ${JSON.stringify(`${appId}:%`)})` : ""};`],
          ["SELECT ROUND(MIN(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)) - MIN(CAST(counter.value AS FLOAT)), 2) FROM counter JOIN counter_track ON counter.track_id = counter_track.id WHERE lower(counter_track.name) LIKE '%rss%' OR lower(counter_track.name) LIKE '%mem%' OR lower(counter_track.name) LIKE '%heap%';"],
        ],
      },
    ];
    for (const queryRun of queryRuns) {
      const sqlPath = path.resolve(repoRoot, plan.traceProcessorScripts[queryRun.key]);
      let execution: CommandExecution | undefined;
      let resolvedStatements: string[] | undefined;
      for (const statements of queryRun.statements) {
        const attempt = await runTraceProcessorScript({
          repoRoot,
          traceProcessorPath,
          tracePath: path.resolve(repoRoot, plan.artifacts.tracePath),
          sqlPath,
          statements,
          timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
        });
        if (attempt.exitCode === 0) {
          execution = attempt;
          resolvedStatements = statements;
          break;
        }
        execution = attempt;
      }
      analysisCommandLabels.push(`trace_processor_${queryRun.key}`);
      analysisCommands.push(buildTraceProcessorShellCommand(traceProcessorPath, path.resolve(repoRoot, plan.artifacts.tracePath), sqlPath));
      if (!execution || execution.exitCode !== 0) {
        analysisSections.push(`# ${queryRun.key}`, execution?.stderr.trim() ?? "", "");
        continue;
      }
      const parsed = parseTraceProcessorTsv(execution.stdout);
      analysisSections.push(`# ${queryRun.key}`, ...(resolvedStatements ?? []), execution.stdout.trim(), "");
      if (queryRun.key === "cpu") {
        cpuRows = parsed;
        cpuSource = resolvedStatements?.[0]?.includes("thread_state") ? "thread_state" : "sched";
      }
      if (queryRun.key === "hotspots") hotspotRows = parsed;
      if (queryRun.key === "frame") {
        frameRows = parsed;
        frameSource = resolvedStatements?.[0]?.includes("actual_frame_timeline_slice") ? "actual_frame_timeline_slice" : "slice_name_heuristic";
      }
      if (queryRun.key === "memory") {
        memoryRows = parsed;
        memorySource = resolvedStatements?.[0]?.includes("process_counter_track") ? "process_counter_track" : "counter_track_heuristic";
      }
    }
  } else {
    status = "partial";
    reasonCode = REASON_CODES.adapterError;
    analysisSections.push("# tables", tablesExecution.stderr.trim(), "");
  }

  if (plan.artifacts.rawAnalysisPath) {
    await writeFile(path.resolve(repoRoot, plan.artifacts.rawAnalysisPath), analysisSections.join(String.fromCharCode(10)), "utf8");
    artifactPaths.push(plan.artifacts.rawAnalysisPath);
  }
  const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames, cpuRows, hotspotRows, frameRows, memoryRows, cpuSource, frameSource, memorySource });
  const data = buildAndroidPerformanceData({
    dryRun: false,
    runnerProfile,
    outputPath: plan.outputPath,
    durationMs: plan.durationMs,
    captureMode: "time_window",
    preset: plan.preset,
    appId,
    commandLabels: analysisCommandLabels,
    commands: analysisCommands,
    exitCode: status === "success" ? 0 : 1,
    supportLevel,
    artifactPaths: [...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath],
    artifactsByKind: plan.artifacts,
    summary,
    evidence: buildPerformanceEvidence([...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath], supportLevel),
  });
  await writeFile(path.resolve(repoRoot, plan.artifacts.summaryPath), JSON.stringify(data.summary, null, 2) + String.fromCharCode(10), "utf8");
  await writeFile(path.resolve(repoRoot, plan.artifacts.reportPath), buildPerformanceMarkdownReport({
    title: `Android Performance Summary (${runnerProfile})`,
    supportLevel,
    summary: data.summary,
    suspectAreas: data.suspectAreas,
    diagnosisBriefing: data.diagnosisBriefing,
    artifactPaths: data.artifactPaths,
  }), "utf8");
  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: data.artifactPaths,
    data,
    nextSuggestions: [...buildPerformanceNextSuggestions(data.summary, plan.artifacts), buildAndroidPerformancePresetSuggestion(plan.preset)],
  };
}

function buildIosTemplateSuggestion(template: IosPerformanceTemplate): string {
  if (template === "animation-hitches") {
    return "Inspect the exported hitch-related tables next; this template is best for animation stalls.";
  }
  if (template === "memory") {
    return "Inspect the exported allocation tables next; this template is best for memory growth signals.";
  }
  return "Inspect the exported Time Profiler tables next; this template is best for CPU-heavy windows.";
}

function buildIosAppScopeNote(appId?: string, attachTarget?: string): string {
  if (attachTarget && appId) {
    return `iOS MVP note: appId '${appId}' was attached by pid ${attachTarget} for this run, but other templates may still fall back to all-process capture.`;
  }
  return appId
    ? `iOS MVP note: appId '${appId}' is currently used for labeling only; xctrace capture still records all processes in the selected time window.`
    : "iOS MVP note: xctrace capture records all processes in the selected time window unless a narrower launch/attach flow is added later.";
}

function buildIosRecordFailureSuggestions(appId: string | undefined, template: IosPerformanceTemplate, stderr: string, attachTarget?: string): string[] {
  const suggestions: string[] = [];
  const lowered = stderr.toLowerCase();
  if (lowered.includes("not supported on this platform")) {
    suggestions.push(`The ${template} template is not supported on this simulator/runtime combination; try a different simulator or keep using Time Profiler for MVP validation.`);
  } else if (lowered.includes("cannot handle a target type of 'all processes'")) {
    suggestions.push(`The ${template} template cannot record All Processes; keep the target app running so the tool can attach directly by pid.`);
  } else {
    suggestions.push("xctrace recording failed. Ensure the simulator/device is available and retry the sampled window.");
  }
  suggestions.push(buildIosAppScopeNote(appId, attachTarget));
  return suggestions;
}

export async function measureIosPerformanceWithMaestro(input: MeasureIosPerformanceInput): Promise<ToolResult<MeasureIosPerformanceData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, "ios", runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
  const appId = input.appId ?? selection.appId;
  const requestedTemplate = input.template ?? "time-profiler";
  let attachTarget = !input.dryRun && requestedTemplate === "memory" && appId
    ? await resolveIosSimulatorProcessId(repoRoot, deviceId, appId)
    : undefined;
  if (!input.dryRun && requestedTemplate === "memory" && appId && !attachTarget) {
    await launchIosSimulatorApp(repoRoot, deviceId, appId);
    attachTarget = await resolveIosSimulatorProcessId(repoRoot, deviceId, appId);
  }
  const plan = buildIosPerformancePlan({ ...input, appId }, runnerProfile, deviceId, attachTarget);
  const supportLevel: "partial" = "partial";

  await mkdir(path.resolve(repoRoot, plan.outputPath), { recursive: true });
  const plannedArtifactPaths = [plan.artifacts.traceBundlePath, plan.artifacts.tocPath, plan.artifacts.exportPath, plan.artifacts.summaryPath, plan.artifacts.reportPath].filter((value): value is string => Boolean(value));

  if (input.dryRun) {
    const summary = summarizeIosPerformance({ durationMs: plan.durationMs, template: plan.template });
    const data = buildIosPerformanceData({
      dryRun: true,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      template: plan.template,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: 0,
      supportLevel,
      artifactPaths: plannedArtifactPaths,
      artifactsByKind: plan.artifacts,
      summary,
      evidence: buildPerformanceEvidence(plannedArtifactPaths, supportLevel),
    });
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: [
        "Run measure_ios_performance without dryRun to capture an xctrace bundle.",
        buildIosAppScopeNote(appId, attachTarget),
        buildIosTemplateSuggestion(plan.template),
      ],
    };
  }

  const recordExecution = await runCommandSafely(plan.steps[0].command, repoRoot, plan.durationMs + 30000);
  if (recordExecution.exitCode !== 0) {
    const summary = summarizeIosPerformance({ durationMs: plan.durationMs, template: plan.template });
    const data = buildIosPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      template: plan.template,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: recordExecution.exitCode,
      supportLevel,
      artifactPaths: [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: undefined,
    });
    return {
      status: recordExecution.exitCode === null ? "failed" : "failed",
      reasonCode: reasonCodeForExecution(recordExecution),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: buildIosRecordFailureSuggestions(appId, plan.template, `${recordExecution.stderr}\n${recordExecution.stdout}`, attachTarget),
    };
  }

  let status: ToolResult<MeasureIosPerformanceData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  const artifactPaths = [plan.artifacts.traceBundlePath].filter((value): value is string => Boolean(value));
  const tocExecution = await runCommandSafely(plan.steps[1].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS + plan.durationMs);
  let tocXml = "";
  if (tocExecution.exitCode === 0 && plan.artifacts.tocPath) {
    tocXml = await readFile(path.resolve(repoRoot, plan.artifacts.tocPath), "utf8").catch(() => "");
    artifactPaths.push(plan.artifacts.tocPath);
  } else {
    status = "partial";
    reasonCode = reasonCodeForExecution(tocExecution);
  }

  const exportExecution = await runCommandSafely(plan.steps[2].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS + plan.durationMs);
  let exportXml = "";
  if (exportExecution.exitCode === 0 && plan.artifacts.exportPath) {
    exportXml = await readFile(path.resolve(repoRoot, plan.artifacts.exportPath), "utf8").catch(() => "");
    artifactPaths.push(plan.artifacts.exportPath);
  } else {
    status = "partial";
    reasonCode = reasonCodeForExecution(exportExecution);
  }

  const summary = summarizeIosPerformance({ durationMs: plan.durationMs, template: plan.template, tocXml, exportXml });
  const data = buildIosPerformanceData({
    dryRun: false,
    runnerProfile,
    outputPath: plan.outputPath,
    durationMs: plan.durationMs,
    captureMode: "time_window",
    template: plan.template,
    appId,
    commandLabels: plan.steps.map((step) => step.label),
    commands: plan.steps.map((step) => step.command),
    exitCode: status === "success" ? 0 : 1,
    supportLevel,
    artifactPaths: [...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath],
    artifactsByKind: plan.artifacts,
    summary,
    evidence: buildPerformanceEvidence([...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath], supportLevel),
  });
  await writeFile(path.resolve(repoRoot, plan.artifacts.summaryPath), JSON.stringify(data.summary, null, 2) + String.fromCharCode(10), "utf8");
  await writeFile(path.resolve(repoRoot, plan.artifacts.reportPath), buildPerformanceMarkdownReport({
    title: `iOS Performance Summary (${runnerProfile})`,
    supportLevel,
    summary: data.summary,
    suspectAreas: data.suspectAreas,
    diagnosisBriefing: data.diagnosisBriefing,
    artifactPaths: data.artifactPaths,
  }), "utf8");
  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: data.artifactPaths,
    data,
    nextSuggestions: [...buildPerformanceNextSuggestions(data.summary, plan.artifacts), buildIosAppScopeNote(appId, attachTarget), buildIosTemplateSuggestion(plan.template)],
  };
}

export async function launchAppWithMaestro(input: LaunchAppInput): Promise<ToolResult<LaunchAppData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const appId = input.appId ?? selection.appId;
  const launchUrl = input.launchUrl ?? selection.launchUrl;

  const launchCommand =
    runnerProfile === "phase1"
      ? input.platform === "android"
        ? ["adb", "-s", deviceId, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", launchUrl ?? "", appId]
        : ["xcrun", "simctl", "openurl", deviceId, launchUrl ?? ""]
      : input.platform === "android"
        ? ["adb", "-s", deviceId, "shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]
        : ["xcrun", "simctl", "launch", deviceId, appId];

  if (runnerProfile === "phase1" && !launchUrl) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile, appId, launchCommand, exitCode: null },
      nextSuggestions: ["Provide launchUrl or ensure the harness config includes a phase1 launch_url before calling launch_app."],
    };
  }

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, appId, launchUrl, launchCommand, exitCode: 0 },
      nextSuggestions: ["Run launch_app without dryRun to perform the actual launch."],
    };
  }

  const execution = await executeRunner(launchCommand, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, appId, launchUrl, launchCommand, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check device/simulator state and launchUrl/appId values before retrying launch_app."],
  };
}

export async function installAppWithMaestro(input: InstallAppInput): Promise<ToolResult<InstallAppData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;

  if (runnerProfile === "phase1") {
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
        installCommand: [],
        exitCode: null,
      },
      nextSuggestions: ["phase1 relies on Expo Go already being installed. Use doctor to verify launch URL/device readiness instead of install_app."],
    };
  }

  const artifactPath = resolveInstallArtifactPath(repoRoot, runnerProfile, input.artifactPath);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const installCommand =
    input.platform === "android"
      ? ["adb", "-s", input.deviceId ?? selection.deviceId ?? "emulator-5554", "install", "-r", artifactPath ?? ""]
      : ["xcrun", "simctl", "install", input.deviceId ?? selection.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816", artifactPath ?? ""];

  const spec = getInstallArtifactSpec(runnerProfile);
  const exists = artifactPath ? existsSync(artifactPath) : false;
  const artifactMissing = !artifactPath || !spec || !exists;
  if (artifactMissing) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        artifactPath,
        installCommand,
        exitCode: null,
      },
      nextSuggestions: ["Provide a valid artifactPath or set the runner-specific artifact environment variable before calling install_app."],
    };
  }

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
        artifactPath,
        installCommand,
        exitCode: 0,
      },
      nextSuggestions: ["Run install_app without dryRun to perform the actual installation."],
    };
  }

  const execution = await executeRunner(installCommand, repoRoot, process.env);
  const status = execution.exitCode === 0 ? "success" : "failed";
  const reasonCode = execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode);
  const nextSuggestions = execution.exitCode === 0
    ? []
    : [
        "Review the install stderr for downgrade or signature conflicts before retrying.",
        "If the conflict is caused by a differently signed build, manually uninstall the existing app before reinstalling.",
      ];

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      artifactPath,
      installCommand,
      exitCode: execution.exitCode,
    },
    nextSuggestions,
  };
}

export async function runDoctor(
  input: DoctorInput = {},
): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>> {
  const repoRoot = resolveRepoPath();
  const startTime = Date.now();
  const sessionId = `doctor-${Date.now()}`;
  const checks: DoctorCheck[] = [];

  checks.push(await checkCommandVersion(repoRoot, "node", ["--version"], "node"));
  checks.push(await checkCommandVersion(repoRoot, "pnpm", ["--version"], "pnpm"));
  checks.push(await checkCommandVersion(repoRoot, "python3", ["--version"], "python3"));
  checks.push(await checkCommandVersion(repoRoot, "adb", ["version"], "adb"));
  checks.push(await checkCommandVersion(repoRoot, "xcrun", ["simctl", "help"], "xcrun simctl"));
  checks.push(await checkCommandVersion(repoRoot, "xcrun", ["xctrace", "version"], "xcrun xctrace"));
  checks.push(await checkCommandVersion(repoRoot, "maestro", ["--version"], "maestro"));
  try {
    const resolvedTraceProcessorPath = resolveTraceProcessorPath();
    checks.push(resolvedTraceProcessorPath
      ? await checkCommandVersion(repoRoot, resolvedTraceProcessorPath, ["--help"], "trace_processor")
      : summarizeInfoCheck("trace_processor", "fail", "trace_processor was not found on PATH and no known fallback location was detected."));
  } catch (error) {
    checks.push(summarizeInfoCheck("trace_processor", "fail", error instanceof Error ? error.message : String(error)));
  }
  let idbCliPath: string | undefined;
  let idbCompanionPath: string | undefined;
  try {
    idbCliPath = resolveIdbCliPath();
    idbCompanionPath = resolveIdbCompanionPath();
    checks.push(idbCliPath ? await checkCommandVersion(repoRoot, idbCliPath, ["--help"], "idb") : summarizeInfoCheck("idb", "fail", "No idb CLI binary is configured."));
    checks.push(summarizeInfoCheck("idb companion", idbCompanionPath ? "pass" : "fail", idbCompanionPath ? `${idbCompanionPath} is available.` : "No idb_companion binary is configured."));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push(summarizeInfoCheck("idb", "fail", message));
    checks.push(summarizeInfoCheck("idb companion", "warn", message));
  }
  try {
    const idbTargetResult = await executeRunner(buildIdbCommand(["list-targets"]), repoRoot, process.env);
    const targetUdid = process.env.SIM_UDID ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    checks.push(summarizeInfoCheck(
      "idb target visibility",
      idbTargetResult.exitCode === 0 && idbTargetResult.stdout.includes(targetUdid) ? "pass" : "warn",
      idbTargetResult.exitCode === 0 && idbTargetResult.stdout.includes(targetUdid)
        ? `idb can see target ${targetUdid}.`
        : `idb could not confirm target ${targetUdid}.`,
    ));
  } catch {
    checks.push(summarizeInfoCheck("idb target visibility", "warn", "idb target visibility could not be verified."));
  }

  checks.push(...(await collectHarnessChecks(repoRoot)));
  checks.push(...collectArtifactChecks(repoRoot));
  checks.push(...(await collectInstallStateChecks(repoRoot)));
  checks.push(...(await collectRuntimeStateChecks(repoRoot)));

  const deviceResult = await listAvailableDevices({ includeUnavailable: input.includeUnavailable });
  checks.push(summarizeDeviceCheck("android devices", deviceResult.data.android.filter((device) => device.available).length));
  checks.push(summarizeDeviceCheck("ios simulators", deviceResult.data.ios.filter((device) => device.available).length));
  checks.push(...(await collectPerformanceEnvironmentChecks(repoRoot, deviceResult.data.android)));
  checks.push(...(await collectIosPerformanceEnvironmentChecks(repoRoot, deviceResult.data.ios)));

  const { status, reasonCode } = classifyDoctorOutcome(checks);

  const nextSuggestions = checks
    .filter((check) => check.status !== "pass")
    .map((check) => `Resolve ${check.name}: ${check.detail}`);

  return {
    status,
    reasonCode,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      checks,
      devices: deviceResult.data,
    },
    nextSuggestions,
  };
}
