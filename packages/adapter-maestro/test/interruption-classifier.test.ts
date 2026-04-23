import assert from "node:assert/strict";
import test from "node:test";
import { classifyInterruptionFromPageContext, classifyInterruptionFromSignals } from "../src/interruption-classifier.ts";

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

test("classifyInterruptionFromPageContext maps permission surface into existing interruption taxonomy", () => {
  const result = classifyInterruptionFromPageContext({
    type: "permission_surface",
    platform: "ios",
    detectionSource: "deterministic",
    confidence: 0.91,
    ownerBundle: "com.apple.springboard",
    containerRole: "alert",
    visibleSignals: ["Allow", "Don’t Allow"],
  });

  assert.equal(result.type, "permission_prompt");
  assert.equal(result.ownerBundle, "com.apple.springboard");
  assert.equal(result.containerRole, "alert");
});

test("classifyInterruptionFromPageContext keeps normal page as unknown interruption semantics", () => {
  const result = classifyInterruptionFromPageContext({
    type: "normal_page",
    platform: "android",
    detectionSource: "deterministic",
    confidence: 0.95,
  });

  assert.equal(result.type, "unknown");
});

test("classifyInterruptionFromSignals detects system_alert via 'dialog' keyword", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "visible_text", value: "Unexpected dialog appeared", confidence: 0.7 },
  ]);
  assert.equal(result.type, "system_alert");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals detects action_sheet via 'sheet' in value", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "visible_text", value: "Share via bottom sheet", confidence: 0.7 },
  ]);
  assert.equal(result.type, "action_sheet");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals detects overlay from dialog_actions alone", () => {
  const result = classifyInterruptionFromSignals([
    { source: "ui_tree", key: "dialog_actions", value: "ok,cancel", confidence: 0.6 },
  ]);
  assert.equal(result.type, "overlay");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals detects overlay from interrupted signal alone", () => {
  const result = classifyInterruptionFromSignals([
    { source: "state_summary", key: "interrupted", value: "true", confidence: 0.5 },
  ]);
  assert.equal(result.type, "overlay");
  assert.ok(result.confidence >= 0.35);
});

test("classifyInterruptionFromSignals permission_prompt wins over system_alert", () => {
  // permission_prompt: 1 signal * 2 weight = 2
  // system_alert: 1 signal (value includes "alert") = 1
  // permission_prompt should win
  const result = classifyInterruptionFromSignals([
    { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.8 },
    { source: "ui_tree", key: "visible_text", value: "System alert: crash", confidence: 0.7 },
  ]);
  assert.equal(result.type, "permission_prompt");
});

test("classifyInterruptionFromSignals permission_prompt wins over action_sheet", () => {
  // permission_prompt: 1 * 2 = 2
  // action_sheet: container_role(1) + sheet-in-value(0) = 1
  const result = classifyInterruptionFromSignals([
    { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.9 },
    { source: "ui_tree", key: "container_role", value: "bottom_sheet", confidence: 0.8 },
  ]);
  assert.equal(result.type, "permission_prompt");
});

test("classifyInterruptionFromSignals multiple signals boost the winning score", () => {
  // Two permission_prompt signals: 2 * 2 = 4, should clearly win
  const result = classifyInterruptionFromSignals([
    { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.8 },
    { source: "ui_tree", key: "owner_package", value: "com.android.permissioncontroller", confidence: 0.8 },
    { source: "ui_tree", key: "container_role", value: "bottom_sheet", confidence: 0.6 },
  ]);
  // permission_prompt: 2 (key) + 1 (owner_package) = 3
  // action_sheet: 1 (container_role) + 1 (sheet in value) = 2
  assert.equal(result.type, "permission_prompt");
});

test("classifyInterruptionFromPageContext maps system_alert_surface into system_alert", () => {
  const result = classifyInterruptionFromPageContext({
    type: "system_alert_surface",
    platform: "android",
    detectionSource: "deterministic",
    confidence: 0.85,
    visibleSignals: ["System alert: App crashed"],
  });

  assert.equal(result.type, "system_alert");
});

test("classifyInterruptionFromPageContext maps action_sheet_surface into action_sheet", () => {
  const result = classifyInterruptionFromPageContext({
    type: "action_sheet_surface",
    platform: "ios",
    detectionSource: "deterministic",
    confidence: 0.88,
    containerRole: "action_sheet",
  });

  assert.equal(result.type, "action_sheet");
});

test("classifyInterruptionFromPageContext maps app_modal into overlay", () => {
  const result = classifyInterruptionFromPageContext({
    type: "app_modal",
    platform: "android",
    detectionSource: "deterministic",
    confidence: 0.80,
    visibleSignals: ["OK", "Cancel"],
  });

  assert.equal(result.type, "overlay");
});

test("classifyInterruptionFromPageContext maps keyboard_surface into keyboard_blocking", () => {
  const result = classifyInterruptionFromPageContext({
    type: "keyboard_surface",
    platform: "ios",
    detectionSource: "deterministic",
    confidence: 0.90,
    visibleSignals: ["keyboard"],
  });

  assert.equal(result.type, "keyboard_blocking");
});
