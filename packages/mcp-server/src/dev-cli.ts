import type { DoctorInput, GetCrashSignalsInput, GetLogsInput, InspectUiInput, InstallAppInput, LaunchAppInput, ListDevicesInput, Platform, QueryUiInput, ResolveUiTargetInput, RunFlowInput, RunnerProfile, ScreenshotInput, ScrollAndResolveUiTargetInput, StartSessionInput, TapElementInput, TapInput, TerminateAppInput, TypeTextInput, TypeIntoElementInput, UiScrollDirection, WaitForUiInput, WaitForUiMode } from "@mobile-e2e-mcp/contracts";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createServer } from "./index.js";

interface CliOptions {
  platform: Platform;
  doctor: boolean;
  dryRun: boolean;
  getCrashSignals: boolean;
  includeUnavailable: boolean;
  getLogs: boolean;
  inspectUi: boolean;
  installApp: boolean;
  launchApp: boolean;
  listDevices: boolean;
  queryUi: boolean;
  resolveUiTarget: boolean;
  scrollAndResolveUiTarget: boolean;
  takeScreenshot: boolean;
  tap: boolean;
  tapElement: boolean;
  terminateApp: boolean;
  typeText: boolean;
  typeIntoElement: boolean;
  waitForUi: boolean;
  runCount: number;
  artifactPath?: string;
  outputPath?: string;
  lines?: number;
  sinceSeconds?: number;
  x?: number;
  y?: number;
  launchUrl?: string;
  appId?: string;
  deviceId?: string;
  queryClassName?: string;
  queryClickable?: boolean;
  queryContentDesc?: string;
  queryLimit?: number;
  queryResourceId?: string;
  queryText?: string;
  text?: string;
  value?: string;
  runnerProfile?: RunnerProfile;
  flowPath?: string;
  harnessConfigPath?: string;
  sessionId?: string;
  timeoutMs?: number;
  intervalMs?: number;
  waitUntil?: WaitForUiMode;
  maxSwipes?: number;
  swipeDirection?: UiScrollDirection;
  swipeDurationMs?: number;
}

