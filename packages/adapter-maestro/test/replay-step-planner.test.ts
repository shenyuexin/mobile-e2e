import assert from "node:assert/strict";
import test from "node:test";
import type { RecordedStep } from "@mobile-e2e-mcp/contracts";
import { buildInitialReplayProgress, buildReplayPlanFromFlowYaml, buildReplayStepsFromRecordedSteps } from "../src/replay-step-planner.ts";

function buildRecordedStep(overrides: Partial<RecordedStep> = {}): RecordedStep {
  return {
    stepNumber: overrides.stepNumber ?? 1,
    eventId: overrides.eventId ?? "event-1",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    actionType: overrides.actionType ?? "tap_element",
    actionIntent: overrides.actionIntent,
    x: overrides.x,
    y: overrides.y,
    confidence: overrides.confidence ?? "high",
    reason: overrides.reason ?? "test step",
    warnings: overrides.warnings,
  };
}

test("buildReplayStepsFromRecordedSteps preserves stepNumber confidence and warnings", () => {
  const replaySteps = buildReplayStepsFromRecordedSteps([
    buildRecordedStep({
      stepNumber: 1,
      confidence: "low",
      warnings: ["Low confidence semantic mapping."],
      actionType: "type_into_element",
      actionIntent: {
        actionType: "type_into_element",
        resourceId: "phone-input",
        value: "13800138000",
      },
    }),
  ]);

  assert.equal(replaySteps[0]?.stepNumber, 1);
  assert.equal(replaySteps[0]?.confidence, "low");
  assert.equal(replaySteps[0]?.warnings?.includes("Low confidence semantic mapping."), true);
  assert.equal(replaySteps[0]?.source, "recorded_step");
});

test("buildInitialReplayProgress returns empty completion arrays and sequential remaining steps", () => {
  const progress = buildInitialReplayProgress(3);

  assert.deepEqual(progress.completedSteps, []);
  assert.deepEqual(progress.partialSteps, []);
  assert.deepEqual(progress.failedSteps, []);
  assert.deepEqual(progress.skippedSteps, []);
  assert.deepEqual(progress.remainingSteps, [1, 2, 3]);
});

test("buildReplayPlanFromFlowYaml surfaces tapOn.point as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- tapOn:\n    point: 10,10\n');

  assert.deepEqual(plan.steps, []);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "tapOn.point" }]);
});
