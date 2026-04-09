import assert from "node:assert/strict";
import test from "node:test";
import { buildResumeCheckpoint, hasStateDrift, summarizeInterruptionDetail, pickEventSource } from "../src/interruption-orchestrator.ts";

test("buildResumeCheckpoint preserves replayable action context", () => {
  const checkpoint = buildResumeCheckpoint({
    actionId: "action-123",
    sessionId: "session-123",
    platform: "android",
    actionType: "type_into_element",
    selector: {
      resourceId: "com.demo:id/search_input",
      clickable: true,
    },
    args: {
      value: "espresso",
      timeoutMs: 1500,
    },
  });

  assert.equal(checkpoint.actionType, "type_into_element");
  assert.equal(checkpoint.selector?.resourceId, "com.demo:id/search_input");
  assert.equal(checkpoint.params?.value, "espresso");
  assert.equal(checkpoint.params?.timeoutMs, 1500);
});

test("buildResumeCheckpoint preserves required fields with minimal input", () => {
  const checkpoint = buildResumeCheckpoint({
    actionId: "min-action",
    sessionId: "min-session",
    platform: "ios",
    actionType: "tap_element",
  });

  assert.equal(checkpoint.actionId, "min-action");
  assert.equal(checkpoint.sessionId, "min-session");
  assert.equal(checkpoint.platform, "ios");
  assert.equal(checkpoint.actionType, "tap_element");
  assert.equal(checkpoint.selector, undefined);
  assert.equal(checkpoint.params, undefined);
  assert.ok(checkpoint.createdAt);
});

test("buildResumeCheckpoint preserves selector without args", () => {
  const checkpoint = buildResumeCheckpoint({
    actionId: "sel-action",
    sessionId: "sel-session",
    platform: "android",
    actionType: "scroll_to_element",
    selector: { text: "Submit" },
  });

  assert.equal(checkpoint.selector?.text, "Submit");
  assert.equal(checkpoint.params, undefined);
});

test("buildResumeCheckpoint preserves iOS platform correctly", () => {
  const checkpoint = buildResumeCheckpoint({
    actionId: "ios-action",
    sessionId: "ios-session",
    platform: "ios",
    actionType: "type_into_element",
    selector: { accessibilityId: "SearchField" },
  });

  assert.equal(checkpoint.platform, "ios");
  assert.equal(checkpoint.selector?.accessibilityId, "SearchField");
});

test("hasStateDrift returns false for same state", () => {
  const state = { appPhase: "ready", readiness: "stable" as const };
  assert.equal(hasStateDrift(state, state), false);
});

test("hasStateDrift returns true when appPhase changes", () => {
  const before = { appPhase: "login", readiness: "stable" as const };
  const after = { appPhase: "home", readiness: "stable" as const };
  assert.equal(hasStateDrift(before, after), true);
});

test("hasStateDrift returns false when both states are undefined", () => {
  assert.equal(hasStateDrift(undefined, undefined), false);
});

test("hasStateDrift returns false when only before is undefined", () => {
  const after = { appPhase: "home", readiness: "stable" as const };
  assert.equal(hasStateDrift(undefined, after), false);
});

test("hasStateDrift returns false when only after is undefined", () => {
  const before = { appPhase: "home", readiness: "stable" as const };
  assert.equal(hasStateDrift(before, undefined), false);
});

test("summarizeInterruptionDetail formats classification and signals", () => {
  const summary = summarizeInterruptionDetail({
    classification: { type: "permission_prompt", confidence: 0.85, rationale: ["test"] },
    signals: [
      { source: "ui_tree", key: "permission_prompt", value: "Camera access", confidence: 0.8 },
      { source: "ui_tree", key: "visible_text", value: "Allow", confidence: 0.6 },
    ],
  });

  assert.ok(summary.includes("permission_prompt"));
  assert.ok(summary.includes("0.85"));
  assert.ok(summary.includes("permission_prompt:Camera access"));
});

test("pickEventSource returns first signal source", () => {
  assert.equal(pickEventSource([
    { source: "state_summary", key: "k", value: "v", confidence: 0.5 },
    { source: "ui_tree", key: "k", value: "v", confidence: 0.5 },
  ]), "state_summary");
});

test("pickEventSource falls back to state_summary for empty signals", () => {
  assert.equal(pickEventSource([]), "state_summary");
});
