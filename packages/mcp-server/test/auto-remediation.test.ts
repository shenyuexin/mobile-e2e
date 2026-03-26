import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath, loadSessionRecord } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type FailureAttribution, type PerformActionWithEvidenceData, type PerformActionWithEvidenceInput, type ToolResult } from "@mobile-e2e-mcp/contracts";
import { createServer } from "../src/index.ts";
import { performActionWithAutoRemediation } from "../src/tools/perform-action-with-auto-remediation.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function buildTestDeviceId(sessionId: string): string {
  return `${sessionId}-device`;
}

async function cleanupSessionArtifacts(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", buildTestDeviceId(sessionId))), { force: true });
}

function buildBasePerformActionResult(params: {
  sessionId: string;
  status: ToolResult<PerformActionWithEvidenceData>["status"];
  actionId: string;
  actionType?: PerformActionWithEvidenceInput["action"]["actionType"];
  appPhase?: "loading" | "crashed" | "unknown" | "ready" | "blocked";
  readiness?: "waiting_ui" | "waiting_network" | "degraded_success" | "backend_failed_terminal" | "offline_terminal" | "unknown" | "ready" | "interrupted";
  failureCategory?: NonNullable<PerformActionWithEvidenceData["outcome"]["failureCategory"]>;
  targetQuality?: NonNullable<PerformActionWithEvidenceData["outcome"]["targetQuality"]>;
  actionabilityReview?: string[];
  reasonCode?: ToolResult<PerformActionWithEvidenceData>["reasonCode"];
  manualHandoffRequired?: boolean;
  manualHandoffReason?: "otp_required" | "captcha_required" | "consent_required" | "protected_page" | "secure_input_required" | "unknown";
}): ToolResult<PerformActionWithEvidenceData> {
  return {
    status: params.status,
    reasonCode: params.reasonCode ?? (params.status === "failed" ? REASON_CODES.adapterError : REASON_CODES.unsupportedOperation),
    sessionId: params.sessionId,
    durationMs: 5,
    attempts: 1,
    artifacts: [`artifacts/actions/${params.actionId}.json`],
    data: {
      sessionRecordFound: true,
      outcome: {
        actionId: params.actionId,
        actionType: params.actionType ?? "tap_element",
        resolutionStrategy: "deterministic",
        preState: {
          appPhase: "ready",
          readiness: "ready",
          blockingSignals: [],
        },
        postState: {
          appPhase: params.appPhase ?? "unknown",
          readiness: params.readiness ?? "unknown",
          blockingSignals: [],
        },
        stateChanged: false,
        fallbackUsed: false,
        retryCount: 0,
        targetQuality: params.targetQuality,
        failureCategory: params.failureCategory,
        confidence: 0.2,
        outcome: params.status === "success" ? "success" : params.status,
      },
      evidenceDelta: {
        runtimeDeltaSummary: params.appPhase === "crashed" ? "crash signal detected" : undefined,
      },
      preStateSummary: {
        appPhase: "ready",
        readiness: "ready",
        blockingSignals: [],
      },
      postStateSummary: {
        appPhase: params.appPhase ?? "unknown",
        readiness: params.readiness ?? "unknown",
        blockingSignals: [],
        manualHandoff: params.manualHandoffRequired
          ? {
            required: true,
            reason: params.manualHandoffReason ?? "unknown",
            summary: "Manual operator intervention is required.",
            suggestedOperatorActions: ["Complete the required operator step manually."],
            resumeHints: ["Resume the bounded flow after the protected step is cleared."],
          }
          : undefined,
      },
      actionabilityReview: params.actionabilityReview,
      manualHandoffRequired: params.manualHandoffRequired,
      manualHandoffReason: params.manualHandoffReason,
      lowLevelStatus: params.status,
      lowLevelReasonCode: params.reasonCode ?? (params.status === "failed" ? REASON_CODES.adapterError : REASON_CODES.unsupportedOperation),
      evidence: [],
      sessionAuditPath: buildSessionAuditRelativePath(params.sessionId),
    },
    nextSuggestions: [],
  };
}

