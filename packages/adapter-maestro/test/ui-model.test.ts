import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { REASON_CODES, type GetScreenSummaryData, type StateSummary, type ToolResult } from "@mobile-e2e-mcp/contracts";
import { MacVisionOcrProvider, OcrService, type MacVisionExecutionResult } from "@mobile-e2e-mcp/adapter-vision";
import { persistActionRecord, recordBaselineEntry, recordFailureSignature } from "@mobile-e2e-mcp/core";
import {
  calculateViewportOverlap,
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  buildUiTargetResolution,
  detectViewportBounds,
  diffAmbiguousCandidates,
  buildInspectUiSummary,
  extractIosEditableNodeValue,
  buildIosNativeLocatorCandidate,
  hasQueryUiSelector,
  isIosEditableNode,
  isWaitConditionMet,
  normalizeQueryUiSelector,
  parseAndroidUiHierarchyNodes,
  parseIosInspectNodes,
  parseIosInspectSummary,
  parseUiBounds,
  queryUiNodes,
  reasonCodeForResolutionStatus,
  resolveFirstTapTarget,
  shouldAbortWaitForUiAfterReadFailure,
  buildScrollOnlySwipeCoordinates,
} from "../src/ui-model.ts";
import { buildResolutionNextSuggestions } from "../src/ui-tools.ts";
import { buildCapabilityProfile, buildDiagnosisBriefing, buildLogSummary, buildStateSummaryFromSignals, collectDebugEvidenceWithMaestro, collectDiagnosticsWithMaestro, compareAgainstBaselineWithMaestro, describeCapabilitiesWithMaestro, explainLastFailureWithMaestro, findSimilarFailuresWithMaestro, getActionOutcomeWithMaestro, getCrashSignalsWithMaestro, getLogsWithMaestro, getScreenSummaryWithMaestro, getSessionStateWithMaestro, inspectUiWithMaestro, navigateBackWithMaestro, performActionWithEvidenceWithMaestro, rankFailureCandidatesWithMaestro, recordScreenWithMaestro, recoverToKnownStateWithMaestro, replayLastStablePathWithMaestro, resetAppStateWithMaestro, resetInterruptionGuardTestHooksForTesting, resetOcrFallbackTestHooksForTesting, resolveUiTargetWithMaestro, scrollAndResolveUiTargetWithMaestro, scrollAndTapElementWithMaestro, scrollOnlyWithMaestro, setInterruptionGuardTestHooksForTesting, setOcrFallbackTestHooksForTesting, suggestKnownRemediationWithMaestro, takeScreenshotWithMaestro, tapElementWithMaestro, tapWithMaestro, typeIntoElementWithMaestro, typeTextWithMaestro, waitForUiWithMaestro } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ocrFixtureRoot = path.join(repoRoot, "tests", "fixtures", "ocr");
const ocrFixtureManifestPath = path.join(ocrFixtureRoot, "manifest.json");

async function hasOcrFixtures(): Promise<boolean> {
  try {
    await access(ocrFixtureManifestPath);
    return true;
  } catch {
    return false;
  }
}

async function readFixture(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function readJsonFixture<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8")) as T;
}

function ocrFixtureRelativePath(name: string): string {
  return path.posix.join("tests", "fixtures", "ocr", `${name}.png`);
}

function ocrFixtureAbsolutePath(name: string): string {
  return path.join(ocrFixtureRoot, `${name}.png`);
}

function buildFixtureScreenSummary(summary: Partial<StateSummary>): StateSummary {
  return {
    appPhase: "ready",
    readiness: "ready",
    blockingSignals: [],
    candidateActions: [],
    recentFailures: [],
    topVisibleTexts: [],
    ...summary,
  };
}

function buildScreenSummaryResult(sessionId: string, screenSummary: StateSummary): ToolResult<GetScreenSummaryData> {
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
      outputPath: "tests/fixtures/ocr/post-state.json",
      command: ["fixture", "get_screen_summary"],
      exitCode: 0,
      supportLevel: "full",
      summarySource: "ui_and_debug_signals",
      screenSummary,
      evidence: [],
    },
    nextSuggestions: [],
  };
}

async function runAdapterFixtureFallback(params: {
  sessionId: string;
  fixtureName: string;
  targetText: string;
}): Promise<Awaited<ReturnType<typeof performActionWithEvidenceWithMaestro>>> {
  const fixture = await readJsonFixture<MacVisionExecutionResult>(`tests/fixtures/ocr/${params.fixtureName}.observations.json`);
  setOcrFallbackTestHooksForTesting({
    now: () => new Date().toISOString(),
    createProvider: () => new MacVisionOcrProvider({ execute: async () => fixture }),
    takeScreenshot: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [ocrFixtureRelativePath(params.fixtureName)],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile ?? "phase1",
        outputPath: ocrFixtureRelativePath(params.fixtureName),
        command: ["fixture", "take_screenshot"],
        exitCode: 0,
        evidence: [],
      },
      nextSuggestions: [],
    }),
  });

  return performActionWithEvidenceWithMaestro({
    sessionId: params.sessionId,
    platform: "ios",
    dryRun: true,
    action: { actionType: "tap_element", text: params.targetText },
  });
}

async function runServiceFixtureFallback(params: {
  fixtureName: string;
  targetText: string;
  expectedText?: string;
  buildVerificationInput?: Parameters<OcrService["executeTextAction"]>[0]["buildVerificationInput"];
  executeAction?: Parameters<OcrService["executeTextAction"]>[0]["executeAction"];
}) {
  const service = new OcrService({
    provider: new MacVisionOcrProvider({
      execute: async () => readJsonFixture<MacVisionExecutionResult>(`tests/fixtures/ocr/${params.fixtureName}.observations.json`),
    }),
  });

  return service.executeTextAction({
    action: "tap",
    targetText: params.targetText,
    expectedText: params.expectedText,
    screenshotPath: ocrFixtureAbsolutePath(params.fixtureName),
    platform: "ios",
    deterministicFailed: true,
    semanticFailed: true,
    screenshotCapturedAt: new Date().toISOString(),
    executeAction: params.executeAction,
    buildVerificationInput: params.buildVerificationInput,
  });
}

test.afterEach(() => {
  resetOcrFallbackTestHooksForTesting();
  resetInterruptionGuardTestHooksForTesting();
});

test("parseAndroidUiHierarchyNodes builds stable nodes and summary from fixture", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const summary = buildInspectUiSummary(nodes);

  assert.equal(nodes.length, 6);
  assert.equal(summary.totalNodes, 6);
  assert.equal(summary.clickableNodes, 2);
  assert.equal(summary.nodesWithContentDesc, 5);
  assert.equal(summary.sampleNodes.length, 5);
  assert.equal(nodes[5]?.resourceId, "view_products_button");
  assert.equal(nodes[5]?.contentDesc, "View products");
});

test("queryUiNodes supports combined filters and preserves totalMatches under limit", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);

  const combined = queryUiNodes(nodes, normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true, limit: 1 }));
  assert.equal(combined.totalMatches, 2);
  assert.equal(combined.matches.length, 1);
  assert.deepEqual(combined.matches[0]?.matchedBy, ["className", "clickable"]);

  const byContentDesc = queryUiNodes(nodes, normalizeQueryUiSelector({ contentDesc: "View products" }));
  assert.equal(byContentDesc.totalMatches, 1);
  assert.equal(byContentDesc.matches[0]?.node.resourceId, "view_products_button");
  assert.deepEqual(byContentDesc.matches[0]?.matchedBy, ["contentDesc"]);
});

test("bounds parsing and first-target resolution produce structured coordinates", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const matches = queryUiNodes(nodes, normalizeQueryUiSelector({ resourceId: "view_products_button" })).matches;
  const resolved = resolveFirstTapTarget(matches);

  assert.equal(resolved.matchCount, 1);
  assert.equal(resolved.matchedNode?.resourceId, "view_products_button");
  assert.deepEqual(resolved.resolvedBounds, {
    left: 323,
    top: 1388,
    right: 757,
    bottom: 1514,
    width: 434,
    height: 126,
    center: { x: 540, y: 1451 },
  });
  assert.deepEqual(resolved.resolvedPoint, { x: 540, y: 1451 });

  assert.deepEqual(parseUiBounds("[32.5,140][192.5,188]"), {
    left: 32.5,
    top: 140,
    right: 192.5,
    bottom: 188,
    width: 160,
    height: 48,
    center: { x: 113, y: 164 },
  });
});

test("parseIosInspectSummary produces honest partial-ready summary from fixture", async () => {
  const json = await readFixture("tests/fixtures/ui/ios-sample.json");
  const summary = parseIosInspectSummary(json);

  assert.equal(summary.totalNodes, 5);
  assert.equal(summary.clickableNodes, 2);
  assert.equal(summary.scrollableNodes, 1);
  assert.equal(summary.nodesWithText, 3);
  assert.equal(summary.nodesWithContentDesc, 5);
  assert.ok(summary.sampleNodes.some((node) => node.resourceId === "signin_button"));
});

test("parseIosInspectNodes supports structured query and target resolution from fixture", async () => {
  const json = await readFixture("tests/fixtures/ui/ios-sample.json");
  const nodes = parseIosInspectNodes(json);
  const query = normalizeQueryUiSelector({ resourceId: "signin_button" });
  const result = { query, ...queryUiNodes(nodes, query) };
  const resolution = buildUiTargetResolution(query, result, "full");

  assert.equal(nodes.length, 5);
  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0]?.node.resourceId, "signin_button");
  assert.equal(resolution.status, "off_screen");
});

test("parseIosInspectNodes detects ambiguous iOS selector matches", async () => {
  const json = await readFixture("tests/fixtures/ui/ios-sample.json");
  const nodes = parseIosInspectNodes(json);
  const query = normalizeQueryUiSelector({ clickable: true });
  const result = { query, ...queryUiNodes(nodes, query) };
  const resolution = buildUiTargetResolution(query, result, "full");

  assert.equal(result.totalMatches, 2);
  assert.equal(resolution.status, "ambiguous");
});