const RUNNER_PROFILES: RunnerProfile[] = ["phase1", "native_android", "native_ios", "flutter_android"];
const WAIT_FOR_UI_MODES: WaitForUiMode[] = ["visible", "gone", "unique"];
const SCROLL_DIRECTIONS: UiScrollDirection[] = ["up", "down"];
function isRunnerProfile(value: string | undefined): value is RunnerProfile { return typeof value === "string" && RUNNER_PROFILES.includes(value as RunnerProfile); }
function isWaitForUiMode(value: string | undefined): value is WaitForUiMode { return typeof value === "string" && WAIT_FOR_UI_MODES.includes(value as WaitForUiMode); }
function isUiScrollDirection(value: string | undefined): value is UiScrollDirection { return typeof value === "string" && SCROLL_DIRECTIONS.includes(value as UiScrollDirection); }
function parseBooleanArg(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let platform: Platform = "android";
  let doctor = false;
  let dryRun = false;
  let getCrashSignals = false;
  let includeUnavailable = false;
  let getLogs = false;
  let inspectUi = false;
  let installApp = false;
  let launchApp = false;
  let listDevices = false;
  let queryUi = false;
  let resolveUiTarget = false;
  let scrollAndResolveUiTarget = false;
  let takeScreenshot = false;
  let tap = false;
  let tapElement = false;
  let terminateApp = false;
  let typeText = false;
  let typeIntoElement = false;
  let waitForUi = false;
  let runCount = 1;
  let artifactPath: string | undefined;
  let outputPath: string | undefined;
  let lines: number | undefined;
  let sinceSeconds: number | undefined;
  let x: number | undefined;
  let y: number | undefined;
  let launchUrl: string | undefined;
  let appId: string | undefined;
  let deviceId: string | undefined;
  let queryClassName: string | undefined;
  let queryClickable: boolean | undefined;
  let queryContentDesc: string | undefined;
  let queryLimit: number | undefined;
  let queryResourceId: string | undefined;
  let queryText: string | undefined;
  let textValue: string | undefined;
  let value: string | undefined;
  let runnerProfile: RunnerProfile | undefined;
  let flowPath: string | undefined;
  let harnessConfigPath: string | undefined;
  let sessionId: string | undefined;
  let timeoutMs: number | undefined;
  let intervalMs: number | undefined;
  let waitUntil: WaitForUiMode | undefined;
  let maxSwipes: number | undefined;
  let swipeDirection: UiScrollDirection | undefined;
  let swipeDurationMs: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];
    if (arg === "--platform" && (nextValue === "android" || nextValue === "ios")) { platform = nextValue; index += 1; }
    else if (arg === "--doctor") { doctor = true; }
    else if (arg === "--dry-run") { dryRun = true; }
    else if (arg === "--get-crash-signals") { getCrashSignals = true; }
    else if (arg === "--include-unavailable") { includeUnavailable = true; }
    else if (arg === "--get-logs") { getLogs = true; }
    else if (arg === "--inspect-ui") { inspectUi = true; }
    else if (arg === "--install-app") { installApp = true; }
    else if (arg === "--launch-app") { launchApp = true; }
    else if (arg === "--list-devices") { listDevices = true; }
    else if (arg === "--query-ui") { queryUi = true; }
    else if (arg === "--resolve-ui-target") { resolveUiTarget = true; }
    else if (arg === "--scroll-and-resolve-ui-target") { scrollAndResolveUiTarget = true; }
    else if (arg === "--take-screenshot") { takeScreenshot = true; }
    else if (arg === "--tap") { tap = true; }
    else if (arg === "--tap-element") { tapElement = true; }
    else if (arg === "--terminate-app") { terminateApp = true; }
    else if (arg === "--type-text") { typeText = true; }
    else if (arg === "--type-into-element") { typeIntoElement = true; }
    else if (arg === "--wait-for-ui") { waitForUi = true; }
    else if (arg === "--run-count" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) runCount = parsed; index += 1; }
    else if (arg === "--artifact-path" && nextValue) { artifactPath = nextValue; index += 1; }
    else if (arg === "--output-path" && nextValue) { outputPath = nextValue; index += 1; }
    else if (arg === "--lines" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) lines = Math.floor(parsed); index += 1; }
    else if (arg === "--since-seconds" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) sinceSeconds = Math.floor(parsed); index += 1; }
    else if (arg === "--x" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed)) x = parsed; index += 1; }
    else if (arg === "--y" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed)) y = parsed; index += 1; }
    else if (arg === "--launch-url" && nextValue) { launchUrl = nextValue; index += 1; }
    else if (arg === "--app-id" && nextValue) { appId = nextValue; index += 1; }
    else if (arg === "--device-id" && nextValue) { deviceId = nextValue; index += 1; }
    else if ((arg === "--query-class-name" || arg === "--class-name") && nextValue) { queryClassName = nextValue; index += 1; }
    else if ((arg === "--query-clickable" || arg === "--clickable") && nextValue) { const parsed = parseBooleanArg(nextValue); if (parsed !== undefined) queryClickable = parsed; index += 1; }
    else if ((arg === "--query-content-desc" || arg === "--content-desc") && nextValue) { queryContentDesc = nextValue; index += 1; }
    else if (arg === "--query-limit" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) queryLimit = Math.floor(parsed); index += 1; }
    else if ((arg === "--query-resource-id" || arg === "--resource-id") && nextValue) { queryResourceId = nextValue; index += 1; }
    else if (arg === "--query-text" && nextValue) { queryText = nextValue; index += 1; }
    else if (arg === "--text" && nextValue) { textValue = nextValue; index += 1; }
    else if (arg === "--value" && nextValue) { value = nextValue; index += 1; }
    else if (arg === "--runner-profile" && isRunnerProfile(nextValue)) { runnerProfile = nextValue; index += 1; }
    else if (arg === "--flow-path" && nextValue) { flowPath = nextValue; index += 1; }
    else if (arg === "--harness-config-path" && nextValue) { harnessConfigPath = nextValue; index += 1; }
    else if (arg === "--session-id" && nextValue) { sessionId = nextValue; index += 1; }
    else if (arg === "--timeout-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) timeoutMs = Math.floor(parsed); index += 1; }
    else if (arg === "--interval-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) intervalMs = Math.floor(parsed); index += 1; }
    else if (arg === "--wait-until" && isWaitForUiMode(nextValue)) { waitUntil = nextValue; index += 1; }
    else if (arg === "--max-swipes" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed >= 0) maxSwipes = Math.floor(parsed); index += 1; }
    else if (arg === "--swipe-direction" && isUiScrollDirection(nextValue)) { swipeDirection = nextValue; index += 1; }
    else if (arg === "--swipe-duration-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) swipeDurationMs = Math.floor(parsed); index += 1; }
  }

  return {
    platform,
    doctor,
    dryRun,
    getCrashSignals,
    includeUnavailable,
    getLogs,
    inspectUi,
    installApp,
    launchApp,
    listDevices,
    queryUi,
    resolveUiTarget,
    scrollAndResolveUiTarget,
    takeScreenshot,
    tap,
    tapElement,
    terminateApp,
    typeText,
    typeIntoElement,
    waitForUi,
    runCount,
    artifactPath,
    outputPath,
    lines,
    sinceSeconds,
    x,
    y,
    launchUrl,
    appId,
    deviceId,
      queryClassName,
      queryClickable,
      queryContentDesc,
      queryLimit,
      queryResourceId,
      queryText,
    text: textValue,
    value,
    runnerProfile,
    flowPath,
    harnessConfigPath,
    sessionId,
    timeoutMs,
    intervalMs,
    waitUntil,
    maxSwipes,
    swipeDirection,
    swipeDurationMs,
  };
}

