import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { persistActionRecord } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type ToolResult, type PerformActionWithEvidenceData } from "@mobile-e2e-mcp/contracts";
import { replayLastStablePathWithMaestro } from "../src/recovery-tools.ts";
import { recoverToKnownStateWithMaestro } from "../src/recovery-tools.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupAction(actionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, "artifacts", "actions", `${actionId}.json`), { force: true });
}

function buildReplayDeps(result: ToolResult<PerformActionWithEvidenceData>) {
  return {
    getSessionStateWithMaestro: async () => ({
      status: "success" as const,
      reasonCode: REASON_CODES.ok,
      sessionId: result.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        platform: "android" as const,
        runnerProfile: "phase1" as const,
        sessionRecordFound: false,
        state: { appPhase: "ready" as const, readiness: "ready" as const, blockingSignals: [] },
        capabilities: { platform: "android" as const, runnerProfile: "phase1" as const, toolCapabilities: [], groups: [] },
        screenSummary: { appPhase: "ready" as const, readiness: "ready" as const, blockingSignals: [] },
      },
      nextSuggestions: [],
    }),
    launchAppWithMaestro: async () => ({
      status: "success" as const,
      reasonCode: REASON_CODES.ok,
      sessionId: result.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile: "phase1" as const, appId: "app", launchCommand: [], exitCode: 0 },
      nextSuggestions: [],
    }),
    performActionWithEvidenceWithMaestro: async () => result,
  };
}

test("replayLastStablePathWithMaestro refuses high-risk replay boundaries", async () => {
  const sessionId = `recovery-high-risk-${Date.now()}`;
  const actionId = `recovery-high-risk-action-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: { actionType: "tap_element", text: "Pay now" },
      outcome: {
        actionId,
        actionType: "tap_element",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: REASON_CODES.ok,
      updatedAt: new Date().toISOString(),
    });

    const result = await replayLastStablePathWithMaestro(
      { sessionId, platform: "android", runnerProfile: "phase1", dryRun: true },
      buildReplayDeps({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          sessionRecordFound: false,
          outcome: {
            actionId: "replayed",
            actionType: "tap_element",
            resolutionStrategy: "deterministic",
            stateChanged: true,
            fallbackUsed: false,
            retryCount: 0,
            outcome: "success",
          },
          evidenceDelta: {},
          lowLevelStatus: "success",
          lowLevelReasonCode: REASON_CODES.ok,
        },
        nextSuggestions: [],
      }),
    );

    assert.equal(result.status, "failed");
    assert.equal(result.reasonCode, REASON_CODES.replayRefusedHighRiskBoundary);
    assert.equal(result.data.summary.checkpointDecision?.replayRefused, true);
  } finally {
    await cleanupAction(actionId);
  }
});

test("replayLastStablePathWithMaestro reports checkpoint divergence and replay value", async () => {
  const sessionId = `recovery-divergence-${Date.now()}`;
  const actionId = `recovery-divergence-action-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: { actionType: "launch_app", appId: "host.exp.exponent" },
      outcome: {
        actionId,
        actionType: "launch_app",
        resolutionStrategy: "deterministic",
        preState: { appPhase: "launching", readiness: "waiting_ui", blockingSignals: [], screenId: "splash" },
        postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "catalog" },
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        progressMarker: "full",
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: REASON_CODES.ok,
      updatedAt: new Date().toISOString(),
    });

    const result = await replayLastStablePathWithMaestro(
      { sessionId, platform: "android", runnerProfile: "phase1", dryRun: true },
      {
        ...buildReplayDeps({
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            sessionRecordFound: false,
            outcome: {
              actionId: "replayed-divergence",
              actionType: "launch_app",
              resolutionStrategy: "deterministic",
              stateChanged: true,
              fallbackUsed: false,
              retryCount: 0,
              outcome: "success",
            },
            evidenceDelta: {},
            lowLevelStatus: "success",
            lowLevelReasonCode: REASON_CODES.ok,
          },
          nextSuggestions: [],
        }),
        getSessionStateWithMaestro: async () => ({
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            dryRun: true,
            platform: "android",
            runnerProfile: "phase1",
            sessionRecordFound: false,
            state: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "login" },
            capabilities: { platform: "android", runnerProfile: "phase1", toolCapabilities: [], groups: [] },
            screenSummary: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "login" },
          },
          nextSuggestions: [],
        }),
      },
    );

    assert.equal(result.reasonCode, REASON_CODES.ok);
    assert.equal(result.data.summary.checkpointDivergence, "screen_mismatch");
    assert.equal(result.data.summary.replayValue, "medium");
  } finally {
    await cleanupAction(actionId);
  }
});