function buildAttribution(affectedLayer: FailureAttribution["affectedLayer"]): FailureAttribution {
  return {
    affectedLayer,
    mostLikelyCause: `layer=${affectedLayer}`,
    candidateCauses: [`layer=${affectedLayer}`],
    missingEvidence: [],
    recommendedNextProbe: "inspect",
    recommendedRecovery: affectedLayer === "interruption" ? "Replay the bounded action once." : "Recover to known state.",
  };
}

test("performActionWithAutoRemediation short-circuits when the action already succeeded", async () => {
  const sessionId = `auto-remediation-success-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "launch_app", appId: "host.exp.exponent" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "success", actionId: "auto-success", actionType: "launch_app", appPhase: "ready", readiness: "ready" }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "action_succeeded");
    assert.equal(result.data.autoRemediation?.attempted, false);
    assert.equal(result.data.autoRemediation?.stateMachineStatus, "ready_to_execute");
    assert.equal(result.data.autoRemediation?.stateMachineTrace?.includes("stop_reason:action_succeeded"), true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation executes one bounded recovery attempt for allowlisted crash attribution", async () => {
  const sessionId = `auto-remediation-crash-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-crash", appPhase: "crashed", readiness: "unknown" }),
        explainLastFailure: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-crash", attribution: buildAttribution("crash") }, nextSuggestions: [] }),
        rankFailureCandidates: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-crash", candidates: [buildAttribution("crash")] }, nextSuggestions: [] }),
        suggestKnownRemediation: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-crash", remediation: ["Recover to known state."] }, nextSuggestions: [] }),
        recoverToKnownState: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: ["artifacts/recovery/relaunch.txt"], data: { summary: { strategy: "relaunch_app", recovered: true, note: "Recovered after one relaunch.", stateBefore: { appPhase: "crashed", readiness: "unknown", blockingSignals: [] }, stateAfter: { appPhase: "ready", readiness: "ready", blockingSignals: [] } } }, nextSuggestions: [] }),
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.attempted, true);
    assert.equal(result.data.autoRemediation?.selectedRecovery, "relaunch_app");
    assert.equal(result.data.autoRemediation?.stopReason, "recovered");
    const stored = await loadSessionRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.equal(stored?.session.timeline.some((event) => event.type === "auto_remediation_triggered" && event.actionId === "auto-crash"), true);
    assert.equal(stored?.session.timeline.some((event) => event.type === "auto_remediation_succeeded" && event.actionId === "auto-crash"), true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation stops when the recovery tool is denied by policy", async () => {
  const sessionId = `auto-remediation-denied-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1", policyProfile: "read-only" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "wait_for_ui", contentDesc: "Loading" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "partial", actionId: "auto-denied", actionType: "wait_for_ui", appPhase: "loading", readiness: "waiting_ui" }),
        explainLastFailure: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-denied", attribution: buildAttribution("network") }, nextSuggestions: [] }),
        rankFailureCandidates: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-denied", candidates: [buildAttribution("network")] }, nextSuggestions: [] }),
        suggestKnownRemediation: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-denied", remediation: ["Recover to known state."] }, nextSuggestions: [] }),
        recoverToKnownState: async () => ({ status: "failed", reasonCode: REASON_CODES.policyDenied, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { summary: { strategy: "wait_until_ready", recovered: false, note: "Policy denied recovery." } }, nextSuggestions: [] }),
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "policy_denied");
    assert.equal(result.data.autoRemediation?.attempted, true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation stops when the audit gate is unavailable", async () => {
  const sessionId = `auto-remediation-audit-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
    let recoverCalled = false;
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-audit", appPhase: "crashed", readiness: "unknown" }),
        explainLastFailure: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-audit", attribution: buildAttribution("crash") }, nextSuggestions: [] }),
        rankFailureCandidates: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-audit", candidates: [buildAttribution("crash")] }, nextSuggestions: [] }),
        suggestKnownRemediation: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-audit", remediation: ["Recover to known state."] }, nextSuggestions: [] }),
        recoverToKnownState: async () => { recoverCalled = true; throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "audit_unavailable");
    assert.equal(recoverCalled, false);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation stops immediately when perform_action_with_evidence requires manual handoff", async () => {
  const sessionId = `auto-remediation-handoff-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", text: "Get code" },
      },
      {
        performAction: async () => buildBasePerformActionResult({
          sessionId,
          status: "partial",
          actionId: "auto-handoff",
          actionType: "tap_element",
          appPhase: "blocked",
          readiness: "interrupted",
          failureCategory: "blocked",
          reasonCode: REASON_CODES.manualHandoffRequired,
          actionabilityReview: ["manual_handoff_required:otp_required"],
          manualHandoffRequired: true,
          manualHandoffReason: "otp_required",
        }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.attempted, false);
    assert.equal(result.data.autoRemediation?.stopReason, "manual_handoff_required");
    assert.equal(result.data.autoRemediation?.stopDetail.includes("otp_required"), true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation blocks high-risk replay suggestions", async () => {
  const sessionId = `auto-remediation-replay-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "Pay now" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-replay", appPhase: "unknown", readiness: "unknown" }),
        explainLastFailure: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-replay", attribution: buildAttribution("runtime") }, nextSuggestions: [] }),
        rankFailureCandidates: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-replay", candidates: [buildAttribution("runtime")] }, nextSuggestions: [] }),
        suggestKnownRemediation: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-replay", remediation: ["Replay the bounded action once."] }, nextSuggestions: [] }),
        recoverToKnownState: async () => { throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "high_risk_replay");
    assert.equal(result.data.autoRemediation?.stateMachineStatus, "terminal_stop");
    assert.equal(result.data.autoRemediation?.stateMachineTrace?.includes("stop_reason:high_risk_replay"), true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation replays when checkpoint drift suggests a safer stable path", async () => {
  const sessionId = `auto-remediation-drift-replay-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-drift-replay", appPhase: "ready", readiness: "ready" }),
        compareAgainstBaseline: async () => ({
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            found: true,
            actionId: "auto-drift-replay",
            comparison: {
              baselineActionId: "stable-boundary",
              comparedActionId: "auto-drift-replay",
              differences: ["screen login != catalog"],
              matched: false,
              divergenceSignals: ["screen_mismatch"],
              replayValue: "medium",
              checkpointDivergence: "screen_mismatch",
            },
          },
          nextSuggestions: [],
        }),
        explainLastFailure: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-drift-replay", attribution: buildAttribution("ui_state") }, nextSuggestions: [] }),
        rankFailureCandidates: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-drift-replay", candidates: [buildAttribution("ui_state")] }, nextSuggestions: [] }),
        suggestKnownRemediation: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: [], data: { found: true, actionId: "auto-drift-replay", remediation: [] }, nextSuggestions: [] }),
        recoverToKnownState: async () => { throw new Error("recover should not run"); },
        replayLastStablePath: async () => ({
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: ["artifacts/recovery/replay.txt"],
          data: {
            summary: {
              strategy: "replay_last_successful_action",
              recovered: true,
              note: "Replayed the last stable action after checkpoint drift.",
              replayedActionId: "stable-boundary",
              replayValue: "medium",
              checkpointDivergence: "screen_mismatch",
            },
          },
          nextSuggestions: [],
        }),
      },
    );

    assert.equal(result.data.autoRemediation?.selectedRecovery, "replay_last_successful_action");
    assert.equal(result.data.autoRemediation?.stateMachineStatus, "replay_recommended");
    assert.equal(result.data.autoRemediation?.stateMachineTrace?.includes("selected_recovery:replay_last_successful_action"), true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation short-circuits selector-missing failures before attribution", async () => {
  const sessionId = `auto-remediation-selector-missing-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "Missing target" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-selector-missing", failureCategory: "selector_missing", targetQuality: "low" }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "selector_missing");
    assert.equal(result.data.autoRemediation?.attempted, false);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation short-circuits ambiguous selector failures before attribution", async () => {
  const sessionId = `auto-remediation-selector-ambiguous-${Date.now()}`;
  const server = createServer();

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "Duplicate target" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "partial", actionId: "auto-selector-ambiguous", failureCategory: "selector_ambiguous", targetQuality: "low" }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "selector_ambiguous");
    assert.equal(result.data.autoRemediation?.attempted, false);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation directly recovers waiting-state failures using action metadata", async () => {
  const sessionId = `auto-remediation-waiting-${Date.now()}`;
  const server = createServer();
  let explainCalled = false;

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "wait_for_ui", contentDesc: "Loading" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "partial", actionId: "auto-waiting", actionType: "wait_for_ui", failureCategory: "waiting", targetQuality: "medium", appPhase: "loading", readiness: "waiting_ui", actionabilityReview: ["pre_state_not_ready:waiting_ui"] }),
        explainLastFailure: async () => { explainCalled = true; throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => ({ status: "success", reasonCode: REASON_CODES.ok, sessionId, durationMs: 1, attempts: 1, artifacts: ["artifacts/recovery/wait.txt"], data: { summary: { strategy: "wait_until_ready", recovered: true, note: "Recovered after waiting for readiness.", stateBefore: { appPhase: "loading", readiness: "waiting_ui", blockingSignals: [] }, stateAfter: { appPhase: "ready", readiness: "ready", blockingSignals: [] } } }, nextSuggestions: [] }),
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(explainCalled, false);
    assert.equal(result.data.autoRemediation?.attempted, true);
    assert.equal(result.data.autoRemediation?.selectedRecovery, "wait_until_ready");
    assert.equal(result.data.autoRemediation?.stopReason, "recovered");
    assert.equal(result.data.autoRemediation?.stateMachineStatus, "recoverable_waiting");
    assert.equal(result.data.autoRemediation?.stateMachineTrace?.includes("waiting_state_detected"), true);
    assert.equal(result.data.autoRemediation?.stateMachineTrace?.includes("selected_recovery:wait_until_ready"), true);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation stops early on backend-terminal readiness", async () => {
  const sessionId = `auto-remediation-backend-terminal-${Date.now()}`;
  const server = createServer();
  let recoverCalled = false;

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "Checkout" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-backend-terminal", appPhase: "blocked", readiness: "backend_failed_terminal" }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { recoverCalled = true; throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "backend_terminal");
    assert.equal(recoverCalled, false);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation stops early on offline-terminal readiness", async () => {
  const sessionId = `auto-remediation-offline-terminal-${Date.now()}`;
  const server = createServer();
  let recoverCalled = false;

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "Retry" },
      },
      {
        performAction: async () => buildBasePerformActionResult({ sessionId, status: "failed", actionId: "auto-offline-terminal", appPhase: "blocked", readiness: "offline_terminal" }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { recoverCalled = true; throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "offline_terminal");
    assert.equal(recoverCalled, false);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});