test("parseIosInspectNodes uses label-like fields for text without turning names into pseudo resource ids", () => {
  const nodes = parseIosInspectNodes(JSON.stringify([
    {
      type: "Button",
      name: "Continue",
      AXLabel: "Continue",
      enabled: true,
      frame: { x: 20, y: 120, width: 120, height: 44 },
    },
  ]));

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]?.text, "Continue");
  assert.equal(nodes[0]?.contentDesc, "Continue");
  assert.equal(nodes[0]?.resourceId, undefined);

  const query = normalizeQueryUiSelector({ text: "Continue" });
  const result = queryUiNodes(nodes, query);
  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0]?.node.text, "Continue");
});

test("parseIosInspectNodes prefers stable identifiers over name-derived pseudo ids", () => {
  const nodes = parseIosInspectNodes(JSON.stringify([
    {
      type: "Button",
      name: "Continue",
      AXLabel: "Continue",
      enabled: true,
      frame: { x: 20, y: 120, width: 120, height: 44 },
    },
    {
      type: "Button",
      identifier: "primary_continue_button",
      name: "Continue",
      AXLabel: "Continue",
      enabled: true,
      frame: { x: 20, y: 220, width: 120, height: 44 },
    },
  ]));

  const resourceIdQuery = normalizeQueryUiSelector({ resourceId: "primary_continue_button" });
  const resourceIdResult = { query: resourceIdQuery, ...queryUiNodes(nodes, resourceIdQuery) };
  const resolution = buildUiTargetResolution(resourceIdQuery, resourceIdResult, "full");

  assert.equal(resourceIdResult.totalMatches, 1);
  assert.equal(resourceIdResult.matches[0]?.node.resourceId, "primary_continue_button");
  assert.equal(resolution.status, "off_screen");
  assert.equal(resolution.bestCandidate?.node.resourceId, "primary_continue_button");

  const textQuery = normalizeQueryUiSelector({ text: "Continue", clickable: true });
  const textResult = { query: textQuery, ...queryUiNodes(nodes, textQuery) };
  assert.equal(textResult.totalMatches, 2);
  assert.equal(buildUiTargetResolution(textQuery, textResult, "full").status, "ambiguous");
});

test("buildIosNativeLocatorCandidate uses stable identifier-backed iOS nodes", () => {
  const candidate = buildIosNativeLocatorCandidate(
    {
      resourceId: "login-submit-button",
      className: "Button",
      text: "Continue",
      contentDesc: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,300][280,380]",
    },
    { resourceId: "login-submit-button", text: "Continue" },
  );

  assert.deepEqual(candidate, {
    kind: "identifier",
    value: "login-submit-button",
  });
});

test("buildIosNativeLocatorCandidate rejects label-only iOS nodes", () => {
  const candidate = buildIosNativeLocatorCandidate(
    {
      className: "StaticText",
      text: "Continue",
      contentDesc: "Continue",
      clickable: false,
      enabled: true,
      scrollable: false,
      bounds: "[110,330][190,350]",
    },
    { text: "Continue" },
  );

  assert.equal(candidate, undefined);
});

test("buildIosNativeLocatorCandidate builds exact semantic fallback for query-backed label-only control", () => {
  const candidate = buildIosNativeLocatorCandidate(
    {
      className: "Button",
      text: "Continue",
      contentDesc: "Continue",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,300][280,380]",
    },
    { text: "Continue", className: "Button", clickable: true },
  );

  assert.deepEqual(candidate, {
    kind: "semantic",
    text: "Continue",
    className: "Button",
  });
});

test("buildIosNativeLocatorCandidate prefers identifier over text-only selector signals", () => {
  const candidate = buildIosNativeLocatorCandidate(
    {
      resourceId: "login-email-input",
      className: "TextField",
      text: "Email",
      contentDesc: "Email",
      clickable: true,
      enabled: true,
      scrollable: false,
      bounds: "[40,220][320,280]",
    },
    { text: "Email", contentDesc: "Email", resourceId: "login-email-input" },
  );

  assert.equal(candidate?.kind, "identifier");
  assert.equal(candidate?.value, "login-email-input");
});

test("isIosEditableNode recognizes text-capable iOS controls", () => {
  assert.equal(isIosEditableNode({ className: "TextField", clickable: true, enabled: true, scrollable: false }), true);
  assert.equal(isIosEditableNode({ className: "SecureTextField", clickable: true, enabled: true, scrollable: false }), true);
  assert.equal(isIosEditableNode({ className: "Button", clickable: true, enabled: true, scrollable: false }), false);
});

test("extractIosEditableNodeValue reads observable value but hides secure field content", () => {
  assert.equal(
    extractIosEditableNodeValue({
      className: "TextField",
      text: "demo@example.com",
      contentDesc: "Email",
      clickable: true,
      enabled: true,
      scrollable: false,
    }),
    "demo@example.com",
  );
  assert.equal(
    extractIosEditableNodeValue({
      className: "SecureTextField",
      text: "••••••",
      contentDesc: "Password",
      clickable: true,
      enabled: true,
      scrollable: false,
    }),
    undefined,
  );
});

test("parseIosInspectSummary falls back to empty summary for invalid JSON", () => {
  const summary = parseIosInspectSummary("not-json");
  assert.equal(summary.totalNodes, 0);
  assert.equal(summary.sampleNodes.length, 0);
});

test("buildUiTargetResolution reports ambiguous and resolved states correctly", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);

  const ambiguousResult = { query: normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true, limit: 1 }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true, limit: 1 })) };
  const ambiguousResolution = buildUiTargetResolution(ambiguousResult.query, ambiguousResult, "full");
  assert.equal(ambiguousResolution.status, "ambiguous");
  assert.equal(ambiguousResolution.matchCount, 2);

  const resolvedResult = { query: normalizeQueryUiSelector({ resourceId: "view_products_button" }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ resourceId: "view_products_button" })) };
  const resolvedResolution = buildUiTargetResolution(resolvedResult.query, resolvedResult, "full");
  assert.equal(resolvedResolution.status, "resolved");
  assert.deepEqual(resolvedResolution.resolvedPoint, { x: 540, y: 1451 });
});

test("buildNonExecutedUiTargetResolution stays honest for full vs partial support", () => {
  const query = normalizeQueryUiSelector({ resourceId: "view_products_button" });
  assert.equal(buildNonExecutedUiTargetResolution(query, "full").status, "not_executed");
  assert.equal(buildNonExecutedUiTargetResolution(query, "partial").status, "unsupported");
});

test("reasonCodeForResolutionStatus maps detailed resolution outcomes", () => {
  assert.equal(reasonCodeForResolutionStatus("resolved"), "OK");
  assert.equal(reasonCodeForResolutionStatus("no_match"), "NO_MATCH");
  assert.equal(reasonCodeForResolutionStatus("ambiguous"), "AMBIGUOUS_MATCH");
  assert.equal(reasonCodeForResolutionStatus("missing_bounds"), "MISSING_BOUNDS");
  assert.equal(reasonCodeForResolutionStatus("not_executed"), "ADAPTER_ERROR");
  assert.equal(reasonCodeForResolutionStatus("unsupported"), "UNSUPPORTED_OPERATION");
});

test("isWaitConditionMet supports visible gone and unique modes", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const visibleResult = { query: normalizeQueryUiSelector({ contentDesc: "View products" }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ contentDesc: "View products" })) };
  const ambiguousResult = { query: normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true })) };
  const missingResult = { query: normalizeQueryUiSelector({ contentDesc: "does not exist" }), totalMatches: 0, matches: [] };
  const offScreenResult = {
    query: normalizeQueryUiSelector({ text: "Continue" }),
    totalMatches: 1,
    matches: [{
      node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,2100][100,2300]" },
      matchedBy: ["text"] as ("text")[],
      score: 5,
      matchQuality: "exact" as const,
      scoreBreakdown: ["exact text match"],
      isOffScreen: true,
      viewportOverlapPercent: 0,
    }],
  };
  const lowVisibilityResult = {
    query: normalizeQueryUiSelector({ text: "Continue" }),
    totalMatches: 1,
    matches: [{
      node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,1900][200,2060]" },
      matchedBy: ["text"] as ("text")[],
      score: 5,
      matchQuality: "exact" as const,
      scoreBreakdown: ["exact text match", "low_viewport_visibility:0.12"],
      isOffScreen: false,
      viewportOverlapPercent: 0.12,
    }],
  };

  assert.equal(isWaitConditionMet(visibleResult, "visible"), true);
  assert.equal(isWaitConditionMet(offScreenResult, "visible"), false);
  assert.equal(isWaitConditionMet(lowVisibilityResult, "visible"), false);
  assert.equal(isWaitConditionMet(ambiguousResult, "unique"), false);
  assert.equal(isWaitConditionMet(visibleResult, "unique"), true);
  assert.equal(isWaitConditionMet(missingResult, "gone"), true);
});

test("shouldAbortWaitForUiAfterReadFailure only aborts after repeated failures", () => {
  assert.equal(shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: 1, maxConsecutiveFailures: 2 }), false);
  assert.equal(shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: 2, maxConsecutiveFailures: 2 }), true);
});

test("buildScrollSwipeCoordinates uses viewport bounds and direction", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);

  assert.deepEqual(buildScrollSwipeCoordinates(nodes, "up", 250), {
    start: { x: 540, y: 1800 },
    end: { x: 540, y: 600 },
    durationMs: 250,
  });
  assert.deepEqual(buildScrollSwipeCoordinates(nodes, "down", 300), {
    start: { x: 540, y: 600 },
    end: { x: 540, y: 1800 },
    durationMs: 300,
  });
});

test("query selector normalization drops empty strings but keeps boolean filters", () => {
  const query = normalizeQueryUiSelector({ text: "", contentDesc: "View", clickable: false, limit: 2 });
  assert.equal(hasQueryUiSelector(query), true);
  assert.deepEqual(query, { contentDesc: "View", clickable: false, limit: 2 });
});

test("resolveUiTargetWithMaestro reports configuration errors without a selector", async () => {
  const result = await resolveUiTargetWithMaestro({
    sessionId: "test-session-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  const configResolution = result.data.resolution;
  assert.ok(configResolution);
  assert.equal(configResolution.status, "not_executed");
});

test("resolveUiTargetWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await resolveUiTargetWithMaestro({
    sessionId: "test-session-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const iosResolution = result.data.resolution;
  assert.ok(iosResolution);
  assert.equal(iosResolution.status, "not_executed");
});

test("resolveUiTargetWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await resolveUiTargetWithMaestro({
    sessionId: "test-session-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const dryRunResolution = result.data.resolution;
  assert.ok(dryRunResolution);
  assert.equal(dryRunResolution.status, "not_executed");
});

