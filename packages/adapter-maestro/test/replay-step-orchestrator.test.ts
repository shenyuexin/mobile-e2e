import assert from "node:assert/strict";
import test from "node:test";
import type { ActionIntent, PerformActionWithEvidenceData, ToolResult } from "@mobile-e2e-mcp/contracts";
import { runReplaySteps } from "../src/replay-step-orchestrator.ts";
import type { ReplayStep } from "../src/replay-step-planner.ts";

function buildReplayStep(stepNumber: number, actionIntent?: ActionIntent): ReplayStep {
  return {
    replayStepId: `replay-step-${stepNumber}`,
    stepNumber,
    source: "recorded_step",
    actionType: actionIntent?.actionType ?? "tap_element",
    actionIntent,
    confidence: "high",
    warnings: [],
    dependency: {
      previousStepRequired: true,
      checkpointEligible: true,
    },
  };
}

function successResult(actionType: ActionIntent["actionType"], actionId: string): ToolResult<PerformActionWithEvidenceData> {
  return {
    status: "success",
    reasonCode: "OK",
    sessionId: "session-1",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {
      sessionRecordFound: false,
      retryDecisionTrace: {
        stepState: "checkpoint_candidate",
        evidenceConfidence: "strong",
        retryAllowed: false,
        maxAttempts: 1,
        attemptIndex: 1,
        backoffClass: "none",
        stateChangeRequired: false,
      },
      postActionVerificationTrace: {
        postconditionMet: true,
        postconditionStatus: "met",
        progressMarker: "full",
        attempts: 1,
        verificationSignals: ["postcondition:met"],
      },
      checkpointDecisionTrace: {
        checkpointCandidate: true,
        checkpointActionId: actionId,
        replayRecommended: false,
        replayRefused: false,
        stableBoundaryReason: "state_changed",
      },
      actionabilityReview: [],
      outcome: {
        actionId,
        actionType,
        resolutionStrategy: "deterministic",
        preState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
        postState: { appPhase: "catalog", readiness: "ready", blockingSignals: [] },
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        confidence: 0.95,
        outcome: "success",
      },
      evidenceDelta: { uiDiffSummary: "changed" },
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
    },
    nextSuggestions: [],
  };
}

test("runReplaySteps executes steps and records progress/outcomes", async () => {
  const steps = [
    buildReplayStep(1, { actionType: "launch_app", appId: "com.example.demo" }),
    buildReplayStep(2, { actionType: "tap_element", resourceId: "view-products" }),
  ];

  const result = await runReplaySteps({
    sessionId: "session-1",
    platform: "android",
    runnerProfile: "phase1",
    steps,
    executeStep: async ({ replayStep }) => successResult(replayStep.actionType as ActionIntent["actionType"], `action-${replayStep.stepNumber}`),
  });

  assert.deepEqual(result.progress.completedSteps, [1, 2]);
  assert.deepEqual(result.progress.remainingSteps, []);
  assert.equal(result.outcomes.length, 2);
  assert.equal(result.outcomes[0]?.actionId, "action-1");
  assert.equal(result.finalReplayState, "checkpoint_candidate");
});

test("runReplaySteps emits replay timeline events", async () => {
  const events: Array<{ type?: string; eventType?: string }> = [];
  const result = await runReplaySteps({
    sessionId: "session-3",
    platform: "android",
    runnerProfile: "phase1",
    steps: [buildReplayStep(1, { actionType: "launch_app", appId: "com.example.demo" })],
    executeStep: async ({ replayStep }) => successResult(replayStep.actionType as ActionIntent["actionType"], "action-1"),
    appendTimelineEvent: async (event) => {
      events.push({ type: event.type, eventType: event.eventType });
    },
  });

  assert.equal(result.outcomes.length, 1);
  assert.deepEqual(
    events.map((event) => event.type),
    ["replay_started", "replay_step_started", "replay_step_completed", "replay_completed"],
  );
});

