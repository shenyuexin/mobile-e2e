import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES, type ToolResult, type ScrollAndResolveUiTargetData } from "@mobile-e2e-mcp/contracts";
import { uiActionToolInternals } from "../src/ui-action-tools.ts";

test("tapResolvedTarget reuses resolved coordinates from scroll result", async () => {
  const resolveResult: ToolResult<ScrollAndResolveUiTargetData> = {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: "scroll-tap",
    durationMs: 1,
    attempts: 1,
    artifacts: ["artifacts/ui-dumps/test/android.xml"],
    data: {
      dryRun: true,
      runnerProfile: "phase1",
      outputPath: "artifacts/ui-dumps/test/android.xml",
      query: { text: "Continue" },
      maxSwipes: 1,
      swipeDirection: "up",
      swipeDurationMs: 250,
      swipesPerformed: 1,
      commandHistory: [["capture"], ["swipe"]],
      exitCode: 0,
      result: { query: { text: "Continue" }, totalMatches: 1, matches: [] },
      resolution: {
        status: "resolved",
        matchCount: 1,
        query: { text: "Continue" },
        matches: [],
        matchedNode: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[240,620][360,680]" },
        resolvedBounds: { left: 240, top: 620, right: 360, bottom: 680, width: 120, height: 60, center: { x: 300, y: 650 } },
        resolvedPoint: { x: 300, y: 650 },
      },
      supportLevel: "full",
    },
    nextSuggestions: [],
  };

  const tapResult = await uiActionToolInternals.tapResolvedTarget({
    sessionId: "scroll-tap",
    platform: "android",
    text: "Continue",
    dryRun: true,
  }, resolveResult);

  assert.equal(tapResult.status, "success");
  assert.equal(tapResult.data.resolvedX, 300);
  assert.equal(tapResult.data.resolvedY, 650);
  assert.deepEqual(tapResult.data.command.slice(-2), ["300", "650"]);
});

test("tapResolvedTarget returns partial when resolved coordinates are missing", async () => {
  const resolveResult: ToolResult<ScrollAndResolveUiTargetData> = {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: "scroll-tap-missing",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile: "phase1",
      outputPath: "artifacts/ui-dumps/test/android.xml",
      query: { text: "Continue" },
      maxSwipes: 1,
      swipeDirection: "up",
      swipeDurationMs: 250,
      swipesPerformed: 1,
      commandHistory: [["capture"], ["swipe"]],
      exitCode: 0,
      result: { query: { text: "Continue" }, totalMatches: 1, matches: [] },
      resolution: {
        status: "missing_bounds",
        matchCount: 1,
        query: { text: "Continue" },
        matches: [],
      },
      supportLevel: "full",
    },
    nextSuggestions: [],
  };

  const tapResult = await uiActionToolInternals.tapResolvedTarget({
    sessionId: "scroll-tap-missing",
    platform: "android",
    text: "Continue",
    dryRun: false,
  }, resolveResult);

  assert.equal(tapResult.status, "partial");
  assert.equal(tapResult.reasonCode, REASON_CODES.missingBounds);
  assert.equal(tapResult.data.resolvedX, undefined);
  assert.equal(tapResult.data.command.length, 0);
});