test("waitForUiWithMaestro reports configuration errors without a selector", async () => {
  const result = await waitForUiWithMaestro({
    sessionId: "test-wait-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
});

test("waitForUiWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await waitForUiWithMaestro({
    sessionId: "test-wait-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
});

test("waitForUiWithMaestro keeps Android dry-run as preview-only partial result", async () => {
  const result = await waitForUiWithMaestro({
    sessionId: "test-wait-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
  assert.equal(result.data.result.totalMatches, 0);
});

test("buildLogSummary extracts top debug signals and honors query filtering", () => {
  const content = [
    "03-09 10:00:00.000 E AndroidRuntime: FATAL EXCEPTION: main",
    "03-09 10:00:00.100 E AndroidRuntime: java.lang.IllegalStateException: boom",
    "03-09 10:00:01.000 W ActivityTaskManager: timeout waiting for activity",
    "03-09 10:00:02.000 I ExampleTag: normal info",
  ].join("\n");

  const summary = buildLogSummary(content, "androidruntime");

  assert.equal(summary.totalLines, 4);
  assert.equal(summary.matchedLines, 2);
  assert.equal(summary.query, "androidruntime");
  assert.equal(summary.topSignals[0]?.category, "crash");
  assert.equal(summary.sampleLines.length, 2);
});

test("buildDiagnosisBriefing prioritizes suspects and packet status", () => {
  const briefing = buildDiagnosisBriefing({
    status: "partial",
    reasonCode: "DEVICE_UNAVAILABLE",
    appId: "host.exp.exponent",
    suspectAreas: ["Environment suspect: device or simulator connectivity prevented evidence capture."],
    jsDebugTargetId: undefined,
    jsConsoleLogCount: 0,
    jsNetworkEventCount: 0,
  });

  assert.equal(briefing[0], "Target app: host.exp.exponent.");
  assert.match(briefing[1] ?? "", /Environment suspect/);
  assert.match(briefing[briefing.length - 1] ?? "", /DEVICE_UNAVAILABLE/);
});

test("buildDiagnosisBriefing surfaces retry tier when available", () => {
  const briefing = buildDiagnosisBriefing({
    status: "partial",
    reasonCode: "OK",
    appId: "com.example.demo",
    suspectAreas: [],
    retryRecommendationTier: "refine_selector",
    retryRecommendation: {
      tier: "refine_selector",
      reason: "Selector is ambiguous.",
      suggestedAction: "Refine the selector before retrying.",
    },
  });

  assert.equal(briefing.some((line) => line.includes("refine_selector")), true);
  assert.equal(briefing.some((line) => line.includes("Refine the selector before retrying")), true);
});

test("tapElementWithMaestro reports configuration errors without a selector", async () => {
  const result = await tapElementWithMaestro({
    sessionId: "test-tap-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  const configResolution = result.data.resolution;
  assert.ok(configResolution);
  assert.equal(configResolution.status, "not_executed");
});

test("tapElementWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await tapElementWithMaestro({
    sessionId: "test-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const iosResolution = result.data.resolution;
  assert.ok(iosResolution);
  assert.equal(iosResolution.status, "not_executed");
});

test("tapElementWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await tapElementWithMaestro({
    sessionId: "test-tap-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const dryRunResolution = result.data.resolution;
  assert.ok(dryRunResolution);
  assert.equal(dryRunResolution.status, "not_executed");
});

test("typeIntoElementWithMaestro reports configuration errors without a selector", async () => {
  const result = await typeIntoElementWithMaestro({
    sessionId: "test-type-config",
    platform: "android",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("typeIntoElementWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await typeIntoElementWithMaestro({
    sessionId: "test-type-ios",
    platform: "ios",
    contentDesc: "View products",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("typeIntoElementWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await typeIntoElementWithMaestro({
    sessionId: "test-type-dry-run",
    platform: "android",
    contentDesc: "View products",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("scrollAndResolveUiTargetWithMaestro reports configuration errors without a selector", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("scrollAndResolveUiTargetWithMaestro rejects iOS (Android-only)", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "partial");
});

test("scrollAndResolveUiTargetWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("scrollOnlyWithMaestro previews swipe-only dry-run semantics", async () => {
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-scroll-only-dry-run",
    platform: "android",
    count: 2,
    gesture: { direction: "up" },
    settleDelayMs: 1500,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.countRequested, 2);
  assert.equal(result.data.swipesPerformed, 0);
  // Dry-run now returns preview command (one swipe command in commandHistory)
  assert.ok(Array.isArray(result.data.commandHistory), "commandHistory should be an array");
  assert.equal(result.data.commandHistory.length, 1, `commandHistory length should be 1, got ${result.data.commandHistory.length}`);
  // commandHistory[0] is a string[]; check that it contains "swipe"
  const cmd = result.data.commandHistory[0];
  assert.ok(cmd.some((s) => s === "swipe"), `command should contain "swipe", got: ${JSON.stringify(cmd)}`);
  // gestureApplied should reflect default mode
  assert.equal(result.data.gestureApplied.mode, "default");
  assert.equal(result.data.gestureApplied.direction, "up");
  assert.ok(result.nextSuggestions[0]?.includes("Dry-run"), `nextSuggestion should reference dry-run, got: ${result.nextSuggestions[0]}`);
});

test("scrollOnlyWithMaestro rejects missing gesture", async () => {
  // @ts-expect-error gesture is required but we test the validation path
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-no-gesture",
    platform: "android",
    count: 1,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.ok(result.nextSuggestions[0]?.includes("gesture is required"));
});

test("scrollOnlyWithMaestro rejects invalid ratio", async () => {
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-bad-ratio",
    platform: "android",
    gesture: { direction: "up", startRatio: 0.5, endRatio: 1.5 },
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.ok(result.nextSuggestions[0]?.includes("endRatio must be between 0 and 1"));
});

test("scrollOnlyWithMaestro rejects partial ratio (startRatio only)", async () => {
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-partial-ratio",
    platform: "android",
    gesture: { direction: "up", startRatio: 0.5 },
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.ok(result.nextSuggestions[0]?.includes("Both startRatio and endRatio must be provided together"));
});

test("scrollOnlyWithMaestro dry-run with precision ratios", async () => {
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-precision-dry-run",
    platform: "android",
    gesture: { direction: "up", startRatio: 0.82, endRatio: 0.34 },
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.gestureApplied.mode, "precision");
  assert.equal(result.data.gestureApplied.direction, "up");
  assert.equal(result.data.gestureApplied.startRatio, 0.82);
  assert.equal(result.data.gestureApplied.endRatio, 0.34);
  assert.ok(result.nextSuggestions[0]?.includes("startRatio=0.82"));
});

test("scrollOnlyWithMaestro dry-run with horizontal left gesture", async () => {
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-left-dry-run",
    platform: "android",
    gesture: { direction: "left" },
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.gestureApplied.direction, "left");
  assert.equal(result.data.gestureApplied.mode, "default");
});

test("scrollOnlyWithMaestro dry-run with horizontal right + precision", async () => {
  const result = await scrollOnlyWithMaestro({
    sessionId: "test-right-precision",
    platform: "android",
    gesture: { direction: "right", startRatio: 0.1, endRatio: 0.9 },
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.gestureApplied.direction, "right");
  assert.equal(result.data.gestureApplied.mode, "precision");
  assert.equal(result.data.gestureApplied.startRatio, 0.1);
  assert.equal(result.data.gestureApplied.endRatio, 0.9);
});

test("buildScrollOnlySwipeCoordinates generates correct geometry", () => {
  const coords = buildScrollOnlySwipeCoordinates([], "up", 250);
  assert.ok(coords.start.y > coords.end.y, "up: start y should be below end y");
  assert.equal(coords.start.x, coords.end.x, "up: x should be centered");

  const leftCoords = buildScrollOnlySwipeCoordinates([], "left", 250);
  assert.ok(leftCoords.start.x > leftCoords.end.x, "left: start x should be right of end x");
  assert.equal(leftCoords.start.y, leftCoords.end.y, "left: y should be centered");

  const rightCoords = buildScrollOnlySwipeCoordinates([], "right", 250);
  assert.ok(rightCoords.start.x < rightCoords.end.x, "right: start x should be left of end x");

  const precisionCoords = buildScrollOnlySwipeCoordinates([], "up", 250, 0.8, 0.3);
  assert.ok(precisionCoords.start.y > precisionCoords.end.y, "precision up: start below end");
});

test("buildCapabilityProfile stays honest across Android and iOS UI action support", () => {
  const androidProfile = buildCapabilityProfile("android", "phase1");
  const iosProfile = buildCapabilityProfile("ios", "phase1");

  assert.equal(androidProfile.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
  assert.equal(androidProfile.toolCapabilities.find((tool) => tool.toolName === "scroll_only")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "tap")?.supportLevel, "conditional");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "type_text")?.supportLevel, "conditional");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "conditional");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "type_into_element")?.supportLevel, "conditional");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "scroll_only")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "full");
  assert.equal(androidProfile.toolCapabilities.find((tool) => tool.toolName === "record_screen")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "reset_app_state")?.supportLevel, "conditional");
  assert.equal(androidProfile.groups.find((group) => group.groupName === "ui_actions")?.toolNames.includes("scroll_only"), true);
  assert.equal(iosProfile.groups.find((group) => group.groupName === "ui_actions")?.supportLevel, "conditional");
});

