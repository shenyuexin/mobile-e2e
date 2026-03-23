import assert from "node:assert/strict";
import test from "node:test";
import type { InterruptionPolicyRuleV2, InterruptionSignal } from "@mobile-e2e-mcp/contracts";
import { evaluateNetworkRetryPolicy, isReplayAllowedByPolicy, resolveInterruptionPlan } from "../src/policy-engine.ts";

test("resolveInterruptionPlan filters matched rule by expected classification type", () => {
  const signals: InterruptionSignal[] = [
    { source: "state_summary", key: "permission_prompt", value: "permission_prompt", confidence: 0.9 },
    { source: "ui_tree", key: "owner_package", value: "com.android.permissioncontroller", confidence: 0.8 },
  ];

  const rules: InterruptionPolicyRuleV2[] = [
    {
      id: "overlay-match",
      platform: "android",
      type: "overlay",
      priority: "high",
      auto: true,
      signature: {
        ownerPackage: "com.android.permissioncontroller",
        requiredSignals: ["permission_prompt"],
      },
      action: { strategy: "tap_selector", tapText: "Dismiss" },
      retry: { maxAttempts: 1 },
    },
  ];

  const withoutTypeFilter = resolveInterruptionPlan(signals, rules);
  assert.equal(withoutTypeFilter.matchedRule?.id, "overlay-match");

  const withTypeFilter = resolveInterruptionPlan(signals, rules, undefined, "permission_prompt");
  assert.equal(withTypeFilter.matchedRule, undefined);
  assert.equal(withTypeFilter.denied, true);
});

test("evaluateNetworkRetryPolicy distinguishes retryable and terminal network readiness", () => {
  assert.deepEqual(evaluateNetworkRetryPolicy("waiting_network"), {
    retryable: true,
    terminal: false,
    reason: "waiting_network",
  });
  assert.deepEqual(evaluateNetworkRetryPolicy("offline_terminal"), {
    retryable: false,
    terminal: true,
    reason: "offline_terminal",
  });
  assert.deepEqual(evaluateNetworkRetryPolicy("backend_failed_terminal"), {
    retryable: false,
    terminal: true,
    reason: "backend_failed_terminal",
  });
});

test("isReplayAllowedByPolicy blocks high-risk replay and allows low-risk with interactive scopes", () => {
  assert.equal(isReplayAllowedByPolicy({ allow: ["tap"], deny: [] }, true), false);
  assert.equal(isReplayAllowedByPolicy({ allow: ["inspect"], deny: [] }, false), false);
  assert.equal(isReplayAllowedByPolicy({ allow: ["tap", "inspect"], deny: [] }, false), true);
});
