import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface ValidationCase {
  name: string;
  cliArgs: string[];
  allowFailureExit?: boolean;
  validate: (result: unknown) => void;
}

const runSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let runCounter = 0;

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function extractJsonPayload(raw: string): string | undefined {
  const trimmed = raw.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    return undefined;
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function withIsolatedRuntimeArgs(cliArgs: string[]): string[] {
  const args = [...cliArgs];
  const caseId = `${runSeed}-${++runCounter}`;
  const platform = readFlagValue(args, "--platform");
  const isDryRun = hasFlag(args, "--dry-run");

  if (!hasFlag(args, "--session-id") && isDryRun) {
    args.push("--session-id", `validate-dry-run-${caseId}`);
  }

  if (platform === "android" && !hasFlag(args, "--device-id") && isDryRun) {
    args.push("--device-id", `validate-dry-run-device-${caseId}`);
  }

  return args;
}

async function runCli(cliArgs: string[], allowFailureExit = false): Promise<unknown> {
  const repoRoot = repoRootFromScript();
  const isolatedCliArgs = withIsolatedRuntimeArgs(cliArgs);
  const commandArgs = [
    "--filter",
    "@shenyuexin/mobile-e2e-mcp",
    "exec",
    "tsx",
    "src/dev-cli.ts",
    ...isolatedCliArgs,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("pnpm", commandArgs, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const jsonPayload = extractJsonPayload(stdout);
      if (code === 0 || (allowFailureExit && jsonPayload !== undefined)) {
        resolve(jsonPayload ?? stdout);
        return;
      }
      reject(new Error(`CLI command failed (${String(code)}): ${stderr || stdout}`));
    });
  });

  const jsonPayload = extractJsonPayload(output) ?? output.trim();
  return JSON.parse(jsonPayload);
}