test("typeTextWithMaestro previews iOS text entry in dry-run mode", async () => {
  const result = await typeTextWithMaestro({
    sessionId: "test-type-text-ios",
    platform: "ios",
    text: "hello world",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  // New backend uses simctl (xcrun) commands; UDID is positional, not --udid
  const cmdStr = result.data.command.join(" ");
  assert.equal(cmdStr.includes("hello world") || cmdStr.includes("hello"), true, `command should include text: ${cmdStr}`);
  assert.equal(result.data.exitCode, 0);
});

test("tapWithMaestro previews iOS coordinate tap in dry-run mode", async () => {
  const result = await tapWithMaestro({
    sessionId: "test-tap-ios-direct",
    platform: "ios",
    x: 10,
    y: 20,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  // New backend uses simctl (xcrun) commands; UDID is positional
  const cmdStr = result.data.command.join(" ");
  assert.equal(cmdStr.includes("10"), true, `command should include x=10: ${cmdStr}`);
  assert.equal(cmdStr.includes("20"), true, `command should include y=20: ${cmdStr}`);
  assert.equal(result.data.exitCode, 0);
});

test("describeCapabilitiesWithMaestro returns a capability profile", async () => {
  const result = await describeCapabilitiesWithMaestro({
    sessionId: "capabilities-test",
    platform: "ios",
    runnerProfile: "phase1",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.capabilities.platform, "ios");
  assert.equal(result.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "inspect_ui")?.supportLevel, "conditional");
  assert.equal(result.data.capabilities.ocrFallback?.deterministicFirst, true);
});

test("scrollAndTapElementWithMaestro rejects iOS (Android-only)", async () => {
  const result = await scrollAndTapElementWithMaestro({
    sessionId: "test-scroll-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
});

test("scrollAndTapElementWithMaestro keeps Android dry-run as preview-only partial result", async () => {
  const result = await scrollAndTapElementWithMaestro({
    sessionId: "test-scroll-tap-android",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolveResult.resolution.status, "not_executed");
});

test("artifact-heavy dry-run tools emit structured evidence", async () => {
  const screenshotResult = await takeScreenshotWithMaestro({ sessionId: "evidence-screenshot", platform: "android", dryRun: true });
  const inspectResult = await inspectUiWithMaestro({ sessionId: "evidence-inspect", platform: "android", dryRun: true });
  const logsResult = await getLogsWithMaestro({ sessionId: "evidence-logs", platform: "android", dryRun: true, query: "error" });
  const crashResult = await getCrashSignalsWithMaestro({ sessionId: "evidence-crash", platform: "android", dryRun: true });
  const diagnosticsResult = await collectDiagnosticsWithMaestro({ sessionId: "evidence-diagnostics", platform: "android", dryRun: true });

  assert.equal(screenshotResult.data.evidence?.[0]?.kind, "screenshot");
  assert.equal(inspectResult.data.evidence?.[0]?.kind, "ui_dump");
  assert.equal(logsResult.data.evidence?.[0]?.kind, "log");
  assert.equal(logsResult.data.evidence?.[0]?.path, logsResult.data.outputPath);
  assert.equal(crashResult.data.evidence?.[0]?.kind, "crash_signal");
  assert.equal(diagnosticsResult.data.evidence?.[0]?.kind, "diagnostics_bundle");
});

test("recordScreenWithMaestro returns dry-run Android plan with recording evidence", async () => {
  const result = await recordScreenWithMaestro({
    sessionId: "record-screen-dry-run",
    platform: "android",
    durationMs: 5000,
    bitrateMbps: 4,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.outputPath.endsWith(".mp4"), true);
  assert.equal(result.data.durationMs, 5000);
  assert.equal(result.data.commands[0]?.includes("screenrecord"), true);
  assert.equal(result.data.evidence?.[0]?.kind, "screen_recording");
});

test("resetAppStateWithMaestro returns dry-run Android clear_data plan", async () => {
  const result = await resetAppStateWithMaestro({
    sessionId: "reset-app-state-dry-run",
    platform: "android",
    appId: "com.example.demo",
    strategy: "clear_data",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.strategy, "clear_data");
  assert.equal(result.data.commands[0]?.includes("pm"), true);
  assert.equal(result.data.commands[0]?.includes("clear"), true);
});

test("collectDebugEvidenceWithMaestro aggregates structured evidence in dry-run mode", async () => {
  const result = await collectDebugEvidenceWithMaestro({
    sessionId: "evidence-debug-summary",
    platform: "android",
    query: "error",
    includeDiagnostics: true,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.jsConsoleSummary?.totalLogs, 0);
  assert.equal(result.data.jsConsoleSummary?.exceptionCount, 0);
  assert.equal(result.data.jsNetworkSummary?.totalTrackedRequests, 0);
  assert.equal(result.data.jsNetworkSummary?.failedRequestCount, 0);
  assert.equal(result.data.evidence?.some((item) => item.kind === "log"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "crash_signal"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "diagnostics_bundle"), true);
  assert.equal(result.data.diagnosisPacket?.strongestSuspectLayer, "environment");
  assert.equal(result.data.diagnosisPacket?.confidence, "moderate");
  assert.equal(typeof result.data.diagnosisPacket?.strongestCausalSignal, "string");
  assert.equal(typeof result.data.diagnosisPacket?.recommendedNextProbe, "string");
  assert.equal(typeof result.data.diagnosisPacket?.recommendedRecovery, "string");
  assert.equal(result.data.diagnosisPacket?.escalationThreshold, "if_summary_inconclusive");
});

test("collectDebugEvidenceWithMaestro carries custom metro base url into auto discovery metadata", async () => {
  const result = await collectDebugEvidenceWithMaestro({
    sessionId: "evidence-custom-metro",
    platform: "android",
    metroBaseUrl: "http://127.0.0.1:9090",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.jsDebugMetroBaseUrl, "http://127.0.0.1:9090");
  assert.equal(result.data.jsDebugTargetEndpoint, "http://127.0.0.1:9090/json/list");
  assert.equal(result.data.jsDebugTargetCandidateCount, 0);
  assert.equal(result.data.jsDebugTargetSelectionReason, undefined);
  assert.equal(result.data.jsConsoleSummary?.totalLogs, 0);
  assert.equal(result.data.jsConsoleSummary?.exceptionCount, 0);
  assert.equal(result.data.jsNetworkSummary?.totalTrackedRequests, 0);
  assert.equal(result.data.jsNetworkSummary?.failedRequestCount, 0);
});

test("getScreenSummaryWithMaestro returns compact dry-run state summary", async () => {
  const result = await getScreenSummaryWithMaestro({
    sessionId: "screen-summary-dry-run",
    platform: "android",
    includeDebugSignals: true,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.summarySource, "ui_and_debug_signals");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.screenSummary.appPhase, "unknown");
  assert.equal(result.data.screenSummary.readiness, "unknown");
  assert.deepEqual(result.data.screenSummary.blockingSignals, []);
  assert.equal(result.data.evidence?.some((item) => item.kind === "ui_dump"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "log"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "crash_signal"), true);
});

test("buildStateSummaryFromSignals infers authentication and interruption hints", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: buildInspectUiSummary([
      { text: "Login", clickable: false, enabled: true, scrollable: false },
      { text: "Password", clickable: false, enabled: true, scrollable: false },
      { text: "Allow", clickable: true, enabled: true, scrollable: false },
    ]),
    logSummary: buildLogSummary("network timeout while signing in"),
  });

  assert.equal(summary.appPhase, "blocked");
  assert.equal(summary.readiness, "interrupted");
  assert.equal(summary.pageHints?.includes("authentication"), true);
  assert.equal(summary.derivedSignals?.includes("network_instability"), true);
  assert.equal(typeof summary.stateConfidence, "number");
});

test("buildStateSummaryFromSignals infers catalog state from visible product labels", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: buildInspectUiSummary([
      { text: "Mobile phones", clickable: true, enabled: true, scrollable: false },
      { text: "Search", clickable: true, enabled: true, scrollable: false },
      { text: "Category", clickable: false, enabled: true, scrollable: false },
    ]),
  });

  assert.equal(summary.appPhase, "catalog");
  assert.equal(summary.readiness, "unknown");
  assert.equal(summary.pageHints?.includes("catalog"), true);
});

test("getSessionStateWithMaestro supports dry-run without persisted session", async () => {
  const result = await getSessionStateWithMaestro({
    sessionId: "session-state-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.sessionRecordFound, false);
  assert.equal(result.data.platform, "android");
  assert.equal(result.data.capabilities.platform, "android");
  assert.equal(result.data.state.appPhase, "unknown");
});

test("performActionWithEvidenceWithMaestro records dry-run action outcome", async () => {
  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "action-evidence-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      contentDesc: "View products",
    },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.outcome.actionType, "tap_element");
  assert.equal(result.data.outcome.outcome, "partial");
  assert.equal(typeof result.data.outcome.actionId, "string");
  assert.equal(typeof result.data.evidenceDelta.uiDiffSummary, "string");
  assert.equal(result.data.outcome.failureCategory, "unsupported");
  assert.equal(result.data.outcome.progressMarker, "none");
  assert.equal(result.data.outcome.postconditionStatus, "not_met");
  assert.equal(result.data.outcome.stateChangeCategory, "no_material_change");
  assert.equal(result.data.outcome.stateChangeConfidence, "weak");
  assert.equal(result.data.postActionVerificationTrace?.postconditionStatus, "not_met");
  assert.equal(result.data.postActionVerificationTrace?.progressMarker, "none");
  assert.equal(result.data.postActionRefreshAttempted, undefined);
  assert.equal(Array.isArray(result.data.actionabilityReview), true);
  assert.equal(result.data.actionabilityReview?.some((item) => item.startsWith("post_action_refresh_")), false);
  assert.equal(result.nextSuggestions[0]?.includes("Inspect the returned pre/post state summaries"), true);
});

test("performActionWithEvidenceWithMaestro includes target-obscured hints in actionability review when available", async () => {
  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "perform-action-review-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      text: "Continue",
    },
  });

  assert.equal(Array.isArray(result.data.actionabilityReview), true);
  assert.equal(result.data.actionabilityReview?.some((item) => item.startsWith("target_resolution:")), true);
});

test("performActionWithEvidenceWithMaestro upgrades to manual handoff stop semantics when post-state requires OTP", async () => {
  let screenSummaryCalls = 0;
  setOcrFallbackTestHooksForTesting({
    getScreenSummary: async (input) => {
      screenSummaryCalls += 1;
      return buildScreenSummaryResult(
        input.sessionId,
        screenSummaryCalls === 1
          ? buildFixtureScreenSummary({
            screenId: "login-form",
            screenTitle: "Login",
            appPhase: "ready",
            readiness: "ready",
          })
          : buildFixtureScreenSummary({
            screenId: "otp-verify",
            screenTitle: "Verification Code",
            appPhase: "authentication",
            readiness: "interrupted",
            protectedPage: {
              suspected: true,
              observability: "ui_tree_only",
              reasons: ["otp_verification"],
            },
            manualHandoff: {
              required: true,
              reason: "otp_required",
              summary: "OTP verification requires operator input.",
              blocking: true,
              suggestedOperatorActions: ["Enter the OTP on-device."],
              resumeHints: ["Re-check the screen summary after the code is accepted."],
            },
          }),
      );
    },
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "perform-action-manual-handoff",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      text: "Get code",
    },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, REASON_CODES.manualHandoffRequired);
  assert.equal(result.data.outcome.failureCategory, "blocked");
  assert.equal(result.data.outcome.stepState, "terminal_stop");
  assert.equal(result.data.manualHandoffRequired, true);
  assert.equal(result.data.manualHandoffReason, "otp_required");
  assert.equal(result.data.retryRecommendationTier, "handoff_required");
  assert.equal(result.data.retryDecisionTrace?.stopReason, "manual_handoff_required");
  assert.equal(result.data.actionabilityReview?.some((item) => item === "manual_handoff_required:otp_required"), true);
  assert.equal(result.nextSuggestions.some((item) => item.includes("request_manual_handoff")), true);
});

test("performActionWithEvidenceWithMaestro blocks action when pre-guard interruption is denied", async () => {
  setInterruptionGuardTestHooksForTesting({
    resolveInterruption: async (input) => ({
      status: "failed",
      reasonCode: REASON_CODES.policyDenied,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {
        attempted: false,
        status: "denied",
        strategy: "tap_selector",
      },
      nextSuggestions: ["Interruption action denied by policy profile."],
    }),
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "perform-action-pre-guard-denied",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      text: "Continue",
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.policyDenied);
  assert.equal(result.data.preActionInterruption?.status, "denied");
  assert.equal(result.data.outcome.failureCategory, "blocked");
});

test("performActionWithEvidenceWithMaestro runs pre/post guard and resume in sequence", async () => {
  let resolveCalls = 0;
  let resumeCalls = 0;

  setInterruptionGuardTestHooksForTesting({
    resolveInterruption: async (input) => {
      resolveCalls += 1;
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: [`artifacts/interruption/resolve-${String(resolveCalls)}.json`],
        data: {
          attempted: true,
          status: "resolved",
          strategy: "tap_selector",
          verifiedCleared: true,
          resolutionAttempts: 1,
        },
        nextSuggestions: [],
      };
    },
    resumeInterruptedAction: async (input) => {
      resumeCalls += 1;
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: 1,
        attempts: 1,
        artifacts: ["artifacts/interruption/resume.json"],
        data: {
          attempted: true,
          resumed: true,
        },
        nextSuggestions: [],
      };
    },
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "perform-action-guard-resume-sequence",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      text: "Continue",
    },
  });

  assert.equal(resolveCalls, 2);
  assert.equal(resumeCalls, 1);
  assert.equal(result.data.preActionInterruption?.status, "resolved");
  assert.equal(result.data.postActionInterruption?.status, "resolved");
  assert.equal(result.artifacts.some((pathValue) => pathValue.includes("resume")), true);
});

