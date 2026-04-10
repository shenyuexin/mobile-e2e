import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import {
  type ActionIntent,
  type ActionOutcomeSummary,
  type CheckpointDivergence,
  type CheckpointDecisionTrace,
  type PerformActionWithEvidenceData,
  type GetSessionStateData,
  type LaunchAppData,
  type RecoverToKnownStateData,
  type RecoverToKnownStateInput,
  REASON_CODES,
  type RecoverySummary,
  type ReplayValue,
  type ReplayLastStablePathData,
  type ReplayLastStablePathInput,
  type ReasonCode,
  type RunnerProfile,
  type SessionTimelineEvent,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { listActionRecordsForSession, loadSessionRecord, persistSessionState, type PersistedActionRecord } from "@mobile-e2e-mcp/core";
import { randomUUID } from "node:crypto";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";

interface RecoveryToolsDeps {
  getSessionStateWithMaestro: (input: {
    sessionId: string;
    platform?: "android" | "ios";
    runnerProfile?: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    dryRun?: boolean;
  }) => Promise<ToolResult<GetSessionStateData>>;
  launchAppWithMaestro: (input: {
    sessionId: string;
    platform?: "android" | "ios";
    runnerProfile?: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    launchUrl?: string;
    dryRun?: boolean;
  }) => Promise<ToolResult<LaunchAppData>>;
  performActionWithEvidenceWithMaestro: (input: {
    sessionId: string;
    platform?: "android" | "ios";
    runnerProfile?: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    action: ActionIntent;
    dryRun?: boolean;
  }) => Promise<ToolResult<PerformActionWithEvidenceData>>;
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

function deriveReplayValueFromStableRecord(outcome: ActionOutcomeSummary): ReplayValue {
  if (outcome.outcome !== "success") return "low";
  if (outcome.progressMarker === "full" || outcome.postconditionStatus === "met") return "high";
  return "medium";
}

function deriveCheckpointDivergence(params: {
  stableOutcome: ActionOutcomeSummary;
  currentState?: GetSessionStateData["state"];
}): CheckpointDivergence {
  const stableScreenId = params.stableOutcome.postState?.screenId ?? params.stableOutcome.preState?.screenId;
  const currentScreenId = params.currentState?.screenId;
  if (stableScreenId && currentScreenId && stableScreenId !== currentScreenId) {
    return "screen_mismatch";
  }
  const stableReadiness = params.stableOutcome.postState?.readiness ?? params.stableOutcome.preState?.readiness;
  const currentReadiness = params.currentState?.readiness;
  if (stableReadiness && currentReadiness && stableReadiness !== currentReadiness) {
    return "readiness_mismatch";
  }
  if (params.stableOutcome.progressMarker && params.stableOutcome.progressMarker !== "full") {
    return "signal_mismatch";
  }
  return "none";
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

  const recoveryActionTypes = new Set<string>([ACTION_TYPES.waitForUi, ACTION_TYPES.launchApp, ACTION_TYPES.terminateApp]);
  return recoveryActionTypes.has(record.outcome.actionType);
}

function buildCheckpointDecision(record: PersistedActionRecord | undefined): CheckpointDecisionTrace {
  if (!record) {
    return {
      checkpointCandidate: false,
      replayRecommended: false,
      replayRefused: true,
      replayRefusalReason: "checkpoint_unavailable",
      stableBoundaryReason: "No successful action checkpoint is available for this session.",
    };
  }
  const highRisk = isHighRiskReplayIntent(record.intent);
  return {
    checkpointCandidate: true,
    checkpointActionId: record.actionId,
    replayRecommended: !highRisk,
    replayRefused: highRisk,
    replayRefusalReason: highRisk ? "replay_refused_high_risk_boundary" : undefined,
    stableBoundaryReason: highRisk
      ? "Checkpoint exists but belongs to a high-risk/non-idempotent path."
      : "Checkpoint is low-risk and replay-safe for bounded remediation.",
  };
}

export async function recoverToKnownStateWithMaestro(
  input: RecoverToKnownStateInput,
  deps: RecoveryToolsDeps,
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
  const before = await deps.getSessionStateWithMaestro({
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

  if (before.data.state.readiness === "backend_failed_terminal") {
    strategy = "none";
    status = "failed";
    reasonCode = REASON_CODES.networkBackendTerminal;
    note = "Recovery stopped early because the session state is backend-terminal.";
  } else if (before.data.state.readiness === "offline_terminal") {
    strategy = "none";
    status = "failed";
    reasonCode = REASON_CODES.networkOfflineTerminal;
    note = "Recovery stopped early because the session state is offline-terminal.";
  } else if (before.data.state.appPhase === "crashed" || before.data.state.blockingSignals.includes("error_state")) {
    strategy = "relaunch_app";
    const result = await deps.launchAppWithMaestro({
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

  const after = await deps.getSessionStateWithMaestro({
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
  deps: RecoveryToolsDeps,
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
  const checkpointDecision = buildCheckpointDecision(stableRecord);
  if (!stableRecord) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.checkpointUnavailable,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        summary: {
          strategy: "replay_last_successful_action",
          recovered: false,
          note: "No stable successful action was recorded for this session.",
          stopReasonCode: REASON_CODES.checkpointUnavailable,
          checkpointDecision,
        },
      },
      nextSuggestions: ["Record at least one successful perform_action_with_evidence step before replaying a stable path."],
    };
  }

  if (!canReplayPersistedAction(stableRecord)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.replayRefusedHighRiskBoundary,
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
          stopReasonCode: REASON_CODES.replayRefusedHighRiskBoundary,
          checkpointDecision,
        },
      },
      nextSuggestions: ["Only low-side-effect actions can be replayed automatically; inspect the prior action manually instead."],
    };
  }

  const before = await deps.getSessionStateWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    dryRun: input.dryRun,
  });
  const checkpointDivergence = deriveCheckpointDivergence({
    stableOutcome: stableRecord.outcome,
    currentState: before.status === "success" ? before.data.state : undefined,
  });
  const replayValue: ReplayValue = checkpointDivergence === "none"
    ? deriveReplayValueFromStableRecord(stableRecord.outcome)
    : "medium";

  // Stabilize before replay: wait for device state to settle
  await new Promise((r) => setTimeout(r, 2000));

  const replayed = await deps.performActionWithEvidenceWithMaestro({
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
    stopReasonCode: replayed.reasonCode,
    checkpointDecision,
    replayValue,
    checkpointDivergence,
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
