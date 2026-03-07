import { MobileE2EMcpServer } from "./server";
import { endSession } from "./tools/end-session";
import { runFlow } from "./tools/run-flow";
import { startSession } from "./tools/start-session";

export function createServer(): MobileE2EMcpServer {
  return new MobileE2EMcpServer({
    start_session: startSession,
    run_flow: runFlow,
    end_session: endSession,
  });
}
