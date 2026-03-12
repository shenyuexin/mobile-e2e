import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { REASON_CODES, type GetScreenSummaryData, type StateSummary, type ToolResult } from "@mobile-e2e-mcp/contracts";
import { MacVisionOcrProvider, OcrService, type MacVisionExecutionResult } from "@mobile-e2e-mcp/adapter-vision";
import {
  calculateViewportOverlap,
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  buildUiTargetResolution,
  detectViewportBounds,
  diffAmbiguousCandidates,
  buildInspectUiSummary,
  hasQueryUiSelector,
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
} from "../src/ui-model.ts";
import { buildResolutionNextSuggestions } from "../src/ui-tools.ts";
import { buildCapabilityProfile, buildDiagnosisBriefing, buildLogSummary, buildStateSummaryFromSignals, collectDebugEvidenceWithMaestro, collectDiagnosticsWithMaestro, compareAgainstBaselineWithMaestro, describeCapabilitiesWithMaestro, findSimilarFailuresWithMaestro, getActionOutcomeWithMaestro, getCrashSignalsWithMaestro, getLogsWithMaestro, getScreenSummaryWithMaestro, getSessionStateWithMaestro, inspectUiWithMaestro, performActionWithEvidenceWithMaestro, recoverToKnownStateWithMaestro, replayLastStablePathWithMaestro, resetOcrFallbackTestHooksForTesting, resolveUiTargetWithMaestro, scrollAndResolveUiTargetWithMaestro, scrollAndTapElementWithMaestro, setOcrFallbackTestHooksForTesting, suggestKnownRemediationWithMaestro, takeScreenshotWithMaestro, tapElementWithMaestro, tapWithMaestro, typeIntoElementWithMaestro, typeTextWithMaestro, waitForUiWithMaestro } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ocrFixtureRoot = path.join(repoRoot, "tests", "fixtures", "ocr");

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
  assert.equal(summary.nodesWithText, 2);
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
  assert.equal(resolution.status, "resolved");
  assert.deepEqual(resolution.resolvedPoint, { x: 113, y: 164 });
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

  assert.equal(isWaitConditionMet(visibleResult, "visible"), true);
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

test("scrollAndResolveUiTargetWithMaestro previews iOS swipe-assisted dry-run", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
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

test("buildCapabilityProfile stays honest across Android and iOS UI action support", () => {
  const androidProfile = buildCapabilityProfile("android", "phase1");
  const iosProfile = buildCapabilityProfile("ios", "phase1");

  assert.equal(androidProfile.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "tap")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "type_text")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "type_into_element")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "scroll_and_resolve_ui_target")?.supportLevel, "full");
  assert.equal(iosProfile.groups.find((group) => group.groupName === "ui_actions")?.supportLevel, "full");
});

test("typeTextWithMaestro previews iOS idb text entry in dry-run mode", async () => {
  const result = await typeTextWithMaestro({
    sessionId: "test-type-text-ios",
    platform: "ios",
    text: "hello world",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.command.includes("ui"), true);
  assert.equal(result.data.command.includes("text"), true);
  assert.equal(result.data.command.includes("hello world"), true);
  assert.equal(result.data.command.includes("--udid"), true);
  assert.equal(result.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
  assert.equal(result.data.exitCode, 0);
});

test("tapWithMaestro previews iOS idb coordinate tap in dry-run mode", async () => {
  const result = await tapWithMaestro({
    sessionId: "test-tap-ios-direct",
    platform: "ios",
    x: 10,
    y: 20,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.command.includes("ui"), true);
  assert.equal(result.data.command.includes("tap"), true);
  assert.equal(result.data.command.includes("10"), true);
  assert.equal(result.data.command.includes("20"), true);
  assert.equal(result.data.command.includes("--udid"), true);
  assert.equal(result.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
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
  assert.equal(result.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "inspect_ui")?.supportLevel, "partial");
  assert.equal(result.data.capabilities.ocrFallback?.deterministicFirst, true);
});

test("scrollAndTapElementWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await scrollAndTapElementWithMaestro({
    sessionId: "test-scroll-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolveResult.resolution.status, "not_executed");
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
  assert.equal(Array.isArray(result.data.actionabilityReview), true);
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
      suggestedSelectors: [{ resourceId: "primary_cta" }],
    },
  });

  assert.equal(suggestions[0]?.includes("resourceId, clickable"), true);
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
});

test("queryUiNodes prefers deeper leaf nodes when other signals tie", () => {
  const query = normalizeQueryUiSelector({ text: "Continue" });
  const result = queryUiNodes([
    { text: "Continue", resourceId: "container_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][200,300]", depth: 0 },
    { text: "Continue", resourceId: "leaf_cta", clickable: true, enabled: true, scrollable: false, bounds: "[0,100][200,300]", depth: 2 },
  ], query);

  assert.equal(result.matches[0]?.node.resourceId, "leaf_cta");
});

test("performActionWithEvidenceWithMaestro uses screenshot fixture for OCR assert fallback success", async () => {
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

test("performActionWithEvidenceWithMaestro uses screenshot fixture for OCR tap success", async () => {
  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/continue-success.observations.json");
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
    getScreenSummary: async (input) => buildScreenSummaryResult(input.sessionId, buildFixtureScreenSummary({
      screenTitle: "Confirmation",
      topVisibleTexts: ["Thanks"],
    })),
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

test("performActionWithEvidenceWithMaestro fails safely on low-confidence screenshot fixtures", async () => {
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

test("performActionWithEvidenceWithMaestro fails safely on ambiguous screenshot fixtures", async () => {
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

test("adapter-maestro and OcrService agree on low-confidence fixture outcome", async () => {
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

test("adapter-maestro and OcrService agree on ambiguous fixture outcome", async () => {
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

test("adapter-maestro and OcrService agree on successful fixture outcome", async () => {
  const fixture = await readJsonFixture<MacVisionExecutionResult>("tests/fixtures/ocr/continue-success.observations.json");
  const [adapterResult, serviceResult] = await Promise.all([
    (async () => {
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
        getScreenSummary: async (input) => buildScreenSummaryResult(input.sessionId, buildFixtureScreenSummary({
          screenTitle: "Confirmation",
          topVisibleTexts: ["Thanks"],
        })),
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
            ocr.blocks[0]!,
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
  assert.equal(loaded.data.outcome?.actionType, "wait_for_ui");
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

test("compareAgainstBaselineWithMaestro compares against successful baseline", async () => {
  const sessionId = "baseline-compare-dry-run";
  await performActionWithEvidenceWithMaestro({ sessionId, platform: "android", dryRun: true, action: { actionType: "launch_app", appId: "host.exp.exponent" } });
  const result = await compareAgainstBaselineWithMaestro({ sessionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(typeof result.data.found, "boolean");
});

test("suggestKnownRemediationWithMaestro returns remediation hints", async () => {
  const sessionId = "known-remediation-dry-run";
  await performActionWithEvidenceWithMaestro({ sessionId, platform: "android", dryRun: true, action: { actionType: "tap_element", contentDesc: "View products" } });
  await findSimilarFailuresWithMaestro({ sessionId });
  const result = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(result.reasonCode, "OK");
  assert.equal(Array.isArray(result.data.remediation), true);
});