test("queryUiNodes prefers clickable candidates over static label matches", () => {
  const query = normalizeQueryUiSelector({ text: "Login" });
  const result = queryUiNodes([
    { text: "Login", resourceId: "login_title", clickable: false, enabled: true, scrollable: false, bounds: "[0,100][100,200]" },
    { text: "Login", resourceId: "login_email", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][100,200]" },
  ], query);

  assert.equal(result.totalMatches, 2);
  assert.equal(result.matches[0]?.node.resourceId, "login_email");
  assert.equal(result.matches[0]?.score !== undefined, true);
  assert.equal(Array.isArray(result.matches[0]?.scoreBreakdown), true);
});

test("buildUiTargetResolution returns disabled_match when best candidate is disabled", () => {
  const resolution = buildUiTargetResolution(
    { text: "Continue" },
    {
      query: { text: "Continue" },
      totalMatches: 1,
      matches: [{
        node: { text: "Continue", clickable: true, enabled: false, scrollable: false, bounds: "[0,0][100,100]" },
        matchedBy: ["text"],
        score: 5,
        matchQuality: "exact",
        scoreBreakdown: ["exact text match"],
      }],
    },
    "full",
  );

  assert.equal(resolution.status, "disabled_match");
  assert.equal(resolution.bestCandidate?.node.enabled, false);
});

test("buildUiTargetResolution auto-resolves a clearly dominant exact candidate", () => {
  const resolution = buildUiTargetResolution(
    { resourceId: "alert_allow_button", text: "Allow" },
    {
      query: { resourceId: "alert_allow_button", text: "Allow" },
      totalMatches: 2,
      matches: [
        {
          node: { text: "Allow", resourceId: "alert_allow_button", clickable: true, enabled: true, scrollable: false, bounds: "[240,620][360,680]" },
          matchedBy: ["resourceId", "text", "clickable"],
          score: 12,
          matchQuality: "exact",
          scoreBreakdown: ["exact resourceId match", "exact text match", "clickable flag matched", "clickable node bonus"],
          isOffScreen: false,
          viewportOverlapPercent: 1,
        },
        {
          node: { text: "Allow", clickable: true, enabled: true, scrollable: false, bounds: "[40,520][353,600]" },
          matchedBy: ["text"],
          score: 8,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match", "clickable flag matched"],
          isOffScreen: false,
          viewportOverlapPercent: 1,
        },
      ],
    },
    "full",
  );

  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.matchedNode?.resourceId, "alert_allow_button");
});

test("buildUiTargetResolution keeps peer exact candidates ambiguous", () => {
  const resolution = buildUiTargetResolution(
    { resourceId: "allow_once", text: "Allow" },
    {
      query: { resourceId: "allow_once", text: "Allow" },
      totalMatches: 2,
      matches: [
        {
          node: { text: "Allow", resourceId: "allow_once", clickable: true, enabled: true, scrollable: false, bounds: "[240,620][360,680]" },
          matchedBy: ["resourceId", "text", "clickable"],
          score: 12,
          matchQuality: "exact",
          scoreBreakdown: ["exact resourceId match", "exact text match", "clickable flag matched"],
          isOffScreen: false,
          viewportOverlapPercent: 1,
        },
        {
          node: { text: "Allow", resourceId: "allow_always", clickable: true, enabled: true, scrollable: false, bounds: "[240,700][360,760]" },
          matchedBy: ["resourceId", "text", "clickable"],
          score: 11,
          matchQuality: "exact",
          scoreBreakdown: ["exact resourceId match", "exact text match", "clickable flag matched"],
          isOffScreen: false,
          viewportOverlapPercent: 1,
        },
      ],
    },
    "full",
  );

  assert.equal(resolution.status, "ambiguous");
});

test("detectViewportBounds prefers the primary scrollable container", () => {
  const viewport = detectViewportBounds([
    { resourceId: "header", clickable: false, enabled: true, scrollable: false, bounds: "[0,0][1080,200]" },
    { resourceId: "list", clickable: false, enabled: true, scrollable: true, bounds: "[0,200][1080,1800]" },
  ]);

  assert.equal(viewport.top, 200);
  assert.equal(viewport.bottom, 1800);
});

test("calculateViewportOverlap reports partially visible candidates", () => {
  const overlap = calculateViewportOverlap(
    { left: 0, top: 1600, right: 100, bottom: 2200, width: 100, height: 600, center: { x: 50, y: 1900 } },
    { left: 0, top: 0, right: 1080, bottom: 1920, width: 1080, height: 1920, center: { x: 540, y: 960 } },
  );

  assert.equal(overlap < 1, true);
  assert.equal(overlap > 0, true);
});

test("queryUiNodes marks off-screen candidates and ranks visible ones first", () => {
  const query = normalizeQueryUiSelector({ text: "Continue" });
  const result = queryUiNodes([
    { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][100,200]" },
    { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,2100][100,2300]" },
  ], query);

  assert.equal(result.totalMatches, 2);
  assert.equal(result.matches[0]?.isOffScreen, false);
  assert.equal(result.matches[1]?.isOffScreen, true);
});

test("buildUiTargetResolution returns off_screen when all candidates are outside viewport", () => {
  const resolution = buildUiTargetResolution(
    { text: "Continue" },
    {
      query: { text: "Continue" },
      totalMatches: 2,
      matches: [
        {
          node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,2100][100,2300]" },
          matchedBy: ["text"],
          score: 3,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match"],
          isOffScreen: true,
          viewportOverlapPercent: 0,
        },
        {
          node: { text: "Continue", clickable: false, enabled: true, scrollable: false, bounds: "[0,2400][100,2600]" },
          matchedBy: ["text"],
          score: 2,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match"],
          isOffScreen: true,
          viewportOverlapPercent: 0,
        },
      ],
    },
    "full",
  );

  assert.equal(resolution.status, "off_screen");
});

test("buildUiTargetResolution returns off_screen for a single exact match outside the viewport", () => {
  const resolution = buildUiTargetResolution(
    { text: "Continue" },
    {
      query: { text: "Continue" },
      totalMatches: 1,
      matches: [
        {
          node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,2100][100,2300]" },
          matchedBy: ["text"],
          score: 5,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match"],
          isOffScreen: true,
          viewportOverlapPercent: 0,
        },
      ],
    },
    "full",
  );

  assert.equal(resolution.status, "off_screen");
});

test("buildUiTargetResolution still resolves a single partially visible match", () => {
  const resolution = buildUiTargetResolution(
    { text: "Continue" },
    {
      query: { text: "Continue" },
      totalMatches: 1,
      matches: [
        {
          node: { text: "Continue", clickable: true, enabled: true, scrollable: false, bounds: "[0,1900][200,2060]" },
          matchedBy: ["text"],
          score: 5,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match"],
          isOffScreen: false,
          viewportOverlapPercent: 0.12,
        },
      ],
    },
    "full",
  );

  assert.equal(resolution.status, "off_screen");
});

test("buildUiTargetResolution does not auto-resolve a barely visible dominant candidate", () => {
  const resolution = buildUiTargetResolution(
    { text: "Continue" },
    {
      query: { text: "Continue" },
      totalMatches: 2,
      matches: [
        {
          node: { text: "Continue", resourceId: "barely_visible", clickable: true, enabled: true, scrollable: false, bounds: "[0,1900][200,2060]" },
          matchedBy: ["text", "resourceId"],
          score: 8,
          matchQuality: "exact",
          scoreBreakdown: ["exact text match", "resourceId match"],
          isOffScreen: false,
          viewportOverlapPercent: 0.12,
        },
        {
          node: { text: "Continue details", clickable: false, enabled: true, scrollable: false, bounds: "[0,100][200,180]" },
          matchedBy: ["text"],
          score: 4,
          matchQuality: "substring",
          scoreBreakdown: ["substring text match"],
          isOffScreen: false,
          viewportOverlapPercent: 1,
        },
      ],
    },
    "full",
  );

  assert.equal(resolution.status, "ambiguous");
});