test("performActionWithAutoRemediation stops when retry budget is exhausted without state change", async () => {
  const sessionId = `auto-remediation-retry-exhausted-${Date.now()}`;
  const server = createServer();
  let recoverCalled = false;

  try {
    await server.invoke("start_session", { sessionId, platform: "android", deviceId: buildTestDeviceId(sessionId), profile: "phase1" });
    const result = await performActionWithAutoRemediation(
      {
        sessionId,
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: { actionType: "tap_element", contentDesc: "Open list" },
      },
      {
        performAction: async () => buildBasePerformActionResult({
          sessionId,
          status: "failed",
          actionId: "auto-retry-exhausted",
          appPhase: "loading",
          readiness: "waiting_network",
          reasonCode: REASON_CODES.retryExhaustedNoStateChange,
        }),
        explainLastFailure: async () => { throw new Error("explain should not run"); },
        rankFailureCandidates: async () => { throw new Error("rank should not run"); },
        suggestKnownRemediation: async () => { throw new Error("suggest should not run"); },
        recoverToKnownState: async () => { recoverCalled = true; throw new Error("recover should not run"); },
        replayLastStablePath: async () => { throw new Error("replay should not run"); },
      },
    );

    assert.equal(result.data.autoRemediation?.stopReason, "retry_exhausted_no_state_change");
    assert.equal(result.data.autoRemediation?.stateMachineStatus, "terminal_stop");
    assert.equal(result.data.autoRemediation?.stateMachineTrace?.includes("retry_stop:retry_exhausted_no_state_change"), true);
    assert.equal(recoverCalled, false);
  } finally {
    await cleanupSessionArtifacts(sessionId);
  }
});
