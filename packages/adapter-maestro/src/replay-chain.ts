import {
  type ActionIntent,
  type ActionOutcomeSummary,
  type CheckpointDecisionTrace,
  type GetSessionStateData,
  type PerformActionWithEvidenceData,
  type ReasonCode,
  type ReplayCheckpointChainData,
  type ReplayCheckpointChainInput,
  type ReplayStepResult,
  type RunnerProfile,
  type ToolResult,
  REASON_CODES,
} from "@mobile-e2e-mcp/contracts";
import { listActionRecordsForSession, loadSessionRecord, type PersistedActionRecord } from "@mobile-e2e-mcp/core";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";

const HIGH_RISK_REPLAY_KEYWORDS = [
  "pay", "payment", "purchase", "buy", "checkout", "order",
  "delete", "remove", "send", "submit", "confirm",
];

const REPLAY_SAFE_ACTION_TYPES = ["tap_element", "type_into_element", "wait_for_ui", "launch_app", "terminate_app"];

interface ReplayChainDeps {
  getSessionStateWithMaestro: (input: {
    sessionId: string;
    platform?: "android" | "ios";
    runnerProfile?: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    dryRun?: boolean;
  }) => Promise<ToolResult<GetSessionStateData>>;
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

function isHighRiskIntent(intent?: ActionIntent): boolean {
  if (!intent) {
    return false;
  }

  const haystacks = [intent.resourceId, intent.contentDesc, intent.text, intent.value, intent.appId]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return haystacks.some((value) => HIGH_RISK_REPLAY_KEYWORDS.some((keyword) => value.includes(keyword)));
}

function isReplaySafeAction(record: PersistedActionRecord): boolean {
  if (isHighRiskIntent(record.intent)) {
    return false;
  }

  if (record.outcome.outcome !== "success") {
    return false;
  }

  if (record.outcome.fallbackUsed === true) {
    return false;
  }

  if (!REPLAY_SAFE_ACTION_TYPES.includes(record.outcome.actionType)) {
    return false;
  }

  return true;
}

function findLastStableCheckpoint(records: PersistedActionRecord[]): PersistedActionRecord | undefined {
  for (const record of records) {
    if (
      record.outcome.outcome === "success"
      && (record.outcome.progressMarker === "full" || record.outcome.postconditionStatus === "met")
    ) {
      return record;
    }
  }
  return undefined;
}

function buildCheckpointDecision(anchor: PersistedActionRecord | undefined): CheckpointDecisionTrace {
  if (!anchor) {
    return {
      checkpointCandidate: false,
      replayRecommended: false,
      replayRefused: true,
      replayRefusalReason: "no_stable_checkpoint",
      stableBoundaryReason: "No stable checkpoint (success + full progress) was found for this session.",
    };
  }
  return {
    checkpointCandidate: true,
    checkpointActionId: anchor.actionId,
    replayRecommended: true,
    replayRefused: false,
    stableBoundaryReason: `Checkpoint at ${anchor.actionId} is the last stable boundary for replay-safe chain execution.`,
  };
}

function buildActionIntentFromRecord(record: PersistedActionRecord): ActionIntent {
  return {
    actionType: record.intent?.actionType ?? record.outcome.actionType,
    resourceId: record.intent?.resourceId ?? record.outcome.postState?.screenId,
    contentDesc: record.intent?.contentDesc,
    text: record.intent?.text,
    className: record.intent?.className,
    clickable: record.intent?.clickable,
    limit: record.intent?.limit,
    value: record.intent?.value,
    appId: record.intent?.appId,
    launchUrl: record.intent?.launchUrl,
    timeoutMs: record.intent?.timeoutMs,
    intervalMs: record.intent?.intervalMs,
    waitUntil: record.intent?.waitUntil,
  };
}

export async function replayCheckpointChain(
  input: ReplayCheckpointChainInput,
  deps: ReplayChainDeps,
): Promise<ToolResult<ReplayCheckpointChainData>> {
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
        anchorActionId: "",
        replayedCount: 0,
        succeededCount: 0,
        divergedCount: 0,
        skippedCount: 0,
        perStepResults: [],
        overallStatus: "failed",
        note: "Platform could not be resolved for checkpoint chain replay.",
      },
      nextSuggestions: ["Provide platform explicitly or start a session before invoking replay_checkpoint_chain."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const deviceId = input.deviceId ?? sessionRecord?.session.deviceId;
  const appId = input.appId ?? sessionRecord?.session.appId;

  // Step 1: Load session action records
  const allRecords = await listActionRecordsForSession(repoRoot, input.sessionId);
  if (allRecords.length === 0) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.checkpointUnavailable,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        anchorActionId: "",
        replayedCount: 0,
        succeededCount: 0,
        divergedCount: 0,
        skippedCount: 0,
        perStepResults: [],
        overallStatus: "failed",
        note: "No action records found for this session.",
      },
      nextSuggestions: ["Record at least one successful perform_action_with_evidence step before replaying a checkpoint chain."],
    };
  }

  // Step 2: Find last stable checkpoint (walk backwards from most recent)
  const anchorRecord = findLastStableCheckpoint(allRecords);
  const checkpointDecision = buildCheckpointDecision(anchorRecord);

  if (!anchorRecord) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.checkpointUnavailable,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        anchorActionId: "",
        replayedCount: 0,
        succeededCount: 0,
        divergedCount: 0,
        skippedCount: 0,
        perStepResults: [],
        overallStatus: "failed",
        checkpointDecision,
        note: "No stable checkpoint (success + full progress marker) found in session records.",
      },
      nextSuggestions: ["Ensure at least one action completed with success + full progress before using checkpoint chain replay."],
    };
  }

  // Step 3: Collect all actions AFTER the anchor
  const anchorIndex = allRecords.findIndex((r) => r.actionId === anchorRecord.actionId);
  const actionsAfterAnchor = allRecords.slice(0, anchorIndex);

  if (actionsAfterAnchor.length === 0) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        anchorActionId: anchorRecord.actionId,
        replayedCount: 0,
        succeededCount: 0,
        divergedCount: 0,
        skippedCount: 0,
        perStepResults: [],
        overallStatus: "full",
        checkpointDecision,
        note: "No actions exist after the anchor checkpoint. Session is already at the stable boundary.",
      },
      nextSuggestions: [],
    };
  }

  // Apply fromStep offset if provided
  const startIndex = input.fromStep ?? 0;
  const candidateActions = actionsAfterAnchor.slice(startIndex);

  // Apply maxSteps limit
  const limitedActions = input.maxSteps ? candidateActions.slice(0, input.maxSteps) : candidateActions;

  // Step 4: Filter for replay-safe actions and build per-step plan
  const perStepResults: ReplayStepResult[] = [];
  let skippedCount = 0;

  for (let i = 0; i < limitedActions.length; i++) {
    const record = limitedActions[i];
    if (!isReplaySafeAction(record)) {
      const skipReasons: string[] = [];
      if (isHighRiskIntent(record.intent)) {
        skipReasons.push("high-risk intent");
      }
      if (record.outcome.outcome !== "success") {
        skipReasons.push(`original outcome was ${record.outcome.outcome}`);
      }
      if (record.outcome.fallbackUsed === true) {
        skipReasons.push("used OCR/CV fallback (non-deterministic)");
      }
      if (!REPLAY_SAFE_ACTION_TYPES.includes(record.outcome.actionType)) {
        skipReasons.push(`action type ${record.outcome.actionType} is not replay-safe`);
      }

      perStepResults.push({
        stepIndex: i,
        actionId: record.actionId,
        actionType: record.outcome.actionType,
        status: "skipped",
        reason: `Skipped: ${skipReasons.join("; ")}`,
        originalOutcome: record.outcome,
      });
      skippedCount++;
    }
  }

  const replayableActions = limitedActions.filter((r) => isReplaySafeAction(r));

  if (replayableActions.length === 0) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        anchorActionId: anchorRecord.actionId,
        replayedCount: 0,
        succeededCount: 0,
        divergedCount: 0,
        skippedCount,
        perStepResults,
        overallStatus: perStepResults.length > 0 ? "partial" : "full",
        checkpointDecision,
        note: `Found ${limitedActions.length} actions after checkpoint, but none are replay-safe.`,
      },
      nextSuggestions: ["Inspect skipped actions manually; high-risk or non-deterministic steps cannot be auto-replayed."],
    };
  }

  // Step 5: Verify current state matches anchor's postState
  const currentState = await deps.getSessionStateWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId,
    appId,
    dryRun: input.dryRun,
  });

  if (currentState.status === "success") {
    const anchorScreenId = anchorRecord.outcome.postState?.screenId ?? anchorRecord.outcome.preState?.screenId;
    const currentScreenId = currentState.data.state.screenId;
    const anchorReadiness = anchorRecord.outcome.postState?.readiness ?? anchorRecord.outcome.preState?.readiness;
    const currentReadiness = currentState.data.state.readiness;
    const anchorAppPhase = anchorRecord.outcome.postState?.appPhase ?? anchorRecord.outcome.preState?.appPhase;
    const currentAppPhase = currentState.data.state.appPhase;

    const divergences: string[] = [];
    if (anchorScreenId && currentScreenId && anchorScreenId !== currentScreenId) {
      divergences.push(`screen: ${anchorScreenId} -> ${currentScreenId}`);
    }
    if (anchorReadiness && currentReadiness && anchorReadiness !== currentReadiness) {
      divergences.push(`readiness: ${anchorReadiness} -> ${currentReadiness}`);
    }
    if (anchorAppPhase && currentAppPhase && anchorAppPhase !== currentAppPhase) {
      divergences.push(`appPhase: ${anchorAppPhase} -> ${currentAppPhase}`);
    }

    if (divergences.length >= 2) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.replayRefusedHighRiskBoundary,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: currentState.artifacts,
        data: {
          anchorActionId: anchorRecord.actionId,
          replayedCount: 0,
          succeededCount: 0,
          divergedCount: 1,
          skippedCount,
          perStepResults,
          overallStatus: "failed",
          checkpointDecision,
          note: `State divergence detected at anchor: ${divergences.join(", ")}. Replay stopped.`,
        },
        nextSuggestions: ["Restore app state to match checkpoint before retrying, or inspect the current state manually."],
      };
    }
  }

  // Step 6: Execute each replayable action sequentially
  let succeededCount = 0;
  let divergedCount = 0;
  let failedCount = 0;
  const artifacts: string[] = [];

  for (let i = 0; i < replayableActions.length; i++) {
    const record = replayableActions[i];
    const globalStepIndex = limitedActions.indexOf(record);

    if (input.dryRun) {
      perStepResults.push({
        stepIndex: globalStepIndex,
        actionId: record.actionId,
        actionType: record.outcome.actionType,
        status: "success",
        reason: "Dry run: action would be replayed",
        originalOutcome: record.outcome,
      });
      succeededCount++;
      continue;
    }

    const replayResult = await deps.performActionWithEvidenceWithMaestro({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId,
      appId,
      action: buildActionIntentFromRecord(record),
      dryRun: input.dryRun,
    });

    artifacts.push(...replayResult.artifacts);

    if (replayResult.status === "success" || replayResult.status === "partial") {
      const replayedOutcome = replayResult.data.outcome;
      const originalOutcome = record.outcome;

      // Step 7: Compare outcome with original outcome
      let stepStatus: ReplayStepResult["status"] = "success";
      let stepReason: string | undefined;

      if (replayedOutcome.outcome !== originalOutcome.outcome) {
        stepStatus = "diverged";
        stepReason = `Outcome diverged: original ${originalOutcome.outcome} -> replayed ${replayedOutcome.outcome}`;
        divergedCount++;
      } else if (
        originalOutcome.postState?.screenId
        && replayedOutcome.postState?.screenId
        && originalOutcome.postState.screenId !== replayedOutcome.postState.screenId
      ) {
        stepStatus = "diverged";
        stepReason = `Screen diverged: ${originalOutcome.postState.screenId} -> ${replayedOutcome.postState.screenId}`;
        divergedCount++;
      } else {
        succeededCount++;
      }

      perStepResults.push({
        stepIndex: globalStepIndex,
        actionId: record.actionId,
        actionType: record.outcome.actionType,
        status: stepStatus,
        reason: stepReason,
        originalOutcome,
        replayedOutcome,
      });
    } else {
      failedCount++;
      perStepResults.push({
        stepIndex: globalStepIndex,
        actionId: record.actionId,
        actionType: record.outcome.actionType,
        status: "failed",
        reason: `Replay failed: ${replayResult.reasonCode}`,
        originalOutcome: record.outcome,
      });
    }
  }

  // Step 8: Determine overall status
  const totalReplayed = succeededCount + divergedCount + failedCount;
  let overallStatus: ReplayCheckpointChainData["overallStatus"];
  if (failedCount === 0 && divergedCount === 0) {
    overallStatus = "full";
  } else if (succeededCount > 0) {
    overallStatus = "partial";
  } else {
    overallStatus = "failed";
  }

  const noteParts: string[] = [];
  noteParts.push(`Replayed ${totalReplayed} of ${limitedActions.length} actions after checkpoint ${anchorRecord.actionId}.`);
  noteParts.push(`${succeededCount} succeeded, ${divergedCount} diverged, ${failedCount} failed, ${skippedCount} skipped.`);
  if (divergedCount > 0) {
    noteParts.push("Some steps diverged from original outcomes; review per-step results.");
  }

  return {
    status: overallStatus === "failed" ? "failed" : "success",
    reasonCode: overallStatus === "full" ? REASON_CODES.ok : REASON_CODES.replayRecommended,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts,
    data: {
      anchorActionId: anchorRecord.actionId,
      replayedCount: totalReplayed,
      succeededCount,
      divergedCount,
      skippedCount,
      perStepResults,
      overallStatus,
      checkpointDecision,
      note: noteParts.join(" "),
    },
    nextSuggestions:
      overallStatus === "full"
        ? []
        : ["Review per-step results for diverged or failed steps; high-risk steps were skipped intentionally."],
  };
}
