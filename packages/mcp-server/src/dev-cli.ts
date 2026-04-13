import type { ActionIntent, AndroidPerformancePreset, AndroidReplayOptions, CaptureJsConsoleLogsInput, CaptureJsNetworkEventsInput, CollectDebugEvidenceInput, CollectDiagnosticsInput, CompareAgainstBaselineInput, DescribeCapabilitiesInput, DoctorInput, ExplainLastFailureInput, FindSimilarFailuresInput, GetActionOutcomeInput, GetCrashSignalsInput, GetLogsInput, GetScreenSummaryInput, GetSessionStateInput, InspectUiInput, InstallAppInput, IosPerformanceTemplate, LaunchAppInput, ListDevicesInput, ListJsDebugTargetsInput, MeasureAndroidPerformanceInput, MeasureIosPerformanceInput, PerformActionWithEvidenceInput, Platform, QueryUiInput, RankFailureCandidatesInput, RecordScreenInput, RecoverToKnownStateInput, ReplayLastStablePathInput, RequestManualHandoffInput, ResetAppStateInput, ResetAppStateStrategy, ResolveUiTargetInput, RunFlowInput, RunnerProfile, ScreenshotInput, ScrollAndResolveUiTargetInput, ScrollAndTapElementInput, ScrollOnlyInput, StartSessionInput, SuggestKnownRemediationInput, TapElementInput, TapInput, TerminateAppInput, ToolResult, TypeTextInput, TypeIntoElementInput, UiScrollDirection, WaitForUiInput, WaitForUiMode } from "@mobile-e2e-mcp/contracts";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { applyContextAlias } from "./cli/context-resolver.js";
import { executePreset } from "./cli/preset-runner.js";
import { executeExplore } from "./cli/explore-runner.js";
import type { CliOptions, PresetName } from "./cli/types.js";
import { createServer } from "./index.js";

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
  let platformProvided = false;
  let useContextAlias = true;
  let presetName: PresetName | undefined;
  let captureJsConsoleLogs = false;
  let captureJsNetworkEvents = false;
  let compareAgainstBaseline = false;
  let collectDebugEvidence = false;
  let collectDiagnostics = false;
  let describeCapabilities = false;
  let doctor = false;
  let explainLastFailure = false;
  let findSimilarFailures = false;
  let dryRun = false;
  let getCrashSignals = false;
  let getActionOutcome = false;
  let getScreenSummary = false;
  let getSessionState = false;
  let includeUnavailable = false;
  let getLogs = false;
  let inspectUi = false;
  let installApp = false;
  let listJsDebugTargets = false;
  let launchApp = false;
  let listDevices = false;
  let measureAndroidPerformance = false;
  let measureIosPerformance = false;
  let performActionWithEvidence = false;
  let requestManualHandoff = false;
  let autoRemediate = false;
  let rankFailureCandidates = false;
  let recordScreen = false;
  let recoverToKnownState = false;
  let replayLastStablePath = false;
  let resetAppState = false;
  let queryUi = false;
  let resolveUiTarget = false;
  let scrollAndResolveUiTarget = false;
  let scrollAndTapElement = false;
  let scrollOnly = false;
  let takeScreenshot = false;
  let suggestKnownRemediation = false;
  let tap = false;
  let tapElement = false;
  let terminateApp = false;
  let explore = false;
  let exploreMode: string | undefined;
  let exploreNoPrompt = false;
  let exploreConfig: string | undefined;
  let exploreOutput: string | undefined;
  let exploreCompare: string | undefined;
  let exploreMaxDepth: number | undefined;
  let durationMs: number | undefined;
  let resetStrategy: ResetAppStateStrategy | undefined;
  let bitrateMbps: number | undefined;
  let performancePreset: AndroidPerformancePreset | undefined;
  let performanceTemplate: IosPerformanceTemplate | undefined;
  let typeText = false;
  let typeIntoElement = false;
  let waitForUi = false;
  let runCount = 1;
  let artifactPath: string | undefined;
  let outputPath: string | undefined;
  let lines: number | undefined;
  let sinceSeconds: number | undefined;
  let jsInspectorTimeoutMs: number | undefined;
  let includeDiagnostics: boolean | undefined;
  let x: number | undefined;
  let y: number | undefined;
  let launchUrl: string | undefined;
  let appId: string | undefined;
  let deviceId: string | undefined;
  let handoffReason: RequestManualHandoffInput["reason"] | undefined;
  let handoffSummary: string | undefined;
  let handoffActions: string[] | undefined;
  let handoffResumeHints: string[] | undefined;
  let handoffBlocking: boolean | undefined;
  let queryClassName: string | undefined;
  let queryClickable: boolean | undefined;
  let queryContentDesc: string | undefined;
  let queryLimit: number | undefined;
  let queryResourceId: string | undefined;
  let queryText: string | undefined;
  let textValue: string | undefined;
  let value: string | undefined;
  let runnerProfile: RunnerProfile | undefined;
  let policyProfile: string | undefined;
  let flowPath: string | undefined;
  let harnessConfigPath: string | undefined;
  let androidReplayUserId: string | undefined;
  let androidTextInputStrategy: AndroidReplayOptions["textInputStrategy"] | undefined;
  let expectedAppPhase: AndroidReplayOptions["expectedAppPhase"] | undefined;
  let sessionId: string | undefined;
  let metroBaseUrl: string | undefined;
  let targetId: string | undefined;
  let webSocketDebuggerUrl: string | undefined;
  let actionId: string | undefined;
  let actionType: ActionIntent["actionType"] | undefined;
  let timeoutMs: number | undefined;
  let maxLogs: number | undefined;
  let maxEvents: number | undefined;
  let failuresOnly: boolean | undefined;
  let intervalMs: number | undefined;
  let waitUntil: WaitForUiMode | undefined;
  let maxSwipes: number | undefined;
  let swipeDirection: UiScrollDirection | undefined;
  let swipeDurationMs: number | undefined;
  let gestureDirection: "up" | "down" | "left" | "right" | undefined;
  let gestureStartRatio: number | undefined;
  let gestureEndRatio: number | undefined;
  let settleDelayMs: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];
    if (arg === "--platform" && (nextValue === "android" || nextValue === "ios")) { platform = nextValue; platformProvided = true; index += 1; }
    else if (arg === "--capture-js-console-logs") { captureJsConsoleLogs = true; }
    else if (arg === "--capture-js-network-events") { captureJsNetworkEvents = true; }
    else if (arg === "--compare-against-baseline") { compareAgainstBaseline = true; }
    else if (arg === "--collect-debug-evidence") { collectDebugEvidence = true; }
    else if (arg === "--collect-diagnostics") { collectDiagnostics = true; }
    else if (arg === "--describe-capabilities") { describeCapabilities = true; }
    else if (arg === "--doctor") { doctor = true; }
    else if (arg === "--explain-last-failure") { explainLastFailure = true; }
    else if (arg === "--find-similar-failures") { findSimilarFailures = true; }
    else if (arg === "--dry-run") { dryRun = true; }
    else if (arg === "--get-crash-signals") { getCrashSignals = true; }
    else if (arg === "--get-action-outcome") { getActionOutcome = true; }
    else if (arg === "--get-screen-summary") { getScreenSummary = true; }
    else if (arg === "--get-session-state") { getSessionState = true; }
    else if (arg === "--include-unavailable") { includeUnavailable = true; }
    else if (arg === "--get-logs") { getLogs = true; }
    else if (arg === "--inspect-ui") { inspectUi = true; }
    else if (arg === "--install-app") { installApp = true; }
    else if (arg === "--list-js-debug-targets") { listJsDebugTargets = true; }
    else if (arg === "--launch-app") { launchApp = true; }
    else if (arg === "--list-devices") { listDevices = true; }
    else if (arg === "--measure-android-performance") { measureAndroidPerformance = true; }
    else if (arg === "--measure-ios-performance") { measureIosPerformance = true; }
    else if (arg === "--perform-action-with-evidence") { performActionWithEvidence = true; }
    else if (arg === "--request-manual-handoff") { requestManualHandoff = true; }
    else if (arg === "--auto-remediate") { autoRemediate = true; }
    else if (arg === "--rank-failure-candidates") { rankFailureCandidates = true; }
    else if (arg === "--record-screen") { recordScreen = true; }
    else if (arg === "--recover-to-known-state") { recoverToKnownState = true; }
    else if (arg === "--replay-last-stable-path") { replayLastStablePath = true; }
    else if (arg === "--reset-app-state") { resetAppState = true; }
    else if (arg === "--duration-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) durationMs = Math.floor(parsed); index += 1; }
    else if (arg === "--reset-strategy" && nextValue && ["clear_data", "uninstall_reinstall", "keychain_reset"].includes(nextValue)) { resetStrategy = nextValue as ResetAppStateStrategy; index += 1; }
    else if (arg === "--bitrate-mbps" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) bitrateMbps = parsed; index += 1; }
    else if (arg === "--preset" && nextValue && ["general", "startup", "interaction", "scroll"].includes(nextValue)) { performancePreset = nextValue as AndroidPerformancePreset; index += 1; }
    else if (arg === "--template" && nextValue && ["time-profiler", "animation-hitches", "memory"].includes(nextValue)) { performanceTemplate = nextValue as IosPerformanceTemplate; index += 1; }
    else if (arg === "--query-ui") { queryUi = true; }
    else if (arg === "--resolve-ui-target") { resolveUiTarget = true; }
    else if (arg === "--scroll-and-resolve-ui-target") { scrollAndResolveUiTarget = true; }
    else if (arg === "--scroll-and-tap-element") { scrollAndTapElement = true; }
    else if (arg === "--take-screenshot") { takeScreenshot = true; }
    else if (arg === "--suggest-known-remediation") { suggestKnownRemediation = true; }
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
    else if (arg === "--js-inspector-timeout-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) jsInspectorTimeoutMs = Math.floor(parsed); index += 1; }
    else if (arg === "--include-diagnostics" && nextValue) { includeDiagnostics = parseBooleanArg(nextValue); index += 1; }
    else if (arg === "--x" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed)) x = parsed; index += 1; }
    else if (arg === "--y" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed)) y = parsed; index += 1; }
    else if (arg === "--launch-url" && nextValue) { launchUrl = nextValue; index += 1; }
    else if (arg === "--app-id" && nextValue) { appId = nextValue; index += 1; }
    else if (arg === "--device-id" && nextValue) { deviceId = nextValue; index += 1; }
    else if (arg === "--handoff-reason" && nextValue && ["otp_required", "captcha_required", "consent_required", "protected_page", "secure_input_required", "unknown"].includes(nextValue)) { handoffReason = nextValue as RequestManualHandoffInput["reason"]; index += 1; }
    else if (arg === "--handoff-summary" && nextValue) { handoffSummary = nextValue; index += 1; }
    else if (arg === "--handoff-actions" && nextValue) { handoffActions = nextValue.split(",").map((value) => value.trim()).filter(Boolean); index += 1; }
    else if (arg === "--handoff-resume-hints" && nextValue) { handoffResumeHints = nextValue.split(",").map((value) => value.trim()).filter(Boolean); index += 1; }
    else if (arg === "--handoff-blocking" && nextValue) { handoffBlocking = parseBooleanArg(nextValue); index += 1; }
    else if ((arg === "--query-class-name" || arg === "--class-name") && nextValue) { queryClassName = nextValue; index += 1; }
    else if ((arg === "--query-clickable" || arg === "--clickable") && nextValue) { const parsed = parseBooleanArg(nextValue); if (parsed !== undefined) queryClickable = parsed; index += 1; }
    else if ((arg === "--query-content-desc" || arg === "--content-desc") && nextValue) { queryContentDesc = nextValue; index += 1; }
    else if (arg === "--query-limit" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) queryLimit = Math.floor(parsed); index += 1; }
    else if ((arg === "--query-resource-id" || arg === "--resource-id") && nextValue) { queryResourceId = nextValue; index += 1; }
    else if (arg === "--query-text" && nextValue) { queryText = nextValue; index += 1; }
    else if (arg === "--text" && nextValue) { textValue = nextValue; index += 1; }
    else if (arg === "--value" && nextValue) { value = nextValue; index += 1; }
    else if (arg === "--runner-profile" && isRunnerProfile(nextValue)) { runnerProfile = nextValue; index += 1; }
    else if (arg === "--policy-profile" && nextValue) { policyProfile = nextValue; index += 1; }
    else if (arg === "--flow-path" && nextValue) { flowPath = nextValue; index += 1; }
    else if (arg === "--harness-config-path" && nextValue) { harnessConfigPath = nextValue; index += 1; }
    else if (arg === "--android-user-id" && nextValue) { androidReplayUserId = nextValue; index += 1; }
    else if (arg === "--android-text-input-strategy" && nextValue && ["auto", "maestro", "oem_fallback"].includes(nextValue)) { androidTextInputStrategy = nextValue as AndroidReplayOptions["textInputStrategy"]; index += 1; }
    else if (arg === "--expected-app-phase" && nextValue && ["launching", "ready", "loading", "blocked", "backgrounded", "crashed", "authentication", "detail", "catalog", "empty", "unknown"].includes(nextValue)) { expectedAppPhase = nextValue as AndroidReplayOptions["expectedAppPhase"]; index += 1; }
    else if (arg === "--session-id" && nextValue) { sessionId = nextValue; index += 1; }
    else if (arg === "--metro-base-url" && nextValue) { metroBaseUrl = nextValue; index += 1; }
    else if (arg === "--target-id" && nextValue) { targetId = nextValue; index += 1; }
    else if (arg === "--websocket-debugger-url" && nextValue) { webSocketDebuggerUrl = nextValue; index += 1; }
    else if (arg === "--action-id" && nextValue) { actionId = nextValue; index += 1; }
    else if (arg === "--action-type" && nextValue && ["tap_element", "type_into_element", "wait_for_ui", "launch_app", "terminate_app"].includes(nextValue)) { actionType = nextValue as ActionIntent["actionType"]; index += 1; }
    else if (arg === "--timeout-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) timeoutMs = Math.floor(parsed); index += 1; }
    else if (arg === "--max-logs" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) maxLogs = Math.floor(parsed); index += 1; }
    else if (arg === "--max-events" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) maxEvents = Math.floor(parsed); index += 1; }
    else if (arg === "--failures-only" && nextValue) { failuresOnly = parseBooleanArg(nextValue); index += 1; }
    else if (arg === "--interval-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) intervalMs = Math.floor(parsed); index += 1; }
    else if (arg === "--wait-until" && isWaitForUiMode(nextValue)) { waitUntil = nextValue; index += 1; }
    else if (arg === "--max-swipes" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed >= 0) maxSwipes = Math.floor(parsed); index += 1; }
    else if (arg === "--swipe-direction" && isUiScrollDirection(nextValue)) { swipeDirection = nextValue; index += 1; }
    else if (arg === "--swipe-duration-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) swipeDurationMs = Math.floor(parsed); index += 1; }
    else if (arg === "--scroll-only") { scrollOnly = true; }
    else if (arg === "--gesture-direction" && ["up", "down", "left", "right"].includes(nextValue)) { gestureDirection = nextValue as "up" | "down" | "left" | "right"; index += 1; }
    else if (arg === "--gesture-start-ratio" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) gestureStartRatio = parsed; index += 1; }
    else if (arg === "--gesture-end-ratio" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) gestureEndRatio = parsed; index += 1; }
    else if (arg === "--settle-delay-ms" && nextValue) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed >= 0) settleDelayMs = Math.floor(parsed); index += 1; }
    else if (arg === "--no-context-alias") { useContextAlias = false; }
    else if (arg === "--preset-name" && nextValue && ["quick_debug_ios", "quick_e2e_android", "crash_triage_android"].includes(nextValue)) { presetName = nextValue as PresetName; index += 1; }
    else if (arg === "explore") { explore = true; }
    else if (arg === "--mode" && explore) { exploreMode = nextValue; index += 1; }
    else if (arg === "--no-prompt") { exploreNoPrompt = true; }
    else if (arg === "--config" && nextValue && explore) { exploreConfig = nextValue; index += 1; }
    else if (arg === "--output" && nextValue && explore) { exploreOutput = nextValue; index += 1; }
    else if (arg === "--compare" && nextValue && explore) { exploreCompare = nextValue; index += 1; }
    else if (arg === "--max-depth" && nextValue && explore) { const parsed = Number(nextValue); if (Number.isFinite(parsed) && parsed > 0) exploreMaxDepth = Math.floor(parsed); index += 1; }
  }

  return {
    captureJsConsoleLogs,
    captureJsNetworkEvents,
    compareAgainstBaseline,
    collectDebugEvidence,
    collectDiagnostics,
    describeCapabilities,
    platform,
    doctor,
    explainLastFailure,
    findSimilarFailures,
    dryRun,
    getCrashSignals,
    getActionOutcome,
    getScreenSummary,
    getSessionState,
    includeUnavailable,
    getLogs,
    inspectUi,
    installApp,
    listJsDebugTargets,
    launchApp,
    listDevices,
    measureAndroidPerformance,
    measureIosPerformance,
    performActionWithEvidence,
    requestManualHandoff,
    autoRemediate,
    rankFailureCandidates,
    recordScreen,
    recoverToKnownState,
    replayLastStablePath,
    resetAppState,
    queryUi,
    resolveUiTarget,
    scrollAndResolveUiTarget,
    scrollAndTapElement,
    scrollOnly,
    takeScreenshot,
    suggestKnownRemediation,
    tap,
    tapElement,
    terminateApp,
    durationMs,
    resetStrategy,
    bitrateMbps,
    performancePreset,
    performanceTemplate,
    typeText,
    typeIntoElement,
    waitForUi,
    runCount,
    artifactPath,
    outputPath,
    lines,
    sinceSeconds,
    jsInspectorTimeoutMs,
    includeDiagnostics,
    x,
    y,
    launchUrl,
    appId,
    deviceId,
    handoffReason,
    handoffSummary,
    handoffActions,
    handoffResumeHints,
    handoffBlocking,
    queryClassName,
      queryClickable,
      queryContentDesc,
      queryLimit,
      queryResourceId,
      queryText,
    text: textValue,
    value,
    runnerProfile,
    policyProfile,
    flowPath,
    harnessConfigPath,
    androidReplayOptions: androidReplayUserId || androidTextInputStrategy || expectedAppPhase
      ? {
        ...(androidReplayUserId ? { userId: androidReplayUserId } : {}),
        ...(androidTextInputStrategy ? { textInputStrategy: androidTextInputStrategy } : {}),
        ...(expectedAppPhase ? { expectedAppPhase } : {}),
      }
      : undefined,
    sessionId,
    metroBaseUrl,
    targetId,
    webSocketDebuggerUrl,
    actionId,
    actionType,
    timeoutMs,
    maxLogs,
    maxEvents,
    failuresOnly,
    intervalMs,
    waitUntil,
    maxSwipes,
    swipeDirection,
    swipeDurationMs,
    gestureDirection,
    gestureStartRatio,
    gestureEndRatio,
    settleDelayMs,
    platformProvided,
    useContextAlias,
    presetName,
    explore,
    exploreMode,
    exploreNoPrompt,
    exploreConfig,
    exploreOutput,
    exploreCompare,
    exploreMaxDepth,
  };
}

