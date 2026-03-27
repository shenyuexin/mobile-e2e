import type {
  ActionIntent,
  OrchestrationStepState,
  PerformActionWithEvidenceData,
  Platform,
  ReplayProgressSummary,
  ReplayStepOutcome,
  RunnerProfile,
  SessionTimelineEvent,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { buildInitialReplayProgress } from "./replay-step-planner.js";
import type { ReplayStep } from "./replay-step-planner.js";
import { updateReplayProgress } from "./replay-step-persistence.js";

export interface RunReplayStepsParams {
  sessionId: string;
  platform: Platform;
  runnerProfile: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  dryRun?: boolean;
  steps: ReplayStep[];
  executeStep: (params: {
    replayStep: ReplayStep;
    sessionId: string;
    platform: Platform;
    runnerProfile: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    dryRun?: boolean;
    action: ActionIntent;
  }) => Promise<ToolResult<PerformActionWithEvidenceData>>;
  appendTimelineEvent?: (event: SessionTimelineEvent, artifacts?: string[]) => Promise<void>;
}

function toReplayStepOutcome(replayStep: ReplayStep, result: ToolResult<PerformActionWithEvidenceData>): ReplayStepOutcome {
  return {
    replayStepId: replayStep.replayStepId,
    stepNumber: replayStep.stepNumber,
    status: result.status === "failed" ? "failed" : result.status === "partial" ? "partial" : "success",
    reasonCode: result.reasonCode,
    actionId: result.data.outcome.actionId,
    attempts: result.data.retryDecisionTrace?.attemptIndex ?? result.attempts,
    boundedRecoveryAttempted: (result.data.retryDecisionTrace?.attemptIndex ?? 1) > 1,
    selectedRecovery: result.data.checkpointDecisionTrace?.replayRecommended ? "replay_last_stable_path" : "none",
    outcome: result.data.outcome,
    retryDecisionTrace: result.data.retryDecisionTrace,
    postActionVerificationTrace: result.data.postActionVerificationTrace,
    checkpointDecisionTrace: result.data.checkpointDecisionTrace,
    actionabilityReview: result.data.actionabilityReview,
    artifacts: result.artifacts,
    evidence: result.data.evidence,
    stopReason: result.data.retryDecisionTrace?.stopReason,
  };
}

function deriveFinalReplayState(outcomes: ReplayStepOutcome[]): OrchestrationStepState {
  const last = [...outcomes].reverse().find((outcome) => outcome.status !== "skipped");
  if (!last) {
    return "ready_to_execute";
  }
  if (last.outcome?.stepState) {
    return last.outcome.stepState;
  }
  if (last.status === "failed") {
    return "terminal_stop";
  }
  if (last.checkpointDecisionTrace?.checkpointCandidate) {
    return "checkpoint_candidate";
  }
  if (last.status === "partial") {
    return "partial_progress";
  }
  return "ready_to_execute";
}

function shouldStopReplay(outcome: ReplayStepOutcome): boolean {
  const stepState = outcome.outcome?.stepState;
  if (stepState === "terminal_stop" || stepState === "recoverable_waiting" || stepState === "replay_recommended") {
    return true;
  }
  if (outcome.actionabilityReview?.some((entry) => entry.startsWith("manual_handoff_required:"))) {
    return true;
  }
  if (outcome.stopReason === "manual_handoff_required") {
    return true;
  }
  if (outcome.status === "failed") {
    return true;
  }
  return false;
}

export async function runReplaySteps(params: RunReplayStepsParams): Promise<{
  progress: ReplayProgressSummary;
  outcomes: ReplayStepOutcome[];
  finalReplayState: OrchestrationStepState;
}> {
  let progress = buildInitialReplayProgress(params.steps.length);
  const outcomes: ReplayStepOutcome[] = [];

  await params.appendTimelineEvent?.({
    timestamp: new Date().toISOString(),
    type: "replay_started",
    eventType: "replay_started",
    layer: "action",
    summary: `Replay started with ${params.steps.length} steps.`,
  });

  for (let index = 0; index < params.steps.length; index += 1) {
    const replayStep = params.steps[index]!;
    progress = {
      ...progress,
      currentStepNumber: replayStep.stepNumber,
    };
    await params.appendTimelineEvent?.({
      timestamp: new Date().toISOString(),
      type: "replay_step_started",
      eventType: "replay_step_started",
      layer: "action",
      summary: `Replay step ${replayStep.stepNumber} started.`,
      detail: replayStep.replayStepId,
    });

    if (replayStep.actionType === "tap" && !replayStep.actionIntent) {
      const outcome: ReplayStepOutcome = {
        replayStepId: replayStep.replayStepId,
        stepNumber: replayStep.stepNumber,
        status: "failed",
        reasonCode: "UNSUPPORTED_OPERATION",
        attempts: 1,
        boundedRecoveryAttempted: false,
        selectedRecovery: "none",
        artifacts: [],
        actionabilityReview: ["Coordinate tap replay is not yet supported in the step-orchestrated path."],
        stopReason: "coordinate_tap_not_supported",
      };
      outcomes.push(outcome);
      progress = updateReplayProgress(progress, replayStep.stepNumber, outcome.status);
      await params.appendTimelineEvent?.({
        timestamp: new Date().toISOString(),
        type: "replay_step_failed",
        eventType: "replay_step_failed",
        layer: "action",
        summary: `Replay step ${replayStep.stepNumber} failed.`,
        detail: outcome.stopReason,
      });
      for (const blockedStep of params.steps.slice(index + 1)) {
        const skipped: ReplayStepOutcome = {
          replayStepId: blockedStep.replayStepId,
          stepNumber: blockedStep.stepNumber,
          status: "skipped",
          reasonCode: outcome.reasonCode,
          attempts: 0,
          boundedRecoveryAttempted: false,
          selectedRecovery: "none",
          artifacts: [],
          blockingStepNumber: replayStep.stepNumber,
          stopReason: outcome.stopReason ?? "blocked_by_previous_failure",
        };
        outcomes.push(skipped);
        progress = updateReplayProgress(progress, blockedStep.stepNumber, skipped.status);
      }
      await params.appendTimelineEvent?.({
        timestamp: new Date().toISOString(),
        type: "replay_stopped",
        eventType: "replay_stopped",
        layer: "action",
        summary: `Replay stopped at step ${replayStep.stepNumber}.`,
      });
      break;
    }

    const action = replayStep.actionIntent ?? { actionType: replayStep.actionType as ActionIntent["actionType"] };
    const result = await params.executeStep({
      replayStep,
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      appId: params.appId,
      dryRun: params.dryRun,
      action,
    });

    const outcome = toReplayStepOutcome(replayStep, result);
    outcomes.push(outcome);
    progress = updateReplayProgress(progress, replayStep.stepNumber, outcome.status);
    await params.appendTimelineEvent?.({
      timestamp: new Date().toISOString(),
      type: outcome.status === "failed" ? "replay_step_failed" : "replay_step_completed",
      eventType: outcome.status === "failed" ? "replay_step_failed" : "replay_step_completed",
      layer: "action",
      actionId: outcome.actionId,
      artifactRefs: outcome.artifacts,
      summary: `Replay step ${replayStep.stepNumber} ${outcome.status}.`,
      detail: outcome.reasonCode,
    }, outcome.artifacts);
    if (shouldStopReplay(outcome)) {
      for (const blockedStep of params.steps.slice(index + 1)) {
        const skipped: ReplayStepOutcome = {
          replayStepId: blockedStep.replayStepId,
          stepNumber: blockedStep.stepNumber,
          status: "skipped",
          reasonCode: outcome.reasonCode,
          attempts: 0,
          boundedRecoveryAttempted: false,
          selectedRecovery: "none",
          artifacts: [],
          blockingStepNumber: replayStep.stepNumber,
          stopReason: outcome.stopReason ?? "blocked_by_previous_failure",
        };
        outcomes.push(skipped);
        progress = updateReplayProgress(progress, blockedStep.stepNumber, skipped.status);
      }
      await params.appendTimelineEvent?.({
        timestamp: new Date().toISOString(),
        type: "replay_stopped",
        eventType: "replay_stopped",
        layer: "action",
        summary: `Replay stopped at step ${replayStep.stepNumber}.`,
      });
      break;
    }
  }

  if (!outcomes.some((outcome) => outcome.status === "failed")) {
    await params.appendTimelineEvent?.({
      timestamp: new Date().toISOString(),
      type: "replay_completed",
      eventType: "replay_completed",
      layer: "action",
      summary: "Replay completed.",
    });
  }

  return {
    progress: {
      ...progress,
      currentStepNumber: undefined,
    },
    outcomes,
    finalReplayState: deriveFinalReplayState(outcomes),
  };
}
