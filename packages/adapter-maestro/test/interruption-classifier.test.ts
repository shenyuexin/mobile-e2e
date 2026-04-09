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

test("classifyInterruptionFromSignals detects system_alert from alert/dialog markers", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "visible_text", value: "System alert: App crashed", confidence: 0.7 },
  ]);
  assert.equal(result.type, "system_alert");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals detects action_sheet from container_role", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "container_role", value: "bottom_sheet", confidence: 0.8 },
  ]);
  assert.equal(result.type, "action_sheet");
  assert.ok(result.confidence >= 0.35);
  assert.deepEqual(result.buttonSlots, ["primary", "cancel", "destructive"]);
});

test("classifyInterruptionFromSignals detects overlay from dialog_actions", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "dialog_actions", value: "dismiss", confidence: 0.6 },
    { source: "state_summary", key: "interrupted", value: "true", confidence: 0.5 },
  ]);
  assert.equal(result.type, "overlay");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals detects keyboard_blocking", () => {
  // Need signals where keyboard score beats action_sheet score.
  // container_role contributes to action_sheet, so use visible_text with "keyboard" keyword.
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "visible_text", value: "Keyboard is covering content", confidence: 0.7 },
  ]);
  assert.equal(result.type, "keyboard_blocking");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals higher-score type wins over lower", () => {
  const result = classifyInterruptionFromSignals([
    { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.9 },
    { source: "ui_tree", key: "container_role", value: "keyboard", confidence: 0.3 },
  ]);
  // permission_prompt should win because permission_prompt signal contributes more to score
  assert.equal(result.type, "permission_prompt");
});

test("classifyInterruptionFromSignals includes ownerPackage and ownerBundle in result", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "owner_package", value: "com.apple.springboard", confidence: 0.7 },
    { source: "ui_tree", key: "owner_bundle", value: "com.apple.system", confidence: 0.6 },
    { source: "ui_tree", key: "dialog_actions", value: "dismiss", confidence: 0.5 },
  ]);
  assert.equal(result.ownerPackage, "com.apple.springboard");
  assert.equal(result.ownerBundle, "com.apple.system");
});

test("classifyInterruptionFromSignals includes containerRole in result", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "container_role", value: "dialog", confidence: 0.7 },
    { source: "ui_tree", key: "dialog_actions", value: "ok", confidence: 0.5 },
  ]);
  assert.equal(result.containerRole, "dialog");
});
