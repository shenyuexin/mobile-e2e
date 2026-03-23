import {
  type ActionIntent,
  type ActionOutcomeSummary,
  type EvidenceDeltaSummary,
  type EvidenceConfidence,
  type GetScreenSummaryData,
  type LogSummary,
  type OcrEvidence,
  type PerformActionWithEvidenceData,
  type PerformActionWithEvidenceInput,
  type PostActionVerificationTrace,
  type Platform,
  type ReasonCode,
  REASON_CODES,
  type ResolveInterruptionData,
  type ResolveInterruptionInput,
  type ResumeInterruptedActionData,
  type ResumeInterruptedActionInput,
  type RunnerProfile,
  type RetryBackoffClass,
  type RetryDecisionTrace,
  type SessionTimelineEvent,
  type ScreenshotData,
  type ScreenshotInput,
  type StateSummary,
  type OrchestrationStepState,
  type TapData,
  type TapInput,
  type ToolResult,
  type WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_OCR_FALLBACK_POLICY,
  MacVisionOcrProvider,
  minimumConfidenceForOcrAction,
  resolveTextTarget,
  shouldUseOcrFallback,
  type OcrFallbackActionType,
  verifyOcrAction,
} from "@mobile-e2e-mcp/adapter-vision";
import { loadSessionRecord, persistActionRecord, persistSessionState, recordBaselineEntry } from "@mobile-e2e-mcp/core";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getScreenSummaryWithMaestro } from "./session-state.js";
import { tapWithMaestroTool } from "./ui-tools.js";
import { resolveInterruptionWithMaestro, resumeInterruptedActionWithMaestro, buildInterruptionCheckpoint } from "./interruption-tools.js";
import { takeScreenshotWithRuntime } from "./device-runtime.js";
import { DEFAULT_RUNNER_PROFILE, isRecord, resolveRepoPath } from "./harness-config.js";

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

export interface OcrFallbackTestHooks {
  createProvider?: () => Pick<MacVisionOcrProvider, "extractTextRegions">;
  takeScreenshot?: (input: ScreenshotInput) => Promise<ToolResult<ScreenshotData>>;
  tap?: (input: TapInput) => Promise<ToolResult<TapData>>;
  getScreenSummary?: typeof getScreenSummaryWithMaestro;
  now?: () => string;
}

export interface InterruptionGuardTestHooks {
  resolveInterruption?: (input: ResolveInterruptionInput) => Promise<ToolResult<ResolveInterruptionData>>;
  resumeInterruptedAction?: (input: ResumeInterruptedActionInput) => Promise<ToolResult<ResumeInterruptedActionData>>;
}

export interface ActionOrchestratorDeps {
  executeIntentWithMaestro?: (
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
  ) => Promise<ToolResult<unknown>>;
}

let ocrFallbackTestHooks: OcrFallbackTestHooks | undefined;
let interruptionGuardTestHooks: InterruptionGuardTestHooks | undefined;

export function setOcrFallbackTestHooksForTesting(hooks: OcrFallbackTestHooks | undefined): void {
  ocrFallbackTestHooks = hooks;
}

export function resetOcrFallbackTestHooksForTesting(): void {
  ocrFallbackTestHooks = undefined;
}

export function setInterruptionGuardTestHooksForTesting(hooks: InterruptionGuardTestHooks | undefined): void {
  interruptionGuardTestHooks = hooks;
}

export function resetInterruptionGuardTestHooksForTesting(): void {
  interruptionGuardTestHooks = undefined;
}

