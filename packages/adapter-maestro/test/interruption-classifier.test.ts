import assert from "node:assert/strict";
import test from "node:test";
import { classifyInterruptionFromSignals } from "../src/interruption-classifier.ts";

test("classifyInterruptionFromSignals prioritizes permission prompt", () => {
  const result = classifyInterruptionFromSignals([
    { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.8 },
    { source: "ui_tree", key: "owner_package", value: "com.android.permissioncontroller", confidence: 0.8 },
    { source: "ui_tree", key: "visible_text", value: "Allow", confidence: 0.6 },
  ]);

  assert.equal(result.type, "permission_prompt");
  assert.equal(result.confidence >= 0.35, true);
});

test("classifyInterruptionFromSignals falls back to unknown for empty signals", () => {
  const result = classifyInterruptionFromSignals([]);
  assert.equal(result.type, "unknown");
});
