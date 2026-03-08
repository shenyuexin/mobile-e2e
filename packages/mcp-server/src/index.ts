import { MobileE2EMcpServer } from "./server.js";
import { doctor } from "./tools/doctor.js";
import { endSession } from "./tools/end-session.js";
import { inspectUi } from "./tools/inspect-ui.js";
import { installApp } from "./tools/install-app.js";
import { launchApp } from "./tools/launch-app.js";
import { listDevices } from "./tools/list-devices.js";
import { runFlow } from "./tools/run-flow.js";
import { startSession } from "./tools/start-session.js";
import { takeScreenshot } from "./tools/take-screenshot.js";
import { terminateApp } from "./tools/terminate-app.js";

export function createServer(): MobileE2EMcpServer {
  return new MobileE2EMcpServer({
    doctor,
    inspect_ui: inspectUi,
    install_app: installApp,
    launch_app: launchApp,
    list_devices: listDevices,
    start_session: startSession,
    run_flow: runFlow,
    take_screenshot: takeScreenshot,
    terminate_app: terminateApp,
    end_session: endSession,
  });
}