export async function main(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const server = createServer();

  const aliasResult = await applyContextAlias(cliOptions);
  if (!aliasResult.ok) {
    console.log(JSON.stringify({ tools: server.listTools(), contextAliasResult: aliasResult.errorResult }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (cliOptions.presetName) {
    const presetResult = await executePreset(server, cliOptions, cliOptions.presetName, aliasResult.resolvedContext);
    console.log(JSON.stringify({ tools: server.listTools(), presetResult }, null, 2));
    if (presetResult.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  if (cliOptions.explore) {
    await executeExplore(server, cliOptions);
    return;
  }

  if (cliOptions.captureJsConsoleLogs) {
    const captureJsConsoleLogsInput: CaptureJsConsoleLogsInput = {
      sessionId: cliOptions.sessionId,
      metroBaseUrl: cliOptions.metroBaseUrl,
      targetId: cliOptions.targetId,
      webSocketDebuggerUrl: cliOptions.webSocketDebuggerUrl,
      maxLogs: cliOptions.maxLogs,
      timeoutMs: cliOptions.timeoutMs,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("capture_js_console_logs", captureJsConsoleLogsInput);
    console.log(JSON.stringify({ tools: server.listTools(), captureJsConsoleLogsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.captureJsNetworkEvents) {
    const captureJsNetworkEventsInput: CaptureJsNetworkEventsInput = {
      sessionId: cliOptions.sessionId,
      metroBaseUrl: cliOptions.metroBaseUrl,
      targetId: cliOptions.targetId,
      webSocketDebuggerUrl: cliOptions.webSocketDebuggerUrl,
      maxEvents: cliOptions.maxEvents,
      timeoutMs: cliOptions.timeoutMs,
      failuresOnly: cliOptions.failuresOnly,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("capture_js_network_events", captureJsNetworkEventsInput);
    console.log(JSON.stringify({ tools: server.listTools(), captureJsNetworkEventsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.compareAgainstBaseline) {
    const compareAgainstBaselineInput: CompareAgainstBaselineInput = {
      sessionId: cliOptions.sessionId ?? `baseline-${Date.now()}`,
      actionId: cliOptions.actionId,
    };
    const result = await server.invoke("compare_against_baseline", compareAgainstBaselineInput);
    console.log(JSON.stringify({ tools: server.listTools(), compareAgainstBaselineResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.collectDebugEvidence) {
    const collectDebugEvidenceInput: CollectDebugEvidenceInput = {
      sessionId: cliOptions.sessionId ?? `debug-evidence-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      metroBaseUrl: cliOptions.metroBaseUrl,
      outputPath: cliOptions.outputPath,
      logLines: cliOptions.lines,
      targetId: cliOptions.targetId,
      webSocketDebuggerUrl: cliOptions.webSocketDebuggerUrl,
      includeJsInspector: true,
      jsInspectorTimeoutMs: cliOptions.jsInspectorTimeoutMs,
      sinceSeconds: cliOptions.sinceSeconds,
      query: cliOptions.queryText ?? cliOptions.text,
      includeDiagnostics: cliOptions.includeDiagnostics,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("collect_debug_evidence", collectDebugEvidenceInput);
    console.log(JSON.stringify({ tools: server.listTools(), collectDebugEvidenceResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.collectDiagnostics) {
    const collectDiagnosticsInput: CollectDiagnosticsInput = {
      sessionId: cliOptions.sessionId ?? `diagnostics-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("collect_diagnostics", collectDiagnosticsInput);
    console.log(JSON.stringify({ tools: server.listTools(), collectDiagnosticsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.describeCapabilities) {
    const describeCapabilitiesInput: DescribeCapabilitiesInput = {
      sessionId: cliOptions.sessionId ?? `capabilities-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile ?? null,
    };
    const result = await server.invoke("describe_capabilities", describeCapabilitiesInput);
    console.log(JSON.stringify({ tools: server.listTools(), describeCapabilitiesResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.doctor) {
    const result = await server.invoke("doctor", { includeUnavailable: cliOptions.includeUnavailable } satisfies DoctorInput);
    console.log(JSON.stringify({ tools: server.listTools(), doctorResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.explainLastFailure) {
    const explainLastFailureInput: ExplainLastFailureInput = {
      sessionId: cliOptions.sessionId ?? `failure-${Date.now()}`,
    };
    const result = await server.invoke("explain_last_failure", explainLastFailureInput);
    console.log(JSON.stringify({ tools: server.listTools(), explainLastFailureResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.findSimilarFailures) {
    const findSimilarFailuresInput: FindSimilarFailuresInput = {
      sessionId: cliOptions.sessionId ?? `similar-failures-${Date.now()}`,
      actionId: cliOptions.actionId,
    };
    const result = await server.invoke("find_similar_failures", findSimilarFailuresInput);
    console.log(JSON.stringify({ tools: server.listTools(), findSimilarFailuresResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.listDevices) {
    const result = await server.invoke("list_devices", { includeUnavailable: cliOptions.includeUnavailable } satisfies ListDevicesInput);
    console.log(JSON.stringify({ tools: server.listTools(), listDevicesResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.listJsDebugTargets) {
    const listJsDebugTargetsInput: ListJsDebugTargetsInput = {
      sessionId: cliOptions.sessionId,
      metroBaseUrl: cliOptions.metroBaseUrl,
      timeoutMs: cliOptions.timeoutMs,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("list_js_debug_targets", listJsDebugTargetsInput);
    console.log(JSON.stringify({ tools: server.listTools(), listJsDebugTargetsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.measureAndroidPerformance) {
    const measureAndroidPerformanceInput: MeasureAndroidPerformanceInput = {
      sessionId: cliOptions.sessionId ?? `android-performance-${Date.now()}`,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      durationMs: cliOptions.durationMs,
      preset: cliOptions.performancePreset,
      outputPath: cliOptions.outputPath,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("measure_android_performance", measureAndroidPerformanceInput);
    console.log(JSON.stringify({ tools: server.listTools(), measureAndroidPerformanceResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.measureIosPerformance) {
    const measureIosPerformanceInput: MeasureIosPerformanceInput = {
      sessionId: cliOptions.sessionId ?? `ios-performance-${Date.now()}`,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      durationMs: cliOptions.durationMs,
      template: cliOptions.performanceTemplate,
      outputPath: cliOptions.outputPath,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("measure_ios_performance", measureIosPerformanceInput);
    console.log(JSON.stringify({ tools: server.listTools(), measureIosPerformanceResult: result }, null, 2));
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
      appId: cliOptions.appId,
      outputPath: cliOptions.outputPath,
      lines: cliOptions.lines,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("get_crash_signals", getCrashSignalsInput);
    console.log(JSON.stringify({ tools: server.listTools(), getCrashSignalsResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.getActionOutcome) {
    const getActionOutcomeInput: GetActionOutcomeInput = {
      sessionId: cliOptions.sessionId,
      actionId: cliOptions.actionId ?? "missing-action-id",
    };
    const result = await server.invoke("get_action_outcome", getActionOutcomeInput);
    console.log(JSON.stringify({ tools: server.listTools(), getActionOutcomeResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.getScreenSummary) {
    const getScreenSummaryInput: GetScreenSummaryInput = {
      sessionId: cliOptions.sessionId ?? `screen-summary-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      outputPath: cliOptions.outputPath,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("get_screen_summary", getScreenSummaryInput);
    console.log(JSON.stringify({ tools: server.listTools(), getScreenSummaryResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.getSessionState) {
    const getSessionStateInput: GetSessionStateInput = {
      sessionId: cliOptions.sessionId ?? `session-state-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("get_session_state", getSessionStateInput);
    console.log(JSON.stringify({ tools: server.listTools(), getSessionStateResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.requestManualHandoff) {
    const requestManualHandoffInput: RequestManualHandoffInput = {
      sessionId: cliOptions.sessionId ?? `handoff-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      reason: cliOptions.handoffReason ?? "unknown",
      summary: cliOptions.handoffSummary,
      suggestedOperatorActions: cliOptions.handoffActions,
      resumeHints: cliOptions.handoffResumeHints,
      blocking: cliOptions.handoffBlocking,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("request_manual_handoff", requestManualHandoffInput);
    console.log(JSON.stringify({ tools: server.listTools(), requestManualHandoffResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.performActionWithEvidence) {
    const action: ActionIntent = {
      actionType: cliOptions.actionType ?? "tap_element",
      resourceId: cliOptions.queryResourceId,
      contentDesc: cliOptions.queryContentDesc,
      text: cliOptions.queryText ?? cliOptions.text,
      className: cliOptions.queryClassName,
      clickable: cliOptions.queryClickable,
      limit: cliOptions.queryLimit,
      value: cliOptions.value,
      appId: cliOptions.appId,
      launchUrl: cliOptions.launchUrl,
      timeoutMs: cliOptions.timeoutMs,
      intervalMs: cliOptions.intervalMs,
      waitUntil: cliOptions.waitUntil,
    };
    const performActionInput: PerformActionWithEvidenceInput = {
      sessionId: cliOptions.sessionId ?? `action-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      includeDebugSignals: true,
      autoRemediate: cliOptions.autoRemediate,
      action,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("perform_action_with_evidence", performActionInput);
    console.log(JSON.stringify({ tools: server.listTools(), performActionWithEvidenceResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.rankFailureCandidates) {
    const rankFailureCandidatesInput: RankFailureCandidatesInput = {
      sessionId: cliOptions.sessionId ?? `failure-candidates-${Date.now()}`,
    };
    const result = await server.invoke("rank_failure_candidates", rankFailureCandidatesInput);
    console.log(JSON.stringify({ tools: server.listTools(), rankFailureCandidatesResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.recordScreen) {
    const recordScreenInput: RecordScreenInput = {
      sessionId: cliOptions.sessionId ?? `record-screen-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      durationMs: cliOptions.durationMs,
      bitrateMbps: cliOptions.bitrateMbps,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("record_screen", recordScreenInput);
    console.log(JSON.stringify({ tools: server.listTools(), recordScreenResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.resetAppState) {
    const resetAppStateInput: ResetAppStateInput = {
      sessionId: cliOptions.sessionId ?? `reset-app-state-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      artifactPath: cliOptions.artifactPath,
      strategy: cliOptions.resetStrategy,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("reset_app_state", resetAppStateInput);
    console.log(JSON.stringify({ tools: server.listTools(), resetAppStateResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.recoverToKnownState) {
    const recoverInput: RecoverToKnownStateInput = {
      sessionId: cliOptions.sessionId ?? `recover-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("recover_to_known_state", recoverInput);
    console.log(JSON.stringify({ tools: server.listTools(), recoverToKnownStateResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.replayLastStablePath) {
    const replayInput: ReplayLastStablePathInput = {
      sessionId: cliOptions.sessionId ?? `replay-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("replay_last_stable_path", replayInput);
    console.log(JSON.stringify({ tools: server.listTools(), replayLastStablePathResult: result }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  if (cliOptions.suggestKnownRemediation) {
    const suggestKnownRemediationInput: SuggestKnownRemediationInput = {
      sessionId: cliOptions.sessionId ?? `remediation-${Date.now()}`,
      actionId: cliOptions.actionId,
    };
    const result = await server.invoke("suggest_known_remediation", suggestKnownRemediationInput);
    console.log(JSON.stringify({ tools: server.listTools(), suggestKnownRemediationResult: result }, null, 2));
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
      appId: cliOptions.appId,
      outputPath: cliOptions.outputPath,
      lines: cliOptions.lines,
      sinceSeconds: cliOptions.sinceSeconds,
      query: cliOptions.queryText ?? cliOptions.text,
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
  if (cliOptions.scrollOnly) {
    if (!cliOptions.gestureDirection) {
      console.error("Error: --gesture-direction is required for --scroll-only. Must be one of: up, down, left, right.");
      process.exitCode = 1;
      return;
    }
    const gesture: NonNullable<ScrollOnlyInput["gesture"]> = {
      direction: cliOptions.gestureDirection,
    };
    if (cliOptions.gestureStartRatio !== undefined && cliOptions.gestureEndRatio !== undefined) {
      gesture.startRatio = cliOptions.gestureStartRatio;
      gesture.endRatio = cliOptions.gestureEndRatio;
    } else if (cliOptions.gestureStartRatio !== undefined || cliOptions.gestureEndRatio !== undefined) {
      console.error("Error: --gesture-start-ratio and --gesture-end-ratio must be provided together.");
      process.exitCode = 1;
      return;
    }
    const scrollOnlyInput: ScrollOnlyInput = {
      sessionId: cliOptions.sessionId ?? `scroll-only-${Date.now()}`,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      gesture,
      swipeDurationMs: cliOptions.swipeDurationMs,
      settleDelayMs: cliOptions.settleDelayMs,
      dryRun: cliOptions.dryRun,
    };
    const result = await server.invoke("scroll_only", scrollOnlyInput);
    console.log(JSON.stringify({ tools: server.listTools(), scrollOnlyResult: result }, null, 2));
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
  if (cliOptions.scrollAndTapElement) {
    const scrollTapInput: ScrollAndTapElementInput = {
      sessionId: cliOptions.sessionId ?? `scroll-tap-${Date.now()}`,
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
    const result = await server.invoke("scroll_and_tap_element", scrollTapInput);
    console.log(JSON.stringify({ tools: server.listTools(), scrollAndTapElementResult: result }, null, 2));
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

  const startInput: StartSessionInput = {
    platform: cliOptions.platform,
    profile: cliOptions.runnerProfile ?? null,
    policyProfile: cliOptions.policyProfile,
    harnessConfigPath: cliOptions.harnessConfigPath,
    sessionId: cliOptions.sessionId,
    deviceId: cliOptions.deviceId,
  };
  const startResult = await server.invoke("start_session", startInput);
  if (startResult.status !== "success") {
    console.log(JSON.stringify({ tools: server.listTools(), startResult }, null, 2));
    process.exitCode = 1;
    return;
  }
  const runInput: RunFlowInput = {
    sessionId: startResult.data.sessionId,
    platform: cliOptions.platform,
    runnerProfile: cliOptions.runnerProfile,
    runCount: cliOptions.runCount,
    dryRun: cliOptions.dryRun,
    flowPath: cliOptions.flowPath,
    harnessConfigPath: cliOptions.harnessConfigPath,
    androidReplayOptions: cliOptions.androidReplayOptions,
  };
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