test("recoverToKnownStateWithMaestro stops early for backend-terminal readiness", async () => {
  const sessionId = `recovery-terminal-${Date.now()}`;
  const result = await recoverToKnownStateWithMaestro(
    { sessionId, platform: "android", runnerProfile: "phase1", dryRun: true },
    {
      getSessionStateWithMaestro: async () => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          platform: "android",
          runnerProfile: "phase1",
          sessionRecordFound: false,
          state: { appPhase: "blocked", readiness: "backend_failed_terminal", blockingSignals: ["error_state"] },
          capabilities: { platform: "android", runnerProfile: "phase1", toolCapabilities: [], groups: [] },
          screenSummary: { appPhase: "blocked", readiness: "backend_failed_terminal", blockingSignals: ["error_state"] },
        },
        nextSuggestions: [],
      }),
      launchAppWithMaestro: async () => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: { dryRun: true, runnerProfile: "phase1", appId: "app", launchCommand: [], exitCode: 0 },
        nextSuggestions: [],
      }),
      performActionWithEvidenceWithMaestro: async () => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          sessionRecordFound: false,
          outcome: {
            actionId: "noop",
            actionType: "tap_element",
            resolutionStrategy: "deterministic",
            stateChanged: false,
            fallbackUsed: false,
            retryCount: 0,
            outcome: "success",
          },
          evidenceDelta: {},
          lowLevelStatus: "success",
          lowLevelReasonCode: REASON_CODES.ok,
        },
        nextSuggestions: [],
      }),
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.networkBackendTerminal);
});

test("replayLastStablePathWithMaestro returns structured dryRun response on safe replay", async () => {
  const sessionId = `recovery-replay-success-${Date.now()}`;
  const actionId = `recovery-replay-action-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: { actionType: "tap_element", resourceId: "com.example:id/nav_button" },
      outcome: {
        actionId,
        actionType: "tap_element",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: REASON_CODES.ok,
      updatedAt: new Date().toISOString(),
    });

    const result = await replayLastStablePathWithMaestro(
      { sessionId, platform: "android", runnerProfile: "phase1", dryRun: true },
      buildReplayDeps({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          sessionRecordFound: true,
          outcome: {
            actionId: "replayed",
            actionType: "tap_element",
            resolutionStrategy: "deterministic",
            stateChanged: true,
            fallbackUsed: false,
            retryCount: 0,
            outcome: "success",
          },
          evidenceDelta: {},
          lowLevelStatus: "success",
          lowLevelReasonCode: REASON_CODES.ok,
        },
        nextSuggestions: [],
      }),
    );

    assert.equal(result.status, "success");
    assert.ok(result.data.summary.checkpointDecision?.replayRefused === false);
    assert.ok(result.data.summary.replayedActionId !== undefined);
  } finally {
    await cleanupAction(actionId);
  }
});

test("recoverToKnownStateWithMaestro returns structured dryRun response with recoveryPath", async () => {
  const sessionId = `recovery-path-${Date.now()}`;
  const result = await recoverToKnownStateWithMaestro(
    { sessionId, platform: "android", runnerProfile: "phase1", dryRun: true },
    {
      getSessionStateWithMaestro: async () => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          platform: "android",
          runnerProfile: "phase1",
          sessionRecordFound: true,
          state: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
          capabilities: { platform: "android", runnerProfile: "phase1", toolCapabilities: [], groups: [] },
          screenSummary: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
        },
        nextSuggestions: [],
      }),
      launchAppWithMaestro: async () => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: { dryRun: true, runnerProfile: "phase1", appId: "app", launchCommand: [], exitCode: 0 },
        nextSuggestions: [],
      }),
      performActionWithEvidenceWithMaestro: async () => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          sessionRecordFound: true,
          outcome: {
            actionId: "recovery-action",
            actionType: "launch_app",
            resolutionStrategy: "deterministic",
            stateChanged: true,
            fallbackUsed: false,
            retryCount: 0,
            outcome: "success",
          },
          evidenceDelta: {},
          lowLevelStatus: "success",
          lowLevelReasonCode: REASON_CODES.ok,
        },
        nextSuggestions: [],
      }),
    },
  );

  assert.equal(result.status, "success");
  assert.ok(result.data.summary, "Should have summary in dryRun response");
  assert.equal(result.data.summary.recovered, true);
});
