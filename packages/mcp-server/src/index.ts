import { MobileE2EMcpServer } from "./server.js";
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

  return new MobileE2EMcpServer({
    capture_js_console_logs: withPolicy("capture_js_console_logs", captureJsConsoleLogs),
    capture_js_network_events: withPolicy("capture_js_network_events", captureJsNetworkEvents),
    compare_against_baseline: withPolicy("compare_against_baseline", compareAgainstBaseline),
    collect_debug_evidence: withPolicy("collect_debug_evidence", collectDebugEvidence),
    collect_diagnostics: withPolicy("collect_diagnostics", collectDiagnostics),
    describe_capabilities: withPolicy("describe_capabilities", describeCapabilities),
    doctor: withPolicy("doctor", doctor),
    explain_last_failure: withPolicy("explain_last_failure", explainLastFailure),
    find_similar_failures: withPolicy("find_similar_failures", findSimilarFailures),
    get_action_outcome: withPolicy("get_action_outcome", getActionOutcome),
    get_crash_signals: withPolicy("get_crash_signals", getCrashSignals),
    get_logs: withPolicy("get_logs", getLogs),
    get_screen_summary: withPolicy("get_screen_summary", getScreenSummary),
    get_session_state: withPolicy("get_session_state", getSessionState),
    inspect_ui: withPolicy("inspect_ui", inspectUi),
    query_ui: withPolicy("query_ui", queryUi),
    recover_to_known_state: withPolicy("recover_to_known_state", recoverToKnownState),
    resolve_ui_target: withPolicy("resolve_ui_target", resolveUiTarget),
    replay_last_stable_path: withPolicy("replay_last_stable_path", replayLastStablePath),
    scroll_and_resolve_ui_target: withPolicy("scroll_and_resolve_ui_target", scrollAndResolveUiTarget),
    scroll_and_tap_element: withPolicy("scroll_and_tap_element", scrollAndTapElement),
    install_app: withPolicy("install_app", installApp),
    list_js_debug_targets: withPolicy("list_js_debug_targets", listJsDebugTargets),
    launch_app: withPolicy("launch_app", launchApp),
    list_devices: withPolicy("list_devices", listDevices),
    measure_android_performance: withPolicy("measure_android_performance", measureAndroidPerformance),
    measure_ios_performance: withPolicy("measure_ios_performance", measureIosPerformance),
    perform_action_with_evidence: withPolicy("perform_action_with_evidence", performActionWithEvidence),
    rank_failure_candidates: withPolicy("rank_failure_candidates", rankFailureCandidates),
    start_session: async (input) => startSession(input),
    run_flow: withPolicy("run_flow", runFlow),
    take_screenshot: withPolicy("take_screenshot", takeScreenshot),
    tap: withPolicy("tap", tap),
    tap_element: withPolicy("tap_element", tapElement),
    terminate_app: withPolicy("terminate_app", terminateApp),
    type_text: withPolicy("type_text", typeText),
    type_into_element: withPolicy("type_into_element", typeIntoElement),
    wait_for_ui: withPolicy("wait_for_ui", waitForUi),
    suggest_known_remediation: withPolicy("suggest_known_remediation", suggestKnownRemediation),
    end_session: endSession,
  });
}
