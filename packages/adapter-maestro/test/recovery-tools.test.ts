import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { persistActionRecord } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type ToolResult, type PerformActionWithEvidenceData } from "@mobile-e2e-mcp/contracts";
import { replayLastStablePathWithMaestro } from "../src/recovery-tools.ts";

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
