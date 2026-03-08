import type {
  DeviceInfo,
  DoctorCheck,
  DoctorInput,
  EndSessionInput,
  InspectUiInput,
  InstallAppInput,
  LaunchAppInput,
  ListDevicesInput,
  RunFlowInput,
  ScreenshotInput,
  Session,
  StartSessionInput,
  TerminateAppInput,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";

export interface MobileE2EMcpToolRegistry {
  doctor: (input: DoctorInput) => Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  inspect_ui: (input: InspectUiInput) => Promise<ToolResult>;
  install_app: (input: InstallAppInput) => Promise<ToolResult>;
  launch_app: (input: LaunchAppInput) => Promise<ToolResult>;
  list_devices: (input: ListDevicesInput) => Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  start_session: (input: StartSessionInput) => Promise<ToolResult<Session>>;
  run_flow: (input: RunFlowInput) => Promise<ToolResult>;
  take_screenshot: (input: ScreenshotInput) => Promise<ToolResult>;
  terminate_app: (input: TerminateAppInput) => Promise<ToolResult>;
  end_session: (input: EndSessionInput) => Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
}

export class MobileE2EMcpServer {
  constructor(private readonly tools: MobileE2EMcpToolRegistry) {}

  listTools(): Array<keyof MobileE2EMcpToolRegistry> {
    return ["doctor", "inspect_ui", "install_app", "launch_app", "list_devices", "start_session", "run_flow", "take_screenshot", "terminate_app", "end_session"];
  }

  async invoke(toolName: "doctor", input: DoctorInput): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  async invoke(toolName: "inspect_ui", input: InspectUiInput): Promise<ToolResult>;
  async invoke(toolName: "install_app", input: InstallAppInput): Promise<ToolResult>;
  async invoke(toolName: "launch_app", input: LaunchAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_devices", input: ListDevicesInput): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  async invoke(toolName: "start_session", input: StartSessionInput): Promise<ToolResult<Session>>;
  async invoke(toolName: "run_flow", input: RunFlowInput): Promise<ToolResult>;
  async invoke(toolName: "take_screenshot", input: ScreenshotInput): Promise<ToolResult>;
  async invoke(toolName: "terminate_app", input: TerminateAppInput): Promise<ToolResult>;
  async invoke(toolName: "end_session", input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
  async invoke(
    toolName: keyof MobileE2EMcpToolRegistry,
    input: DoctorInput | InspectUiInput | InstallAppInput | LaunchAppInput | ListDevicesInput | StartSessionInput | RunFlowInput | ScreenshotInput | TerminateAppInput | EndSessionInput,
  ): Promise<
    | ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>
    | ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>
    | ToolResult<Session>
    | ToolResult
    | ToolResult<{ closed: boolean; endedAt: string }>
  > {
    if (toolName === "doctor") return this.tools.doctor(input as DoctorInput);
    if (toolName === "inspect_ui") return this.tools.inspect_ui(input as InspectUiInput);
    if (toolName === "install_app") return this.tools.install_app(input as InstallAppInput);
    if (toolName === "launch_app") return this.tools.launch_app(input as LaunchAppInput);
    if (toolName === "list_devices") return this.tools.list_devices(input as ListDevicesInput);
    if (toolName === "start_session") return this.tools.start_session(input as StartSessionInput);
    if (toolName === "run_flow") return this.tools.run_flow(input as RunFlowInput);
    if (toolName === "take_screenshot") return this.tools.take_screenshot(input as ScreenshotInput);
    if (toolName === "terminate_app") return this.tools.terminate_app(input as TerminateAppInput);
    return this.tools.end_session(input as EndSessionInput);
  }
}
