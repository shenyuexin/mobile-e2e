import { MobileE2EMcpServer } from "./server.js";
import type { PerformActionWithEvidenceInput } from "@mobile-e2e-mcp/contracts";
import { enforcePolicyForTool } from "./policy-guard.js";
import { captureJsConsoleLogs } from "./tools/capture-js-console-logs.js";
import { captureJsNetworkEvents } from "./tools/capture-js-network-events.js";
import { compareAgainstBaseline } from "./tools/compare-against-baseline.js";
import { collectDebugEvidence } from "./tools/collect-debug-evidence.js";
import { collectDiagnostics } from "./tools/collect-diagnostics.js";
import { describeCapabilities } from "./tools/describe-capabilities.js";
import { doctor } from "./tools/doctor.js";
import { endSession } from "./tools/end-session.js";
import { explainLastFailure } from "./tools/explain-last-failure.js";
import { findSimilarFailures } from "./tools/find-similar-failures.js";
import { getActionOutcome } from "./tools/get-action-outcome.js";
import { getCrashSignals } from "./tools/get-crash-signals.js";
import { getLogs } from "./tools/get-logs.js";
import { getScreenSummary } from "./tools/get-screen-summary.js";
import { getSessionState } from "./tools/get-session-state.js";
import { inspectUi } from "./tools/inspect-ui.js";
import { installApp } from "./tools/install-app.js";
import { listJsDebugTargets } from "./tools/list-js-debug-targets.js";
import { launchApp } from "./tools/launch-app.js";
import { listDevices } from "./tools/list-devices.js";
import { measureAndroidPerformance } from "./tools/measure-android-performance.js";
import { measureIosPerformance } from "./tools/measure-ios-performance.js";
import { queryUi } from "./tools/query-ui.js";
import { recoverToKnownState } from "./tools/recover-to-known-state.js";
import { performActionWithEvidence } from "./tools/perform-action-with-evidence.js";
import { performActionWithAutoRemediation } from "./tools/perform-action-with-auto-remediation.js";
import { resolveUiTarget } from "./tools/resolve-ui-target.js";
import { rankFailureCandidates } from "./tools/rank-failure-candidates.js";
import { replayLastStablePath } from "./tools/replay-last-stable-path.js";
import { runFlow } from "./tools/run-flow.js";
import { scrollAndResolveUiTarget } from "./tools/scroll-and-resolve-ui-target.js";
import { scrollAndTapElement } from "./tools/scroll-and-tap-element.js";
import { startSession } from "./tools/start-session.js";
import { takeScreenshot } from "./tools/take-screenshot.js";
import { tapElement } from "./tools/tap-element.js";
import { tap } from "./tools/tap.js";
import { terminateApp } from "./tools/terminate-app.js";
import { typeText } from "./tools/type-text.js";
import { typeIntoElement } from "./tools/type-into-element.js";
import { waitForUi } from "./tools/wait-for-ui.js";
import { suggestKnownRemediation } from "./tools/suggest-known-remediation.js";