function mergeSignalSummaries(...summaries: Array<LogSummary | undefined>) {
  const merged = new Map<string, { category: string; count: number; sample: string }>();
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

function buildActionOutcomeConfidence(status: ToolResult["status"], stateChanged: boolean): number {
  if (status === "success" && stateChanged) return 0.95;
  if (status === "success") return 0.7;
  if (status === "partial") return 0.45;
  return 0.2;
}

function classifyNetworkReadiness(postState: StateSummary): ActionOutcomeSummary["networkReadinessClass"] {
  if (postState.readiness === "backend_failed_terminal") return "terminal_backend_failed";
  if (postState.readiness === "offline_terminal") return "terminal_offline";
  if (postState.readiness === "degraded_success") return "degraded_success";
  if (postState.readiness === "waiting_network") return "retryable_waiting";
  return "unknown";
}

function classifyStepState(params: {
  finalStatus: ToolResult["status"];
  stateChanged: boolean;
  postState: StateSummary;
  failureCategory?: ActionOutcomeSummary["failureCategory"];
}): OrchestrationStepState {
  if (params.postState.readiness === "backend_failed_terminal" || params.postState.readiness === "offline_terminal") {
    return "terminal_stop";
  }
  if (params.finalStatus === "success" && params.stateChanged) {
    return "checkpoint_candidate";
  }
  if (params.finalStatus === "partial" && params.stateChanged) {
    return "partial_progress";
  }
  if (params.failureCategory === "blocked") {
    return "replay_recommended";
  }
  if (params.postState.readiness === "waiting_network" || params.postState.readiness === "waiting_ui") {
    return "recoverable_waiting";
  }
  if (params.postState.readiness === "degraded_success") {
    return "degraded_but_continue_safe";
  }
  if (params.finalStatus === "success") {
    return "ready_to_execute";
  }
  return "terminal_stop";
}

function computeEvidenceConfidence(params: {
  stateChanged: boolean;
  preState: StateSummary;
  postState: StateSummary;
  evidenceDelta: EvidenceDeltaSummary;
}): EvidenceConfidence {
  if (params.stateChanged && params.preState.screenId !== params.postState.screenId) {
    return "strong";
  }
  if (params.stateChanged || params.preState.readiness !== params.postState.readiness) {
    return "moderate";
  }
  if ((params.evidenceDelta.networkDeltaSummary ?? "").length > 0 || (params.evidenceDelta.runtimeDeltaSummary ?? "").length > 0) {
    return "weak";
  }
  return "none";
}

function retryBackoffClassForStep(stepState: OrchestrationStepState): RetryBackoffClass {
  if (stepState === "recoverable_waiting") return "bounded_wait_ready";
  if (stepState === "partial_progress") return "reason_aware_retry";
  if (stepState === "degraded_but_continue_safe") return "short_ui_settle";
  return "none";
}

function shouldRetryStep(params: {
  stepState: OrchestrationStepState;
  evidenceConfidence: EvidenceConfidence;
  attemptIndex: number;
  maxAttempts: number;
}): boolean {
  const retryableStep = params.stepState === "recoverable_waiting" || params.stepState === "partial_progress" || params.stepState === "degraded_but_continue_safe";
  if (!retryableStep) return false;
  if (params.attemptIndex >= params.maxAttempts) return false;
  if (params.evidenceConfidence === "none" && params.attemptIndex > 1) return false;
  return true;
}

function buildPostActionVerificationTrace(params: {
  stepState: OrchestrationStepState;
  stateChanged: boolean;
  preState: StateSummary;
  postState: StateSummary;
  attempts: number;
}): PostActionVerificationTrace {
  const signals = uniqueNonEmpty([
    params.stateChanged ? "state_changed" : "state_unchanged",
    params.preState.screenId !== params.postState.screenId ? "screen_shift_detected" : undefined,
    params.preState.readiness !== params.postState.readiness ? `readiness:${params.preState.readiness}->${params.postState.readiness}` : undefined,
    params.stepState,
  ], 6);
  return {
    postconditionMet: params.stateChanged || params.stepState === "checkpoint_candidate" || params.stepState === "ready_to_execute",
    attempts: params.attempts,
    verificationSignals: signals,
  };
}

function buildCheckpointDecisionTraceForAction(params: {
  actionId: string;
  stepState: OrchestrationStepState;
  failureCategory?: ActionOutcomeSummary["failureCategory"];
  stateChanged: boolean;
}): PerformActionWithEvidenceData["checkpointDecisionTrace"] {
  if (params.stepState === "checkpoint_candidate" && params.stateChanged) {
    return {
      checkpointCandidate: true,
      checkpointActionId: params.actionId,
      replayRecommended: false,
      replayRefused: false,
      stableBoundaryReason: "Action produced a meaningful state change and can anchor future replay boundaries.",
    };
  }
  if (params.stepState === "replay_recommended" || params.failureCategory === "blocked") {
    return {
      checkpointCandidate: false,
      replayRecommended: true,
      replayRefused: false,
      stableBoundaryReason: "Current step is blocked or drifted; replay from a known checkpoint is preferred over local retry.",
    };
  }
  return {
    checkpointCandidate: false,
    replayRecommended: false,
    replayRefused: false,
    stableBoundaryReason: "No explicit checkpoint/replay decision was required for this action outcome.",
  };
}

function summarizeStateDelta(previous: StateSummary | undefined, current: StateSummary): string[] {
  if (!previous) return [];
  return uniqueNonEmpty([
    previous.appPhase !== current.appPhase ? `appPhase:${previous.appPhase}->${current.appPhase}` : undefined,
    previous.readiness !== current.readiness ? `readiness:${previous.readiness}->${current.readiness}` : undefined,
    JSON.stringify(previous.blockingSignals ?? []) !== JSON.stringify(current.blockingSignals ?? []) ? `blockingSignals:${(previous.blockingSignals ?? []).join(",")}->${(current.blockingSignals ?? []).join(",")}` : undefined,
    previous.screenTitle !== current.screenTitle ? `screenTitle:${previous.screenTitle ?? "unknown"}->${current.screenTitle ?? "unknown"}` : undefined,
    previous.screenId !== current.screenId ? `screenId:${previous.screenId ?? "unknown"}->${current.screenId ?? "unknown"}` : undefined,
  ], 6);
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
  if (!isRecord(data) || !isRecord(data.resolution)) return undefined;
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

function mapIntentToOcrActionKind(action: ActionIntent): OcrFallbackActionType | undefined {
  if (action.actionType === "tap_element") return "tap";
  if (action.actionType === "wait_for_ui") return "assertText";
  return undefined;
}

function buildOcrTargetText(action: ActionIntent): string | undefined {
  return action.text?.trim() || action.contentDesc?.trim();
}

function canAttemptOcrFallback(action: ActionIntent, deterministicResult: ToolResult<unknown>): boolean {
  if (deterministicResult.status === "success") return false;
  if (action.actionType !== "tap_element" && action.actionType !== "wait_for_ui") return false;
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
    return { attempted: false, used: false, status: "failed", reasonCode: REASON_CODES.noMatch, artifacts: [], attempts: 0, retryCount: 0, nextSuggestions: [] };
  }
  const actionKind = mapIntentToOcrActionKind(params.input.action);
  const targetText = buildOcrTargetText(params.input.action);
  if (!actionKind || !targetText) {
    return { attempted: false, used: false, status: "failed", reasonCode: REASON_CODES.noMatch, artifacts: [], attempts: 0, retryCount: 0, nextSuggestions: [] };
  }

  const policyDecision = shouldUseOcrFallback({ action: actionKind, deterministicFailed: true, semanticFailed: true, state: params.preStateSummary }, DEFAULT_OCR_FALLBACK_POLICY);
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
  const screenshotExecutor = ocrFallbackTestHooks?.takeScreenshot ?? takeScreenshotWithRuntime;
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
  const screenshotFreshDecision = shouldUseOcrFallback({ action: actionKind, deterministicFailed: true, semanticFailed: true, state: params.preStateSummary, screenshotCapturedAt: nowIsoString }, DEFAULT_OCR_FALLBACK_POLICY);
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
    ocrOutput = await ocrProvider.extractTextRegions({ screenshotPath, platform: params.platform, languageHints: ["en-US", "zh-Hans"] });
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

  let resolverResult = resolveTextTarget({ targetText, blocks: ocrOutput.blocks, maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail });
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
    const tapExecutor = ocrFallbackTestHooks?.tap ?? tapWithMaestroTool;
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
      resolverResult = resolveTextTarget({ targetText, blocks: ocrOutput.blocks, fuzzy: false, maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail });
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
  if (!preState && !postState) return "State transition is unknown.";
  if (!preState && postState) return `Observed new state ${postState.screenTitle ?? postState.appPhase}.`;
  if (preState && !postState) return `Lost state visibility after action from ${preState.screenTitle ?? preState.appPhase}.`;
  const changes: string[] = [];
  if (preState?.screenTitle !== postState?.screenTitle) changes.push(`screen ${preState?.screenTitle ?? "<unknown>"} -> ${postState?.screenTitle ?? "<unknown>"}`);
  if (preState?.appPhase !== postState?.appPhase) changes.push(`phase ${preState?.appPhase ?? "unknown"} -> ${postState?.appPhase ?? "unknown"}`);
  if (preState?.readiness !== postState?.readiness) changes.push(`readiness ${preState?.readiness ?? "unknown"} -> ${postState?.readiness ?? "unknown"}`);
  const preBlocking = preState?.blockingSignals.join(",") ?? "";
  const postBlocking = postState?.blockingSignals.join(",") ?? "";
  if (preBlocking !== postBlocking) changes.push(`blocking [${preBlocking}] -> [${postBlocking}]`);
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
  const networkDeltaSummary = params.preState && params.postState && params.preState.readiness !== params.postState.readiness
    ? `Network/readiness changed: ${params.preState.readiness} -> ${params.postState.readiness}`
    : params.postState?.readiness === "waiting_network"
      ? "Network/readiness remains in waiting_network state."
      : params.postState?.readiness === "backend_failed_terminal"
        ? "Network/readiness is terminal: backend_failed_terminal."
        : params.postState?.readiness === "offline_terminal"
          ? "Network/readiness is terminal: offline_terminal."
          : undefined;
  return {
    uiDiffSummary: summarizeStateTransition(params.preState, params.postState),
    logDeltaSummary: newSignals.length > 0 ? `New runtime signals: ${newSignals.slice(0, 3).join(" | ")}` : "No new high-confidence runtime signals after action.",
    runtimeDeltaSummary: newSignals.length > 0 ? newSignals.slice(0, 3).join(" | ") : "No new runtime delta detected.",
    networkDeltaSummary,
  };
}

function isInterruptionGuardPassed(status: ResolveInterruptionData["status"] | undefined): boolean {
  return status === "resolved" || status === "not_needed";
}

export async function performActionWithEvidenceWithMaestro(
  input: PerformActionWithEvidenceInput,
  deps: ActionOrchestratorDeps = {},
): Promise<ToolResult<PerformActionWithEvidenceData>> {
  const startTime = Date.now();
  const actionId = `action-${randomUUID()}`;
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
          actionId,
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

  const executeIntent = deps.executeIntentWithMaestro;
  if (!executeIntent) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: Boolean(sessionRecord),
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.1,
          outcome: "unknown",
        },
        evidenceDelta: { uiDiffSummary: "Action executor is not configured." },
        lowLevelStatus: "failed",
        lowLevelReasonCode: REASON_CODES.configurationError,
      },
      nextSuggestions: ["Action executor is unavailable in current runtime context."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const resolveInterruptionExecutor = interruptionGuardTestHooks?.resolveInterruption ?? resolveInterruptionWithMaestro;
  const resumeInterruptionExecutor = interruptionGuardTestHooks?.resumeInterruptedAction
    ?? ((resumeInput: ResumeInterruptedActionInput) => resumeInterruptedActionWithMaestro(resumeInput, { executeIntentWithMaestro: executeIntent }));

  const preActionInterruption = await resolveInterruptionExecutor({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    actionId,
    checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
    dryRun: input.dryRun,
  });
  if (!isInterruptionGuardPassed(preActionInterruption.data.status)) {
    const guardReasonCode = preActionInterruption.reasonCode === REASON_CODES.ok ? REASON_CODES.interruptionResolutionFailed : preActionInterruption.reasonCode;
    return {
      status: "failed",
      reasonCode: guardReasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: preActionInterruption.artifacts,
      data: {
        sessionRecordFound: Boolean(sessionRecord),
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.2,
          failureCategory: "blocked",
          outcome: "failed",
        },
        evidenceDelta: {
          uiDiffSummary: `Action was blocked by unresolved interruption (${preActionInterruption.data.status}).`,
        },
        lowLevelStatus: "failed",
        lowLevelReasonCode: guardReasonCode,
        preActionInterruption: preActionInterruption.data,
      },
      nextSuggestions: preActionInterruption.nextSuggestions.length > 0
        ? preActionInterruption.nextSuggestions
        : ["Resolve interruption manually or adjust policy/signature rules before retrying the action."],
    };
  }

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
  const lowLevelResult = await executeIntent({
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

  let actionStatus = ocrFallbackResult?.attempted ? ocrFallbackResult.status : lowLevelResult.status;
  let actionReasonCode = ocrFallbackResult?.attempted ? ocrFallbackResult.reasonCode : lowLevelResult.reasonCode;
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
    finalStatus: actionStatus,
    finalReasonCode: actionReasonCode,
    preStateSummary,
    postStateSummary,
    lowLevelResult,
    stateChanged,
    targetResolution,
  });
  let stepState = classifyStepState({
    finalStatus: actionStatus,
    stateChanged,
    postState: postStateSummary,
    failureCategory,
  });
  let evidenceConfidence = computeEvidenceConfidence({
    stateChanged,
    preState: preStateSummary,
    postState: postStateSummary,
    evidenceDelta,
  });
  const maxRetryAttempts = stepState === "recoverable_waiting" || stepState === "partial_progress" ? 3 : stepState === "degraded_but_continue_safe" ? 2 : 1;
  let retryAttemptIndex = 1;
  let retryStopReason: string | undefined;

  while (shouldRetryStep({ stepState, evidenceConfidence, attemptIndex: retryAttemptIndex, maxAttempts: maxRetryAttempts })) {
    const retryPostStateResult = await getScreenSummaryWithMaestro({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      includeDebugSignals: input.includeDebugSignals ?? true,
      dryRun: input.dryRun,
    });
    retryAttemptIndex += 1;
    postStateSummary = retryPostStateResult.data.screenSummary;
    stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
    evidenceDelta = buildActionEvidenceDelta({
      preState: preStateSummary,
      postState: postStateSummary,
      preLogSummary: preStateResult.data.logSummary,
      postLogSummary: retryPostStateResult.data.logSummary,
      preCrashSummary: preStateResult.data.crashSummary,
      postCrashSummary: retryPostStateResult.data.crashSummary,
    });
    failureCategory = classifyActionFailureCategory({
      finalStatus: actionStatus,
      finalReasonCode: actionReasonCode,
      preStateSummary,
      postStateSummary,
      lowLevelResult,
      stateChanged,
      targetResolution,
    });
    stepState = classifyStepState({
      finalStatus: actionStatus,
      stateChanged,
      postState: postStateSummary,
      failureCategory,
    });
    evidenceConfidence = computeEvidenceConfidence({
      stateChanged,
      preState: preStateSummary,
      postState: postStateSummary,
      evidenceDelta,
    });
    if (stateChanged || stepState === "checkpoint_candidate") {
      break;
    }
  }

  if (!stateChanged && retryAttemptIndex >= maxRetryAttempts && (stepState === "recoverable_waiting" || stepState === "partial_progress" || stepState === "degraded_but_continue_safe")) {
    retryStopReason = "retry_budget_exhausted_without_state_change";
    actionStatus = "failed";
    actionReasonCode = postStateSummary.readiness === "waiting_network"
      ? REASON_CODES.networkWaitRetryExhausted
      : REASON_CODES.retryExhaustedNoStateChange;
  }

  if (postStateSummary.readiness === "backend_failed_terminal") {
    actionStatus = "failed";
    actionReasonCode = REASON_CODES.networkBackendTerminal;
    stepState = "terminal_stop";
    retryStopReason = "backend_terminal_stop_early";
  }
  if (postStateSummary.readiness === "offline_terminal") {
    actionStatus = "failed";
    actionReasonCode = REASON_CODES.networkOfflineTerminal;
    stepState = "terminal_stop";
    retryStopReason = "offline_terminal_stop_early";
  }

  const retryDecisionTrace: RetryDecisionTrace = {
    stepState,
    evidenceConfidence,
    retryAllowed: shouldRetryStep({ stepState, evidenceConfidence, attemptIndex: retryAttemptIndex, maxAttempts: maxRetryAttempts }),
    maxAttempts: maxRetryAttempts,
    attemptIndex: retryAttemptIndex,
    backoffClass: retryBackoffClassForStep(stepState),
    stateChangeRequired: true,
    stopReason: retryStopReason,
  };

  const postActionVerificationTrace = buildPostActionVerificationTrace({
    stepState,
    stateChanged,
    preState: preStateSummary,
    postState: postStateSummary,
    attempts: retryAttemptIndex,
  });
  const checkpointDecisionTrace = buildCheckpointDecisionTraceForAction({
    actionId,
    stepState,
    failureCategory,
    stateChanged,
  });

  let postActionRefreshAttempted = false;
  let refreshedPostStateSummary: StateSummary | undefined;
  if (shouldAttemptPostActionRefresh({ failureCategory, finalStatus: actionStatus, stateChanged })) {
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
        finalStatus: actionStatus,
        finalReasonCode: actionReasonCode,
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
    retryCount: (ocrFallbackResult?.retryCount ?? 0) + Math.max(0, retryAttemptIndex - 1),
    stepState,
    evidenceConfidence,
    networkReadinessClass: classifyNetworkReadiness(postStateSummary),
    postconditionMet: postActionVerificationTrace.postconditionMet,
    targetQuality: classifyTargetQuality({ failureCategory, finalStatus: actionStatus, fallbackUsed, stateChanged }),
    failureCategory,
    confidence: ocrFallbackResult?.ocrEvidence?.ocrConfidence ?? buildActionOutcomeConfidence(actionStatus, stateChanged),
    ocrEvidence: ocrFallbackResult?.ocrEvidence,
    outcome: actionStatus === "success" ? "success" : actionStatus === "partial" ? "partial" : "failed",
  };

  const evidence = [...(preStateResult.data.evidence ?? []), ...(postStateResult.data.evidence ?? [])];
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
  const retryTimelineMarkers = uniqueNonEmpty([
    `step_state:${stepState}`,
    `evidence_confidence:${evidenceConfidence}`,
    retryStopReason,
  ], 6);
  if (sessionRecord && retryTimelineMarkers.length > 0) {
    await persistSessionState(repoRoot, input.sessionId, postStateSummary, {
      timestamp: new Date().toISOString(),
      type: "action_retry_decision",
      eventType: "retry_decision",
      actionId,
      layer: "action",
      detail: retryTimelineMarkers.join("; "),
      summary: retryDecisionTrace.retryAllowed ? "retry_allowed" : "retry_stopped",
      artifactRefs: artifacts,
      stateSummary: postStateSummary,
    }, artifacts);
  }
  if (outcome.outcome === "success") {
    await recordBaselineEntry(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      actionType: outcome.actionType,
      screenId: outcome.postState?.screenId ?? outcome.preState?.screenId,
      updatedAt: new Date().toISOString(),
    });
  }

  const actionabilityReview = buildActionabilityReview({
    preStateSummary,
    postStateSummary,
    latestKnownState: sessionRecord?.session.latestStateSummary,
    lowLevelStatus: actionStatus,
    lowLevelReasonCode: actionReasonCode,
    targetResolution,
    stateChanged,
  });
  if (postActionRefreshAttempted) {
    const refreshSignal = refreshedPostStateSummary && JSON.stringify(postStateResult.data.screenSummary) !== JSON.stringify(refreshedPostStateSummary)
      ? "post_action_refresh_detected_additional_state_change"
      : "post_action_refresh_no_additional_change";
    actionabilityReview.unshift(refreshSignal);
    if (refreshSignal === "post_action_refresh_no_additional_change") {
      actionabilityReview.unshift("refresh_signal:noop");
      actionabilityReview.unshift(actionabilityReview.some((item) => item.startsWith("stale_state_candidate:"))
        ? "retry_tier_code:refresh_context_stale_state"
        : "retry_tier_code:refresh_context_noop");
    }
  }

  const retryRecommendationTier = classifyRetryRecommendationTier({
    finalStatus: actionStatus,
    stateChanged,
    postActionRefreshAttempted,
    actionabilityReview,
    failureCategory,
    ocrFallbackSuggestions: ocrFallbackResult?.nextSuggestions,
  });
  const retryRecommendation = buildRetryRecommendation({
    tier: retryRecommendationTier ?? "none",
    failureCategory,
    actionabilityReview,
  });

  const persistedAction = await persistActionRecord(repoRoot, {
    actionId,
    sessionId: input.sessionId,
    intent: input.action,
    outcome,
    retryRecommendationTier,
    retryRecommendation,
    retryDecisionTrace,
    postActionVerificationTrace,
    checkpointDecisionTrace,
    actionabilityReview,
    evidenceDelta,
    evidence,
    lowLevelStatus: actionStatus,
    lowLevelReasonCode: actionReasonCode,
    updatedAt: new Date().toISOString(),
  });
  let allArtifacts = persistedAction.relativePath ? [persistedAction.relativePath, ...artifacts] : artifacts;

  const postActionInterruption = await resolveInterruptionExecutor({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    actionId,
    checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
    dryRun: input.dryRun,
  });

  let finalToolStatus = actionStatus;
  let finalToolReasonCode = actionReasonCode;
  let finalOutcome = outcome;
  let finalActionabilityReview = [...actionabilityReview];
  let finalLowLevelStatus = actionStatus;
  let finalLowLevelReasonCode = actionReasonCode;

  allArtifacts = Array.from(new Set([...allArtifacts, ...postActionInterruption.artifacts]));

  if (!isInterruptionGuardPassed(postActionInterruption.data.status)) {
    finalToolStatus = "failed";
    finalToolReasonCode = postActionInterruption.reasonCode === REASON_CODES.ok
      ? REASON_CODES.interruptionResolutionFailed
      : postActionInterruption.reasonCode;
    finalLowLevelStatus = "failed";
    finalLowLevelReasonCode = finalToolReasonCode;
    finalOutcome = {
      ...finalOutcome,
      outcome: "failed",
      failureCategory: "blocked",
      confidence: Math.min(finalOutcome.confidence ?? 0.5, 0.4),
    };
    finalActionabilityReview.unshift(`post_interruption_status:${postActionInterruption.data.status}`);
  } else if (postActionInterruption.data.status === "resolved") {
    const resumed = await resumeInterruptionExecutor({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
      dryRun: input.dryRun,
    });
    allArtifacts = Array.from(new Set([...allArtifacts, ...resumed.artifacts]));
    if (!resumed.data.resumed) {
      finalToolStatus = "failed";
      finalToolReasonCode = resumed.reasonCode === REASON_CODES.ok
        ? REASON_CODES.interruptionRecoveryStateDrift
        : resumed.reasonCode;
      finalLowLevelStatus = "failed";
      finalLowLevelReasonCode = finalToolReasonCode;
      finalOutcome = {
        ...finalOutcome,
        outcome: "failed",
        failureCategory: "blocked",
      };
      finalActionabilityReview.unshift("post_interruption_resume_failed");
    }
  }

  if (finalToolStatus !== actionStatus || finalToolReasonCode !== actionReasonCode) {
    const persistedAfterInterruption = await persistActionRecord(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      intent: input.action,
      outcome: finalOutcome,
      retryRecommendationTier,
      retryRecommendation,
      retryDecisionTrace,
      postActionVerificationTrace,
      checkpointDecisionTrace,
      actionabilityReview: finalActionabilityReview,
      evidenceDelta,
      evidence,
      lowLevelStatus: finalLowLevelStatus,
      lowLevelReasonCode: finalLowLevelReasonCode,
      updatedAt: new Date().toISOString(),
    });
    if (persistedAfterInterruption.relativePath) {
      allArtifacts = Array.from(new Set([persistedAfterInterruption.relativePath, ...allArtifacts]));
    }
  }

  return {
    status: finalToolStatus,
    reasonCode: finalToolReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: allArtifacts,
    data: {
      sessionRecordFound: Boolean(sessionRecord),
      outcome: finalOutcome,
      evidenceDelta,
      preStateSummary,
      postStateSummary,
      postActionRefreshAttempted: postActionRefreshAttempted || undefined,
      retryRecommendationTier,
      retryRecommendation,
      retryDecisionTrace,
      postActionVerificationTrace,
      checkpointDecisionTrace,
      timelineDecisionMarkers: uniqueNonEmpty([
        ...retryTimelineMarkers,
        postActionInterruption.data.status !== "not_needed" ? `post_interruption:${postActionInterruption.data.status}` : undefined,
      ], 8),
      actionabilityReview: finalActionabilityReview,
      lowLevelStatus: finalLowLevelStatus,
      lowLevelReasonCode: finalLowLevelReasonCode,
      evidence,
      sessionAuditPath: persistedSessionState?.auditPath,
      preActionInterruption: preActionInterruption.data,
      postActionInterruption: postActionInterruption.data,
    },
    nextSuggestions: buildRetryRecommendations({
      finalStatus: finalToolStatus,
      stateChanged,
      postActionRefreshAttempted,
      actionabilityReview: finalActionabilityReview,
      failureCategory: finalOutcome.failureCategory,
      ocrFallbackSuggestions: ocrFallbackResult?.nextSuggestions,
    }),
  };
}
