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