test("runReplaySteps stops on failure and marks remaining steps as skipped", async () => {
  const steps = [
    buildReplayStep(1, { actionType: "launch_app", appId: "com.example.demo" }),
    buildReplayStep(2, { actionType: "tap_element", resourceId: "view-products" }),
    buildReplayStep(3, { actionType: "wait_for_ui", text: "Products" }),
  ];

  const result = await runReplaySteps({
    sessionId: "session-2",
    platform: "android",
    runnerProfile: "phase1",
    steps,
    executeStep: async ({ replayStep }) => replayStep.stepNumber === 2
      ? {
          status: "failed",
          reasonCode: "FLOW_FAILED",
          sessionId: "session-2",
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            sessionRecordFound: false,
            retryDecisionTrace: {
              stepState: "terminal_stop",
              evidenceConfidence: "strong",
              retryAllowed: false,
              maxAttempts: 1,
              attemptIndex: 1,
              backoffClass: "none",
              stateChangeRequired: false,
              stopReason: "step_failed",
            },
            postActionVerificationTrace: {
              postconditionMet: false,
              postconditionStatus: "not_met",
              progressMarker: "none",
              attempts: 1,
              verificationSignals: ["postcondition:not_met"],
            },
            checkpointDecisionTrace: {
              checkpointCandidate: false,
              replayRecommended: true,
              replayRefused: false,
              stableBoundaryReason: "failure",
            },
            actionabilityReview: [],
            outcome: {
              actionId: "action-2",
              actionType: replayStep.actionType as ActionIntent["actionType"],
              resolutionStrategy: "deterministic",
              preState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
              postState: { appPhase: "ready", readiness: "backend_failed_terminal", blockingSignals: ["backend_failed"] },
              stateChanged: false,
              fallbackUsed: false,
              retryCount: 0,
              confidence: 0.2,
              outcome: "failed",
            },
            evidenceDelta: { uiDiffSummary: "none" },
            lowLevelStatus: "failed",
            lowLevelReasonCode: "FLOW_FAILED",
          },
          nextSuggestions: [],
        }
      : successResult(replayStep.actionType as ActionIntent["actionType"], `action-${replayStep.stepNumber}`),
  });

  assert.deepEqual(result.progress.failedSteps, [2]);
  assert.deepEqual(result.progress.skippedSteps, [3]);
  assert.equal(result.outcomes[2]?.status, "skipped");
  assert.equal(result.outcomes[2]?.blockingStepNumber, 2);
  assert.equal(result.finalReplayState, "terminal_stop");
});

test("runReplaySteps continues through degraded_but_continue_safe partial outcomes", async () => {
  const steps = [
    buildReplayStep(1, { actionType: "launch_app", appId: "com.example.demo" }),
    buildReplayStep(2, { actionType: "wait_for_ui", text: "Products" }),
  ];

  const result = await runReplaySteps({
    sessionId: "session-4",
    platform: "android",
    runnerProfile: "phase1",
    steps,
    executeStep: async ({ replayStep }) => replayStep.stepNumber === 1
      ? {
          ...successResult(replayStep.actionType as ActionIntent["actionType"], "action-1"),
          status: "partial",
          reasonCode: "OK",
          data: {
            ...successResult(replayStep.actionType as ActionIntent["actionType"], "action-1").data,
            retryDecisionTrace: {
              ...successResult(replayStep.actionType as ActionIntent["actionType"], "action-1").data.retryDecisionTrace!,
              stepState: "degraded_but_continue_safe",
            },
            outcome: {
              ...successResult(replayStep.actionType as ActionIntent["actionType"], "action-1").data.outcome,
              stepState: "degraded_but_continue_safe",
              outcome: "partial",
            },
          },
        }
      : successResult(replayStep.actionType as ActionIntent["actionType"], `action-${replayStep.stepNumber}`),
  });

  assert.equal(result.outcomes.length, 2);
  assert.deepEqual(result.progress.completedSteps, [2]);
  assert.deepEqual(result.progress.partialSteps, [1]);
});

