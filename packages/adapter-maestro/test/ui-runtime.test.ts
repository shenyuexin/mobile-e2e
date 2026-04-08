import assert from "node:assert/strict";
import test from "node:test";
import type { QueryUiMatch } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { type UiRuntimeSnapshot, uiRuntimeInternals } from "../src/ui-runtime.ts";

function buildSnapshot(overrides: Partial<{
  command: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}> = {}): UiRuntimeSnapshot {
  return {
    command: ["capture"],
    relativeOutputPath: "artifacts/ui-dumps/test/android.xml",
    absoluteOutputPath: "/tmp/android.xml",
    exitCode: 0,
    stdout: "<hierarchy />",
    stderr: "",
    nodes: [],
    summary: undefined,
    queryResult: {
      totalMatches: 0,
      matches: [],
    },
    ...overrides,
  };
}

test("executeUiActionCommand stops before execution when runtime probe fails", async () => {
  const result = await uiRuntimeInternals.executeUiActionCommand({
    repoRoot: process.cwd(),
    command: ["missing-command"],
    requiresProbe: true,
    probeRuntimeAvailability: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "missing",
    }),
  });

  assert.equal(result.execution, undefined);
  assert.equal(result.probeExecution?.exitCode, 1);
  assert.deepEqual(result.command, ["missing-command"]);
});

test("isDegenerateIosSnapshot detects root-only zero-area application payload", () => {
  assert.equal(uiRuntimeInternals.isDegenerateIosSnapshot([
    {
      className: "Application",
      clickable: false,
      enabled: true,
      scrollable: false,
      bounds: "[0,0][0,0]",
    },
  ]), true);

  assert.equal(uiRuntimeInternals.isDegenerateIosSnapshot([
    {
      className: "Application",
      contentDesc: "Mobitru",
      clickable: false,
      enabled: true,
      scrollable: false,
      bounds: "[0,0][430,932]",
    },
  ]), false);
});

test("runUiWaitPollingLoop aborts after repeated retryable snapshot failures", async () => {
  let currentTime = 0;
  const outcome = await uiRuntimeInternals.runUiWaitPollingLoop({
    query: { text: "Continue" },
    waitUntil: "visible",
    timeoutMs: 10,
    intervalMs: 1,
    defaultOutputPath: "artifacts/ui-dumps/test/android.xml",
    previewCommand: ["preview"],
    captureSnapshot: async () =>
      buildSnapshot({
        exitCode: 2,
        stderr: "read failed",
      }),
    buildRetryableSnapshotFailure: () => ({
      reasonCode: REASON_CODES.deviceUnavailable,
      message: "Android UI hierarchy reads failed 2 times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.",
    }),
    maxConsecutiveRetryableFailures: 2,
    now: () => currentTime++,
    delayMs: async () => undefined,
  });

  assert.equal(outcome.outcome, "failure");
  assert.equal(outcome.polls, 2);
  if (outcome.outcome !== "failure") {
    assert.fail("expected failure outcome");
  }
  assert.equal(outcome.reasonCode, REASON_CODES.deviceUnavailable);
  assert.equal(
    outcome.message,
    "Android UI hierarchy reads failed 2 times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.",
  );
  assert.equal(outcome.state.exitCode, 2);
  assert.equal(outcome.state.result.totalMatches, 0);
});

test("runUiWaitPollingLoop does not treat off-screen or low-visibility matches as visible", async () => {
  let currentTime = 0;
  const snapshots = [
    buildSnapshot({
      queryResult: {
        totalMatches: 1,
        matches: [{
          node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,2100][100,2300]" },
          matchedBy: ["text"] as QueryUiMatch["matchedBy"],
          isOffScreen: true,
          viewportOverlapPercent: 0,
          score: 5,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match"],
        }],
      },
    }),
    buildSnapshot({
      queryResult: {
        totalMatches: 1,
        matches: [{
          node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,1900][200,2060]" },
          matchedBy: ["text"] as QueryUiMatch["matchedBy"],
          isOffScreen: false,
          viewportOverlapPercent: 0.12,
          score: 5,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match", "low_viewport_visibility:0.12"],
        }],
      },
    }),
  ];
  const outcome = await uiRuntimeInternals.runUiWaitPollingLoop({
    query: { text: "Continue" },
    waitUntil: "visible",
    timeoutMs: 2,
    intervalMs: 1,
    defaultOutputPath: "artifacts/ui-dumps/test/android.xml",
    previewCommand: ["preview"],
    captureSnapshot: async () => snapshots.shift() ?? buildSnapshot(),
    buildRetryableSnapshotFailure: () => ({
      reasonCode: REASON_CODES.deviceUnavailable,
      message: "unused",
    }),
    maxConsecutiveRetryableFailures: 2,
    now: () => currentTime++,
    delayMs: async () => undefined,
  });

  assert.equal(outcome.outcome, "timeout");
  if (outcome.outcome !== "timeout") {
    assert.fail("expected timeout outcome");
  }
  assert.equal(outcome.state.result.totalMatches, 1);
});

