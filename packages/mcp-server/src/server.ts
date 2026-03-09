import type {
  DeviceInfo,
  DoctorCheck,
  DoctorInput,
  EndSessionInput,
  GetCrashSignalsData,
  GetCrashSignalsInput,
  GetLogsData,
  GetLogsInput,
  InspectUiInput,
  InstallAppInput,
  LaunchAppInput,
  ListDevicesInput,
  QueryUiData,
  QueryUiInput,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  RunFlowInput,
  ScreenshotInput,
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
  Session,
  StartSessionInput,
  TapElementData,
  TapElementInput,
  TapInput,
  TerminateAppInput,
  ToolResult,
  TypeTextInput,
  TypeIntoElementData,
  TypeIntoElementInput,
  WaitForUiData,
  WaitForUiInput,
} from "@mobile-e2e-mcp/contracts";

export interface MobileE2EMcpToolRegistry {
  doctor: (input: DoctorInput) => Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  get_crash_signals: (input: GetCrashSignalsInput) => Promise<ToolResult<GetCrashSignalsData>>;
  get_logs: (input: GetLogsInput) => Promise<ToolResult<GetLogsData>>;
  inspect_ui: (input: InspectUiInput) => Promise<ToolResult>;
  query_ui: (input: QueryUiInput) => Promise<ToolResult<QueryUiData>>;
  resolve_ui_target: (input: ResolveUiTargetInput) => Promise<ToolResult<ResolveUiTargetData>>;
  scroll_and_resolve_ui_target: (input: ScrollAndResolveUiTargetInput) => Promise<ToolResult<ScrollAndResolveUiTargetData>>;
  install_app: (input: InstallAppInput) => Promise<ToolResult>;
  launch_app: (input: LaunchAppInput) => Promise<ToolResult>;
  list_devices: (input: ListDevicesInput) => Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  start_session: (input: StartSessionInput) => Promise<ToolResult<Session>>;
  run_flow: (input: RunFlowInput) => Promise<ToolResult>;
  take_screenshot: (input: ScreenshotInput) => Promise<ToolResult>;
  tap: (input: TapInput) => Promise<ToolResult>;
  tap_element: (input: TapElementInput) => Promise<ToolResult<TapElementData>>;
  terminate_app: (input: TerminateAppInput) => Promise<ToolResult>;
  type_text: (input: TypeTextInput) => Promise<ToolResult>;
  type_into_element: (input: TypeIntoElementInput) => Promise<ToolResult<TypeIntoElementData>>;
  wait_for_ui: (input: WaitForUiInput) => Promise<ToolResult<WaitForUiData>>;
  end_session: (input: EndSessionInput) => Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
}

export class MobileE2EMcpServer {
  constructor(private readonly tools: MobileE2EMcpToolRegistry) {}

  listTools(): Array<keyof MobileE2EMcpToolRegistry> {
    return ["doctor", "get_crash_signals", "get_logs", "inspect_ui", "query_ui", "resolve_ui_target", "scroll_and_resolve_ui_target", "install_app", "launch_app", "list_devices", "start_session", "run_flow", "take_screenshot", "tap", "tap_element", "terminate_app", "type_text", "type_into_element", "wait_for_ui", "end_session"];
  }

