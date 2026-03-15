import assert from "node:assert/strict";
import test from "node:test";
import { buildResumeCheckpoint } from "../src/interruption-orchestrator.ts";

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
