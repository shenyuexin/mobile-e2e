import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAccessPolicyConfig, requiredPolicyScopesForTool, isToolAllowedByProfile } from "../src/policy-engine.ts";
import type { AccessProfile } from "../src/policy-engine.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// --- loadAccessPolicyConfig tests ---

test("loadAccessPolicyConfig parses valid YAML profiles", async () => {
  const config = await loadAccessPolicyConfig(repoRoot);
  assert.ok(config.profiles["sample-harness-default"], "Should have sample-harness-default profile");
  assert.ok(config.profiles["read-only"], "Should have read-only profile");
  assert.ok(config.profiles["sample-harness-default"].allow.includes("inspect"));
  assert.ok(config.profiles["read-only"].deny.includes("tap"));
});

test("loadAccessPolicyConfig throws for missing file", async () => {
  await assert.rejects(
    () => loadAccessPolicyConfig(repoRoot, "configs/policies/non-existent-profiles.yaml"),
    /ENOENT/,
  );
});

test("loadAccessPolicyConfig throws for invalid YAML content", async () => {
  const tmpDir = path.resolve(repoRoot, "artifacts", "_tmp-policy-" + Date.now());
  const badFile = path.resolve(tmpDir, "bad.yaml");
  await mkdir(tmpDir, { recursive: true });
  // YAML that parses to a plain string, not an object with profiles
  await writeFile(badFile, "just a string\n", "utf8");
  try {
    await assert.rejects(
      () => loadAccessPolicyConfig(repoRoot, badFile),
      /Invalid access policy config/,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// --- requiredPolicyScopesForTool tests ---

test("requiredPolicyScopesForTool returns correct scopes for inspect tools", () => {
  assert.deepEqual(requiredPolicyScopesForTool("inspect_ui"), ["inspect"]);
  assert.deepEqual(requiredPolicyScopesForTool("query_ui"), ["inspect"]);
  assert.deepEqual(requiredPolicyScopesForTool("resolve_ui_target"), ["inspect"]);
  assert.deepEqual(requiredPolicyScopesForTool("wait_for_ui"), ["inspect"]);
  assert.deepEqual(requiredPolicyScopesForTool("describe_capabilities"), ["inspect"]);
  assert.deepEqual(requiredPolicyScopesForTool("list_devices"), ["inspect"]);
  assert.deepEqual(requiredPolicyScopesForTool("doctor"), ["inspect"]);
});

test("requiredPolicyScopesForTool returns correct scopes for action tools", () => {
  assert.deepEqual(requiredPolicyScopesForTool("tap"), ["tap"]);
  assert.deepEqual(requiredPolicyScopesForTool("tap_element"), ["tap"]);
  assert.deepEqual(requiredPolicyScopesForTool("launch_app"), ["tap"]);
  assert.deepEqual(requiredPolicyScopesForTool("terminate_app"), ["tap"]);
  assert.deepEqual(requiredPolicyScopesForTool("type_text"), ["type"]);
  assert.deepEqual(requiredPolicyScopesForTool("type_into_element"), ["type"]);
  assert.deepEqual(requiredPolicyScopesForTool("scroll_only"), ["swipe"]);
  assert.deepEqual(requiredPolicyScopesForTool("scroll_and_resolve_ui_target"), ["swipe"]);
  assert.deepEqual(requiredPolicyScopesForTool("scroll_and_tap_element"), ["swipe"]);
});

test("requiredPolicyScopesForTool returns correct scopes for multi-scope tools", () => {
  assert.deepEqual(requiredPolicyScopesForTool("perform_action_with_evidence"), ["tap", "type", "swipe"]);
  assert.deepEqual(requiredPolicyScopesForTool("reset_app_state"), ["clear-data", "install", "uninstall"]);
  assert.deepEqual(requiredPolicyScopesForTool("run_flow"), ["tap", "type", "swipe"]);
  assert.deepEqual(requiredPolicyScopesForTool("detect_interruption"), ["interrupt"]);
  assert.deepEqual(requiredPolicyScopesForTool("resolve_interruption"), ["interrupt"]);
});

test("requiredPolicyScopesForTool returns [] for unknown tools", () => {
  assert.deepEqual(requiredPolicyScopesForTool("some_unknown_tool"), []);
  assert.deepEqual(requiredPolicyScopesForTool("totally_made_up"), []);
});

// --- isToolAllowedByProfile tests ---

test("isToolAllowedByProfile allows when all scopes are in allow list", () => {
  const profile: AccessProfile = { allow: ["inspect", "screenshot", "logs"], deny: [] };
  assert.equal(isToolAllowedByProfile(profile, "inspect_ui"), true);
  assert.equal(isToolAllowedByProfile(profile, "take_screenshot"), true);
  assert.equal(isToolAllowedByProfile(profile, "get_logs"), true);
});

test("isToolAllowedByProfile denies when any scope is in deny list", () => {
  const profile: AccessProfile = { allow: ["inspect", "screenshot", "logs", "tap"], deny: ["tap"] };
  assert.equal(isToolAllowedByProfile(profile, "tap_element"), false);
  assert.equal(isToolAllowedByProfile(profile, "launch_app"), false);
});

test("isToolAllowedByProfile denies when scope is missing from allow list", () => {
  const profile: AccessProfile = { allow: ["inspect"], deny: [] };
  // tap_element requires ["tap"], but "tap" is not in allow
  assert.equal(isToolAllowedByProfile(profile, "tap_element"), false);
  assert.equal(isToolAllowedByProfile(profile, "scroll_only"), false);
});

test("isToolAllowedByProfile defaults to true for unknown tools (no scopes required)", () => {
  const profile: AccessProfile = { allow: [], deny: ["tap"] };
  // Unknown tools return [] from requiredPolicyScopesForTool, which means allowed
  assert.equal(isToolAllowedByProfile(profile, "unknown_tool_xyz"), true);
});

test("isToolAllowedByProfile allows multi-scope tools when all scopes are allowed", () => {
  const profile: AccessProfile = { allow: ["tap", "type", "swipe"], deny: [] };
  assert.equal(isToolAllowedByProfile(profile, "run_flow"), true);
  assert.equal(isToolAllowedByProfile(profile, "perform_action_with_evidence"), true);
});

test("isToolAllowedByProfile denies multi-scope tools when any scope is missing", () => {
  const profile: AccessProfile = { allow: ["tap", "type"], deny: [] };
  // run_flow requires ["tap", "type", "swipe"] — "swipe" missing
  assert.equal(isToolAllowedByProfile(profile, "run_flow"), false);
});
