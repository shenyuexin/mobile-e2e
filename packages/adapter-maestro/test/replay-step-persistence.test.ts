import assert from "node:assert/strict";
import test from "node:test";
import { buildInitialReplayProgress } from "../src/replay-step-planner.ts";
import { updateReplayProgress } from "../src/replay-step-persistence.ts";

test("updateReplayProgress removes a successful step from remainingSteps", () => {
  const initial = buildInitialReplayProgress(3);
  const updated = updateReplayProgress(initial, 2, "success");

  assert.deepEqual(updated.completedSteps, [2]);
  assert.deepEqual(updated.remainingSteps, [1, 3]);
  assert.equal(updated.lastSuccessfulStepNumber, 2);
});

test("updateReplayProgress sets firstFailedStepNumber for failed step", () => {
  const initial = buildInitialReplayProgress(3);
  const updated = updateReplayProgress(initial, 1, "failed");

  assert.deepEqual(updated.failedSteps, [1]);
  assert.deepEqual(updated.remainingSteps, [2, 3]);
  assert.equal(updated.firstFailedStepNumber, 1);
});
