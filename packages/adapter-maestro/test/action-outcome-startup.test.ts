import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { persistActionRecord } from "@mobile-e2e-mcp/core";
import { suggestKnownRemediationWithMaestro } from "../src/index.ts";
import { resolveRepoPath } from "../src/harness-config.js";

const repoRoot = resolveRepoPath();

test("suggestKnownRemediationWithMaestro prioritizes signing guidance for iOS signature preflight evidence", async () => {
  const sessionId = `known-remediation-ios-signature-${Date.now()}`;
  const actionId = `known-remediation-ios-signature-action-${Date.now()}`;
  const startupDir = path.join(repoRoot, "artifacts", "ios-physical-actions", sessionId);
  await mkdir(startupDir, { recursive: true });
  await writeFile(
    path.join(startupDir, "type_text.execution.md"),
    [
      "# iOS physical type_text execution evidence",
      "",
      "- attemptedBackend: local_manual_runner",
      "- executedBackend: local_manual_runner",
      "- fallbackUsed: false",
      "- primaryFailurePhase: preflight",
      "- startupPhase: preflight",
      "- reasonCode: CONFIGURATION_ERROR",
      "",
      "## Summary",
      "Runner installation failed during iOS preflight because the test-runner code signature could not be validated on device (0xe8008018).",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "type_into_element", text: "Email", value: "demo@example.com" },
    outcome: {
      actionId,
      actionType: "type_into_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      outcome: "failed",
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "ios-physical-actions", sessionId, "type_text.execution.md"),
        supportLevel: "partial",
        description: "iOS startup signature evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.configurationError,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(remediation.status, "success");
  assert.equal(
    remediation.data.remediation.some((item) => /apple development identity|signing|provisioning/i.test(item)),
    true,
  );
});

test("suggestKnownRemediationWithMaestro detects permission interruption from blocking signals", async () => {
  const sessionId = `remediation-permission-${Date.now()}`;
  const actionId = `permission-action-${Date.now()}`;
  const artifactsDir = path.join(repoRoot, "artifacts", "maestro-actions", sessionId);
  await mkdir(artifactsDir, { recursive: true });

  await writeFile(
    path.join(artifactsDir, "tap.execution.md"),
    [
      "# Tap execution evidence",
      "",
      "- stateSummary: permission_prompt visible, owner_package=com.android.permissioncontroller",
      "- blockingSignals: permission_prompt, dialog_actions",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Allow", value: "" },
    outcome: {
      actionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 1,
      outcome: "failed",
      // postState with blockingSignals triggers the interruption attribution path
      postState: {
        appPhase: "unknown",
        readiness: "interrupted",
        blockingSignals: ["permission_prompt", "dialog_actions"],
        topVisibleTexts: ["Allow", "Deny"],
      },
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "tap.execution.md"),
        supportLevel: "partial",
        description: "Permission prompt blocking evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.adapterError,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(remediation.status, "success");
  assert.ok(
    remediation.data.remediation.length > 0,
    "Expected remediation array to be populated when blocking signals trigger attribution",
  );
  // The attribution engine should detect blockingSignals=permission_prompt and produce
  // a recommendedRecovery that references interruption resolution.
  assert.ok(
    remediation.data.remediation.some((item) => /interrupt|permission|blocking|dialog|dismiss|resolution/i.test(item)),
    `Expected permission/interruption remediation, got: ${JSON.stringify(remediation.data.remediation)}`,
  );
});

test("suggestKnownRemediationWithMaestro detects network layer issues from offline readiness", async () => {
  const sessionId = `remediation-network-${Date.now()}`;
  const actionId = `network-action-${Date.now()}`;
  const artifactsDir = path.join(repoRoot, "artifacts", "maestro-actions", sessionId);
  await mkdir(artifactsDir, { recursive: true });

  await writeFile(
    path.join(artifactsDir, "tap.execution.md"),
    [
      "# Tap execution evidence",
      "",
      "- readiness: offline_terminal",
      "- network probe: dns resolution failed",
      "- blockingSignals: network_instability",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Login", value: "" },
    outcome: {
      actionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 2,
      outcome: "failed",
      // postState with network readiness triggers network attribution path
      postState: {
        appPhase: "unknown",
        readiness: "offline_terminal",
        blockingSignals: ["network_instability"],
      },
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "tap.execution.md"),
        supportLevel: "partial",
        description: "Network offline evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.deviceUnavailable,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(remediation.status, "success");
  assert.ok(
    remediation.data.remediation.length > 0,
    "Expected remediation array to be populated when network signals trigger attribution",
  );
  // The attribution engine should detect readiness=offline_terminal and produce
  // a recommendedRecovery that references network recovery.
  assert.ok(
    remediation.data.remediation.some((item) => /network|offline|connectivity|dns|http/i.test(item)),
    `Expected network remediation, got: ${JSON.stringify(remediation.data.remediation)}`,
  );
});

test("suggestKnownRemediationWithMaestro populates skillGuidance when attribution signals present", async () => {
  const sessionId = `remediation-skill-${Date.now()}`;
  const actionId = `skill-action-${Date.now()}`;
  const startupDir = path.join(repoRoot, "artifacts", "maestro-actions", sessionId);
  await mkdir(startupDir, { recursive: true });

  // Write evidence that triggers the "environment" affectedLayer (startupPhase=preflight)
  // This will produce skill guidance with firstFix about entry/hook ownership.
  await writeFile(
    path.join(startupDir, "launch.execution.md"),
    [
      "# Launch execution evidence",
      "",
      "- startupPhase: preflight",
      "- primaryFailurePhase: preflight",
      "- reasonCode: CONFIGURATION_ERROR",
      "",
      "## Summary",
      "App failed to launch during preflight check. Tooling environment not properly configured.",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "launch_app", appId: "com.example.demo" },
    outcome: {
      actionId,
      actionType: "launch_app",
      resolutionStrategy: "deterministic",
      preState: { appPhase: "launching", readiness: "waiting_ui", blockingSignals: [] },
      postState: {
        appPhase: "unknown",
        readiness: "backend_failed_terminal",
        blockingSignals: [],
      },
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      outcome: "failed",
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "launch.execution.md"),
        supportLevel: "partial",
        description: "Preflight failure evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.configurationError,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId, platform: "android" });

  assert.equal(remediation.status, "success");
  // skillGuidance should be populated because attribution detected an affectedLayer
  // and platform=android was provided.
  assert.ok(
    remediation.data.skillGuidance !== undefined && remediation.data.skillGuidance.firstFix,
    `Expected skillGuidance.firstFix to be populated, got: ${JSON.stringify(remediation.data.skillGuidance)}`,
  );
  // The remediation array should include the skill guidance's firstFix
  assert.ok(
    remediation.data.remediation.includes(remediation.data.skillGuidance!.firstFix),
    `Expected remediation to include skill guidance firstFix: ${remediation.data.skillGuidance!.firstFix}`,
  );
});