test("diffAmbiguousCandidates returns selector-friendly field differences", () => {
  const diff = diffAmbiguousCandidates([
    {
      node: { text: "Continue", resourceId: "primary_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][100,200]" },
      matchedBy: ["text"],
      score: 5,
      scoreBreakdown: ["exact text match"],
    },
    {
      node: { text: "Continue", resourceId: "secondary_cta", clickable: false, enabled: true, scrollable: false, bounds: "[0,300][100,400]" },
      matchedBy: ["text"],
      score: 5,
      scoreBreakdown: ["exact text match"],
    },
  ]);

  assert.ok(diff);
  assert.equal(typeof diff?.scoreDelta, "number");
  assert.equal(diff?.differingFields.some((field) => field.field === "resourceId"), true);
  assert.equal((diff?.suggestedSelectors.length ?? 0) > 0, true);
});

test("buildResolutionNextSuggestions explains off-screen scroll guidance", () => {
  const suggestions = buildResolutionNextSuggestions("off_screen", "scroll_and_resolve_ui_target", {
    bestCandidate: {
      node: { resourceId: "bottom_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,2200][100,2400]" },
      matchedBy: ["resourceId"],
    },
  });

  assert.equal(suggestions[0]?.includes("outside the visible viewport"), true);
  assert.equal(suggestions[1]?.includes("bottom_cta"), true);
});

test("buildResolutionNextSuggestions includes score-aware narrowing hint for ambiguous matches", () => {
  const suggestions = buildResolutionNextSuggestions("ambiguous", "resolve_ui_target", {
    ambiguityDiff: {
      differingFields: [
        { field: "resourceId", left: "primary_cta", right: "secondary_cta" },
        { field: "clickable", left: "true", right: "false" },
      ],
      scoreDelta: 2,
      suggestedSelectors: [{ resourceId: "primary_cta" }],
    },
  });

  assert.equal(suggestions[0]?.includes("resourceId, clickable"), true);
  assert.equal(suggestions[0]?.includes("top score delta: 2"), true);
  assert.equal(suggestions[1]?.includes("primary_cta"), true);
});

test("queryUiNodes penalizes candidates obscured by a higher-ranked overlapping node", () => {
  const query = normalizeQueryUiSelector({ text: "Continue" });
  const result = queryUiNodes([
    { text: "Continue", resourceId: "front_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][200,300]" },
    { text: "Continue", resourceId: "back_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][200,300]" },
  ], query);

  assert.equal(result.totalMatches, 2);
  assert.equal(result.matches[1]?.obscuredByHigherRanked, true);
  assert.equal((result.matches[1]?.overlapPercentWithHigherRanked ?? 0) >= 0.8, true);
  assert.equal(result.matches[1]?.visibilityHeuristics?.some((item) => item.startsWith("heavy_overlap:")), true);
});

test("queryUiNodes records low viewport visibility heuristics for barely visible targets", () => {
  const query = normalizeQueryUiSelector({ text: "Continue" });
  const result = queryUiNodes([
    { resourceId: "viewport", clickable: false, enabled: true, scrollable: true, bounds: "[0,0][1080,1920]" },
    { text: "Continue", resourceId: "barely_visible", clickable: true, enabled: true, scrollable: false, bounds: "[0,1900][200,2060]" },
  ], query);

  assert.equal(result.matches[0]?.viewportOverlapPercent !== undefined, true);
  assert.equal(result.matches[0]?.visibilityHeuristics?.some((item) => item.startsWith("low_viewport_visibility:")), true);
});

test("queryUiNodes prefers deeper leaf nodes when other signals tie", () => {
  const query = normalizeQueryUiSelector({ text: "Continue" });
  const result = queryUiNodes([
    { text: "Continue", resourceId: "container_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][200,300]", depth: 0 },
    { text: "Continue", resourceId: "leaf_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][200,300]", depth: 2 },
  ], query);

  assert.equal(result.matches[0]?.node.resourceId, "leaf_cta");
});

test("performActionWithEvidenceWithMaestro uses screenshot fixture for OCR assert fallback success", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/signin-success.observations.json");
  setOcrFallbackTestHooksForTesting({
    now: () => new Date().toISOString(),
    createProvider: () => new MacVisionOcrProvider({
      execute: async (input) => {
        assert.equal(input.screenshotPath, ocrFixtureAbsolutePath("signin-success"));
        return fixture;
      },
    }),
    takeScreenshot: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [ocrFixtureRelativePath("signin-success")],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile ?? "phase1",
        outputPath: ocrFixtureRelativePath("signin-success"),
        command: ["fixture", "take_screenshot"],
        exitCode: 0,
        evidence: [],
      },
      nextSuggestions: [],
    }),
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "ocr-assert-success",
    platform: "ios",
    dryRun: true,
    action: { actionType: "wait_for_ui", text: "Sign In" },
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, REASON_CODES.ok);
  assert.equal(result.data.outcome.resolutionStrategy, "ocr");
  assert.equal(result.data.outcome.fallbackUsed, true);
  assert.equal(result.data.outcome.retryCount, 0);
  assert.equal(result.data.outcome.ocrEvidence?.matchedText, "Sign In");
});

test("performActionWithEvidenceWithMaestro uses screenshot fixture for OCR tap success", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/continue-success.observations.json");
  let screenSummaryCalls = 0;
  setOcrFallbackTestHooksForTesting({
    now: () => new Date().toISOString(),
    createProvider: () => new MacVisionOcrProvider({ execute: async () => fixture }),
    takeScreenshot: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [ocrFixtureRelativePath("continue-success")],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile ?? "phase1",
        outputPath: ocrFixtureRelativePath("continue-success"),
        command: ["fixture", "take_screenshot"],
        exitCode: 0,
        evidence: [],
      },
      nextSuggestions: [],
    }),
    getScreenSummary: async (input) => buildScreenSummaryResult(
      input.sessionId,
      buildFixtureScreenSummary(screenSummaryCalls++ === 0
        ? {
          screenTitle: "Shipping",
          topVisibleTexts: ["Continue"],
        }
        : {
          screenTitle: "Confirmation",
          topVisibleTexts: ["Thanks"],
        }),
    ),
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "ocr-tap-success",
    platform: "ios",
    dryRun: true,
    action: { actionType: "tap_element", text: "Continue" },
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, REASON_CODES.ok);
  assert.equal(result.data.outcome.resolutionStrategy, "ocr");
  assert.equal(result.data.outcome.fallbackUsed, true);
  assert.equal(result.data.outcome.retryCount, 0);
  assert.equal(result.data.outcome.ocrEvidence?.postVerificationResult, "passed");
});

test("performActionWithEvidenceWithMaestro fails safely on low-confidence screenshot fixtures", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/continue-low-confidence.observations.json");
  setOcrFallbackTestHooksForTesting({
    now: () => new Date().toISOString(),
    createProvider: () => new MacVisionOcrProvider({ execute: async () => fixture }),
    takeScreenshot: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [ocrFixtureRelativePath("continue-low-confidence")],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile ?? "phase1",
        outputPath: ocrFixtureRelativePath("continue-low-confidence"),
        command: ["fixture", "take_screenshot"],
        exitCode: 0,
        evidence: [],
      },
      nextSuggestions: [],
    }),
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "ocr-low-confidence",
    platform: "ios",
    dryRun: true,
    action: { actionType: "tap_element", text: "Continue" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.ocrLowConfidence);
  assert.equal(result.data.outcome.fallbackUsed, false);
  assert.equal(result.data.outcome.retryCount, 0);
  assert.equal(result.data.outcome.ocrEvidence?.fallbackReason, REASON_CODES.ocrLowConfidence);
});

test("performActionWithEvidenceWithMaestro fails safely on ambiguous screenshot fixtures", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/continue-ambiguous.observations.json");
  setOcrFallbackTestHooksForTesting({
    now: () => new Date().toISOString(),
    createProvider: () => new MacVisionOcrProvider({ execute: async () => fixture }),
    takeScreenshot: async (input) => ({
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 1,
      attempts: 1,
      artifacts: [ocrFixtureRelativePath("continue-ambiguous")],
      data: {
        dryRun: false,
        runnerProfile: input.runnerProfile ?? "phase1",
        outputPath: ocrFixtureRelativePath("continue-ambiguous"),
        command: ["fixture", "take_screenshot"],
        exitCode: 0,
        evidence: [],
      },
      nextSuggestions: [],
    }),
  });

  const result = await performActionWithEvidenceWithMaestro({
    sessionId: "ocr-ambiguous",
    platform: "ios",
    dryRun: true,
    action: { actionType: "tap_element", text: "Continue" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.ocrAmbiguousTarget);
  assert.equal(result.data.outcome.fallbackUsed, false);
  assert.equal(result.data.outcome.retryCount, 0);
  assert.equal(result.data.outcome.ocrEvidence?.fallbackReason, REASON_CODES.ocrAmbiguousTarget);
});

test("adapter-maestro and OcrService agree on low-confidence fixture outcome", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const [adapterResult, serviceResult] = await Promise.all([
    runAdapterFixtureFallback({
      sessionId: "ocr-low-confidence-parity",
      fixtureName: "continue-low-confidence",
      targetText: "Continue",
    }),
    runServiceFixtureFallback({
      fixtureName: "continue-low-confidence",
      targetText: "Continue",
    }),
  ]);

  assert.equal(adapterResult.reasonCode, REASON_CODES.ocrLowConfidence);
  assert.equal(serviceResult.status, "low_confidence");
  assert.equal(adapterResult.data.outcome.ocrEvidence?.candidateCount, serviceResult.evidence?.candidateCount);
  assert.equal(adapterResult.data.outcome.ocrEvidence?.ocrConfidence, serviceResult.evidence?.ocrConfidence);
  assert.equal(adapterResult.data.outcome.ocrEvidence?.fallbackReason, REASON_CODES.ocrLowConfidence);
});

