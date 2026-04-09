import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { loadSessionAuditRecord, loadSessionRecord, persistSessionState } from "@mobile-e2e-mcp/core";
import {
  type CompareAgainstBaselineData,
  type CompareAgainstBaselineInput,
  REASON_CODES,
  type AutoRemediationResult,
  type FailureAttribution,
  type OrchestrationStepState,
  type PerformActionWithEvidenceData,
  type PerformActionWithEvidenceInput,
  type RankFailureCandidatesData,
  type RankFailureCandidatesInput,
  type RecoverToKnownStateData,
  type RecoverToKnownStateInput,
  type ReplayLastStablePathData,
  type ReplayLastStablePathInput,
  type SessionTimelineEvent,
  type StateSummary,
  type SuggestKnownRemediationData,
  type SuggestKnownRemediationInput,
  type ToolResult,
  TOOL_NAMES,
} from "@mobile-e2e-mcp/contracts";
import type { ExplainLastFailureData, ExplainLastFailureInput } from "@mobile-e2e-mcp/contracts";

interface AutoRemediationDependencies {
  performAction: (input: PerformActionWithEvidenceInput) => Promise<ToolResult<PerformActionWithEvidenceData>>;
  compareAgainstBaseline?: (input: CompareAgainstBaselineInput) => Promise<ToolResult<CompareAgainstBaselineData>>;
  explainLastFailure: (input: ExplainLastFailureInput) => Promise<ToolResult<ExplainLastFailureData>>;
  rankFailureCandidates: (input: RankFailureCandidatesInput) => Promise<ToolResult<RankFailureCandidatesData>>;
  suggestKnownRemediation: (input: SuggestKnownRemediationInput) => Promise<ToolResult<SuggestKnownRemediationData>>;
  recoverToKnownState: (input: RecoverToKnownStateInput) => Promise<ToolResult<RecoverToKnownStateData>>;
  replayLastStablePath: (input: ReplayLastStablePathInput) => Promise<ToolResult<ReplayLastStablePathData>>;
}

const HIGH_RISK_KEYWORDS = ["pay", "payment", "purchase", "buy", "checkout", "order", "delete", "remove", "send", "submit", "confirm"];

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function buildResult(
  base: ToolResult<PerformActionWithEvidenceData>,
  autoRemediation: AutoRemediationResult,
): ToolResult<PerformActionWithEvidenceData> {
  const stateMachineStatus = autoRemediation.stateMachineStatus
    ?? deriveStateMachineStatus({
      base,
      stopReason: autoRemediation.stopReason,
      selectedRecovery: autoRemediation.selectedRecovery,
    });
  const stateMachineTrace = autoRemediation.stateMachineTrace
    ?? buildStateMachineTrace({
      base,
      stopReason: autoRemediation.stopReason,
      selectedRecovery: autoRemediation.selectedRecovery,
    });
  return {
    ...base,
    data: {
      ...base.data,
      autoRemediation: {
        ...autoRemediation,
        stateMachineStatus,
        stateMachineTrace,
      },
    },
  };
}

function deriveStateMachineStatus(params: {
  base: ToolResult<PerformActionWithEvidenceData>;
  stopReason: AutoRemediationResult["stopReason"];
  selectedRecovery?: AutoRemediationResult["selectedRecovery"];
}): OrchestrationStepState {
  if (["retry_exhausted_no_state_change", "backend_terminal", "offline_terminal", "manual_handoff_required", "high_risk_replay"].includes(params.stopReason)) {
    return "terminal_stop";
  }
  if (params.selectedRecovery === "wait_until_ready" || params.base.data.outcome.failureCategory === "waiting") {
    return "recoverable_waiting";
  }
  if (params.selectedRecovery === "replay_last_successful_action") {
    return "replay_recommended";
  }
  if (params.base.data.outcome.progressMarker === "partial") {
    return "partial_progress";
  }
  if (params.stopReason === "action_succeeded") {
    return "ready_to_execute";
  }
  return params.base.data.outcome.stepState ?? "terminal_stop";
}

