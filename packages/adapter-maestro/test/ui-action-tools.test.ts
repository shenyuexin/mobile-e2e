import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES, type ToolResult, type ScrollAndResolveUiTargetData } from "@mobile-e2e-mcp/contracts";
import { uiActionToolInternals } from "../src/ui-action-tools.ts";
import { verifyTypedIosPostconditionWithHooks } from "../src/ui-runtime-ios.ts";

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

test("tapResolvedTarget stops on iOS describe-point mismatch before coordinate tap", async () => {
  const resolveResult: ToolResult<ScrollAndResolveUiTargetData> = {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: "scroll-ios-mismatch",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile: "phase1",
      outputPath: "artifacts/ui-dumps/test/ios.json",
      query: { resourceId: "login-submit-button" },
      maxSwipes: 1,
      swipeDirection: "up",
      swipeDurationMs: 250,
      swipesPerformed: 1,
      commandHistory: [["capture"], ["swipe"]],
      exitCode: 0,
      result: { query: { resourceId: "login-submit-button" }, totalMatches: 1, matches: [] },
      resolution: {
        status: "resolved",
        matchCount: 1,
        query: { resourceId: "login-submit-button" },
        matches: [],
        matchedNode: { resourceId: "login-submit-button", className: "Button", text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[240,620][360,680]" },
        resolvedBounds: { left: 240, top: 620, right: 360, bottom: 680, width: 120, height: 60, center: { x: 300, y: 650 } },
        resolvedPoint: { x: 300, y: 650 },
      },
      supportLevel: "full",
    },
    nextSuggestions: [],
  };

  const tapResult = await uiActionToolInternals.tapResolvedTarget({
    sessionId: "scroll-ios-mismatch",
    platform: "ios",
    resourceId: "login-submit-button",
    dryRun: false,
  }, resolveResult, {
    verifyResolvedIosPoint: async () => ({
      verified: false,
      command: ["describe-point", "300", "650"],
      exitCode: 0,
      reasonCode: REASON_CODES.noMatch,
    }),
  });

  assert.equal(tapResult.status, "partial");
  assert.equal(tapResult.reasonCode, REASON_CODES.noMatch);
  assert.deepEqual(tapResult.data.command, ["describe-point", "300", "650"]);
});

test("tapResolvedTarget continues on iOS when describe-point agrees", async () => {
  const resolveResult: ToolResult<ScrollAndResolveUiTargetData> = {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: "scroll-ios-verified",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: true,
      runnerProfile: "phase1",
      outputPath: "artifacts/ui-dumps/test/ios.json",
      query: { resourceId: "login-submit-button" },
      maxSwipes: 1,
      swipeDirection: "up",
      swipeDurationMs: 250,
      swipesPerformed: 1,
      commandHistory: [["capture"], ["swipe"]],
      exitCode: 0,
      result: { query: { resourceId: "login-submit-button" }, totalMatches: 1, matches: [] },
      resolution: {
        status: "resolved",
        matchCount: 1,
        query: { resourceId: "login-submit-button" },
        matches: [],
        matchedNode: { resourceId: "login-submit-button", className: "Button", text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[240,620][360,680]" },
        resolvedBounds: { left: 240, top: 620, right: 360, bottom: 680, width: 120, height: 60, center: { x: 300, y: 650 } },
        resolvedPoint: { x: 300, y: 650 },
      },
      supportLevel: "full",
    },
    nextSuggestions: [],
  };

  const tapResult = await uiActionToolInternals.tapResolvedTarget({
    sessionId: "scroll-ios-verified",
    platform: "ios",
    resourceId: "login-submit-button",
    dryRun: true,
  }, resolveResult, {
    verifyResolvedIosPoint: async () => ({
      verified: true,
      command: ["describe-point", "300", "650"],
      exitCode: 0,
      reasonCode: REASON_CODES.ok,
    }),
  });

  assert.equal(tapResult.status, "success");
  assert.equal(tapResult.data.command.includes("300"), true);
  assert.equal(tapResult.data.command.includes("650"), true);
});

test("verifyResolvedIosPoint keeps identifier-backed match when describe-point agrees", async () => {
  const verification = await uiActionToolInternals.verifyResolvedIosPoint({
    repoRoot: process.cwd(),
    deviceId: "ios-sim-1",
    resolvedNode: {
      resourceId: "login-submit-button",
      className: "Button",
      text: "Continue",
      contentDesc: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,300][280,380]",
    },
    resolvedPoint: { x: 120, y: 340 },
    runtimeHooks: {
      platform: "ios",
      requiresProbe: true,
      probeFailureReasonCode: REASON_CODES.configurationError,
      buildTapCommand: () => ["tap"],
      buildDescribePointCommand: () => ["describe-point", "120", "340"],
      buildTypeTextCommand: () => ["type"],
      buildSwipeCommand: () => ["swipe"],
      buildHierarchyCapturePreviewCommand: () => ["describe-all"],
      probeUnavailableSuggestion: () => "probe unavailable",
      tapDryRunSuggestion: "tap dry",
      tapFailureSuggestion: "tap failed",
      typeTextDryRunSuggestion: "type dry",
      typeTextFailureSuggestion: "type failed",
    },
    executeDescribePointCommand: async () => ({
      command: ["describe-point", "120", "340"],
      probeExecution: { exitCode: 0, stdout: "ok", stderr: "" },
      execution: {
        exitCode: 0,
        stdout: JSON.stringify([{ identifier: "login-submit-button", type: "Button", AXLabel: "Continue", frame: { x: 40, y: 300, width: 240, height: 80 } }]),
        stderr: "",
      },
    }),
  });

  assert.equal(verification.verified, true);
  assert.deepEqual(verification.command, ["describe-point", "120", "340"]);
});

