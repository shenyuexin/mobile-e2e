import { MobileE2EMcpServer } from "./server.js";
import { endSession } from "./tools/end-session.js";
import { runFlow } from "./tools/run-flow.js";
import { startSession } from "./tools/start-session.js";

export function createServer(): MobileE2EMcpServer {
  return new MobileE2EMcpServer({
    start_session: startSession,
    run_flow: runFlow,
    end_session: endSession,
  });
}
