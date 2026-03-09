import { MobileE2EMcpServer } from "./server.js";
import { captureJsConsoleLogs } from "./tools/capture-js-console-logs.js";
import { captureJsNetworkEvents } from "./tools/capture-js-network-events.js";
import { collectDebugEvidence } from "./tools/collect-debug-evidence.js";
import { collectDiagnostics } from "./tools/collect-diagnostics.js";
import { describeCapabilities } from "./tools/describe-capabilities.js";
import { doctor } from "./tools/doctor.js";
import { endSession } from "./tools/end-session.js";
import { getCrashSignals } from "./tools/get-crash-signals.js";
import { getLogs } from "./tools/get-logs.js";
import { inspectUi } from "./tools/inspect-ui.js";
import { installApp } from "./tools/install-app.js";
import { listJsDebugTargets } from "./tools/list-js-debug-targets.js";
import { launchApp } from "./tools/launch-app.js";
import { listDevices } from "./tools/list-devices.js";
import { queryUi } from "./tools/query-ui.js";
import { resolveUiTarget } from "./tools/resolve-ui-target.js";
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

export function createServer(): MobileE2EMcpServer {
  return new MobileE2EMcpServer({
    capture_js_console_logs: captureJsConsoleLogs,
    capture_js_network_events: captureJsNetworkEvents,
    collect_debug_evidence: collectDebugEvidence,
    collect_diagnostics: collectDiagnostics,
    describe_capabilities: describeCapabilities,
    doctor,
    get_crash_signals: getCrashSignals,
    get_logs: getLogs,
    inspect_ui: inspectUi,
    query_ui: queryUi,
    resolve_ui_target: resolveUiTarget,
    scroll_and_resolve_ui_target: scrollAndResolveUiTarget,
    scroll_and_tap_element: scrollAndTapElement,
    install_app: installApp,
    list_js_debug_targets: listJsDebugTargets,
    launch_app: launchApp,
    list_devices: listDevices,
    start_session: startSession,
    run_flow: runFlow,
    take_screenshot: takeScreenshot,
    tap,
    tap_element: tapElement,
    terminate_app: terminateApp,
    type_text: typeText,
    type_into_element: typeIntoElement,
    wait_for_ui: waitForUi,
    end_session: endSession,
  });
}
