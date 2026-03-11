import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { loadSessionAuditRecord, loadSessionRecord, persistSessionState } from "@mobile-e2e-mcp/core";
import {
  REASON_CODES,
  type AutoRemediationResult,
  type FailureAttribution,
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
} from "@mobile-e2e-mcp/contracts";
import type { ExplainLastFailureData, ExplainLastFailureInput } from "@mobile-e2e-mcp/contracts";

interface AutoRemediationDependencies {
  performAction: (input: PerformActionWithEvidenceInput) => Promise<ToolResult<PerformActionWithEvidenceData>>;
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
  return {
    ...base,
    data: {
      ...base.data,
      autoRemediation,
    },
  };
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
}): SessionTimelineEvent {
  return {
    timestamp: new Date().toISOString(),
    type: params.type,
    eventType: "auto_remediation",
    actionId: params.actionId,
    layer: "action",
    detail: params.detail,
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

function chooseRecovery(params: {
  input: PerformActionWithEvidenceInput;
  attribution: FailureAttribution;
  stateAfter?: StateSummary;
  remediationSuggestions: string[];
}): { selectedRecovery?: "recover_to_known_state" | "replay_last_stable_path"; stopReason: AutoRemediationResult["stopReason"]; stopDetail: string } {
  const waitingLike = params.stateAfter?.readiness === "waiting_network"
    || params.stateAfter?.readiness === "waiting_ui"
    || params.stateAfter?.appPhase === "loading"
    || params.stateAfter?.blockingSignals.includes("error_state") === true;

  if (params.attribution.affectedLayer === "crash" || waitingLike) {
    return {
      selectedRecovery: "recover_to_known_state",
      stopReason: "recovered",
      stopDetail: "Failure attribution is within the allowlist for bounded recovery.",
    };
  }

  const replaySuggested = params.remediationSuggestions.some((item) => item.toLowerCase().includes("replay"));
  if (replaySuggested && canReplaySafely(params.input)) {
    return {
      selectedRecovery: "replay_last_stable_path",
      stopReason: "recovered",
      stopDetail: "Known remediation suggests a bounded replay and the current action is low risk.",
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
  });
  if (!triggerPersisted) {
    return buildResult(base, {
      ...seed,
      stopReason: "audit_unavailable",
      stopDetail: "The auto-remediation trigger could not be written to audit storage.",
    });
  }

  const explain = await deps.explainLastFailure({ sessionId: input.sessionId });
  const rank = explain.status === "failed" ? undefined : await deps.rankFailureCandidates({ sessionId: input.sessionId });
  const suggest = explain.status === "failed" ? undefined : await deps.suggestKnownRemediation({ sessionId: input.sessionId });
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
    });
    return buildResult(base, {
      ...seed,
      stopReason: "weak_attribution",
      stopDetail: "Failure attribution was missing, unknown, or lacked enough evidence to enter recovery.",
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
    });
    return buildResult(base, {
      ...seed,
      stopReason: recoveryPlan.stopReason,
      stopDetail: recoveryPlan.stopDetail,
      remediationSuggestions,
      candidateLayers,
      attribution: explain.data.attribution,
    });
  }

  const recovery = recoveryPlan.selectedRecovery === "recover_to_known_state"
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
  });

  return buildResult(base, {
    ...seed,
    attempted: true,
    selectedRecovery: recoverySummary.strategy,
    recovered: recoverySummary.recovered && recovery.status !== "failed",
    stopReason: finalStopReason,
    stopDetail: finalDetail,
    stateAfter: recoverySummary.stateAfter ?? stateAfter,
    artifactRefs: finalArtifacts,
    remediationSuggestions,
    candidateLayers,
    attribution: explain.data.attribution,
  });
}