test("adapter-maestro and OcrService agree on ambiguous fixture outcome", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const [adapterResult, serviceResult] = await Promise.all([
    runAdapterFixtureFallback({
      sessionId: "ocr-ambiguous-parity",
      fixtureName: "continue-ambiguous",
      targetText: "Continue",
    }),
    runServiceFixtureFallback({
      fixtureName: "continue-ambiguous",
      targetText: "Continue",
    }),
  ]);

  assert.equal(adapterResult.reasonCode, REASON_CODES.ocrAmbiguousTarget);
  assert.equal(serviceResult.status, "ambiguous");
  assert.equal(adapterResult.data.outcome.ocrEvidence?.candidateCount, serviceResult.evidence?.candidateCount);
  assert.equal(serviceResult.resolution?.rejectionReason, "ambiguous");
  assert.equal(adapterResult.data.outcome.ocrEvidence?.fallbackReason, REASON_CODES.ocrAmbiguousTarget);
});

test("adapter-maestro and OcrService agree on successful fixture outcome", async (t) => {
  if (!(await hasOcrFixtures())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/continue-success.observations.json");
  const [adapterResult, serviceResult] = await Promise.all([
    (async () => {
      let screenSummaryCalls = 0;
      setOcrFallbackTestHooksForTesting({
        now: () => new Date().toISOString(),
        createProvider: () => new MacVisionOcrProvider({ execute: async () => fixture }),
        takeScreenshot: async (input) => ({
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: 1,
          attempts: 1,
          artifacts: [ocrFixtureRelativePath("continue-success")],
          data: {
            dryRun: false,
            runnerProfile: input.runnerProfile ?? "phase1",
            outputPath: ocrFixtureRelativePath("continue-success"),
            command: ["fixture", "take_screenshot"],
            exitCode: 0,
            evidence: [],
          },
          nextSuggestions: [],
        }),
        getScreenSummary: async (input) => buildScreenSummaryResult(
          input.sessionId,
          buildFixtureScreenSummary(screenSummaryCalls++ === 0
            ? {
              screenTitle: "Shipping",
              topVisibleTexts: ["Continue"],
            }
            : {
              screenTitle: "Confirmation",
              topVisibleTexts: ["Thanks"],
            }),
        ),
      });

      return performActionWithEvidenceWithMaestro({
        sessionId: "ocr-success-parity",
        platform: "ios",
        dryRun: true,
        action: { actionType: "tap_element", text: "Continue" },
      });
    })(),
    runServiceFixtureFallback({
      fixtureName: "continue-success",
      targetText: "Continue",
      expectedText: "Thanks",
      executeAction: async ({ target }) => ({ tappedCenter: target.bounds.center }),
      buildVerificationInput: async ({ ocr }) => ({
        beforeOcr: ocr,
        afterOcr: {
          ...ocr,
          blocks: [
            ocr.blocks[0] ?? ocr.blocks[ocr.blocks.length - 1] ?? {
              text: "Continue",
              confidence: 0.95,
              bounds: { left: 112, top: 513, right: 263, bottom: 551, width: 151, height: 38, center: { x: 187.5, y: 532 } },
            },
            {
              text: "Thanks",
              confidence: 0.99,
              bounds: { left: 126, top: 620, right: 249, bottom: 648, width: 123, height: 28, center: { x: 187.5, y: 634 } },
            },
          ],
        },
        targetText: "Continue",
        expectedText: "Thanks",
        preState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Shipping" },
        postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Confirmation" },
      }),
    }),
  ]);

  assert.equal(adapterResult.status, "success");
  assert.equal(serviceResult.status, "executed");
  assert.equal(adapterResult.data.outcome.ocrEvidence?.matchedText, serviceResult.evidence?.matchedText);
  assert.equal(adapterResult.data.outcome.ocrEvidence?.matchType, serviceResult.evidence?.matchType);
  assert.equal(adapterResult.data.outcome.ocrEvidence?.postVerificationResult, "passed");
  assert.equal(serviceResult.verification?.status, "verified");
});

test("getActionOutcomeWithMaestro loads persisted dry-run action record", async () => {
  const actionResult = await performActionWithEvidenceWithMaestro({
    sessionId: "action-outcome-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "wait_for_ui",
      contentDesc: "View products",
    },
  });
  const actionId = actionResult.data.outcome.actionId;
  const loaded = await getActionOutcomeWithMaestro({ actionId });

  assert.equal(loaded.status, "success");
  assert.equal(loaded.data.found, true);
  assert.equal(loaded.data.actionId, actionId);
  assert.equal(typeof loaded.data.retryRecommendationTier, "string");
  assert.equal(typeof loaded.data.retryRecommendation?.suggestedAction, "string");
  assert.equal(loaded.data.outcome?.actionType, "wait_for_ui");
});

test("explainLastFailureWithMaestro prioritizes iOS startup handshake evidence from action artifacts", async () => {
  const sessionId = `ios-startup-explain-${Date.now()}`;
  const actionId = `ios-startup-action-${Date.now()}`;
  const startupDir = path.join(repoRoot, "artifacts", "ios-physical-actions", sessionId);
  await mkdir(startupDir, { recursive: true });
  await writeFile(
    path.join(startupDir, "tap.execution.md"),
    [
      "# iOS physical tap execution evidence",
      "",
      "- attemptedBackend: local_manual_runner",
      "- executedBackend: maestro_cli",
      "- fallbackUsed: true",
      "- primaryFailurePhase: xctest_handshake",
      "- startupPhase: maestro_fallback_success",
      "- reasonCode: ADAPTER_ERROR",
      "",
      "## Summary",
      "Runner exited before channel bootstrap completed (code74 / dtxproxy XCTestManager handshake failure).",
      "",
    ].join("\n"),
    "utf8",
  );
  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Continue" },
    outcome: {
      actionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: true,
      retryCount: 0,
      outcome: "failed",
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "ios-physical-actions", sessionId, "tap.execution.md"),
        supportLevel: "partial",
        description: "iOS startup evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.adapterError,
    updatedAt: new Date().toISOString(),
  });

  const explained = await explainLastFailureWithMaestro({ sessionId });
  const ranked = await rankFailureCandidatesWithMaestro({ sessionId });

  assert.equal(explained.status, "success");
  assert.equal(explained.data.attribution?.affectedLayer, "runtime");
  assert.match(explained.data.attribution?.mostLikelyCause ?? "", /dtxproxy|bootstrap/i);
  assert.equal(ranked.data.candidates[0]?.affectedLayer, "runtime");
});

test("explainLastFailureWithMaestro maps iOS startup preflight evidence to environment layer", async () => {
  const sessionId = `ios-preflight-explain-${Date.now()}`;
  const actionId = `ios-preflight-action-${Date.now()}`;
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
      "- reasonCode: DEVICE_UNAVAILABLE",
      "",
      "## Summary",
      "Runner startup blocked during iOS preflight because target device is not ready/unlocked.",
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
        description: "iOS preflight startup evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.deviceUnavailable,
    updatedAt: new Date().toISOString(),
  });

  const explained = await explainLastFailureWithMaestro({ sessionId });
  assert.equal(explained.status, "success");
  assert.equal(explained.data.attribution?.affectedLayer, "environment");
  assert.match(explained.data.attribution?.mostLikelyCause ?? "", /preflight|unlocked/i);
});

