import type { EndSessionInput, RunFlowInput, Session, StartSessionInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export interface MobileE2EMcpToolRegistry {
  start_session: (input: StartSessionInput) => Promise<ToolResult<Session>>;
  run_flow: (input: RunFlowInput) => Promise<ToolResult>;
  end_session: (input: EndSessionInput) => Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
}

export class MobileE2EMcpServer {
  constructor(private readonly tools: MobileE2EMcpToolRegistry) {}

  listTools(): Array<keyof MobileE2EMcpToolRegistry> {
    return ["start_session", "run_flow", "end_session"];
  }

  async invoke(toolName: "start_session", input: StartSessionInput): Promise<ToolResult<Session>>;
  async invoke(toolName: "run_flow", input: RunFlowInput): Promise<ToolResult>;
  async invoke(toolName: "end_session", input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
  async invoke(
    toolName: keyof MobileE2EMcpToolRegistry,
    input: StartSessionInput | RunFlowInput | EndSessionInput,
  ): Promise<ToolResult<Session> | ToolResult | ToolResult<{ closed: boolean; endedAt: string }>> {
    if (toolName === "start_session") {
      return this.tools.start_session(input as StartSessionInput);
    }
    if (toolName === "run_flow") {
      return this.tools.run_flow(input as RunFlowInput);
    }
    return this.tools.end_session(input as EndSessionInput);
  }
}
