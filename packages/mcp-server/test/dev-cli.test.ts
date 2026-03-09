import assert from "node:assert/strict";
import test from "node:test";
import { main, parseCliArgs } from "../src/dev-cli.ts";

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

test("parseCliArgs captures scroll_and_tap_element flags", () => {
  const options = parseCliArgs([
    "--scroll-and-tap-element",
    "--platform", "android",
    "--content-desc", "View products",
    "--max-swipes", "2",
    "--dry-run",
  ]);

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
  assert.equal(output.waitForUiResult.data.supportLevel, "partial");
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

test("main dispatches scroll_and_tap_element Android dry-run through the CLI", async () => {
  const output = await runCli([
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
  assert.equal(output.typeIntoElementResult.data.supportLevel, "partial");
  assert.equal(output.typeIntoElementResult.data.resolution.status, "unsupported");
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
  assert.equal(output.tapElementResult.data.supportLevel, "partial");
  assert.equal(output.tapElementResult.data.resolution?.status, "unsupported");
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
  assert.equal(output.describeCapabilitiesResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "partial");
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
      data: { supportLevel: string; logSummary?: { query?: string }; jsDebugTargetId?: string; jsConsoleLogCount?: number; jsNetworkEventCount?: number; evidence?: Array<{ kind: string }> };
    };
  };

  assert.equal(output.collectDebugEvidenceResult.status, "success");
  assert.equal(output.collectDebugEvidenceResult.reasonCode, "OK");
  assert.equal(output.collectDebugEvidenceResult.data.supportLevel, "full");
  assert.equal(output.collectDebugEvidenceResult.data.logSummary?.query, "error");
  assert.equal(output.collectDebugEvidenceResult.data.jsDebugTargetId, undefined);
  assert.equal(output.collectDebugEvidenceResult.data.jsConsoleLogCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.jsNetworkEventCount, 0);
  assert.equal(output.collectDebugEvidenceResult.data.evidence?.some((item) => item.kind === "log"), true);
  assert.equal(output.collectDebugEvidenceResult.data.evidence?.some((item) => item.kind === "crash_signal"), true);
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
      data: { collectedCount: number; webSocketDebuggerUrl: string };
    };
  };

  assert.equal(output.captureJsConsoleLogsResult.status, "success");
  assert.equal(output.captureJsConsoleLogsResult.reasonCode, "OK");
  assert.equal(output.captureJsConsoleLogsResult.data.collectedCount, 0);
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
      data: { collectedCount: number; failuresOnly: boolean; webSocketDebuggerUrl: string };
    };
  };

  assert.equal(output.captureJsNetworkEventsResult.status, "success");
  assert.equal(output.captureJsNetworkEventsResult.reasonCode, "OK");
  assert.equal(output.captureJsNetworkEventsResult.data.collectedCount, 0);
  assert.equal(output.captureJsNetworkEventsResult.data.failuresOnly, true);
  assert.equal(output.captureJsNetworkEventsResult.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
});
