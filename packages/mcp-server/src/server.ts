import type {
  DeviceInfo,
  DoctorCheck,
  DoctorInput,
  EndSessionInput,
  InstallAppInput,
  ListDevicesInput,
  RunFlowInput,
  Session,
  StartSessionInput,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";

export interface MobileE2EMcpToolRegistry {
  doctor: (input: DoctorInput) => Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  install_app: (input: InstallAppInput) => Promise<ToolResult>;
  list_devices: (input: ListDevicesInput) => Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  start_session: (input: StartSessionInput) => Promise<ToolResult<Session>>;
  run_flow: (input: RunFlowInput) => Promise<ToolResult>;
  end_session: (input: EndSessionInput) => Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
}

export class MobileE2EMcpServer {
  constructor(private readonly tools: MobileE2EMcpToolRegistry) {}

  listTools(): Array<keyof MobileE2EMcpToolRegistry> {
    return ["doctor", "install_app", "list_devices", "start_session", "run_flow", "end_session"];
  }

  async invoke(toolName: "doctor", input: DoctorInput): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  async invoke(toolName: "install_app", input: InstallAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_devices", input: ListDevicesInput): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  async invoke(toolName: "start_session", input: StartSessionInput): Promise<ToolResult<Session>>;
  async invoke(toolName: "run_flow", input: RunFlowInput): Promise<ToolResult>;
  async invoke(toolName: "end_session", input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
  async invoke(
    toolName: keyof MobileE2EMcpToolRegistry,
    input: DoctorInput | InstallAppInput | ListDevicesInput | StartSessionInput | RunFlowInput | EndSessionInput,
  ): Promise<
    | ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>
    | ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>
    | ToolResult<Session>
    | ToolResult
    | ToolResult<{ closed: boolean; endedAt: string }>
  > {
    if (toolName === "doctor") {
      return this.tools.doctor(input as DoctorInput);
    }
    if (toolName === "install_app") {
      return this.tools.install_app(input as InstallAppInput);
    }
    if (toolName === "list_devices") {
      return this.tools.list_devices(input as ListDevicesInput);
    }
    if (toolName === "start_session") {
      return this.tools.start_session(input as StartSessionInput);
    }
    if (toolName === "run_flow") {
      return this.tools.run_flow(input as RunFlowInput);
    }
    return this.tools.end_session(input as EndSessionInput);
  }
}
