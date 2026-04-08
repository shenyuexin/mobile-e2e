import type {
  ActionOutcomeSummary,
  ActionProgressMarker,
  EvidenceConfidence,
  EvidenceDeltaSummary,
  LogSummary,
  NetworkReadinessProbe,
  NetworkRecoveryStrategy,
  OrchestrationStepState,
  PerformActionWithEvidenceData,
  PostconditionStatus,
  PostActionVerificationTrace,
  ReasonCode,
  RetryBackoffClass,
  StateChangeCategory,
  StateSummary,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

export function mergeSignalSummaries(...summaries: Array<LogSummary | undefined>) {
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

export function uniqueNonEmpty(values: Array<string | undefined>, limit = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

export function buildActionOutcomeConfidence(status: ToolResult["status"], stateChanged: boolean): number {
  if (status === "success" && stateChanged) return 0.95;
  if (status === "success") return 0.55;
  if (status === "partial") return 0.45;
  return 0.2;
}

export function classifyStateChangeCategory(params: {
  stateChanged: boolean;
  preState: StateSummary;
  postState: StateSummary;
}): StateChangeCategory {
  if (!params.stateChanged) {
    return "no_material_change";
  }
  if (params.preState.screenId !== params.postState.screenId) {
    return "screen_transition";
  }
  if (params.preState.screenTitle !== params.postState.screenTitle) {
    return "screen_title_transition";
  }
  if (params.preState.readiness !== params.postState.readiness) {
    return "readiness_transition";
  }
  if (JSON.stringify(params.preState.blockingSignals ?? []) !== JSON.stringify(params.postState.blockingSignals ?? [])) {
    return "blocking_signal_transition";
  }
  return "same_screen_delta";
}

export function classifyPostconditionStatus(params: {
  actionType: ActionOutcomeSummary["actionType"];
  finalStatus: ToolResult["status"];
  stateChanged: boolean;
  stepState: OrchestrationStepState;
  postState: StateSummary;
}): PostconditionStatus {
  if (params.finalStatus === "success" && params.stateChanged) {
    return "met";
  }
  if (params.actionType === "wait_for_ui" && params.finalStatus === "success" && params.postState.readiness === "ready") {
    return "met";
  }
  if (params.finalStatus === "partial" && params.stateChanged) {
    return "partial";
  }
  if (params.finalStatus === "success" && params.stepState === "ready_to_execute") {
    return "unknown";
  }
  return "not_met";
}

export function classifyActionProgressMarker(params: {
  finalStatus: ToolResult["status"];
  stateChanged: boolean;
  postconditionStatus: PostconditionStatus;
}): ActionProgressMarker {
  if (params.finalStatus === "success" && params.stateChanged) {
    return "full";
  }
  if (params.finalStatus === "partial" && params.stateChanged) {
    return "partial";
  }
  if (params.finalStatus === "success" && !params.stateChanged && params.postconditionStatus === "unknown") {
    return "ambiguous";
  }
  return "none";
}

export function classifyNetworkReadiness(postState: StateSummary): ActionOutcomeSummary["networkReadinessClass"] {
  if (postState.readiness === "backend_failed_terminal") return "terminal_backend_failed";
  if (postState.readiness === "offline_terminal") return "terminal_offline";
  if (postState.readiness === "degraded_success") return "degraded_success";
  if (postState.readiness === "waiting_network") return "retryable_waiting";
  return "unknown";
}

export function classifyStepState(params: {
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

export function computeEvidenceConfidence(params: {
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

export function retryBackoffClassForStep(stepState: OrchestrationStepState): RetryBackoffClass {
  if (stepState === "recoverable_waiting") return "bounded_wait_ready";
  if (stepState === "partial_progress") return "reason_aware_retry";
  if (stepState === "degraded_but_continue_safe") return "short_ui_settle";
  return "none";
}

export function shouldRetryStep(params: {
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

export function buildPostActionVerificationTrace(params: {
  actionType: ActionOutcomeSummary["actionType"];
  finalStatus: ToolResult["status"];
  stepState: OrchestrationStepState;
  stateChanged: boolean;
  preState: StateSummary;
  postState: StateSummary;
  attempts: number;
}): PostActionVerificationTrace {
  const postconditionStatus = classifyPostconditionStatus({
    actionType: params.actionType,
    finalStatus: params.finalStatus,
    stateChanged: params.stateChanged,
    stepState: params.stepState,
    postState: params.postState,
  });
  const progressMarker = classifyActionProgressMarker({
    finalStatus: params.finalStatus,
    stateChanged: params.stateChanged,
    postconditionStatus,
  });
  const signals = uniqueNonEmpty([
    params.stateChanged ? "state_changed" : "state_unchanged",
    params.preState.screenId !== params.postState.screenId ? "screen_shift_detected" : undefined,
    params.preState.readiness !== params.postState.readiness ? `readiness:${params.preState.readiness}->${params.postState.readiness}` : undefined,
    `postcondition_status:${postconditionStatus}`,
    `progress_marker:${progressMarker}`,
    params.stepState,
  ], 6);
  return {
    postconditionMet: postconditionStatus === "met",
    postconditionStatus,
    progressMarker,
    attempts: params.attempts,
    verificationSignals: signals,
  };
}

export function buildCheckpointDecisionTraceForAction(params: {
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

export function summarizeStateDelta(previous: StateSummary | undefined, current: StateSummary): string[] {
  if (!previous) return [];
  return uniqueNonEmpty([
    previous.appPhase !== current.appPhase ? `appPhase:${previous.appPhase}->${current.appPhase}` : undefined,
    previous.readiness !== current.readiness ? `readiness:${previous.readiness}->${current.readiness}` : undefined,
    JSON.stringify(previous.blockingSignals ?? []) !== JSON.stringify(current.blockingSignals ?? []) ? `blockingSignals:${(previous.blockingSignals ?? []).join(",")}->${(current.blockingSignals ?? []).join(",")}` : undefined,
    previous.screenTitle !== current.screenTitle ? `screenTitle:${previous.screenTitle ?? "unknown"}->${current.screenTitle ?? "unknown"}` : undefined,
    previous.screenId !== current.screenId ? `screenId:${previous.screenId ?? "unknown"}->${current.screenId ?? "unknown"}` : undefined,
  ], 6);
}

export function buildActionabilityReview(params: {
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

export function classifyActionFailureCategory(params: {
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

export function classifyTargetQuality(params: { failureCategory?: ActionOutcomeSummary["failureCategory"]; finalStatus: ToolResult["status"]; fallbackUsed: boolean; stateChanged: boolean }): ActionOutcomeSummary["targetQuality"] {
  if (params.failureCategory === "selector_missing" || params.failureCategory === "selector_ambiguous") {
    return "low";
  }
  if (params.finalStatus === "success" && params.stateChanged && !params.fallbackUsed) {
    return "high";
  }
  return "medium";
}

export function shouldAttemptPostActionRefresh(params: {
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

export function buildRetryRecommendations(params: {
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
  const manualHandoffMarker = params.actionabilityReview.find((item) => item.startsWith("manual_handoff_required:"));
  const manualHandoffReason = manualHandoffMarker?.replace("manual_handoff_required:", "");
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

  if (manualHandoffMarker) {
    return [
      "Do not retry this action automatically; the runtime detected a manual handoff boundary.",
      `Call request_manual_handoff before continuing${manualHandoffReason ? ` (reason: ${manualHandoffReason})` : ""}.`,
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

export function classifyRetryRecommendationTier(params: {
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
  if (params.actionabilityReview.some((item) => item.startsWith("manual_handoff_required:"))) {
    return "handoff_required";
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

export function buildRetryRecommendation(params: {
  tier: NonNullable<PerformActionWithEvidenceData["retryRecommendationTier"]>;
  failureCategory?: ActionOutcomeSummary["failureCategory"];
  actionabilityReview: string[];
}): NonNullable<PerformActionWithEvidenceData["retryRecommendation"]> {
  if (params.tier === "handoff_required") {
    const handoffReason = params.actionabilityReview.find((item) => item.startsWith("manual_handoff_required:"))?.replace("manual_handoff_required:", "");
    return {
      tier: params.tier,
      reason: handoffReason
        ? `The current screen requires human intervention before automation can continue (${handoffReason}).`
        : "The current screen requires human intervention before automation can continue.",
      suggestedAction: "Record the checkpoint with request_manual_handoff, let the operator complete the step on-device, then reacquire screen state before resuming.",
    };
  }
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

export function readResolutionSignal(data: unknown): {
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

export function summarizeStateTransition(preState?: StateSummary, postState?: StateSummary): string {
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

export function buildActionEvidenceDelta(params: {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function classifyNetworkRecoveryStrategy(
  probe: NetworkReadinessProbe,
  _failureCategory?: string,
): NetworkRecoveryStrategy {
  // a. No network connectivity
  if (!probe.connected) {
    return {
      strategy: "toggle_airplane_mode",
      reason: "No network connectivity detected",
      maxRetries: 1,
    };
  }

  // b. High latency (> 1000ms)
  if (probe.latencyMs && probe.latencyMs > 1000) {
    return {
      strategy: "retry_extended_timeout",
      reason: "High latency detected",
      timeoutMs: 30000,
    };
  }

  // c. DNS resolution failed
  if (!probe.dnsOk) {
    return {
      strategy: "check_network_config",
      reason: "DNS resolution failed",
    };
  }

  // d. Backend unreachable but network is up
  if (!probe.backendReachable && probe.connected) {
    return {
      strategy: "wait_and_retry",
      reason: "Backend unreachable but network is up — likely server-side issue",
      maxRetries: 3,
    };
  }

  // e. Connected but slow (latency > 500ms)
  if (probe.connected && probe.latencyMs && probe.latencyMs > 500) {
    return {
      strategy: "bounded_wait_for_backend",
      reason: "Slow network, bounded wait recommended",
      timeoutMs: 15000,
    };
  }

  // f. Default: network is healthy
  return {
    strategy: "none",
    reason: "Network appears healthy",
  };
}
