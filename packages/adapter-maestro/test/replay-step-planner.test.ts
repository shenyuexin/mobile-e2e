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

// Phase 10: MVP Command Support Matrix tests

test("buildReplayPlanFromFlowYaml accepts launchApp as supported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- launchApp:\n    appId: com.example.demo\n');

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0]?.actionType, "launch_app");
  assert.equal(plan.unsupportedCommands.length, 0);
});

test("buildReplayPlanFromFlowYaml accepts tapOn with identifier as supported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- tapOn:\n    identifier: "Login Button"\n');

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0]?.actionType, "tap_element");
  assert.equal(plan.unsupportedCommands.length, 0);
});

test("buildReplayPlanFromFlowYaml accepts tapOn with resourceId as supported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- tapOn:\n    id: "com.example:id/login_button"\n');

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0]?.actionType, "tap_element");
  assert.equal(plan.unsupportedCommands.length, 0);
});

test("buildReplayPlanFromFlowYaml accepts inputText as supported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- inputText: "hello world"\n');

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0]?.actionType, "type_into_element");
  assert.equal(plan.unsupportedCommands.length, 0);
});

test("buildReplayPlanFromFlowYaml accepts assertVisible as supported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- assertVisible:\n    text: "Welcome"\n');

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0]?.actionType, "wait_for_ui");
  assert.equal(plan.unsupportedCommands.length, 0);
});

test("buildReplayPlanFromFlowYaml marks stopApp as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- stopApp: {}\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "stopApp" }]);
});

test("buildReplayPlanFromFlowYaml marks clearState as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- clearState: {}\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "clearState" }]);
});

test("buildReplayPlanFromFlowYaml marks scroll as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- scroll: {}\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "scroll" }]);
});

test("buildReplayPlanFromFlowYaml marks swipe as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- swipe:\n    start: 100,500\n    end: 100,200\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "swipe" }]);
});

test("buildReplayPlanFromFlowYaml marks back as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- back: {}\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "back" }]);
});

test("buildReplayPlanFromFlowYaml marks home as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- home: {}\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "home" }]);
});

test("buildReplayPlanFromFlowYaml marks killApp as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- killApp: {}\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "killApp" }]);
});

test("buildReplayPlanFromFlowYaml marks assertNotVisible as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- assertNotVisible:\n    text: "Error"\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "assertNotVisible" }]);
});

test("buildReplayPlanFromFlowYaml marks nested runFlow as unsupported", () => {
  const plan = buildReplayPlanFromFlowYaml('appId: com.example.demo\n---\n- runFlow:\n    file: "flows/sub-flow.yaml"\n');

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.unsupportedCommands, [{ stepNumber: 1, command: "runFlow" }]);
});

test("buildReplayPlanFromFlowYaml mixed flow with supported and unsupported commands", () => {
  const flowContent = [
    "appId: com.example.demo",
    "---",
    "- launchApp:",
    "    appId: com.example.demo",
    "- tapOn:",
    '    identifier: "Login Button"',
    "- stopApp:",
    "    appId: com.example.demo",
    "- assertVisible:",
    '    text: "Welcome"',
  ].join("\n");

  const plan = buildReplayPlanFromFlowYaml(flowContent);

  // launchApp, tapOn, assertVisible are supported
  assert.equal(plan.steps.length, 3);
  // stopApp is unsupported
  assert.equal(plan.unsupportedCommands.length, 1);
  assert.equal(plan.unsupportedCommands[0]?.stepNumber, 3);
  assert.equal(plan.unsupportedCommands[0]?.command, "stopApp");
});