test("runUiScrollResolveLoop reports swipe failures with last snapshot state", async () => {
  const outcome = await uiRuntimeInternals.runUiScrollResolveLoop({
    query: { text: "Continue" },
    maxSwipes: 1,
    defaultOutputPath: "artifacts/ui-dumps/test/android.xml",
    captureSnapshot: async () => buildSnapshot(),
    buildSwipeCommand: () => ["swipe"],
    executeSwipeCommand: async () => ({
      exitCode: 13,
      stdout: "",
      stderr: "swipe failed",
    }),
    scrollFailureMessage:
      "Android swipe failed while searching for the target. Check device state and retry scroll_and_resolve_ui_target.",
  });

  assert.equal(outcome.outcome, "failure");
  if (outcome.outcome !== "failure") {
    assert.fail("expected failure outcome");
  }
  assert.equal(outcome.reasonCode, REASON_CODES.actionScrollFailed);
  assert.equal(outcome.state.resolution.status, "no_match");
  assert.deepEqual(outcome.state.commandHistory, [["capture"], ["swipe"]]);
  assert.equal(outcome.state.exitCode, 13);
});

test("runUiScrollResolveLoop returns max_swipes with off-screen resolution state", async () => {
  const offScreenMatch = {
    node: {
      text: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[0,2100][100,2300]",
    },
    matchedBy: ["text"] as QueryUiMatch["matchedBy"],
    isOffScreen: true,
    viewportOverlapPercent: 0,
    score: 5,
  };
  const outcome = await uiRuntimeInternals.runUiScrollResolveLoop({
    query: { text: "Continue" },
    maxSwipes: 0,
    defaultOutputPath: "artifacts/ui-dumps/test/android.xml",
    captureSnapshot: async () =>
      buildSnapshot({
        queryResult: {
          totalMatches: 2,
          matches: [offScreenMatch, { ...offScreenMatch }],
        },
      }),
    buildSwipeCommand: () => ["swipe"],
    executeSwipeCommand: async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    }),
    scrollFailureMessage: "unused",
  });

  assert.equal(outcome.outcome, "max_swipes");
  if (outcome.outcome !== "max_swipes") {
    assert.fail("expected max_swipes outcome");
  }
  assert.equal(outcome.state.resolution.status, "off_screen");
  assert.equal(outcome.state.swipesPerformed, 0);
  assert.deepEqual(outcome.state.commandHistory, [["capture"]]);
});

test("runUiScrollResolveLoop keeps a single off-screen match as off_screen instead of resolved", async () => {
  const offScreenMatch = {
    node: {
      text: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[0,2100][100,2300]",
    },
    matchedBy: ["text"] as QueryUiMatch["matchedBy"],
    isOffScreen: true,
    viewportOverlapPercent: 0,
    score: 5,
    matchQuality: "exact" as const,
    scoreBreakdown: ["exact text match"],
  };
  const outcome = await uiRuntimeInternals.runUiScrollResolveLoop({
    query: { text: "Continue" },
    maxSwipes: 0,
    defaultOutputPath: "artifacts/ui-dumps/test/android.xml",
    captureSnapshot: async () =>
      buildSnapshot({
        queryResult: {
          totalMatches: 1,
          matches: [offScreenMatch],
        },
      }),
    buildSwipeCommand: () => ["swipe"],
    executeSwipeCommand: async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    }),
    scrollFailureMessage: "unused",
  });

  assert.equal(outcome.outcome, "max_swipes");
  if (outcome.outcome !== "max_swipes") {
    assert.fail("expected max_swipes outcome");
  }
  assert.equal(outcome.state.resolution.status, "off_screen");
  assert.equal(outcome.state.swipesPerformed, 0);
});

test("runUiScrollResolveLoop keeps a barely visible single match in off_screen state", async () => {
  const barelyVisibleMatch = {
    node: {
      text: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[0,1900][200,2060]",
    },
    matchedBy: ["text"] as QueryUiMatch["matchedBy"],
    isOffScreen: false,
    viewportOverlapPercent: 0.12,
    score: 5,
    matchQuality: "exact" as const,
    scoreBreakdown: ["exact text match", "low_viewport_visibility:0.12"],
  };
  const outcome = await uiRuntimeInternals.runUiScrollResolveLoop({
    query: { text: "Continue" },
    maxSwipes: 0,
    defaultOutputPath: "artifacts/ui-dumps/test/android.xml",
    captureSnapshot: async () =>
      buildSnapshot({
        queryResult: {
          totalMatches: 1,
          matches: [barelyVisibleMatch],
        },
      }),
    buildSwipeCommand: () => ["swipe"],
    executeSwipeCommand: async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    }),
    scrollFailureMessage: "unused",
  });

  assert.equal(outcome.outcome, "max_swipes");
  if (outcome.outcome !== "max_swipes") {
    assert.fail("expected max_swipes outcome");
  }
  assert.equal(outcome.state.resolution.status, "off_screen");
});

// --- captureIosUiSnapshot backend routing tests ---

import { captureIosUiSnapshot } from "../src/ui-runtime.js";

test("captureIosUiSnapshot returns configurationError when no backend available", async () => {
  const result = await captureIosUiSnapshot(
    "/Users/linan/Documents/mobile-e2e-mcp",
    "nonexistent-device-udid",
    "test-session",
    "test-profile",
    undefined,
    { identifier: "test" },
  );
  // Should fail because neither axe nor WDA is available for a nonexistent device
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
});