const validationCases: ValidationCase[] = [
  {
    name: "default run_flow dry-run",
    cliArgs: ["--platform", "android", "--dry-run", "--run-count", "1"],
    validate: (result) => {
      const typed = result as { startResult: { status: string; data: { capabilities?: { platform: string } } }; runResult: { status: string; data: { dryRun: boolean } }; endResult: { status: string } };
      assert.equal(typed.startResult.status, "success");
      assert.equal(typed.startResult.data.capabilities?.platform, "android");
      assert.equal(typed.runResult.status, "success");
      assert.equal(typed.runResult.data.dryRun, true);
      assert.equal(typed.endResult.status, "success");
    },
  },
  {
    name: "describe_capabilities ios profile",
    cliArgs: ["--describe-capabilities", "--platform", "ios", "--runner-profile", "phase1"],
    validate: (result) => {
      const typed = result as { describeCapabilitiesResult: { status: string; reasonCode: string; data: { capabilities: { platform: string; toolCapabilities: Array<{ toolName: string; supportLevel: string }> } } } };
      assert.equal(typed.describeCapabilitiesResult.status, "success");
      assert.equal(typed.describeCapabilitiesResult.reasonCode, "OK");
      assert.equal(typed.describeCapabilitiesResult.data.capabilities.platform, "ios");
      assert.equal(typed.describeCapabilitiesResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "full");
    },
  },
  {
    name: "collect_debug_evidence custom metro dry-run",
    cliArgs: ["--collect-debug-evidence", "--platform", "android", "--metro-base-url", "http://127.0.0.1:9090", "--dry-run"],
    validate: (result) => {
      const typed = result as {
        collectDebugEvidenceResult: {
          status: string;
          reasonCode: string;
          data: { supportLevel: string; jsDebugMetroBaseUrl?: string; jsDebugTargetEndpoint?: string; jsDebugTargetCandidateCount?: number; jsDebugTargetSelectionReason?: string; jsConsoleSummary?: { totalLogs: number; exceptionCount: number }; jsNetworkSummary?: { totalTrackedRequests: number; failedRequestCount: number } };
        };
      };
      assert.equal(typed.collectDebugEvidenceResult.status, "success");
      assert.equal(typed.collectDebugEvidenceResult.reasonCode, "OK");
      assert.equal(typed.collectDebugEvidenceResult.data.supportLevel, "full");
      assert.equal(typed.collectDebugEvidenceResult.data.jsDebugMetroBaseUrl, "http://127.0.0.1:9090");
      assert.equal(typed.collectDebugEvidenceResult.data.jsDebugTargetEndpoint, "http://127.0.0.1:9090/json/list");
      assert.equal(typed.collectDebugEvidenceResult.data.jsDebugTargetCandidateCount, 0);
      assert.equal(typed.collectDebugEvidenceResult.data.jsDebugTargetSelectionReason, undefined);
      assert.equal(typed.collectDebugEvidenceResult.data.jsConsoleSummary?.totalLogs, 0);
      assert.equal(typed.collectDebugEvidenceResult.data.jsConsoleSummary?.exceptionCount, 0);
      assert.equal(typed.collectDebugEvidenceResult.data.jsNetworkSummary?.totalTrackedRequests, 0);
      assert.equal(typed.collectDebugEvidenceResult.data.jsNetworkSummary?.failedRequestCount, 0);
    },
  },
  {
    name: "list_js_debug_targets dry-run",
    cliArgs: ["--list-js-debug-targets", "--dry-run"],
    validate: (result) => {
      const typed = result as { listJsDebugTargetsResult: { status: string; reasonCode: string; data: { targetCount: number; endpoint: string } } };
      assert.equal(typed.listJsDebugTargetsResult.status, "success");
      assert.equal(typed.listJsDebugTargetsResult.reasonCode, "OK");
      assert.equal(typed.listJsDebugTargetsResult.data.targetCount, 0);
      assert.equal(typed.listJsDebugTargetsResult.data.endpoint, "http://127.0.0.1:8081/json/list");
    },
  },
  {
    name: "capture_js_console_logs dry-run",
    cliArgs: ["--capture-js-console-logs", "--target-id", "demo-target", "--dry-run"],
    validate: (result) => {
      const typed = result as { captureJsConsoleLogsResult: { status: string; reasonCode: string; data: { collectedCount: number; webSocketDebuggerUrl: string; summary: { totalLogs: number; exceptionCount: number } } } };
      assert.equal(typed.captureJsConsoleLogsResult.status, "success");
      assert.equal(typed.captureJsConsoleLogsResult.reasonCode, "OK");
      assert.equal(typed.captureJsConsoleLogsResult.data.collectedCount, 0);
      assert.equal(typed.captureJsConsoleLogsResult.data.summary.totalLogs, 0);
      assert.equal(typed.captureJsConsoleLogsResult.data.summary.exceptionCount, 0);
      assert.equal(typed.captureJsConsoleLogsResult.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
    },
  },
  {
    name: "capture_js_network_events dry-run",
    cliArgs: ["--capture-js-network-events", "--target-id", "demo-target", "--dry-run"],
    validate: (result) => {
      const typed = result as { captureJsNetworkEventsResult: { status: string; reasonCode: string; data: { collectedCount: number; failuresOnly: boolean; webSocketDebuggerUrl: string; summary: { totalTrackedRequests: number; failedRequestCount: number } } } };
      assert.equal(typed.captureJsNetworkEventsResult.status, "success");
      assert.equal(typed.captureJsNetworkEventsResult.reasonCode, "OK");
      assert.equal(typed.captureJsNetworkEventsResult.data.collectedCount, 0);
      assert.equal(typed.captureJsNetworkEventsResult.data.failuresOnly, true);
      assert.equal(typed.captureJsNetworkEventsResult.data.summary.totalTrackedRequests, 0);
      assert.equal(typed.captureJsNetworkEventsResult.data.summary.failedRequestCount, 0);
      assert.equal(typed.captureJsNetworkEventsResult.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
    },
  },
  {
    name: "measure_android_performance dry-run",
    cliArgs: ["--measure-android-performance", "--platform", "android", "--runner-profile", "phase1", "--duration-ms", "4000", "--preset", "interaction", "--dry-run"],
    validate: (result) => {
      const typed = result as { measureAndroidPerformanceResult: { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; preset: string } } };
      assert.equal(typed.measureAndroidPerformanceResult.status, "success");
      assert.equal(typed.measureAndroidPerformanceResult.reasonCode, "OK");
      assert.equal(typed.measureAndroidPerformanceResult.data.supportLevel, "full");
      assert.equal(typed.measureAndroidPerformanceResult.data.captureMode, "time_window");
      assert.equal(typed.measureAndroidPerformanceResult.data.preset, "interaction");
    },
  },
  {
    name: "measure_ios_performance dry-run",
    cliArgs: ["--measure-ios-performance", "--platform", "ios", "--runner-profile", "phase1", "--duration-ms", "4000", "--template", "time-profiler", "--dry-run"],
    validate: (result) => {
      const typed = result as { measureIosPerformanceResult: { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; template: string } } };
      assert.equal(typed.measureIosPerformanceResult.status, "success");
      assert.equal(typed.measureIosPerformanceResult.reasonCode, "OK");
      assert.equal(typed.measureIosPerformanceResult.data.supportLevel, "partial");
      assert.equal(typed.measureIosPerformanceResult.data.captureMode, "time_window");
      assert.equal(typed.measureIosPerformanceResult.data.template, "time-profiler");
    },
  },
  {
    name: "measure_ios_performance animation-hitches dry-run",
    cliArgs: ["--measure-ios-performance", "--platform", "ios", "--runner-profile", "phase1", "--duration-ms", "4000", "--template", "animation-hitches", "--dry-run"],
    validate: (result) => {
      const typed = result as { measureIosPerformanceResult: { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; template: string } } };
      assert.equal(typed.measureIosPerformanceResult.status, "success");
      assert.equal(typed.measureIosPerformanceResult.reasonCode, "OK");
      assert.equal(typed.measureIosPerformanceResult.data.supportLevel, "partial");
      assert.equal(typed.measureIosPerformanceResult.data.captureMode, "time_window");
      assert.equal(typed.measureIosPerformanceResult.data.template, "animation-hitches");
    },
  },
  {
    name: "query_ui Android dry-run",
    cliArgs: ["--query-ui", "--platform", "android", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { queryUiResult: { status: string; reasonCode: string; data: { supportLevel: string; evidence?: Array<{ kind: string; path: string; supportLevel: string }> } } };
      assert.equal(typed.queryUiResult.status, "success");
      assert.equal(typed.queryUiResult.reasonCode, "OK");
      assert.equal(typed.queryUiResult.data.supportLevel, "full");
      assert.equal(typed.queryUiResult.data.evidence?.[0]?.kind, "ui_dump");
      assert.equal(typed.queryUiResult.data.evidence?.[0]?.supportLevel, "full");
    },
  },
  {
    name: "resolve_ui_target Android dry-run",
    cliArgs: ["--resolve-ui-target", "--platform", "android", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { resolveUiTargetResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string } } } };
      assert.equal(typed.resolveUiTargetResult.status, "partial");
      assert.equal(typed.resolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.resolveUiTargetResult.data.supportLevel, "full");
      assert.equal(typed.resolveUiTargetResult.data.resolution.status, "not_executed");
    },
  },
  {
    name: "wait_for_ui iOS dry-run",
    cliArgs: ["--wait-for-ui", "--platform", "ios", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { waitForUiResult: { status: string; reasonCode: string; data: { supportLevel: string; polls: number } } };
      assert.equal(typed.waitForUiResult.status, "partial");
      assert.equal(typed.waitForUiResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.waitForUiResult.data.supportLevel, "full");
      assert.equal(typed.waitForUiResult.data.polls, 0);
    },
  },
  {
    name: "scroll_and_resolve_ui_target Android dry-run",
    cliArgs: ["--scroll-and-resolve-ui-target", "--platform", "android", "--content-desc", "View products", "--max-swipes", "2", "--dry-run"],
    validate: (result) => {
      const typed = result as { scrollAndResolveUiTargetResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string }; maxSwipes: number } } };
      assert.equal(typed.scrollAndResolveUiTargetResult.status, "partial");
      assert.equal(typed.scrollAndResolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.supportLevel, "full");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.resolution.status, "not_executed");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.maxSwipes, 2);
    },
  },
  {
    name: "scroll_and_tap_element Android dry-run",
    cliArgs: ["--scroll-and-tap-element", "--platform", "android", "--content-desc", "View products", "--max-swipes", "2", "--dry-run"],
    validate: (result) => {
      const typed = result as { scrollAndTapElementResult: { status: string; reasonCode: string; data: { supportLevel: string; resolveResult: { resolution: { status: string } } } } };
      assert.equal(typed.scrollAndTapElementResult.status, "partial");
      assert.equal(typed.scrollAndTapElementResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.scrollAndTapElementResult.data.supportLevel, "full");
      assert.equal(typed.scrollAndTapElementResult.data.resolveResult.resolution.status, "not_executed");
    },
  },
  {
    name: "type_into_element iOS dry-run",
    cliArgs: ["--type-into-element", "--platform", "ios", "--content-desc", "View products", "--value", "hello", "--dry-run"],
    validate: (result) => {
      const typed = result as { typeIntoElementResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string }; value: string } } };
      assert.equal(typed.typeIntoElementResult.status, "partial");
      assert.equal(typed.typeIntoElementResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.typeIntoElementResult.data.supportLevel, "full");
      assert.equal(typed.typeIntoElementResult.data.resolution.status, "not_executed");
      assert.equal(typed.typeIntoElementResult.data.value, "hello");
    },
  },
  {
    name: "scroll_and_resolve_ui_target iOS dry-run",
    cliArgs: ["--scroll-and-resolve-ui-target", "--platform", "ios", "--content-desc", "View products", "--max-swipes", "2", "--dry-run"],
    validate: (result) => {
      const typed = result as { scrollAndResolveUiTargetResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string }; commandHistory: string[][] } } };
      assert.equal(typed.scrollAndResolveUiTargetResult.status, "partial");
      assert.equal(typed.scrollAndResolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.supportLevel, "full");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.resolution.status, "not_executed");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.commandHistory[1]?.includes("swipe"), true);
    },
  },
  {
    name: "default run_flow read-only policy denied",
    cliArgs: ["--platform", "android", "--dry-run", "--run-count", "1", "--session-id", "validate-policy-denied", "--policy-profile", "read-only"],
    allowFailureExit: true,
    validate: (result) => {
      const typed = result as { startResult: { status: string }; runResult: { status: string; reasonCode: string }; endResult: { status: string } };
      assert.equal(typed.startResult.status, "success");
      assert.equal(typed.runResult.status, "failed");
      assert.equal(typed.runResult.reasonCode, "POLICY_DENIED");
      assert.equal(typed.endResult.status, "success");
    },
  },
  {
    name: "install_app Android dry-run",
    cliArgs: ["--install-app", "--platform", "android", "--runner-profile", "native_android", "--artifact-path", "package.json", "--dry-run"],
    validate: (result) => {
      const typed = result as { installAppResult: { status: string; reasonCode: string; data: { dryRun: boolean; installCommand: string[] } } };
      assert.equal(typed.installAppResult.status, "success");
      assert.equal(typed.installAppResult.reasonCode, "OK");
      assert.equal(typed.installAppResult.data.dryRun, true);
      assert.equal(typed.installAppResult.data.installCommand.some((item) => item.endsWith("package.json")), true);
    },
  },
  {
    name: "launch_app Android dry-run",
    cliArgs: ["--launch-app", "--platform", "android", "--runner-profile", "native_android", "--app-id", "com.example.demo", "--dry-run"],
    validate: (result) => {
      const typed = result as { launchAppResult: { status: string; reasonCode: string; data: { dryRun: boolean; launchCommand: string[] } } };
      assert.equal(typed.launchAppResult.status, "success");
      assert.equal(typed.launchAppResult.reasonCode, "OK");
      assert.equal(typed.launchAppResult.data.dryRun, true);
      assert.equal(typed.launchAppResult.data.launchCommand.includes("monkey"), true);
    },
  },
  {
    name: "terminate_app iOS dry-run",
    cliArgs: ["--terminate-app", "--platform", "ios", "--app-id", "host.exp.Exponent", "--dry-run"],
    validate: (result) => {
      const typed = result as { terminateAppResult: { status: string; reasonCode: string; data: { dryRun: boolean; command: string[] } } };
      assert.equal(typed.terminateAppResult.status, "success");
      assert.equal(typed.terminateAppResult.reasonCode, "OK");
      assert.equal(typed.terminateAppResult.data.dryRun, true);
      assert.equal(typed.terminateAppResult.data.command[0], "xcrun");
    },
  },
  {
    name: "tap iOS dry-run",
    cliArgs: ["--tap", "--platform", "ios", "--x", "12", "--y", "34", "--dry-run"],
    validate: (result) => {
      const typed = result as { tapResult: { status: string; reasonCode: string; data: { command: string[] } } };
      assert.equal(typed.tapResult.status, "success");
      assert.equal(typed.tapResult.reasonCode, "OK");
      // AXe CLI format: ["axe", "tap", "-x", "12", "-y", "34", "--udid", "..."]
      assert.equal(typed.tapResult.data.command[0], "axe");
      assert.equal(typed.tapResult.data.command.includes("tap"), true);
      assert.equal(typed.tapResult.data.command.includes("12"), true);
      assert.equal(typed.tapResult.data.command.includes("34"), true);
      assert.equal(typed.tapResult.data.command.includes("--udid"), true);
      assert.equal(typed.tapResult.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
    },
  },
  {
    name: "type_text iOS dry-run",
    cliArgs: ["--type-text", "--platform", "ios", "--text", "hello", "--dry-run"],
    validate: (result) => {
      const typed = result as { typeTextResult: { status: string; reasonCode: string; data: { command: string[] } } };
      assert.equal(typed.typeTextResult.status, "success");
      assert.equal(typed.typeTextResult.reasonCode, "OK");
      // AXe CLI format: ["axe", "type", "hello", "--udid", "..."]
      assert.equal(typed.typeTextResult.data.command[0], "axe");
      assert.equal(typed.typeTextResult.data.command.includes("hello"), true);
      assert.equal(typed.typeTextResult.data.command.includes("--udid"), true);
      assert.equal(typed.typeTextResult.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
    },
  },
  {
    name: "get_screen_summary Android dry-run",
    cliArgs: ["--get-screen-summary", "--platform", "android", "--dry-run"],
    validate: (result) => {
      const typed = result as { getScreenSummaryResult: { status: string; reasonCode: string; data: { summarySource: string; supportLevel: string; screenSummary: { appPhase: string } } } };
      assert.equal(typed.getScreenSummaryResult.status, "success");
      assert.equal(typed.getScreenSummaryResult.reasonCode, "OK");
      assert.equal(typed.getScreenSummaryResult.data.summarySource, "ui_only");
      assert.equal(typed.getScreenSummaryResult.data.supportLevel, "full");
      assert.equal(typed.getScreenSummaryResult.data.screenSummary.appPhase, "unknown");
    },
  },
  {
    name: "get_session_state Android dry-run",
    cliArgs: ["--get-session-state", "--platform", "android", "--dry-run"],
    validate: (result) => {
      const typed = result as { getSessionStateResult: { status: string; reasonCode: string; data: { sessionRecordFound: boolean; platform: string; state: { appPhase: string } } } };
      assert.equal(typed.getSessionStateResult.status, "success");
      assert.equal(typed.getSessionStateResult.reasonCode, "OK");
      assert.equal(typed.getSessionStateResult.data.sessionRecordFound, false);
      assert.equal(typed.getSessionStateResult.data.platform, "android");
      assert.equal(typed.getSessionStateResult.data.state.appPhase, "unknown");
    },
  },
  {
    name: "perform_action_with_evidence Android dry-run",
    cliArgs: ["--perform-action-with-evidence", "--platform", "android", "--action-type", "tap_element", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { performActionWithEvidenceResult: { status: string; reasonCode: string; data: { outcome: { actionType: string; actionId: string } } } };
      assert.equal(typed.performActionWithEvidenceResult.status, "partial");
      assert.equal(typed.performActionWithEvidenceResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.performActionWithEvidenceResult.data.outcome.actionType, "tap_element");
      assert.equal(typeof typed.performActionWithEvidenceResult.data.outcome.actionId, "string");
    },
  },
  {
    name: "perform_action_with_evidence auto-remediation stop dry-run",
    cliArgs: ["--perform-action-with-evidence", "--auto-remediate", "--session-id", "smoke-auto-remediation", "--platform", "android", "--action-type", "tap_element", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { performActionWithEvidenceResult: { data: { autoRemediation?: { stopReason: string } } } };
      assert.equal(typeof typed.performActionWithEvidenceResult.data.autoRemediation?.stopReason, "string");
    },
  },
  {
    name: "explain_last_failure Android dry-run",
    cliArgs: ["--session-id", "smoke-explain-failure", "--perform-action-with-evidence", "--platform", "android", "--action-type", "tap_element", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { performActionWithEvidenceResult: { data: { outcome: { actionId: string } } } };
      assert.equal(typeof typed.performActionWithEvidenceResult.data.outcome.actionId, "string");
    },
  },
  {
    name: "explain_last_failure query",
    cliArgs: ["--explain-last-failure", "--session-id", "smoke-explain-failure"],
    validate: (result) => {
      const typed = result as { explainLastFailureResult: { reasonCode: string; data: { found: boolean; attribution?: { affectedLayer: string } } } };
      assert.equal(typed.explainLastFailureResult.reasonCode, "OK");
      assert.equal(typed.explainLastFailureResult.data.found, true);
      assert.equal(typeof typed.explainLastFailureResult.data.attribution?.affectedLayer, "string");
    },
  },
  {
    name: "rank_failure_candidates query",
    cliArgs: ["--rank-failure-candidates", "--session-id", "smoke-explain-failure"],
    validate: (result) => {
      const typed = result as { rankFailureCandidatesResult: { reasonCode: string; data: { found: boolean; candidates: Array<{ affectedLayer: string }> } } };
      assert.equal(typed.rankFailureCandidatesResult.reasonCode, "OK");
      assert.equal(typed.rankFailureCandidatesResult.data.found, true);
      assert.equal(typed.rankFailureCandidatesResult.data.candidates.length >= 1, true);
    },
  },
  {
    name: "recover_to_known_state Android dry-run",
    cliArgs: ["--recover-to-known-state", "--session-id", "smoke-recover-state", "--platform", "android", "--dry-run"],
    validate: (result) => {
      const typed = result as { recoverToKnownStateResult: { reasonCode: string; data: { summary: { strategy: string } } } };
      assert.equal(typed.recoverToKnownStateResult.reasonCode, "OK");
      assert.equal(typeof typed.recoverToKnownStateResult.data.summary.strategy, "string");
    },
  },
  {
    name: "replay_last_stable_path setup",
    cliArgs: ["--session-id", "smoke-replay-stable", "--perform-action-with-evidence", "--platform", "android", "--action-type", "launch_app", "--dry-run"],
    validate: (result) => {
      const typed = result as { performActionWithEvidenceResult: { data: { outcome: { actionId: string } } } };
      assert.equal(typeof typed.performActionWithEvidenceResult.data.outcome.actionId, "string");
    },
  },
  {
    name: "replay_last_stable_path query",
    cliArgs: ["--replay-last-stable-path", "--session-id", "smoke-replay-stable", "--platform", "android", "--dry-run"],
    validate: (result) => {
      const typed = result as { replayLastStablePathResult: { reasonCode: string; data: { summary: { strategy: string } } } };
      assert.equal(typed.replayLastStablePathResult.reasonCode, "OK");
      assert.equal(typed.replayLastStablePathResult.data.summary.strategy, "replay_last_successful_action");
    },
  },
  {
    name: "phase-f setup failure and baseline history",
    cliArgs: ["--session-id", "smoke-phase-f", "--perform-action-with-evidence", "--platform", "android", "--action-type", "launch_app", "--dry-run"],
    validate: (result) => {
      const typed = result as { performActionWithEvidenceResult: { reasonCode: string } };
      assert.equal(typed.performActionWithEvidenceResult.reasonCode, "OK");
    },
  },
  {
    name: "phase-f setup failure sample",
    cliArgs: ["--session-id", "smoke-phase-f", "--perform-action-with-evidence", "--platform", "android", "--action-type", "tap_element", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { performActionWithEvidenceResult: { reasonCode: string } };
      assert.equal(["OK", "UNSUPPORTED_OPERATION"].includes(typed.performActionWithEvidenceResult.reasonCode), true);
    },
  },
  {
    name: "find_similar_failures query",
    cliArgs: ["--find-similar-failures", "--session-id", "smoke-phase-f"],
    validate: (result) => {
      const typed = result as { findSimilarFailuresResult: { reasonCode: string } };
      assert.equal(typed.findSimilarFailuresResult.reasonCode, "OK");
    },
  },
  {
    name: "compare_against_baseline query",
    cliArgs: ["--compare-against-baseline", "--session-id", "smoke-phase-f"],
    validate: (result) => {
      const typed = result as { compareAgainstBaselineResult: { reasonCode: string } };
      assert.equal(typed.compareAgainstBaselineResult.reasonCode, "OK");
    },
  },
  {
    name: "suggest_known_remediation query",
    cliArgs: ["--suggest-known-remediation", "--session-id", "smoke-phase-f"],
    validate: (result) => {
      const typed = result as { suggestKnownRemediationResult: { reasonCode: string } };
      assert.equal(typed.suggestKnownRemediationResult.reasonCode, "OK");
    },
  },
  {
    name: "tap_element iOS dry-run",
    cliArgs: ["--tap-element", "--platform", "ios", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { tapElementResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution?: { status: string } } } };
      assert.equal(typed.tapElementResult.status, "partial");
      assert.equal(typed.tapElementResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.tapElementResult.data.supportLevel, "full");
      assert.equal(typed.tapElementResult.data.resolution?.status, "not_executed");
    },
  },
];

async function main(): Promise<void> {
  for (const validationCase of validationCases) {
    const result = await runCli(validationCase.cliArgs, validationCase.allowFailureExit ?? false);
    validationCase.validate(result);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
