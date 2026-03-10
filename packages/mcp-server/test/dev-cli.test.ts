import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSessionRecordRelativePath } from "@mobile-e2e-mcp/core";
import { main, parseCliArgs } from "../src/dev-cli.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
}

async function runCli(argv: string[]): Promise<unknown> {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const messages: string[] = [];

  process.argv = [originalArgv[0] ?? "node", originalArgv[1] ?? "dev-cli.ts", ...argv];
  process.exitCode = 0;
  console.log = (message?: unknown, ...optional: unknown[]) => {
    messages.push([message, ...optional].map((item) => String(item)).join(" "));
  };

  try {
    await main();
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    console.log = originalLog;
  }

  assert.equal(messages.length > 0, true);
  return JSON.parse(messages[messages.length - 1] ?? "null");
}

test("parseCliArgs captures wait_for_ui flags", () => {
  const options = parseCliArgs([
    "--wait-for-ui",
    "--platform", "android",
    "--content-desc", "View products",
    "--wait-until", "unique",
    "--timeout-ms", "3000",
    "--interval-ms", "250",
    "--dry-run",
  ]);

  assert.equal(options.waitForUi, true);
  assert.equal(options.platform, "android");
  assert.equal(options.queryContentDesc, "View products");
  assert.equal(options.waitUntil, "unique");
  assert.equal(options.timeoutMs, 3000);
  assert.equal(options.intervalMs, 250);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures describe_capabilities flags", () => {
  const options = parseCliArgs([
    "--describe-capabilities",
    "--platform", "ios",
    "--runner-profile", "phase1",
  ]);

  assert.equal(options.describeCapabilities, true);
  assert.equal(options.platform, "ios");
  assert.equal(options.runnerProfile, "phase1");
});

test("parseCliArgs captures collect_debug_evidence flags", () => {
  const options = parseCliArgs([
    "--collect-debug-evidence",
    "--platform", "android",
    "--text", "timeout",
    "--lines", "80",
    "--include-diagnostics", "true",
    "--dry-run",
  ]);

  assert.equal(options.collectDebugEvidence, true);
  assert.equal(options.text, "timeout");
  assert.equal(options.lines, 80);
  assert.equal(options.includeDiagnostics, true);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures performance flags", () => {
  const options = parseCliArgs([
    "--measure-android-performance",
    "--duration-ms", "5000",
    "--preset", "interaction",
    "--dry-run",
  ]);

  assert.equal(options.measureAndroidPerformance, true);
  assert.equal(options.durationMs, 5000);
  assert.equal(options.performancePreset, "interaction");
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures capture_js_console_logs flags", () => {
  const options = parseCliArgs([
    "--capture-js-console-logs",
    "--target-id", "demo-target",
    "--max-logs", "10",
    "--timeout-ms", "1500",
    "--dry-run",
  ]);

  assert.equal(options.captureJsConsoleLogs, true);
  assert.equal(options.targetId, "demo-target");
  assert.equal(options.maxLogs, 10);
  assert.equal(options.timeoutMs, 1500);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures capture_js_network_events flags", () => {
  const options = parseCliArgs([
    "--capture-js-network-events",
    "--target-id", "demo-target",
    "--max-events", "12",
    "--failures-only", "true",
    "--dry-run",
  ]);

  assert.equal(options.captureJsNetworkEvents, true);
  assert.equal(options.targetId, "demo-target");
  assert.equal(options.maxEvents, 12);
  assert.equal(options.failuresOnly, true);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures list_js_debug_targets flags", () => {
  const options = parseCliArgs([
    "--list-js-debug-targets",
    "--metro-base-url", "http://127.0.0.1:8081",
    "--timeout-ms", "1500",
    "--dry-run",
  ]);

  assert.equal(options.listJsDebugTargets, true);
  assert.equal(options.metroBaseUrl, "http://127.0.0.1:8081");
  assert.equal(options.timeoutMs, 1500);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures scroll_and_resolve_ui_target flags", () => {
  const options = parseCliArgs([
    "--scroll-and-resolve-ui-target",
    "--platform", "android",
    "--resource-id", "view_products_button",
    "--max-swipes", "2",
    "--swipe-direction", "down",
    "--swipe-duration-ms", "400",
    "--dry-run",
  ]);

  assert.equal(options.scrollAndResolveUiTarget, true);
  assert.equal(options.queryResourceId, "view_products_button");
  assert.equal(options.maxSwipes, 2);
  assert.equal(options.swipeDirection, "down");
  assert.equal(options.swipeDurationMs, 400);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures policy-profile and scroll_and_tap_element flags", () => {
  const options = parseCliArgs([
    "--policy-profile", "read-only",
    "--scroll-and-tap-element",
    "--platform", "android",
    "--content-desc", "View products",
    "--max-swipes", "2",
    "--dry-run",
  ]);

  assert.equal(options.policyProfile, "read-only");
  assert.equal(options.scrollAndTapElement, true);
  assert.equal(options.queryContentDesc, "View products");
  assert.equal(options.maxSwipes, 2);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs keeps text value for query_ui paths", () => {
  const options = parseCliArgs([
    "--query-ui",
    "--platform", "android",
    "--text", "Cart is empty",
  ]);

  assert.equal(options.queryUi, true);
  assert.equal(options.text, "Cart is empty");
});

