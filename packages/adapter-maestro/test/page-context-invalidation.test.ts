import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES, type GetScreenSummaryData, type ResolveInterruptionData, type ResumeInterruptedActionData, type ToolResult } from "@mobile-e2e-mcp/contracts";
import {
  performActionWithEvidenceWithMaestro,
  resetInterruptionGuardTestHooksForTesting,
  resetOcrFallbackTestHooksForTesting,
  setInterruptionGuardTestHooksForTesting,
  setOcrFallbackTestHooksForTesting,
} from "../src/action-orchestrator.ts";

function buildScreenSummaryResult(
  sessionId: string,
  screenSummary: GetScreenSummaryData["screenSummary"],
): ToolResult<GetScreenSummaryData> {
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile: "phase1",
      outputPath: `artifacts/state-summaries/${sessionId}/android-phase1.json`,
      command: ["fixture", "get_screen_summary"],
      exitCode: 0,
      supportLevel: "full",
      summarySource: "ui_only",
      screenSummary,
      evidence: [],
    },
    nextSuggestions: [],
  };
}

const notNeededInterruptionResult = (sessionId: string): ToolResult<ResolveInterruptionData> => ({
  status: "success",
  reasonCode: REASON_CODES.ok,
  sessionId,
  durationMs: 1,
  attempts: 1,
  artifacts: [],
  data: {
    attempted: false,
    status: "not_needed",
  },
  nextSuggestions: [],
});

const resumedInterruptionResult = (sessionId: string): ToolResult<ResumeInterruptedActionData> => ({
  status: "success",
  reasonCode: REASON_CODES.ok,
  sessionId,
  durationMs: 1,
  attempts: 1,
  artifacts: [],
  data: {
    attempted: false,
    resumed: true,
  },
  nextSuggestions: [],
});

test.afterEach(() => {
  resetOcrFallbackTestHooksForTesting();
  resetInterruptionGuardTestHooksForTesting();
});

test("performActionWithEvidenceWithMaestro invalidates page-context cache after a state-changing action", async () => {
  let getScreenSummaryCalls = 0;
  let invalidationCalls = 0;

  setOcrFallbackTestHooksForTesting({
    getScreenSummary: async (input) => {
      getScreenSummaryCalls += 1;
      return buildScreenSummaryResult(
        input.sessionId,
        getScreenSummaryCalls === 1
          ? { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Catalog", topVisibleTexts: ["Catalog"] }
          : { appPhase: "detail", readiness: "ready", blockingSignals: [], screenTitle: "Product", topVisibleTexts: ["Product"] },
      );
    },
  });

  setInterruptionGuardTestHooksForTesting({
    resolveInterruption: async (input) => notNeededInterruptionResult(input.sessionId),
    resumeInterruptedAction: async (input) => resumedInterruptionResult(input.sessionId),
  });

  const result = await performActionWithEvidenceWithMaestro(
    {
      sessionId: "page-context-invalidation",
      platform: "android",
      dryRun: true,
      action: { actionType: "tap_element", text: "Open product" },
    },
    {
      executeIntentWithMaestro: async ({ sessionId }) => ({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {},
        nextSuggestions: [],
      }),
      invalidatePageContextCache: (sessionId) => {
        invalidationCalls += 1;
        assert.equal(sessionId, "page-context-invalidation");
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.data.outcome.stateChanged, true);
  assert.equal(invalidationCalls, 1);
});