test("runReplaySteps stops on manual handoff requirement and skips remaining steps", async () => {
  const steps = [
    buildReplayStep(1, { actionType: "launch_app", appId: "com.example.demo" }),
    buildReplayStep(2, { actionType: "tap_element", resourceId: "confirm-otp" }),
  ];

  const result = await runReplaySteps({
    sessionId: "session-5",
    platform: "android",
    runnerProfile: "phase1",
    steps,
    executeStep: async () => ({
      status: "partial",
      reasonCode: "OK",
      sessionId: "session-5",
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: false,
        retryDecisionTrace: {
          stepState: "terminal_stop",
          evidenceConfidence: "strong",
          retryAllowed: false,
          maxAttempts: 1,
          attemptIndex: 1,
          backoffClass: "none",
          stateChangeRequired: false,
          stopReason: "manual_handoff_required",
        },
        postActionVerificationTrace: {
          postconditionMet: false,
          postconditionStatus: "not_met",
          progressMarker: "none",
          attempts: 1,
          verificationSignals: ["manual_handoff_required"],
        },
        checkpointDecisionTrace: {
          checkpointCandidate: false,
          replayRecommended: false,
          replayRefused: false,
          stableBoundaryReason: "manual_handoff",
        },
        actionabilityReview: ["manual_handoff_required:otp_required"],
        outcome: {
          actionId: "action-manual-handoff",
          actionType: "tap_element",
          resolutionStrategy: "deterministic",
          preState: { appPhase: "auth", readiness: "ready", blockingSignals: [] },
          postState: { appPhase: "auth", readiness: "ready", blockingSignals: [] },
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.2,
          outcome: "partial",
          stepState: "terminal_stop",
        },
        evidenceDelta: {},
        lowLevelStatus: "partial",
        lowLevelReasonCode: "OK",
      },
      nextSuggestions: [],
    }),
  });

  assert.equal(result.finalReplayState, "terminal_stop");
  assert.equal(result.outcomes[1]?.status, "skipped");
  assert.equal(result.outcomes[1]?.blockingStepNumber, 1);
});

test("runReplaySteps stops on recoverable_waiting and marks remaining steps as skipped", async () => {
  const steps = [
    buildReplayStep(1, { actionType: "wait_for_ui", text: "Catalog" }),
    buildReplayStep(2, { actionType: "tap_element", resourceId: "view-products" }),
  ];

  const result = await runReplaySteps({
    sessionId: "session-6",
    platform: "android",
    runnerProfile: "phase1",
    steps,
    executeStep: async () => ({
      status: "partial",
      reasonCode: "FLOW_FAILED",
      sessionId: "session-6",
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: false,
        retryDecisionTrace: {
          stepState: "recoverable_waiting",
          evidenceConfidence: "moderate",
          retryAllowed: true,
          maxAttempts: 3,
          attemptIndex: 3,
          backoffClass: "bounded_wait_ready",
          stateChangeRequired: false,
          stopReason: "wait_budget_exhausted",
        },
        postActionVerificationTrace: {
          postconditionMet: false,
          postconditionStatus: "partial",
          progressMarker: "partial",
          attempts: 3,
          verificationSignals: ["waiting_ui"],
        },
        checkpointDecisionTrace: {
          checkpointCandidate: false,
          replayRecommended: false,
          replayRefused: false,
          stableBoundaryReason: "waiting",
        },
        actionabilityReview: [],
        outcome: {
          actionId: "action-recoverable-waiting",
          actionType: "wait_for_ui",
          resolutionStrategy: "deterministic",
          preState: { appPhase: "ready", readiness: "waiting_ui", blockingSignals: [] },
          postState: { appPhase: "ready", readiness: "waiting_ui", blockingSignals: [] },
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 2,
          confidence: 0.4,
          outcome: "partial",
          stepState: "recoverable_waiting",
        },
        evidenceDelta: {},
        lowLevelStatus: "partial",
        lowLevelReasonCode: "FLOW_FAILED",
      },
      nextSuggestions: [],
    }),
  });

  assert.equal(result.finalReplayState, "recoverable_waiting");
  assert.deepEqual(result.progress.partialSteps, [1]);
  assert.deepEqual(result.progress.skippedSteps, [2]);
  assert.equal(result.outcomes[1]?.status, "skipped");
  assert.equal(result.outcomes[1]?.blockingStepNumber, 1);
});