test("main dispatches query_ui Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--query-ui",
    "--platform", "android",
    "--content-desc", "View products",
    "--dry-run",
  ]) as {
    queryUiResult: { status: string; reasonCode: string; data: { supportLevel: string; evidence?: Array<{ kind: string; supportLevel: string }> } };
  };

  assert.equal(output.queryUiResult.status, "success");
  assert.equal(output.queryUiResult.reasonCode, "OK");
  assert.equal(output.queryUiResult.data.supportLevel, "full");
  assert.equal(output.queryUiResult.data.evidence?.[0]?.kind, "ui_dump");
  assert.equal(output.queryUiResult.data.evidence?.[0]?.supportLevel, "full");
});

test("main dispatches wait_for_ui iOS dry-run through the CLI", async () => {
  const output = await runCli([
    "--wait-for-ui",
    "--platform", "ios",
    "--content-desc", "View products",
    "--dry-run",
  ]) as {
    waitForUiResult: { status: string; reasonCode: string; data: { supportLevel: string; polls: number } };
  };

  assert.equal(output.waitForUiResult.status, "partial");
  assert.equal(output.waitForUiResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.waitForUiResult.data.supportLevel, "full");
  assert.equal(output.waitForUiResult.data.polls, 0);
});

test("main dispatches scroll_and_resolve_ui_target Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--scroll-and-resolve-ui-target",
    "--platform", "android",
    "--content-desc", "View products",
    "--max-swipes", "2",
    "--swipe-direction", "up",
    "--dry-run",
  ]) as {
    scrollAndResolveUiTargetResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; resolution: { status: string }; maxSwipes: number; swipeDirection: string };
    };
  };

  assert.equal(output.scrollAndResolveUiTargetResult.status, "partial");
  assert.equal(output.scrollAndResolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.scrollAndResolveUiTargetResult.data.supportLevel, "full");
  assert.equal(output.scrollAndResolveUiTargetResult.data.resolution.status, "not_executed");
  assert.equal(output.scrollAndResolveUiTargetResult.data.maxSwipes, 2);
  assert.equal(output.scrollAndResolveUiTargetResult.data.swipeDirection, "up");
});

test("main dispatches scroll_and_resolve_ui_target iOS dry-run through the CLI", async () => {
  const output = await runCli([
    "--scroll-and-resolve-ui-target",
    "--platform", "ios",
    "--content-desc", "View products",
    "--max-swipes", "2",
    "--dry-run",
  ]) as {
    scrollAndResolveUiTargetResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; resolution: { status: string }; commandHistory: string[][] };
    };
  };

  assert.equal(output.scrollAndResolveUiTargetResult.status, "partial");
  assert.equal(output.scrollAndResolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.scrollAndResolveUiTargetResult.data.supportLevel, "full");
  assert.equal(output.scrollAndResolveUiTargetResult.data.resolution.status, "not_executed");
  assert.equal(output.scrollAndResolveUiTargetResult.data.commandHistory[1]?.includes("swipe"), true);
});

test("main dispatches scroll_and_tap_element Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--policy-profile", "read-only",
    "--scroll-and-tap-element",
    "--platform", "android",
    "--content-desc", "View products",
    "--max-swipes", "2",
    "--dry-run",
  ]) as {
    scrollAndTapElementResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; resolveResult: { resolution: { status: string } } };
    };
  };

  assert.equal(output.scrollAndTapElementResult.status, "partial");
  assert.equal(output.scrollAndTapElementResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.scrollAndTapElementResult.data.supportLevel, "full");
  assert.equal(output.scrollAndTapElementResult.data.resolveResult.resolution.status, "not_executed");
});

