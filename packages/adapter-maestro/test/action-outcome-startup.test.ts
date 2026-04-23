import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { persistActionRecord, recordFailureSignature, recordBaselineEntry } from "@mobile-e2e-mcp/core";
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

test("suggestKnownRemediationWithMaestro includes indexed remediation from failure signature", async () => {
  const sessionId = `remediation-indexed-${Date.now()}`;
  const actionId = `indexed-action-${Date.now()}`;
  const indexedActionId = `indexed-sig-${Date.now()}`;
  const artifactsDir = path.join(repoRoot, "artifacts", "maestro-actions", sessionId);
  await mkdir(artifactsDir, { recursive: true });

  await writeFile(
    path.join(artifactsDir, "tap.execution.md"),
    [
      "# Tap execution evidence",
      "",
      "- startupPhase: runner_execution",
      "- reasonCode: ADAPTER_ERROR",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Submit", value: "" },
    outcome: {
      actionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 1,
      outcome: "failed",
      postState: {
        appPhase: "unknown",
        readiness: "waiting_ui",
        blockingSignals: [],
      },
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "tap.execution.md"),
        supportLevel: "partial",
        description: "Indexed remediation test evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.adapterError,
    updatedAt: new Date().toISOString(),
  });

  // Seed the failure index with a known remediation using a distinct actionId
  // to avoid overwrite by explainLastFailureWithMaestro's internal recordFailureSignature call.
  await recordFailureSignature(repoRoot, {
    actionId: indexedActionId,
    sessionId,
    signature: {
      actionType: "tap_element",
      screenId: "submit-screen",
      affectedLayer: "ui_state",
      topSignal: undefined,
      interruptionCategory: undefined,
      readiness: "waiting_ui",
      progressMarker: undefined,
      stateChangeCategory: undefined,
    },
    causalSignals: ["selector did not resolve to a visible element"],
    replayValue: "low",
    checkpointDivergence: "outcome_mismatch",
    fallbackUsed: false,
    evidenceFingerprint: undefined,
    baselineRelation: "drifted_checkpoint",
    remediation: [
      "Indexed hint: verify the target element exists in the current screen hierarchy before tapping.",
      "Indexed hint: use wait_for_ui with a visibility predicate before retrying.",
    ],
    updatedAt: new Date().toISOString(),
  });

  // Pass the seeded actionId explicitly so indexed remediation lookup finds our entry.
  const remediation = await suggestKnownRemediationWithMaestro({ sessionId, actionId: indexedActionId, platform: "android" });

  assert.equal(remediation.status, "success");
  assert.ok(
    remediation.data.remediation.length > 0,
    "Expected remediation array to be populated when indexed remediation exists",
  );
  assert.ok(
    remediation.data.remediation.some((item) => /indexed hint|selector exists|wait_for_ui/i.test(item)),
    `Expected indexed remediation hint, got: ${JSON.stringify(remediation.data.remediation)}`,
  );
});

test("suggestKnownRemediationWithMaestro includes similar-failures hint when matching signatures exist", async () => {
  const sessionId = `remediation-similar-${Date.now()}`;
  const actionId = `similar-action-${Date.now()}`;
  const olderActionId = `older-similar-action-${Date.now() - 1000}`;
  const artifactsDir = path.join(repoRoot, "artifacts", "maestro-actions", sessionId);
  await mkdir(artifactsDir, { recursive: true });

  await writeFile(
    path.join(artifactsDir, "tap.execution.md"),
    [
      "# Tap execution evidence",
      "",
      "- reasonCode: ADAPTER_ERROR",
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
      retryCount: 0,
      outcome: "failed",
      postState: {
        appPhase: "unknown",
        readiness: "waiting_ui",
        blockingSignals: [],
      },
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "tap.execution.md"),
        supportLevel: "partial",
        description: "Similar failures test evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.adapterError,
    updatedAt: new Date().toISOString(),
  });

  // Seed an older failure signature with matching characteristics
  await recordFailureSignature(repoRoot, {
    actionId: olderActionId,
    sessionId: `older-session-${Date.now() - 2000}`,
    signature: {
      actionType: "tap_element",
      screenId: "submit-screen",
      affectedLayer: "ui_state",
      topSignal: undefined,
      interruptionCategory: undefined,
      readiness: "waiting_ui",
      progressMarker: undefined,
      stateChangeCategory: undefined,
    },
    causalSignals: ["element not visible"],
    replayValue: "low",
    checkpointDivergence: "outcome_mismatch",
    fallbackUsed: false,
    evidenceFingerprint: undefined,
    baselineRelation: "drifted_checkpoint",
    remediation: ["Older incident: check element visibility before tapping."],
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId, platform: "android" });

  assert.equal(remediation.status, "success");
  // When similar failures exist, the remediation should include the similarity hint
  assert.ok(
    remediation.data.remediation.some((item) => /resembles|previous incidents|closest matching|similar/i.test(item)),
    `Expected similar-failures hint, got: ${JSON.stringify(remediation.data.remediation)}`,
  );
});

test("suggestKnownRemediationWithMaestro includes baseline-divergence hint when baseline exists", async () => {
  const sessionId = `remediation-baseline-${Date.now()}`;
  const baselineActionId = `baseline-success-${Date.now()}`;
  const currentActionId = `current-failed-${Date.now()}`;
  const artifactsDir = path.join(repoRoot, "artifacts", "maestro-actions", sessionId);
  await mkdir(artifactsDir, { recursive: true });

  // Write a successful baseline action record
  await writeFile(
    path.join(artifactsDir, "tap_baseline.execution.md"),
    [
      "# Tap execution evidence (baseline)",
      "",
      "- reasonCode: OK",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId: baselineActionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Submit", value: "" },
    outcome: {
      actionId: baselineActionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: true,
      fallbackUsed: false,
      retryCount: 0,
      outcome: "success",
      progressMarker: "full",
      postState: {
        appPhase: "idle",
        readiness: "waiting_ui",
        blockingSignals: [],
        screenId: "baseline-screen",
      },
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "tap_baseline.execution.md"),
        supportLevel: "partial",
        description: "Baseline success evidence",
      },
    ],
    lowLevelStatus: "ok",
    lowLevelReasonCode: REASON_CODES.ok,
    updatedAt: new Date().toISOString(),
  });

  await recordBaselineEntry(repoRoot, {
    actionId: baselineActionId,
    actionType: "tap_element",
    selector: { text: "Submit" },
    screenId: "baseline-screen",
    appId: undefined,
    outcome: "success",
    updatedAt: new Date().toISOString(),
  });

  // Write a failed current action record with different screen
  await writeFile(
    path.join(artifactsDir, "tap_current.execution.md"),
    [
      "# Tap execution evidence (current)",
      "",
      "- reasonCode: ADAPTER_ERROR",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId: currentActionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Submit", value: "" },
    outcome: {
      actionId: currentActionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      outcome: "failed",
      postState: {
        appPhase: "unknown",
        readiness: "waiting_ui",
        blockingSignals: [],
        screenId: "different-screen",
      },
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "maestro-actions", sessionId, "tap_current.execution.md"),
        supportLevel: "partial",
        description: "Current failed evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.adapterError,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId, actionId: currentActionId, platform: "android" });

  assert.equal(remediation.status, "success");
  // When baseline divergence exists, the remediation should include the divergence hint
  assert.ok(
    remediation.data.remediation.some((item) => /diverges|successful baseline|differences/i.test(item)),
    `Expected baseline-divergence hint, got: ${JSON.stringify(remediation.data.remediation)}`,
  );
});