export async function main(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const server = createServer();

  if (cliOptions.doctor) {
    const result = await server.invoke("doctor", { includeUnavailable: cliOptions.includeUnavailable } satisfies DoctorInput);
    console.log(JSON.stringify({ tools: server.listTools(), doctorResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.listDevices) {
    const result = await server.invoke("list_devices", { includeUnavailable: cliOptions.includeUnavailable } satisfies ListDevicesInput);
    console.log(JSON.stringify({ tools: server.listTools(), listDevicesResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.getCrashSignals) {
    const getCrashSignalsInput: GetCrashSignalsInput = {
      sessionId: cliOptions.sessionId ?? `crash-signals-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      lines: cliOptions.lines,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("get_crash_signals", getCrashSignalsInput);
    console.log(JSON.stringify({ tools: server.listTools(), getCrashSignalsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.getLogs) {
    const getLogsInput: GetLogsInput = {
      sessionId: cliOptions.sessionId ?? `logs-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      lines: cliOptions.lines,
      sinceSeconds: cliOptions.sinceSeconds,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("get_logs", getLogsInput);
    console.log(JSON.stringify({ tools: server.listTools(), getLogsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.inspectUi) {
    const inspectInput: InspectUiInput = { sessionId: cliOptions.sessionId ?? `inspect-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, deviceId: cliOptions.deviceId, outputPath: cliOptions.outputPath, dryRun: cliOptions.dryRun };
    const result = await server.invoke("inspect_ui", inspectInput);
    console.log(JSON.stringify({ tools: server.listTools(), inspectUiResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.queryUi) {
    const queryInput: QueryUiInput = {
      sessionId: cliOptions.sessionId ?? `query-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("query_ui", queryInput);
    console.log(JSON.stringify({ tools: server.listTools(), queryUiResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.resolveUiTarget) {
    const resolveInput: ResolveUiTargetInput = {
      sessionId: cliOptions.sessionId ?? `resolve-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("resolve_ui_target", resolveInput);
    console.log(JSON.stringify({ tools: server.listTools(), resolveUiTargetResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.scrollAndResolveUiTarget) {
    const scrollResolveInput: ScrollAndResolveUiTargetInput = {
      sessionId: cliOptions.sessionId ?? `scroll-resolve-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      maxSwipes: cliOptions.maxSwipes,
      swipeDirection: cliOptions.swipeDirection,
      swipeDurationMs: cliOptions.swipeDurationMs,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("scroll_and_resolve_ui_target", scrollResolveInput);
    console.log(JSON.stringify({ tools: server.listTools(), scrollAndResolveUiTargetResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.installApp) {
    const installInput: InstallAppInput = { sessionId: cliOptions.sessionId ?? `install-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, artifactPath: cliOptions.artifactPath, deviceId: cliOptions.deviceId, dryRun: cliOptions.dryRun };
    const result = await server.invoke("install_app", installInput);
    console.log(JSON.stringify({ tools: server.listTools(), installAppResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.launchApp) {
    const launchInput: LaunchAppInput = { sessionId: cliOptions.sessionId ?? `launch-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, deviceId: cliOptions.deviceId, appId: cliOptions.appId, launchUrl: cliOptions.launchUrl, dryRun: cliOptions.dryRun };
    const result = await server.invoke("launch_app", launchInput);
    console.log(JSON.stringify({ tools: server.listTools(), launchAppResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.terminateApp) {
    const terminateInput: TerminateAppInput = { sessionId: cliOptions.sessionId ?? `terminate-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, deviceId: cliOptions.deviceId, appId: cliOptions.appId, dryRun: cliOptions.dryRun };
    const result = await server.invoke("terminate_app", terminateInput);
    console.log(JSON.stringify({ tools: server.listTools(), terminateAppResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.typeText) {
    const typeTextInput: TypeTextInput = { sessionId: cliOptions.sessionId ?? `type-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, deviceId: cliOptions.deviceId, text: cliOptions.text ?? "hello", dryRun: cliOptions.dryRun };
    const result = await server.invoke("type_text", typeTextInput);
    console.log(JSON.stringify({ tools: server.listTools(), typeTextResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.typeIntoElement) {
    const typeIntoElementInput: TypeIntoElementInput = {
      sessionId: cliOptions.sessionId ?? `type-into-element-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      value: cliOptions.value ?? "hello",
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("type_into_element", typeIntoElementInput);
    console.log(JSON.stringify({ tools: server.listTools(), typeIntoElementResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.tapElement) {
    const tapElementInput: TapElementInput = {
      sessionId: cliOptions.sessionId ?? `tap-element-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("tap_element", tapElementInput);
    console.log(JSON.stringify({ tools: server.listTools(), tapElementResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.waitForUi) {
    const waitForUiInput: WaitForUiInput = {
      sessionId: cliOptions.sessionId ?? `wait-for-ui-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      timeoutMs: cliOptions.timeoutMs,
      intervalMs: cliOptions.intervalMs,
      waitUntil: cliOptions.waitUntil,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("wait_for_ui", waitForUiInput);
    console.log(JSON.stringify({ tools: server.listTools(), waitForUiResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.tap) {
    const tapInput: TapInput = { sessionId: cliOptions.sessionId ?? `tap-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, deviceId: cliOptions.deviceId, x: cliOptions.x ?? 100, y: cliOptions.y ?? 100, dryRun: cliOptions.dryRun };
    const result = await server.invoke("tap", tapInput);
    console.log(JSON.stringify({ tools: server.listTools(), tapResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.takeScreenshot) {
    const screenshotInput: ScreenshotInput = { sessionId: cliOptions.sessionId ?? `screenshot-${Date.now()}`, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, harnessConfigPath: cliOptions.harnessConfigPath, deviceId: cliOptions.deviceId, outputPath: cliOptions.outputPath, dryRun: cliOptions.dryRun };
    const result = await server.invoke("take_screenshot", screenshotInput);
    console.log(JSON.stringify({ tools: server.listTools(), takeScreenshotResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }

  const startInput: StartSessionInput = { platform: cliOptions.platform, profile: cliOptions.runnerProfile ?? null, harnessConfigPath: cliOptions.harnessConfigPath, sessionId: cliOptions.sessionId };
  const startResult = await server.invoke("start_session", startInput);
  const runInput: RunFlowInput = { sessionId: startResult.data.sessionId, platform: cliOptions.platform, runnerProfile: cliOptions.runnerProfile, runCount: cliOptions.runCount, dryRun: cliOptions.dryRun, flowPath: cliOptions.flowPath, harnessConfigPath: cliOptions.harnessConfigPath };
  const runResult = await server.invoke("run_flow", runInput);
  const endResult = await server.invoke("end_session", { sessionId: startResult.data.sessionId, artifacts: runResult.artifacts });
  console.log(JSON.stringify({ tools: server.listTools(), startResult, runResult, endResult }, null, 2));
  if (runResult.status === "failed") process.exitCode = 1;
}

const isEntrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