test("recoverToKnownStateWithMaestro returns bounded recovery summary", async () => {
  const result = await recoverToKnownStateWithMaestro({
    sessionId: "recover-state-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.reasonCode, "OK");
  assert.equal(typeof result.data.summary.strategy, "string");
  assert.equal(typeof result.data.summary.recovered, "boolean");
});

test("replayLastStablePathWithMaestro replays last successful action", async () => {
  const sessionId = "replay-stable-path-dry-run";
  await performActionWithEvidenceWithMaestro({
    sessionId,
    platform: "android",
    dryRun: true,
    action: {
      actionType: "launch_app",
      appId: "host.exp.exponent",
    },
  });
  const result = await replayLastStablePathWithMaestro({
    sessionId,
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.summary.strategy, "replay_last_successful_action");
});

test("findSimilarFailuresWithMaestro returns indexed similar failures", async () => {
  const sessionId = "similar-failures-dry-run";
  await performActionWithEvidenceWithMaestro({ sessionId, platform: "android", dryRun: true, action: { actionType: "tap_element", contentDesc: "View products" } });
  await findSimilarFailuresWithMaestro({ sessionId });
  const result = await findSimilarFailuresWithMaestro({ sessionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.found, true);
});

test("findSimilarFailuresWithMaestro surfaces matched signals and replay value from indexed memory", async () => {
  const sessionId = `similar-failures-rich-${Date.now()}`;
  await recordFailureSignature(repoRoot, {
    actionId: `seeded-similar-${Date.now()}`,
    sessionId: `seeded-session-${Date.now()}`,
    signature: {
      actionType: "tap_element",
      screenId: "catalog",
      affectedLayer: "ui_locator",
      readiness: "ready",
      progressMarker: "none",
      stateChangeCategory: "no_material_change",
    },
    causalSignals: ["selector_unchanged", "state_unchanged"],
    replayValue: "low",
    updatedAt: new Date().toISOString(),
  });
  await performActionWithEvidenceWithMaestro({ sessionId, platform: "android", dryRun: true, action: { actionType: "tap_element", contentDesc: "View products" } });
  const result = await findSimilarFailuresWithMaestro({ sessionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.similarFailures.length >= 1, true);
  assert.equal(result.data.similarFailures[0]?.matchedSignals?.includes("action_type"), true);
  assert.equal(result.data.similarFailures[0]?.replayValue, "low");
});

test("compareAgainstBaselineWithMaestro compares against successful baseline", async () => {
  const sessionId = "baseline-compare-dry-run";
  await performActionWithEvidenceWithMaestro({ sessionId, platform: "android", dryRun: true, action: { actionType: "launch_app", appId: "host.exp.exponent" } });
  const result = await compareAgainstBaselineWithMaestro({ sessionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(typeof result.data.found, "boolean");
});

test("compareAgainstBaselineWithMaestro reports divergence metadata for drifted checkpoints", async () => {
  const sessionId = `baseline-divergence-${Date.now()}`;
  const baselineActionId = `baseline-stable-${Date.now()}`;
  const currentActionId = `baseline-current-${Date.now()}`;

  await persistActionRecord(repoRoot, {
    actionId: baselineActionId,
    sessionId,
    intent: { actionType: "launch_app", appId: "host.exp.exponent" },
    outcome: {
      actionId: baselineActionId,
      actionType: "launch_app",
      resolutionStrategy: "deterministic",
      preState: { appPhase: "launching", readiness: "waiting_ui", blockingSignals: [], screenId: "splash" },
      postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "catalog" },
      stateChanged: true,
      fallbackUsed: false,
      retryCount: 0,
      progressMarker: "full",
      stateChangeCategory: "screen_transition",
      outcome: "success",
    },
    evidenceDelta: {},
    evidence: [],
    lowLevelStatus: "success",
    lowLevelReasonCode: REASON_CODES.ok,
    updatedAt: new Date().toISOString(),
  });
  await recordBaselineEntry(repoRoot, {
    actionId: baselineActionId,
    sessionId,
    actionType: "launch_app",
    screenId: "catalog",
    readiness: "ready",
    progressMarker: "full",
    stateChangeCategory: "screen_transition",
    replayValue: "high",
    updatedAt: new Date().toISOString(),
  });
  await persistActionRecord(repoRoot, {
    actionId: currentActionId,
    sessionId,
    intent: { actionType: "launch_app", appId: "host.exp.exponent" },
    outcome: {
      actionId: currentActionId,
      actionType: "launch_app",
      resolutionStrategy: "deterministic",
      preState: { appPhase: "launching", readiness: "waiting_ui", blockingSignals: [], screenId: "splash" },
      postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "login" },
      stateChanged: true,
      fallbackUsed: false,
      retryCount: 0,
      progressMarker: "partial",
      stateChangeCategory: "screen_transition",
      outcome: "partial",
    },
    evidenceDelta: {},
    evidence: [],
    lowLevelStatus: "partial",
    lowLevelReasonCode: REASON_CODES.unsupportedOperation,
    updatedAt: new Date().toISOString(),
  });

  const result = await compareAgainstBaselineWithMaestro({ sessionId, actionId: currentActionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.comparison?.checkpointDivergence, "screen_mismatch");
  assert.equal(result.data.comparison?.replayValue, "low");
  assert.equal(result.data.comparison?.divergenceSignals?.includes("screen_mismatch"), true);
});

test("compareAgainstBaselineWithMaestro prefers the closest matching baseline over the first same-action entry", async () => {
  const sessionId = `baseline-preference-${Date.now()}`;
  const poorBaselineActionId = `baseline-poor-${Date.now()}`;
  const bestBaselineActionId = `baseline-best-${Date.now()}`;
  const currentActionId = `baseline-current-${Date.now()}`;

  await recordBaselineEntry(repoRoot, {
    actionId: bestBaselineActionId,
    sessionId,
    actionType: "tap_element",
    screenId: "catalog",
    readiness: "ready",
    progressMarker: "full",
    stateChangeCategory: "screen_transition",
    replayValue: "high",
    updatedAt: new Date().toISOString(),
  });
  await recordBaselineEntry(repoRoot, {
    actionId: poorBaselineActionId,
    sessionId,
    actionType: "tap_element",
    screenId: "settings",
    readiness: "waiting_ui",
    progressMarker: "partial",
    stateChangeCategory: "same_screen_delta",
    replayValue: "low",
    updatedAt: new Date().toISOString(),
  });
  await persistActionRecord(repoRoot, {
    actionId: currentActionId,
    sessionId,
    intent: { actionType: "tap_element", contentDesc: "View products" },
    outcome: {
      actionId: currentActionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      preState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "catalog" },
      postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenId: "catalog" },
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      progressMarker: "full",
      stateChangeCategory: "screen_transition",
      outcome: "success",
    },
    evidenceDelta: {},
    evidence: [],
    lowLevelStatus: "success",
    lowLevelReasonCode: REASON_CODES.ok,
    updatedAt: new Date().toISOString(),
  });

  const result = await compareAgainstBaselineWithMaestro({ sessionId, actionId: currentActionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.comparison?.baselineActionId, bestBaselineActionId);
  assert.equal(result.data.comparison?.matched, true);
  assert.equal(result.data.comparison?.replayValue, "high");
});

test("suggestKnownRemediationWithMaestro returns remediation hints", async () => {
  const sessionId = "known-remediation-dry-run";
  await performActionWithEvidenceWithMaestro({ sessionId, platform: "android", dryRun: true, action: { actionType: "tap_element", contentDesc: "View products" } });
  await findSimilarFailuresWithMaestro({ sessionId });
  const result = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(Array.isArray(result.data.remediation), true);
  assert.equal(new Set(result.nextSuggestions).size, result.nextSuggestions.length);
});

test("suggestKnownRemediationWithMaestro prioritizes iOS startup handshake remediation", async () => {
  const sessionId = `known-remediation-ios-startup-${Date.now()}`;
  const actionId = `known-remediation-ios-action-${Date.now()}`;
  const startupDir = path.join(repoRoot, "artifacts", "ios-physical-actions", sessionId);
  await mkdir(startupDir, { recursive: true });
  await writeFile(
    path.join(startupDir, "tap.execution.md"),
    [
      "# iOS physical tap execution evidence",
      "",
      "- attemptedBackend: local_manual_runner",
      "- executedBackend: maestro_cli",
      "- fallbackUsed: true",
      "- primaryFailurePhase: xctest_handshake",
      "- startupPhase: maestro_fallback_success",
      "- reasonCode: ADAPTER_ERROR",
      "",
      "## Summary",
      "Runner exited before channel bootstrap completed (code74 / dtxproxy XCTestManager handshake failure).",
      "",
    ].join("\n"),
    "utf8",
  );
  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "tap_element", text: "Continue" },
    outcome: {
      actionId,
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: true,
      retryCount: 0,
      outcome: "failed",
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "ios-physical-actions", sessionId, "tap.execution.md"),
        supportLevel: "partial",
        description: "iOS startup evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.adapterError,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(remediation.status, "success");
  assert.equal(
    remediation.data.remediation.some((item) => /code74|dtxproxy|handshake/i.test(item)),
    true,
  );
});

// ─── Navigate Back Tests ──────────────────────────────────────────────────

test("navigateBackWithMaestro fails without platform", async () => {
  const result = await navigateBackWithMaestro({
    sessionId: "navigate-back-test",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.configurationError);
  assert.equal(result.data.executedStrategy, "unsupported");
  assert.equal(result.data.supportLevel, "unsupported");
});

test("navigateBackWithMaestro rejects iOS system back", async () => {
  const result = await navigateBackWithMaestro({
    sessionId: "navigate-back-test",
    platform: "ios",
    target: "system",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.unsupportedOperation);
  assert.equal(result.data.executedStrategy, "unsupported");
  assert.equal(result.data.supportLevel, "unsupported");
  assert.match(result.data.capabilityNote ?? "", /system-level back/i);
  assert.equal(result.nextSuggestions.some((item) => /edge_swipe/i.test(item)), false);
});

test("navigateBackWithMaestro Android dry-run returns deterministic metadata", async () => {
  const result = await navigateBackWithMaestro({
    sessionId: "navigate-back-test",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, REASON_CODES.ok);
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.target, "app");
  assert.equal(result.data.executedStrategy, "android_keyevent");
  assert.equal(result.data.supportLevel, "full");
  assert.match(result.data.command ?? "", /keyevent.*4/);
});

test("navigateBackWithMaestro iOS without selector fails with helpful suggestion", async () => {
  const result = await navigateBackWithMaestro({
    sessionId: "navigate-back-test",
    platform: "ios",
    target: "app",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.noMatch);
  assert.equal(result.data.executedStrategy, "unsupported");
  assert.equal(result.data.supportLevel, "conditional");
  assert.match(result.data.capabilityNote ?? "", /selector.*back button/i);
});

test("navigateBackWithMaestro iOS edge_swipe without dimensions returns conditional unsupported", async () => {
  const result = await navigateBackWithMaestro({
    sessionId: "navigate-back-test",
    platform: "ios",
    target: "app",
    iosStrategy: "edge_swipe",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.unsupportedOperation);
  assert.equal(result.data.supportLevel, "conditional");
  assert.match(result.data.capabilityNote ?? "", /edge_swipe/i);
});

test("navigateBackWithMaestro iOS selector tap preserves command evidence", async () => {
  const result = await navigateBackWithMaestro({
    sessionId: "navigate-back-test",
    platform: "ios",
    deviceId: "ios-sim-1",
    target: "app",
    dryRun: true,
    selector: { resourceId: "login-back-button" },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, REASON_CODES.unsupportedOperation);
  assert.equal(result.data.executedStrategy, "ios_selector_tap");
  assert.equal(typeof result.data.command, "string");
  assert.match(result.data.command ?? "", /__wda_http__|\/source/i);
});

// ═══════════════════════════════════════════════════════════════════
// Regression tests for iOS verifyResolvedPoint findNodeAtPoint fix
// Bug: nodes[0] was always Application root, never the target element
// Fix: findNodeAtPoint finds the deepest node containing the resolved point
// ═══════════════════════════════════════════════════════════════════

test("parseUiBounds handles negative and floating-point coordinates", () => {
  // Standard integer bounds
  const standard = parseUiBounds("[20,334][410,378]");
  assert.ok(standard);
  assert.equal(standard.left, 20);
  assert.equal(standard.top, 334);
  assert.equal(standard.right, 410);
  assert.equal(standard.bottom, 378);

  // Negative coordinates (edge case for future-proofing)
  const negative = parseUiBounds("[-10,-5][100,200]");
  assert.ok(negative);
  assert.equal(negative.left, -10);
  assert.equal(negative.top, -5);

  // Floating-point coordinates (axe backend may return subpixel values)
  const floating = parseUiBounds("[20.5,334.75][410.3,378.1]");
  assert.ok(floating);
  assert.equal(Math.round(floating.left), 21);
  assert.equal(Math.round(floating.top), 335);
});

test("parseUiBounds returns undefined for malformed input", () => {
  assert.equal(parseUiBounds(undefined), undefined);
  assert.equal(parseUiBounds(""), undefined);
  assert.equal(parseUiBounds("invalid"), undefined);
  assert.equal(parseUiBounds("[20,334]"), undefined); // incomplete
});