function buildStateMachineTrace(params: {
  base: ToolResult<PerformActionWithEvidenceData>;
  stopReason: AutoRemediationResult["stopReason"];
  selectedRecovery?: AutoRemediationResult["selectedRecovery"];
}): string[] {
  return uniqueStrings([
    params.base.data.outcome.stepState ? `step_state:${params.base.data.outcome.stepState}` : undefined,
    params.base.data.retryDecisionTrace?.stopReason ? `retry_stop:${params.base.data.retryDecisionTrace.stopReason}` : undefined,
    params.stopReason === "retry_exhausted_no_state_change" ? "retry_stop:retry_exhausted_no_state_change" : undefined,
    params.base.data.outcome.failureCategory === "waiting" ? "waiting_state_detected" : undefined,
    params.selectedRecovery ? `selected_recovery:${params.selectedRecovery}` : undefined,
    params.base.data.checkpointDecisionTrace?.checkpointActionId ? `checkpoint:${params.base.data.checkpointDecisionTrace.checkpointActionId}` : undefined,
    `stop_reason:${params.stopReason}`,
  ]);
}

function hasExistingAutoRemediationAttempt(actionId: string, timeline: SessionTimelineEvent[]): boolean {
  return timeline.some((event) => event.actionId === actionId && event.type.startsWith("auto_remediation_"));
}

function buildAutoRemediationEvent(params: {
  type: "auto_remediation_triggered" | "auto_remediation_succeeded" | "auto_remediation_stopped";
  actionId: string;
  detail: string;
  stateSummary?: StateSummary;
  artifacts: string[];
  trace?: string[];
}): SessionTimelineEvent {
  return {
    timestamp: new Date().toISOString(),
    type: params.type,
    eventType: "auto_remediation",
    actionId: params.actionId,
    layer: "action",
    detail: params.trace && params.trace.length > 0 ? `${params.detail} [${params.trace.join("; ")}]` : params.detail,
    summary: params.type.replaceAll("_", " "),
    artifactRefs: params.artifacts,
    stateSummary: params.stateSummary,
  };
}

