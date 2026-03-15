import assert from "node:assert/strict";
import test from "node:test";
import { decideInterruptionResolution } from "../src/interruption-resolver.ts";

test("decideInterruptionResolution selects matching auto rule", () => {
  const decision = decideInterruptionResolution({
    platform: "android",
    classification: {
      type: "permission_prompt",
      confidence: 0.8,
      rationale: ["permission_prompt"],
      ownerPackage: "com.android.permissioncontroller",
      containerRole: "dialog",
    },
    signals: [
      { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.8 },
      { source: "ui_tree", key: "owner_package", value: "com.android.permissioncontroller", confidence: 0.8 },
    ],
    policyRules: [
      {
        id: "android-permission",
        platform: "android",
        type: "permission_prompt",
        priority: "high",
        auto: true,
        signature: {
          ownerPackage: "com.android.permissioncontroller",
          requiredSignals: ["permission_prompt"],
        },
        action: {
          strategy: "tap_selector",
          slot: "primary",
          tapText: "Allow",
        },
        retry: { maxAttempts: 1 },
      },
    ],
  });

  assert.equal(decision.decision.status, "resolved");
  assert.equal(decision.decision.matchedRuleId, "android-permission");
});

test("decideInterruptionResolution chooses first_available_text from visible signals", () => {
  const decision = decideInterruptionResolution({
    platform: "android",
    classification: {
      type: "permission_prompt",
      confidence: 0.85,
      rationale: ["permission_prompt"],
      ownerPackage: "com.android.permissioncontroller",
      containerRole: "dialog",
    },
    signals: [
      { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.8 },
      { source: "ui_tree", key: "owner_package", value: "com.android.permissioncontroller", confidence: 0.8 },
      { source: "ui_tree", key: "visible_text", value: "Only this time", confidence: 0.7 },
    ],
    policyRules: [
      {
        id: "android-permission-first-available",
        platform: "android",
        type: "permission_prompt",
        priority: "high",
        auto: true,
        signature: {
          ownerPackage: "com.android.permissioncontroller",
          requiredSignals: ["permission_prompt"],
        },
        action: {
          strategy: "tap_selector",
          firstAvailableText: ["While using the app", "Only this time", "Allow"],
        },
        retry: { maxAttempts: 1 },
      },
    ],
  });

  assert.equal(decision.decision.status, "resolved");
  assert.equal(decision.decision.tapText, "Only this time");
});

test("decideInterruptionResolution fails when selected slot is unavailable in classification", () => {
  const decision = decideInterruptionResolution({
    platform: "ios",
    classification: {
      type: "action_sheet",
      confidence: 0.81,
      rationale: ["container_role:sheet"],
      ownerBundle: "com.apple.springboard",
      containerRole: "sheet",
      buttonSlots: ["primary", "cancel"],
    },
    signals: [
      { source: "ui_tree", key: "container_role", value: "sheet", confidence: 0.8 },
      { source: "ui_tree", key: "owner_bundle", value: "com.apple.springboard", confidence: 0.8 },
    ],
    policyRules: [
      {
        id: "ios-sheet-destructive",
        platform: "ios",
        type: "action_sheet",
        priority: "high",
        auto: true,
        signature: {
          ownerBundle: "com.apple.springboard",
          containerRole: "sheet",
          requiredSignals: ["container_role"],
        },
        action: {
          strategy: "choose_slot",
          slot: "destructive",
        },
        retry: { maxAttempts: 1 },
      },
    ],
  });

  assert.equal(decision.decision.status, "failed");
  assert.match(decision.decision.reason ?? "", /not available/i);
});

test("decideInterruptionResolution respects classification type when matching rules", () => {
  const decision = decideInterruptionResolution({
    platform: "android",
    classification: {
      type: "permission_prompt",
      confidence: 0.9,
      rationale: ["permission_prompt"],
      ownerPackage: "com.android.permissioncontroller",
      containerRole: "dialog",
      buttonSlots: ["primary", "secondary"],
    },
    signals: [
      { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.9 },
      { source: "ui_tree", key: "owner_package", value: "com.android.permissioncontroller", confidence: 0.9 },
    ],
    policyRules: [
      {
        id: "wrong-overlay-rule",
        platform: "android",
        type: "overlay",
        priority: "high",
        auto: true,
        signature: {
          ownerPackage: "com.android.permissioncontroller",
          requiredSignals: ["permission_prompt"],
        },
        action: {
          strategy: "tap_selector",
          tapText: "Dismiss",
        },
        retry: { maxAttempts: 1 },
      },
    ],
  });

  assert.equal(decision.decision.status, "failed");
  assert.match(decision.decision.reason ?? "", /No interruption policy rule matched/i);
});
