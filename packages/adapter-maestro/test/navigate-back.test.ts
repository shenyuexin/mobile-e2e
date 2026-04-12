/**
 * Navigate back tool-level behavioral tests.
 *
 * These tests call navigateBackWithMaestro with mocked dependencies
 * to verify real tool behavior: pre-back state captured before back action,
 * post-back evidence fields derived from StateSummary.pageIdentity,
 * and pageTreeHashUnchanged semantics.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { afterEach } from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  navigateBackWithMaestro,
  setNavigateBackTestHooksForTesting,
  resetNavigateBackTestHooksForTesting,
} from "../src/index.ts";
import type { NavigateBackTestHooks } from "../src/ui-action-tools.js";

// Per-test cleanup: prevents mock state leakage between tests
afterEach(() => {
  resetNavigateBackTestHooksForTesting();
});

// ─── Android post-back evidence fields ─────────────────────────────────────

test("navigate_back Android captures pre-back hash BEFORE back action", async () => {
  // Track call ordering to prove preBackTreeHash is captured before back
  const callOrder: string[] = [];
  let capturedPreBackTreeHash: string | undefined;

  const hooks: NavigateBackTestHooks = {
    getScreenSummary: async (input) => {
      if (callOrder.filter(c => c === "getScreenSummary").length === 0) {
        callOrder.push("getScreenSummary"); // pre-back
        return {
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile: input.runnerProfile,
            outputPath: "/tmp/test.json",
            command: [],
            exitCode: 0,
            supportLevel: "full",
            summarySource: "ui_only",
            screenSummary: {
              appPhase: "authentication",
              readiness: "ready",
              blockingSignals: [],
              pageIdentity: {
                treeHash: "pre-back-hash-abc",
                visibleElementCount: 10,
                identityConfidence: 0.9,
              },
            },
          },
          nextSuggestions: [],
        };
      } else {
        callOrder.push("getScreenSummary"); // post-back
        return {
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile: input.runnerProfile,
            outputPath: "/tmp/test.json",
            command: [],
            exitCode: 0,
            supportLevel: "full",
            summarySource: "ui_only",
            screenSummary: {
              appPhase: "catalog",
              readiness: "ready",
              blockingSignals: [],
              pageIdentity: {
                treeHash: "post-back-hash-def",
                visibleElementCount: 15,
                identityConfidence: 0.9,
              },
            },
          },
          nextSuggestions: [],
        };
      }
    },
    waitForUiStable: async () => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: "test",
      durationMs: 100,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: "phase1",
        stable: true,
        polls: 2,
        stableAfterMs: 300,
        stableFingerprint: "stability-fingerprint",
        confidence: 0.95,
        stabilityBasis: "visible-tree",
        timeoutMs: 5000,
        intervalMs: 300,
        consecutiveStable: 2,
      },
      nextSuggestions: [],
    }),
    executeBackCommand: async () => {
      callOrder.push("executeBackCommand");
      return { exitCode: 0, stderr: "", stdout: "" };
    },
  };

  setNavigateBackTestHooksForTesting(hooks);

  const result = await navigateBackWithMaestro({
    sessionId: "test-session",
    platform: "android",
    deviceId: "test-device",
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.stateChanged, "unknown");

  // Verify call ordering: pre-back state captured BEFORE back action
  assert.equal(callOrder[0], "getScreenSummary", "pre-back state should be captured first");
  assert.equal(callOrder[1], "executeBackCommand", "back action should come after pre-back state");
  assert.equal(callOrder[2], "getScreenSummary", "wait_for_ui_stable calls getScreenSummary internally for pre");

  // Verify preBackTreeHash comes from the pre-back state
  assert.equal(result.data.preBackTreeHash, "pre-back-hash-abc");

  // Verify postBackTreeHash comes from the post-back state
  assert.equal(result.data.postBackTreeHash, "post-back-hash-def");

  // Verify pageTreeHashUnchanged is false (different hashes)
  assert.equal(result.data.pageTreeHashUnchanged, false);
});

test("navigate_back Android postBackPageIdentity derives from StateSummary.pageIdentity", async () => {
  let getScreenSummaryCallCount = 0;

  const hooks: NavigateBackTestHooks = {
    getScreenSummary: async (input) => {
      getScreenSummaryCallCount++;
      const isPreCall = getScreenSummaryCallCount === 1;
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile: input.runnerProfile,
          outputPath: "/tmp/test.json",
          command: [],
          exitCode: 0,
          supportLevel: "full",
          summarySource: "ui_only",
          screenSummary: {
            appPhase: isPreCall ? "authentication" as const : "catalog" as const,
            readiness: "ready" as const,
            blockingSignals: [] as string[],
            pageIdentity: {
              treeHash: isPreCall ? "pre-hash" : "post-hash",
              visibleElementCount: isPreCall ? 10 : 15,
              hasBackAffordance: !isPreCall,
              backAffordanceLabel: "Settings",
              identitySource: "heading" as const,
              identityConfidence: 0.9,
              isTopLevel: isPreCall,
            },
          },
        },
        nextSuggestions: [],
      };
    },
    waitForUiStable: async () => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: "test",
      durationMs: 100,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: "phase1",
        stable: true,
        polls: 2,
        stableAfterMs: 300,
        stableFingerprint: "should-not-be-used-for-page-identity",
        confidence: 0.95,
        stabilityBasis: "visible-tree",
        timeoutMs: 5000,
        intervalMs: 300,
        consecutiveStable: 2,
      },
      nextSuggestions: [],
    }),
    executeBackCommand: async () => ({ exitCode: 0, stderr: "", stdout: "" }),
  };

  setNavigateBackTestHooksForTesting(hooks);

  const result = await navigateBackWithMaestro({
    sessionId: "test-session",
    platform: "android",
    deviceId: "test-device",
  });

  assert.equal(result.status, "success");

  // postBackPageIdentity should derive from StateSummary.pageIdentity, NOT from stableFingerprint
  assert.ok(result.data.postBackPageIdentity, "postBackPageIdentity should be present");
  assert.equal(result.data.postBackPageIdentity?.treeHash, "post-hash");
  assert.equal(result.data.postBackPageIdentity?.visibleElementCount, 15);
  assert.equal(result.data.postBackPageIdentity?.hasBackAffordance, true);
  assert.equal(result.data.postBackPageIdentity?.backAffordanceLabel, "Settings");

  // stableFingerprint is different from pageIdentity.treeHash — they should NOT match
  assert.notEqual(result.data.postBackPageIdentity?.treeHash, "should-not-be-used-for-page-identity");
});

test("navigate_back Android pageTreeHashUnchanged=true when hashes match", async () => {
  const hooks: NavigateBackTestHooks = {
    getScreenSummary: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile,
        outputPath: "/tmp/test.json",
        command: [],
        exitCode: 0,
        supportLevel: "full",
        summarySource: "ui_only",
        screenSummary: {
          appPhase: "authentication" as const,
          readiness: "ready" as const,
          blockingSignals: [] as string[],
          pageIdentity: {
            treeHash: "same-hash", // same for both pre and post
            visibleElementCount: 8,
            identityConfidence: 0.6,
          },
        },
      },
      nextSuggestions: [],
    }),
    waitForUiStable: async () => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: "test",
      durationMs: 100,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: "phase1",
        stable: true,
        polls: 2,
        stableAfterMs: 300,
        stableFingerprint: "unused",
        confidence: 0.95,
        stabilityBasis: "visible-tree",
        timeoutMs: 5000,
        intervalMs: 300,
        consecutiveStable: 2,
      },
      nextSuggestions: [],
    }),
    executeBackCommand: async () => ({ exitCode: 0, stderr: "", stdout: "" }),
  };

  setNavigateBackTestHooksForTesting(hooks);

  const result = await navigateBackWithMaestro({
    sessionId: "test-session",
    platform: "android",
    deviceId: "test-device",
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.pageTreeHashUnchanged, true);
  assert.equal(result.data.preBackTreeHash, "same-hash");
  assert.equal(result.data.postBackTreeHash, "same-hash");
});

test("navigate_back Android back command failure propagates error", async () => {
  const hooks: NavigateBackTestHooks = {
    getScreenSummary: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile,
        outputPath: "/tmp/test.json",
        command: [],
        exitCode: 0,
        supportLevel: "full",
        summarySource: "ui_only",
        screenSummary: {
          appPhase: "authentication" as const,
          readiness: "ready" as const,
          blockingSignals: [] as string[],
        },
      },
      nextSuggestions: [],
    }),
    executeBackCommand: async () => ({ exitCode: 1, stderr: "error: device not found", stdout: "" }),
  };

  setNavigateBackTestHooksForTesting(hooks);

  const result = await navigateBackWithMaestro({
    sessionId: "test-session",
    platform: "android",
    deviceId: "test-device",
  });

  assert.equal(result.status, "failed");
  // Pre-back state was captured but pageIdentity was not present in mock
  assert.equal(result.data.preBackTreeHash, undefined);
  // Post-back stabilization skipped on failure
  assert.equal(result.data.postBackVerified, false);
  assert.equal(result.data.postBackTreeHash, undefined);
});

// ─── iOS post-back evidence fields ───────────────────────────────────────

test("navigate_back iOS selector-tap captures pre-back hash BEFORE tap", async () => {
  const callOrder: string[] = [];

  const hooks: NavigateBackTestHooks = {
    getScreenSummary: async (input) => {
      const isPreCall = callOrder.filter(c => c === "getScreenSummary").length === 0;
      callOrder.push("getScreenSummary");
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile: input.runnerProfile,
          outputPath: "/tmp/test.json",
          command: [],
          exitCode: 0,
          supportLevel: "full",
          summarySource: "ui_only",
          screenSummary: {
            appPhase: isPreCall ? "detail" as const : "catalog" as const,
            readiness: "ready" as const,
            blockingSignals: [] as string[],
            pageIdentity: {
              treeHash: isPreCall ? "ios-pre-hash" : "ios-post-hash",
              visibleElementCount: isPreCall ? 10 : 15,
              hasBackAffordance: !isPreCall,
              backAffordanceLabel: "Settings",
              identitySource: "heading" as const,
              identityConfidence: 0.9,
              isTopLevel: isPreCall,
            },
          },
        },
        nextSuggestions: [],
      };
    },
    waitForUiStable: async () => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: "test",
      durationMs: 100,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: "phase1",
        stable: true,
        polls: 2,
        stableAfterMs: 300,
        stableFingerprint: "stability-fingerprint",
        confidence: 0.95,
        stabilityBasis: "visible-tree",
        timeoutMs: 5000,
        intervalMs: 300,
        consecutiveStable: 2,
      },
      nextSuggestions: [],
    }),
    tapBackButton: async () => {
      callOrder.push("tapBackButton");
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: "test-session",
        durationMs: 50,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile: "phase1",
          query: { resourceId: "back-button" },
          matchCount: 1,
          resolution: {} as any,
          matchedNode: {} as any,
          resolvedBounds: {} as any,
          resolvedX: 40,
          resolvedY: 60,
          command: ["tap", "40", "60"],
          exitCode: 0,
          supportLevel: "conditional",
        },
        nextSuggestions: [],
      };
    },
  };

  setNavigateBackTestHooksForTesting(hooks);

  const result = await navigateBackWithMaestro({
    sessionId: "test-session",
    platform: "ios",
    deviceId: "ios-sim-1",
    selector: { resourceId: "back-button" },
  });

  assert.equal(result.status, "success");

  // Verify call ordering: pre-back state captured BEFORE tap
  assert.equal(callOrder[0], "getScreenSummary", "pre-back state should be captured first");
  assert.equal(callOrder[1], "tapBackButton", "back tap should come after pre-back state");

  // Verify preBackTreeHash comes from the pre-back state
  assert.equal(result.data.preBackTreeHash, "ios-pre-hash");

  // Verify postBackTreeHash comes from the post-back state
  assert.equal(result.data.postBackTreeHash, "ios-post-hash");

  // Verify pageTreeHashUnchanged is false (different hashes)
  assert.equal(result.data.pageTreeHashUnchanged, false);

  // Verify postBackPageIdentity derives from StateSummary.pageIdentity
  assert.ok(result.data.postBackPageIdentity);
  assert.equal(result.data.postBackPageIdentity?.treeHash, "ios-post-hash");
  assert.equal(result.data.postBackPageIdentity?.visibleElementCount, 15);
});