test("main dispatches type_into_element iOS dry-run through the CLI", async () => {
  const output = await runCli([
    "--type-into-element",
    "--platform", "ios",
    "--content-desc", "View products",
    "--value", "hello",
    "--dry-run",
  ]) as {
    typeIntoElementResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; resolution: { status: string }; value: string };
    };
  };

  assert.equal(output.typeIntoElementResult.status, "partial");
  assert.equal(output.typeIntoElementResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.typeIntoElementResult.data.supportLevel, "full");
  assert.equal(output.typeIntoElementResult.data.resolution.status, "not_executed");
  assert.equal(output.typeIntoElementResult.data.value, "hello");
});

test("main dispatches resolve_ui_target Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--resolve-ui-target",
    "--platform", "android",
    "--content-desc", "View products",
    "--dry-run",
  ]) as {
    resolveUiTargetResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; resolution: { status: string } };
    };
  };

  assert.equal(output.resolveUiTargetResult.status, "partial");
  assert.equal(output.resolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.resolveUiTargetResult.data.supportLevel, "full");
  assert.equal(output.resolveUiTargetResult.data.resolution.status, "not_executed");
});

test("main dispatches tap_element iOS dry-run through the CLI", async () => {
  const output = await runCli([
    "--tap-element",
    "--platform", "ios",
    "--content-desc", "View products",
    "--dry-run",
  ]) as {
    tapElementResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; resolution?: { status: string } };
    };
  };

  assert.equal(output.tapElementResult.status, "partial");
  assert.equal(output.tapElementResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(output.tapElementResult.data.supportLevel, "full");
  assert.equal(output.tapElementResult.data.resolution?.status, "not_executed");
});

test("main dispatches run_flow Android dry-run through the CLI default path", async () => {
  const output = await runCli([
    "--platform", "android",
    "--dry-run",
    "--run-count", "1",
  ]) as {
    startResult: { status: string };
    runResult: { status: string; data: { dryRun: boolean; runnerProfile: string } };
    endResult: { status: string };
  };

  assert.equal(output.startResult.status, "success");
  assert.equal(output.runResult.status, "success");
  assert.equal(output.runResult.data.dryRun, true);
  assert.equal(output.runResult.data.runnerProfile, "phase1");
  assert.equal(output.endResult.status, "success");
});