function canReplaySafely(input: PerformActionWithEvidenceInput): boolean {
  const haystacks = [
    input.action.resourceId,
    input.action.contentDesc,
    input.action.text,
    input.action.value,
    input.action.appId,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return !haystacks.some((value) => HIGH_RISK_KEYWORDS.some((keyword) => value.includes(keyword)));
}

function buildMetadataStop(auto: {
  stopReason: AutoRemediationResult["stopReason"];
  stopDetail: string;
  attempted?: boolean;
}, base: ToolResult<PerformActionWithEvidenceData>, seed: Omit<AutoRemediationResult, "stopReason" | "stopDetail" | "attempted">): ToolResult<PerformActionWithEvidenceData> {
  const stateMachineStatus = deriveStateMachineStatus({ base, stopReason: auto.stopReason });
  const stateMachineTrace = buildStateMachineTrace({ base, stopReason: auto.stopReason });
  return buildResult(base, {
    ...seed,
    attempted: auto.attempted ?? false,
    stopReason: auto.stopReason,
    stopDetail: auto.stopDetail,
    stateMachineStatus,
    stateMachineTrace,
  });
}

function classifyMetadataDrivenStop(base: ToolResult<PerformActionWithEvidenceData>): { stopReason: AutoRemediationResult["stopReason"]; stopDetail: string } | undefined {
  const manualHandoffReason = base.data.manualHandoffReason
    ?? base.data.postStateSummary?.manualHandoff?.reason
    ?? base.data.preStateSummary?.manualHandoff?.reason;
  if (base.data.manualHandoffRequired || base.data.postStateSummary?.manualHandoff?.required || base.data.preStateSummary?.manualHandoff?.required) {
    return {
      stopReason: "manual_handoff_required",
      stopDetail: manualHandoffReason
        ? `The runtime detected a manual handoff boundary (${manualHandoffReason}), so bounded auto-remediation stops before recovery or replay.`
        : "The runtime detected a manual handoff boundary, so bounded auto-remediation stops before recovery or replay.",
    };
  }
  const readiness = base.data.postStateSummary?.readiness;
  if (readiness === "backend_failed_terminal") {
    return {
      stopReason: "backend_terminal",
      stopDetail: "The runtime detected a backend-terminal state, so optimistic auto-remediation is refused.",
    };
  }
  if (readiness === "offline_terminal") {
    return {
      stopReason: "offline_terminal",
      stopDetail: "The runtime detected an offline-terminal state, so optimistic auto-remediation is refused.",
    };
  }
  const failureCategory = base.data.outcome.failureCategory;
  if (failureCategory === "selector_missing") {
    return {
      stopReason: "selector_missing",
      stopDetail: "The action failed because no target matched the selector, so remediation should refine the locator instead of recovering state.",
    };
  }
  if (failureCategory === "selector_ambiguous") {
    return {
      stopReason: "selector_ambiguous",
      stopDetail: "The action failed because multiple targets matched the selector, so remediation should narrow the locator before retrying.",
    };
  }
  if (failureCategory === "blocked") {
    return {
      stopReason: "blocked_by_state",
      stopDetail: "The action failed while the screen was blocked by interruption/error state, so auto-remediation stops at suggestion-only.",
    };
  }
  if (base.data.outcome.targetQuality === "low") {
    return {
      stopReason: "low_target_quality",
      stopDetail: "The target quality is too low for bounded remediation to safely continue.",
    };
  }
  if (base.reasonCode === REASON_CODES.retryExhaustedNoStateChange || base.reasonCode === REASON_CODES.networkWaitRetryExhausted) {
    return {
      stopReason: "retry_exhausted_no_state_change",
      stopDetail: "Retry budget was exhausted without meaningful state change, so bounded remediation stops.",
    };
  }
  return undefined;
}

function chooseRecovery(params: {
  input: PerformActionWithEvidenceInput;
  attribution: FailureAttribution;
  stateAfter?: StateSummary;
  remediationSuggestions: string[];
  baselineComparison?: CompareAgainstBaselineData["comparison"];
}): { selectedRecovery?: typeof TOOL_NAMES.recoverToKnownState | typeof TOOL_NAMES.replayLastStablePath; stopReason: AutoRemediationResult["stopReason"]; stopDetail: string } {
  const waitingLike = params.stateAfter?.readiness === "waiting_network"
    || params.stateAfter?.readiness === "waiting_ui"
    || params.stateAfter?.appPhase === "loading"
    || params.stateAfter?.blockingSignals.includes("error_state") === true;

  if (params.attribution.affectedLayer === "crash" || waitingLike) {
    return {
      selectedRecovery: TOOL_NAMES.recoverToKnownState,
      stopReason: "recovered",
      stopDetail: "Failure attribution is within the allowlist for bounded recovery.",
    };
  }

  const replaySuggested = params.remediationSuggestions.some((item) => item.toLowerCase().includes("replay"));
  if (replaySuggested && canReplaySafely(params.input)) {
    return {
      selectedRecovery: TOOL_NAMES.replayLastStablePath,
      stopReason: "recovered",
      stopDetail: "Known remediation suggests a bounded replay and the current action is low risk.",
    };
  }

  const driftSuggestsReplay = params.baselineComparison
    && params.baselineComparison.checkpointDivergence
    && params.baselineComparison.checkpointDivergence !== "none"
    && params.baselineComparison.replayValue !== "low";
  if (driftSuggestsReplay && canReplaySafely(params.input)) {
    return {
      selectedRecovery: TOOL_NAMES.replayLastStablePath,
      stopReason: "recovered",
      stopDetail: "Baseline checkpoint drift suggests replaying the last stable bounded path is safer than local retry.",
    };
  }

  if (replaySuggested) {
    return {
      stopReason: "high_risk_replay",
      stopDetail: "The candidate replay path looks business-sensitive, so auto-remediation stops at suggestion-only.",
    };
  }

  return {
    stopReason: "allowlist_miss",
    stopDetail: "Failure attribution is outside the bounded auto-remediation allowlist.",
  };
}

async function persistAutoRemediationEvent(params: {
  repoRoot: string;
  sessionId: string;
  actionId: string;
  type: "auto_remediation_triggered" | "auto_remediation_succeeded" | "auto_remediation_stopped";
  detail: string;
  stateSummary?: StateSummary;
  artifacts: string[];
  trace?: string[];
}): Promise<boolean> {
  const persisted = await persistSessionState(
    params.repoRoot,
    params.sessionId,
    params.stateSummary ?? { appPhase: "unknown", readiness: "unknown", blockingSignals: [] },
    buildAutoRemediationEvent({
      type: params.type,
      actionId: params.actionId,
      detail: params.detail,
      stateSummary: params.stateSummary,
      artifacts: params.artifacts,
      trace: params.trace,
    }),
    params.artifacts,
  );
  return Boolean(persisted.auditPath);
}

export async function performActionWithAutoRemediation(
  input: PerformActionWithEvidenceInput,
  deps: AutoRemediationDependencies,
): Promise<ToolResult<PerformActionWithEvidenceData>> {
  const base = await deps.performAction(input);

  if (!input.autoRemediate) {
    return base;
  }

  const repoRoot = resolveRepoPath();
  const policyProfile = (await loadSessionRecord(repoRoot, input.sessionId))?.session.policyProfile;
  const actionId = base.data.outcome.actionId;
  const stateBefore = base.data.preStateSummary;
  const stateAfter = base.data.postStateSummary;
  const seed = {
    attempted: false,
    actionId,
    triggerReason: `${base.data.outcome.actionType}:${base.status}`,
    recovered: false,
    stateBefore,
    stateAfter,
    artifactRefs: base.artifacts,
    remediationSuggestions: [] as string[],
    policyProfile,
  };

  if (base.status === "success") {
    return buildResult(base, {
      ...seed,
      stopReason: "action_succeeded",
      stopDetail: "The bounded action succeeded, so auto-remediation does not trigger.",
    });
  }

  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  if (!sessionRecord) {
    return buildResult(base, {
      ...seed,
      stopReason: "missing_session_record",
      stopDetail: "Auto-remediation requires a persisted session so policy and audit gates can run.",
    });
  }

  if (!actionId || !stateBefore || !stateAfter) {
    return buildResult(base, {
      ...seed,
      stopReason: "missing_evidence_window",
      stopDetail: "The action result did not include a complete evidence window, so auto-remediation stops.",
    });
  }

  const metadataStop = classifyMetadataDrivenStop(base);
  if (metadataStop) {
    return buildMetadataStop(metadataStop, base, seed);
  }

  if (hasExistingAutoRemediationAttempt(actionId, sessionRecord.session.timeline)) {
    return buildResult(base, {
      ...seed,
      stopReason: "already_attempted",
      stopDetail: "This failed action already consumed its single auto-remediation attempt.",
    });
  }

  if (!(await loadSessionAuditRecord(repoRoot, input.sessionId))) {
    return buildResult(base, {
      ...seed,
      stopReason: "audit_unavailable",
      stopDetail: "Auto-remediation requires an audit record before recovery can continue.",
    });
  }

  const triggerPersisted = await persistAutoRemediationEvent({
    repoRoot,
    sessionId: input.sessionId,
    actionId,
    type: "auto_remediation_triggered",
    detail: `Auto-remediation triggered after ${base.status} ${base.data.outcome.actionType}.`,
    stateSummary: stateAfter,
    artifacts: base.artifacts,
    trace: buildStateMachineTrace({ base, stopReason: "recovered" }),
  });
  if (!triggerPersisted) {
    return buildResult(base, {
      ...seed,
      stopReason: "audit_unavailable",
      stopDetail: "The auto-remediation trigger could not be written to audit storage.",
    });
  }

  if (base.data.outcome.failureCategory === "waiting") {
    const recovery = await deps.recoverToKnownState({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile: input.runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      dryRun: input.dryRun,
    });
    const recoverySummary = recovery.data.summary;
    const finalArtifacts = Array.from(new Set([...base.artifacts, ...recovery.artifacts]));
    const waitingStopReason = recovery.reasonCode === REASON_CODES.policyDenied
      ? "policy_denied"
      : recoverySummary.recovered
        ? "recovered"
        : "recovery_not_recovered";
    await persistAutoRemediationEvent({
      repoRoot,
      sessionId: input.sessionId,
      actionId,
      type: recoverySummary.recovered ? "auto_remediation_succeeded" : "auto_remediation_stopped",
      detail: recoverySummary.note,
      stateSummary: recoverySummary.stateAfter ?? stateAfter,
      artifacts: finalArtifacts,
      trace: buildStateMachineTrace({ base, stopReason: waitingStopReason, selectedRecovery: recoverySummary.strategy }),
    });
    return buildResult(base, {
      ...seed,
      attempted: true,
      selectedRecovery: recoverySummary.strategy,
      recovered: recoverySummary.recovered && recovery.status !== "failed",
      stopReason: recovery.reasonCode === REASON_CODES.policyDenied
        ? "policy_denied"
        : recoverySummary.recovered
          ? "recovered"
          : "recovery_not_recovered",
      stopDetail: recovery.reasonCode === REASON_CODES.policyDenied
        ? "Policy denied the bounded wait-state recovery path."
        : recoverySummary.note,
      stateMachineStatus: deriveStateMachineStatus({ base, stopReason: waitingStopReason, selectedRecovery: recoverySummary.strategy }),
      stateMachineTrace: buildStateMachineTrace({ base, stopReason: waitingStopReason, selectedRecovery: recoverySummary.strategy }),
      stateAfter: recoverySummary.stateAfter ?? stateAfter,
      artifactRefs: finalArtifacts,
      remediationSuggestions: base.data.actionabilityReview ?? [],
      policyProfile,
    });
  }

  const explain = await deps.explainLastFailure({ sessionId: input.sessionId });
  const baseline = explain.status === "failed" || !deps.compareAgainstBaseline
    ? undefined
    : await deps.compareAgainstBaseline({ sessionId: input.sessionId, actionId });
  const rank = explain.status === "failed" ? undefined : await deps.rankFailureCandidates({ sessionId: input.sessionId });
  const suggest = explain.status === "failed" ? undefined : await deps.suggestKnownRemediation({ sessionId: input.sessionId, platform: input.platform });
  const remediationSuggestions = uniqueStrings([
    ...(suggest?.data.remediation ?? []),
    ...explain.nextSuggestions,
    ...(rank?.nextSuggestions ?? []),
  ]);
  const candidateLayers = rank?.data.candidates.map((candidate) => candidate.affectedLayer);

  if (explain.status === "failed" || !explain.data.found || !explain.data.attribution || explain.data.attribution.affectedLayer === "unknown" || explain.data.attribution.missingEvidence.length > 0) {
    await persistAutoRemediationEvent({
      repoRoot,
      sessionId: input.sessionId,
      actionId,
      type: "auto_remediation_stopped",
      detail: "Auto-remediation stopped because failure attribution was too weak.",
      stateSummary: stateAfter,
      artifacts: base.artifacts,
      trace: buildStateMachineTrace({ base, stopReason: "weak_attribution" }),
    });
    return buildResult(base, {
      ...seed,
      stopReason: "weak_attribution",
      stopDetail: "Failure attribution was missing, unknown, or lacked enough evidence to enter recovery.",
      stateMachineStatus: deriveStateMachineStatus({ base, stopReason: "weak_attribution" }),
      stateMachineTrace: buildStateMachineTrace({ base, stopReason: "weak_attribution" }),
      remediationSuggestions,
      candidateLayers,
      attribution: explain.data.attribution,
    });
  }

  const recoveryPlan = chooseRecovery({
    input,
    attribution: explain.data.attribution,
    stateAfter,
    remediationSuggestions,
    baselineComparison: baseline?.data.comparison,
  });

  if (!recoveryPlan.selectedRecovery) {
    await persistAutoRemediationEvent({
      repoRoot,
      sessionId: input.sessionId,
      actionId,
      type: "auto_remediation_stopped",
      detail: recoveryPlan.stopDetail,
      stateSummary: stateAfter,
      artifacts: base.artifacts,
      trace: buildStateMachineTrace({ base, stopReason: recoveryPlan.stopReason }),
    });
    return buildResult(base, {
      ...seed,
      stopReason: recoveryPlan.stopReason,
      stopDetail: recoveryPlan.stopDetail,
      stateMachineStatus: deriveStateMachineStatus({ base, stopReason: recoveryPlan.stopReason }),
      stateMachineTrace: buildStateMachineTrace({ base, stopReason: recoveryPlan.stopReason }),
      remediationSuggestions,
      candidateLayers,
      attribution: explain.data.attribution,
    });
  }

  const recovery = recoveryPlan.selectedRecovery === TOOL_NAMES.recoverToKnownState
    ? await deps.recoverToKnownState({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile: input.runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      dryRun: input.dryRun,
    })
    : await deps.replayLastStablePath({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile: input.runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      dryRun: input.dryRun,
    });

  const recoverySummary = recovery.data.summary;
  const finalStopReason = recovery.reasonCode === REASON_CODES.policyDenied
    ? "policy_denied"
    : recovery.status === "failed"
      ? "recovery_failed"
      : recoverySummary.recovered
        ? "recovered"
        : "recovery_not_recovered";
  const finalDetail = recovery.reasonCode === REASON_CODES.policyDenied
    ? "Policy denied the bounded recovery tool, so auto-remediation downgraded to suggestion-only."
    : recoverySummary.note;

  const finalArtifacts = Array.from(new Set([...base.artifacts, ...recovery.artifacts]));
  const recoveryAudit = await loadSessionAuditRecord(repoRoot, input.sessionId);
  if (!recoveryAudit) {
    return buildResult(base, {
      ...seed,
      attempted: true,
      selectedRecovery: recoverySummary.strategy,
      stopReason: "audit_unavailable",
      stopDetail: "The recovery result could not be synchronized into the audit record.",
      stateAfter: recoverySummary.stateAfter ?? stateAfter,
      artifactRefs: finalArtifacts,
      remediationSuggestions,
      candidateLayers,
      attribution: explain.data.attribution,
    });
  }

  await persistAutoRemediationEvent({
    repoRoot,
    sessionId: input.sessionId,
    actionId,
    type: recoverySummary.recovered ? "auto_remediation_succeeded" : "auto_remediation_stopped",
    detail: finalDetail,
    stateSummary: recoverySummary.stateAfter ?? stateAfter,
    artifacts: finalArtifacts,
    trace: buildStateMachineTrace({ base, stopReason: finalStopReason, selectedRecovery: recoverySummary.strategy }),
  });

  return buildResult(base, {
    ...seed,
    attempted: true,
    selectedRecovery: recoverySummary.strategy,
    recovered: recoverySummary.recovered && recovery.status !== "failed",
    stopReason: finalStopReason,
    stopDetail: finalDetail,
    stateMachineStatus: deriveStateMachineStatus({ base, stopReason: finalStopReason, selectedRecovery: recoverySummary.strategy }),
    stateMachineTrace: buildStateMachineTrace({ base, stopReason: finalStopReason, selectedRecovery: recoverySummary.strategy }),
    stateAfter: recoverySummary.stateAfter ?? stateAfter,
    artifactRefs: finalArtifacts,
    remediationSuggestions,
    candidateLayers,
    attribution: explain.data.attribution,
  });
}