test("verifyResolvedIosPoint reports mismatch when describe-point returns different identifier", async () => {
  const verification = await uiActionToolInternals.verifyResolvedIosPoint({
    repoRoot: process.cwd(),
    deviceId: "ios-sim-1",
    resolvedNode: {
      resourceId: "login-submit-button",
      className: "Button",
      text: "Continue",
      contentDesc: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,300][280,380]",
    },
    resolvedPoint: { x: 120, y: 340 },
    runtimeHooks: {
      platform: "ios",
      requiresProbe: true,
      probeFailureReasonCode: REASON_CODES.configurationError,
      buildTapCommand: () => ["tap"],
      buildDescribePointCommand: () => ["describe-point", "120", "340"],
      buildTypeTextCommand: () => ["type"],
      buildSwipeCommand: () => ["swipe"],
      buildHierarchyCapturePreviewCommand: () => ["describe-all"],
      probeUnavailableSuggestion: () => "probe unavailable",
      tapDryRunSuggestion: "tap dry",
      tapFailureSuggestion: "tap failed",
      typeTextDryRunSuggestion: "type dry",
      typeTextFailureSuggestion: "type failed",
    },
    executeDescribePointCommand: async () => ({
      command: ["describe-point", "120", "340"],
      probeExecution: { exitCode: 0, stdout: "ok", stderr: "" },
      execution: {
        exitCode: 0,
        stdout: JSON.stringify([{ identifier: "other-button", type: "Button", AXLabel: "Continue", frame: { x: 40, y: 300, width: 240, height: 80 } }]),
        stderr: "",
      },
    }),
  });

  assert.equal(verification.verified, false);
  assert.equal(verification.reasonCode, REASON_CODES.noMatch);
});

test("verifyTypedIosPostconditionWithHooks accepts updated text field value", async () => {
  const verification = await verifyTypedIosPostconditionWithHooks({
    repoRoot: process.cwd(),
    deviceId: "ios-sim-1",
    resolvedNode: {
      resourceId: "login-email-input",
      className: "TextField",
      text: "old@example.com",
      contentDesc: "Email",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,220][320,280]",
    },
    resolvedPoint: { x: 120, y: 250 },
    typedValue: "new@example.com",
    runtimeHooks: {
      platform: "ios",
      requiresProbe: true,
      probeFailureReasonCode: REASON_CODES.configurationError,
      buildTapCommand: () => ["tap"],
      buildDescribePointCommand: () => ["describe-point", "120", "250"],
      buildTypeTextCommand: () => ["type"],
      buildSwipeCommand: () => ["swipe"],
      buildHierarchyCapturePreviewCommand: () => ["describe-all"],
      probeUnavailableSuggestion: () => "probe unavailable",
      tapDryRunSuggestion: "tap dry",
      tapFailureSuggestion: "tap failed",
      typeTextDryRunSuggestion: "type dry",
      typeTextFailureSuggestion: "type failed",
    },
    executeDescribePointCommand: async () => ({
      command: ["describe-point", "120", "250"],
      probeExecution: { exitCode: 0, stdout: "ok", stderr: "" },
      execution: {
        exitCode: 0,
        stdout: JSON.stringify([{ identifier: "login-email-input", type: "TextField", value: "new@example.com", AXLabel: "Email", frame: { x: 40, y: 220, width: 280, height: 60 } }]),
        stderr: "",
      },
    }),
  });

  assert.equal(verification.verified, true);
  assert.equal(verification.reasonCode, REASON_CODES.ok);
});

test("verifyTypedIosPostconditionWithHooks accepts secure field without echoed value", async () => {
  const verification = await verifyTypedIosPostconditionWithHooks({
    repoRoot: process.cwd(),
    deviceId: "ios-sim-1",
    resolvedNode: {
      resourceId: "login-password-input",
      className: "SecureTextField",
      text: undefined,
      contentDesc: "Password",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,300][320,360]",
    },
    resolvedPoint: { x: 120, y: 330 },
    typedValue: "super-secret",
    runtimeHooks: {
      platform: "ios",
      requiresProbe: true,
      probeFailureReasonCode: REASON_CODES.configurationError,
      buildTapCommand: () => ["tap"],
      buildDescribePointCommand: () => ["describe-point", "120", "330"],
      buildTypeTextCommand: () => ["type"],
      buildSwipeCommand: () => ["swipe"],
      buildHierarchyCapturePreviewCommand: () => ["describe-all"],
      probeUnavailableSuggestion: () => "probe unavailable",
      tapDryRunSuggestion: "tap dry",
      tapFailureSuggestion: "tap failed",
      typeTextDryRunSuggestion: "type dry",
      typeTextFailureSuggestion: "type failed",
    },
    executeDescribePointCommand: async () => ({
      command: ["describe-point", "120", "330"],
      probeExecution: { exitCode: 0, stdout: "ok", stderr: "" },
      execution: {
        exitCode: 0,
        stdout: JSON.stringify([{ identifier: "login-password-input", type: "SecureTextField", AXLabel: "Password", frame: { x: 40, y: 300, width: 280, height: 60 } }]),
        stderr: "",
      },
    }),
  });

  assert.equal(verification.verified, true);
  assert.equal(verification.reasonCode, REASON_CODES.ok);
});