test("main dispatches read-only policy denial through the default CLI flow", async () => {
  const sessionId = `cli-read-only-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  try {
    const output = await runCli([
      "--platform", "android",
      "--dry-run",
      "--run-count", "1",
      "--session-id", sessionId,
      "--policy-profile", "read-only",
    ]) as {
      startResult: { status: string };
      runResult: { status: string; reasonCode: string; nextSuggestions: string[] };
      endResult: { status: string };
    };

    assert.equal(output.startResult.status, "success");
    assert.equal(output.runResult.status, "failed");
    assert.equal(output.runResult.reasonCode, "POLICY_DENIED");
    assert.equal(output.runResult.nextSuggestions[0]?.includes("read-only"), true);
    assert.equal(output.endResult.status, "success");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("main dispatches install_app Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--install-app",
    "--platform", "android",
    "--runner-profile", "native_android",
    "--artifact-path", "package.json",
    "--dry-run",
  ]) as {
    installAppResult: {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; installCommand: string[] };
    };
  };

  assert.equal(output.installAppResult.status, "success");
  assert.equal(output.installAppResult.reasonCode, "OK");
  assert.equal(output.installAppResult.data.dryRun, true);
  assert.equal(output.installAppResult.data.installCommand.some((item) => item.endsWith("package.json")), true);
});

test("main dispatches launch_app Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--launch-app",
    "--platform", "android",
    "--runner-profile", "native_android",
    "--app-id", "com.example.demo",
    "--dry-run",
  ]) as {
    launchAppResult: {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; launchCommand: string[] };
    };
  };

  assert.equal(output.launchAppResult.status, "success");
  assert.equal(output.launchAppResult.reasonCode, "OK");
  assert.equal(output.launchAppResult.data.dryRun, true);
  assert.equal(output.launchAppResult.data.launchCommand.includes("monkey"), true);
});

test("main dispatches terminate_app iOS dry-run through the CLI", async () => {
  const output = await runCli([
    "--terminate-app",
    "--platform", "ios",
    "--app-id", "host.exp.Exponent",
    "--dry-run",
  ]) as {
    terminateAppResult: {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; command: string[] };
    };
  };

  assert.equal(output.terminateAppResult.status, "success");
  assert.equal(output.terminateAppResult.reasonCode, "OK");
  assert.equal(output.terminateAppResult.data.dryRun, true);
  assert.equal(output.terminateAppResult.data.command[0], "xcrun");
});

test("main dispatches iOS tap dry-run through the CLI", async () => {
  const output = await runCli([
    "--tap",
    "--platform", "ios",
    "--x", "12",
    "--y", "34",
    "--dry-run",
  ]) as {
    tapResult: {
      status: string;
      reasonCode: string;
      data: { command: string[] };
    };
  };

  assert.equal(output.tapResult.status, "success");
  assert.equal(output.tapResult.reasonCode, "OK");
  assert.deepEqual(output.tapResult.data.command.slice(1), ["ui", "tap", "12", "34", "--udid", "ADA078B9-3C6B-4875-8B85-A7789F368816"]);
});

test("main dispatches iOS type_text dry-run through the CLI", async () => {
  const output = await runCli([
    "--type-text",
    "--platform", "ios",
    "--text", "hello",
    "--dry-run",
  ]) as {
    typeTextResult: {
      status: string;
      reasonCode: string;
      data: { command: string[] };
    };
  };

  assert.equal(output.typeTextResult.status, "success");
  assert.equal(output.typeTextResult.reasonCode, "OK");
  assert.deepEqual(output.typeTextResult.data.command.slice(1), ["ui", "text", "hello", "--udid", "ADA078B9-3C6B-4875-8B85-A7789F368816"]);
});

test("main dispatches describe_capabilities through the CLI", async () => {
  const output = await runCli([
    "--describe-capabilities",
    "--platform", "ios",
    "--runner-profile", "phase1",
  ]) as {
    describeCapabilitiesResult: {
      status: string;
      reasonCode: string;
      data: { capabilities: { platform: string; toolCapabilities: Array<{ toolName: string; supportLevel: string }> } };
    };
  };

  assert.equal(output.describeCapabilitiesResult.status, "success");
  assert.equal(output.describeCapabilitiesResult.reasonCode, "OK");
  assert.equal(output.describeCapabilitiesResult.data.capabilities.platform, "ios");
  assert.equal(output.describeCapabilitiesResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "full");
});

test("main dispatches collect_debug_evidence Android dry-run through the CLI", async () => {
  const output = await runCli([
    "--collect-debug-evidence",
    "--platform", "android",
    "--text", "error",
    "--lines", "40",
    "--dry-run",
  ]) as {
    collectDebugEvidenceResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; jsDebugMetroBaseUrl?: string; jsDebugTargetEndpoint?: string; jsDebugTargetCandidateCount?: number; jsDebugTargetSelectionReason?: string; logSummary?: { query?: string }; suspectAreas: string[]; jsDebugTargetId?: string; jsConsoleLogCount?: number; jsNetworkEventCount?: number; jsConsoleSummary?: { totalLogs: number; exceptionCount: number }; jsNetworkSummary?: { totalTrackedRequests: number; failedRequestCount: number }; evidence?: Array<{ kind: string }> };
    };
  };

  assert.equal(output.collectDebugEvidenceResult.status, "success");
  assert.equal(output.collectDebugEvidenceResult.reasonCode, "OK");
  assert.equal(output.collectDebugEvidenceResult.data.supportLevel, "full");
  assert.equal(output.collectDebugEvidenceResult.data.jsDebugMetroBaseUrl, "http://127.0.0.1:8081");
  assert.equal(output.collectDebugEvidenceResult.data.jsDebugTargetEndpoint, "http://127.0.0.1:8081/json/list");
  assert.equal(output.collectDebugEvidenceResult.data.jsDebugTargetCandidateCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsDebugTargetSelectionReason, undefined);
  assert.equal(output.collectDebugEvidenceResult.data.logSummary?.query, "error");
  assert.equal(Array.isArray(output.collectDebugEvidenceResult.data.suspectAreas), true);
  assert.equal(output.collectDebugEvidenceResult.data.jsDebugTargetId, undefined);
  assert.equal(output.collectDebugEvidenceResult.data.jsConsoleLogCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsNetworkEventCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsConsoleSummary?.totalLogs, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsConsoleSummary?.exceptionCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsNetworkSummary?.totalTrackedRequests, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsNetworkSummary?.failedRequestCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.evidence?.some((item) => item.kind === "log"), true);
  assert.equal(output.collectDebugEvidenceResult.data.evidence?.some((item) => item.kind === "crash_signal"), true);
});

test("main dispatches measure_android_performance dry-run through the CLI", async () => {
  const output = await runCli([
    "--measure-android-performance",
    "--platform", "android",
    "--runner-profile", "phase1",
    "--duration-ms", "4000",
    "--preset", "interaction",
    "--dry-run",
  ]) as {
    measureAndroidPerformanceResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; captureMode: string; preset: string };
    };
  };

  assert.equal(output.measureAndroidPerformanceResult.status, "success");
  assert.equal(output.measureAndroidPerformanceResult.reasonCode, "OK");
  assert.equal(output.measureAndroidPerformanceResult.data.supportLevel, "full");
  assert.equal(output.measureAndroidPerformanceResult.data.captureMode, "time_window");
  assert.equal(output.measureAndroidPerformanceResult.data.preset, "interaction");
});

test("main dispatches measure_ios_performance dry-run through the CLI", async () => {
  const output = await runCli([
    "--measure-ios-performance",
    "--platform", "ios",
    "--runner-profile", "phase1",
    "--duration-ms", "4000",
    "--template", "time-profiler",
    "--dry-run",
  ]) as {
    measureIosPerformanceResult: {
      status: string;
      reasonCode: string;
      data: { supportLevel: string; captureMode: string; template: string };
    };
  };

  assert.equal(output.measureIosPerformanceResult.status, "success");
  assert.equal(output.measureIosPerformanceResult.reasonCode, "OK");
  assert.equal(output.measureIosPerformanceResult.data.supportLevel, "partial");
  assert.equal(output.measureIosPerformanceResult.data.captureMode, "time_window");
  assert.equal(output.measureIosPerformanceResult.data.template, "time-profiler");
});

test("main dispatches list_js_debug_targets dry-run through the CLI", async () => {
  const output = await runCli([
    "--list-js-debug-targets",
    "--dry-run",
  ]) as {
    listJsDebugTargetsResult: {
      status: string;
      reasonCode: string;
      data: { targetCount: number; endpoint: string };
    };
  };

  assert.equal(output.listJsDebugTargetsResult.status, "success");
  assert.equal(output.listJsDebugTargetsResult.reasonCode, "OK");
  assert.equal(output.listJsDebugTargetsResult.data.targetCount, 0);
  assert.equal(output.listJsDebugTargetsResult.data.endpoint, "http://127.0.0.1:8081/json/list");
});

test("main dispatches capture_js_console_logs dry-run through the CLI", async () => {
  const output = await runCli([
    "--capture-js-console-logs",
    "--target-id", "demo-target",
    "--dry-run",
  ]) as {
    captureJsConsoleLogsResult: {
      status: string;
      reasonCode: string;
      data: { collectedCount: number; webSocketDebuggerUrl: string; summary: { totalLogs: number; exceptionCount: number } };
    };
  };

  assert.equal(output.captureJsConsoleLogsResult.status, "success");
  assert.equal(output.captureJsConsoleLogsResult.reasonCode, "OK");
  assert.equal(output.captureJsConsoleLogsResult.data.collectedCount, 0);
  assert.equal(output.captureJsConsoleLogsResult.data.summary.totalLogs, 0);
  assert.equal(output.captureJsConsoleLogsResult.data.summary.exceptionCount, 0);
  assert.equal(output.captureJsConsoleLogsResult.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
});

test("main dispatches capture_js_network_events dry-run through the CLI", async () => {
  const output = await runCli([
    "--capture-js-network-events",
    "--target-id", "demo-target",
    "--dry-run",
  ]) as {
    captureJsNetworkEventsResult: {
      status: string;
      reasonCode: string;
      data: { collectedCount: number; failuresOnly: boolean; webSocketDebuggerUrl: string; summary: { totalTrackedRequests: number; failedRequestCount: number } };
    };
  };

  assert.equal(output.captureJsNetworkEventsResult.status, "success");
  assert.equal(output.captureJsNetworkEventsResult.reasonCode, "OK");
  assert.equal(output.captureJsNetworkEventsResult.data.collectedCount, 0);
  assert.equal(output.captureJsNetworkEventsResult.data.failuresOnly, true);
  assert.equal(output.captureJsNetworkEventsResult.data.summary.totalTrackedRequests, 0);
  assert.equal(output.captureJsNetworkEventsResult.data.summary.failedRequestCount, 0);
  assert.equal(output.captureJsNetworkEventsResult.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
});