export function createServer(): MobileE2EMcpServer {
  const withPolicy = <TInput, TOutput>(toolName: string, handler: (input: TInput) => Promise<TOutput>) => {
    return async (input: TInput): Promise<TOutput> => {
      const denied = await enforcePolicyForTool(toolName, input);
      if (denied) {
        return denied as TOutput;
      }
      return handler(input);
    };
  };
  const captureJsConsoleLogsHandler = withPolicy("capture_js_console_logs", captureJsConsoleLogs);
  const captureJsNetworkEventsHandler = withPolicy("capture_js_network_events", captureJsNetworkEvents);
  const compareAgainstBaselineHandler = withPolicy("compare_against_baseline", compareAgainstBaseline);
  const collectDebugEvidenceHandler = withPolicy("collect_debug_evidence", collectDebugEvidence);
  const collectDiagnosticsHandler = withPolicy("collect_diagnostics", collectDiagnostics);
  const describeCapabilitiesHandler = withPolicy("describe_capabilities", describeCapabilities);
  const doctorHandler = withPolicy("doctor", doctor);
  const explainLastFailureHandler = withPolicy("explain_last_failure", explainLastFailure);
  const findSimilarFailuresHandler = withPolicy("find_similar_failures", findSimilarFailures);
  const getActionOutcomeHandler = withPolicy("get_action_outcome", getActionOutcome);
  const getCrashSignalsHandler = withPolicy("get_crash_signals", getCrashSignals);
  const getLogsHandler = withPolicy("get_logs", getLogs);
  const getScreenSummaryHandler = withPolicy("get_screen_summary", getScreenSummary);
  const getSessionStateHandler = withPolicy("get_session_state", getSessionState);
  const inspectUiHandler = withPolicy("inspect_ui", inspectUi);
  const queryUiHandler = withPolicy("query_ui", queryUi);
  const recoverToKnownStateHandler = withPolicy("recover_to_known_state", recoverToKnownState);
  const resolveUiTargetHandler = withPolicy("resolve_ui_target", resolveUiTarget);
  const replayLastStablePathHandler = withPolicy("replay_last_stable_path", replayLastStablePath);
  const scrollAndResolveUiTargetHandler = withPolicy("scroll_and_resolve_ui_target", scrollAndResolveUiTarget);
  const scrollAndTapElementHandler = withPolicy("scroll_and_tap_element", scrollAndTapElement);
  const installAppHandler = withPolicy("install_app", installApp);
  const listJsDebugTargetsHandler = withPolicy("list_js_debug_targets", listJsDebugTargets);
  const launchAppHandler = withPolicy("launch_app", launchApp);
  const listDevicesHandler = withPolicy("list_devices", listDevices);
  const measureAndroidPerformanceHandler = withPolicy("measure_android_performance", measureAndroidPerformance);
  const measureIosPerformanceHandler = withPolicy("measure_ios_performance", measureIosPerformance);
  const rankFailureCandidatesHandler = withPolicy("rank_failure_candidates", rankFailureCandidates);
  const runFlowHandler = withPolicy("run_flow", runFlow);
  const takeScreenshotHandler = withPolicy("take_screenshot", takeScreenshot);
  const tapHandler = withPolicy("tap", tap);
  const tapElementHandler = withPolicy("tap_element", tapElement);
  const terminateAppHandler = withPolicy("terminate_app", terminateApp);
  const typeTextHandler = withPolicy("type_text", typeText);
  const typeIntoElementHandler = withPolicy("type_into_element", typeIntoElement);
  const waitForUiHandler = withPolicy("wait_for_ui", waitForUi);
  const suggestKnownRemediationHandler = withPolicy("suggest_known_remediation", suggestKnownRemediation);
  const performActionWithEvidenceHandler = withPolicy(
    "perform_action_with_evidence",
    (input: PerformActionWithEvidenceInput) => performActionWithAutoRemediation(input, {
      performAction: performActionWithEvidence,
      explainLastFailure: explainLastFailureHandler,
      rankFailureCandidates: rankFailureCandidatesHandler,
      suggestKnownRemediation: suggestKnownRemediationHandler,
      recoverToKnownState: recoverToKnownStateHandler,
      replayLastStablePath: replayLastStablePathHandler,
    }),
  );

  return new MobileE2EMcpServer({
    capture_js_console_logs: captureJsConsoleLogsHandler,
    capture_js_network_events: captureJsNetworkEventsHandler,
    compare_against_baseline: compareAgainstBaselineHandler,
    collect_debug_evidence: collectDebugEvidenceHandler,
    collect_diagnostics: collectDiagnosticsHandler,
    describe_capabilities: describeCapabilitiesHandler,
    doctor: doctorHandler,
    explain_last_failure: explainLastFailureHandler,
    find_similar_failures: findSimilarFailuresHandler,
    get_action_outcome: getActionOutcomeHandler,
    get_crash_signals: getCrashSignalsHandler,
    get_logs: getLogsHandler,
    get_screen_summary: getScreenSummaryHandler,
    get_session_state: getSessionStateHandler,
    inspect_ui: inspectUiHandler,
    query_ui: queryUiHandler,
    recover_to_known_state: recoverToKnownStateHandler,
    resolve_ui_target: resolveUiTargetHandler,
    replay_last_stable_path: replayLastStablePathHandler,
    scroll_and_resolve_ui_target: scrollAndResolveUiTargetHandler,
    scroll_and_tap_element: scrollAndTapElementHandler,
    install_app: installAppHandler,
    list_js_debug_targets: listJsDebugTargetsHandler,
    launch_app: launchAppHandler,
    list_devices: listDevicesHandler,
    measure_android_performance: measureAndroidPerformanceHandler,
    measure_ios_performance: measureIosPerformanceHandler,
    perform_action_with_evidence: performActionWithEvidenceHandler,
    rank_failure_candidates: rankFailureCandidatesHandler,
    start_session: async (input) => startSession(input),
    run_flow: runFlowHandler,
    take_screenshot: takeScreenshotHandler,
    tap: tapHandler,
    tap_element: tapElementHandler,
    terminate_app: terminateAppHandler,
    type_text: typeTextHandler,
    type_into_element: typeIntoElementHandler,
    wait_for_ui: waitForUiHandler,
    suggest_known_remediation: suggestKnownRemediationHandler,
    end_session: endSession,
  });
}