  async invoke(toolName: "doctor", input: DoctorInput): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  async invoke(toolName: "get_crash_signals", input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>>;
  async invoke(toolName: "get_logs", input: GetLogsInput): Promise<ToolResult<GetLogsData>>;
  async invoke(toolName: "inspect_ui", input: InspectUiInput): Promise<ToolResult>;
  async invoke(toolName: "query_ui", input: QueryUiInput): Promise<ToolResult<QueryUiData>>;
  async invoke(toolName: "resolve_ui_target", input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>>;
  async invoke(toolName: "scroll_and_resolve_ui_target", input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>>;
  async invoke(toolName: "install_app", input: InstallAppInput): Promise<ToolResult>;
  async invoke(toolName: "launch_app", input: LaunchAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_devices", input: ListDevicesInput): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  async invoke(toolName: "start_session", input: StartSessionInput): Promise<ToolResult<Session>>;
  async invoke(toolName: "run_flow", input: RunFlowInput): Promise<ToolResult>;
  async invoke(toolName: "take_screenshot", input: ScreenshotInput): Promise<ToolResult>;
  async invoke(toolName: "tap", input: TapInput): Promise<ToolResult>;
  async invoke(toolName: "tap_element", input: TapElementInput): Promise<ToolResult<TapElementData>>;
  async invoke(toolName: "terminate_app", input: TerminateAppInput): Promise<ToolResult>;
  async invoke(toolName: "type_text", input: TypeTextInput): Promise<ToolResult>;
  async invoke(toolName: "type_into_element", input: TypeIntoElementInput): Promise<ToolResult<TypeIntoElementData>>;
  async invoke(toolName: "wait_for_ui", input: WaitForUiInput): Promise<ToolResult<WaitForUiData>>;
  async invoke(toolName: "end_session", input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>>;
  async invoke(
    toolName: keyof MobileE2EMcpToolRegistry,
    input: DoctorInput | GetCrashSignalsInput | GetLogsInput | InspectUiInput | QueryUiInput | ResolveUiTargetInput | ScrollAndResolveUiTargetInput | InstallAppInput | LaunchAppInput | ListDevicesInput | StartSessionInput | RunFlowInput | ScreenshotInput | TapInput | TapElementInput | TerminateAppInput | TypeTextInput | TypeIntoElementInput | WaitForUiInput | EndSessionInput,
  ): Promise<
    | ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>
    | ToolResult<GetCrashSignalsData>
    | ToolResult<GetLogsData>
    | ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>
    | ToolResult<Session>
    | ToolResult<QueryUiData>
    | ToolResult<ResolveUiTargetData>
    | ToolResult<ScrollAndResolveUiTargetData>
    | ToolResult<TapElementData>
    | ToolResult<TypeIntoElementData>
    | ToolResult<WaitForUiData>
    | ToolResult
    | ToolResult<{ closed: boolean; endedAt: string }>
  > {
    if (toolName === "doctor") return this.tools.doctor(input as DoctorInput);
    if (toolName === "get_crash_signals") return this.tools.get_crash_signals(input as GetCrashSignalsInput);
    if (toolName === "get_logs") return this.tools.get_logs(input as GetLogsInput);
    if (toolName === "inspect_ui") return this.tools.inspect_ui(input as InspectUiInput);
    if (toolName === "query_ui") return this.tools.query_ui(input as QueryUiInput);
    if (toolName === "resolve_ui_target") return this.tools.resolve_ui_target(input as ResolveUiTargetInput);
    if (toolName === "scroll_and_resolve_ui_target") return this.tools.scroll_and_resolve_ui_target(input as ScrollAndResolveUiTargetInput);
    if (toolName === "install_app") return this.tools.install_app(input as InstallAppInput);
    if (toolName === "launch_app") return this.tools.launch_app(input as LaunchAppInput);
    if (toolName === "list_devices") return this.tools.list_devices(input as ListDevicesInput);
    if (toolName === "start_session") return this.tools.start_session(input as StartSessionInput);
    if (toolName === "run_flow") return this.tools.run_flow(input as RunFlowInput);
    if (toolName === "take_screenshot") return this.tools.take_screenshot(input as ScreenshotInput);
    if (toolName === "tap") return this.tools.tap(input as TapInput);
    if (toolName === "tap_element") return this.tools.tap_element(input as TapElementInput);
    if (toolName === "terminate_app") return this.tools.terminate_app(input as TerminateAppInput);
    if (toolName === "type_text") return this.tools.type_text(input as TypeTextInput);
    if (toolName === "type_into_element") return this.tools.type_into_element(input as TypeIntoElementInput);
    if (toolName === "wait_for_ui") return this.tools.wait_for_ui(input as WaitForUiInput);
    return this.tools.end_session(input as EndSessionInput);
  }
}
