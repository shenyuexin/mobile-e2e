import type {
  CaptureJsConsoleLogsData,
  CaptureJsConsoleLogsInput,
  CaptureJsNetworkEventsData,
  CaptureJsNetworkEventsInput,
  CollectDebugEvidenceData,
  CollectDebugEvidenceInput,
  CollectDiagnosticsData,
  CollectDiagnosticsInput,
  DescribeCapabilitiesData,
  DescribeCapabilitiesInput,
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
  ListJsDebugTargetsData,
  ListJsDebugTargetsInput,
  ListDevicesInput,
  MeasureAndroidPerformanceData,
  MeasureAndroidPerformanceInput,
  MeasureIosPerformanceData,
  MeasureIosPerformanceInput,
  QueryUiData,
  QueryUiInput,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  RunFlowInput,
  ScreenshotInput,
  ScrollAndTapElementData,
  ScrollAndTapElementInput,
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
  capture_js_console_logs: (input: CaptureJsConsoleLogsInput) => Promise<ToolResult<CaptureJsConsoleLogsData>>;
  capture_js_network_events: (input: CaptureJsNetworkEventsInput) => Promise<ToolResult<CaptureJsNetworkEventsData>>;
  collect_debug_evidence: (input: CollectDebugEvidenceInput) => Promise<ToolResult<CollectDebugEvidenceData>>;
  collect_diagnostics: (input: CollectDiagnosticsInput) => Promise<ToolResult<CollectDiagnosticsData>>;
  describe_capabilities: (input: DescribeCapabilitiesInput) => Promise<ToolResult<DescribeCapabilitiesData>>;
  doctor: (input: DoctorInput) => Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  get_crash_signals: (input: GetCrashSignalsInput) => Promise<ToolResult<GetCrashSignalsData>>;
  get_logs: (input: GetLogsInput) => Promise<ToolResult<GetLogsData>>;
  inspect_ui: (input: InspectUiInput) => Promise<ToolResult>;
  query_ui: (input: QueryUiInput) => Promise<ToolResult<QueryUiData>>;
  resolve_ui_target: (input: ResolveUiTargetInput) => Promise<ToolResult<ResolveUiTargetData>>;
  scroll_and_resolve_ui_target: (input: ScrollAndResolveUiTargetInput) => Promise<ToolResult<ScrollAndResolveUiTargetData>>;
  scroll_and_tap_element: (input: ScrollAndTapElementInput) => Promise<ToolResult<ScrollAndTapElementData>>;
  install_app: (input: InstallAppInput) => Promise<ToolResult>;
  list_js_debug_targets: (input: ListJsDebugTargetsInput) => Promise<ToolResult<ListJsDebugTargetsData>>;
  launch_app: (input: LaunchAppInput) => Promise<ToolResult>;
  list_devices: (input: ListDevicesInput) => Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  measure_android_performance: (input: MeasureAndroidPerformanceInput) => Promise<ToolResult<MeasureAndroidPerformanceData>>;
  measure_ios_performance: (input: MeasureIosPerformanceInput) => Promise<ToolResult<MeasureIosPerformanceData>>;
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
    return ["capture_js_console_logs", "capture_js_network_events", "collect_debug_evidence", "collect_diagnostics", "describe_capabilities", "doctor", "get_crash_signals", "get_logs", "inspect_ui", "query_ui", "resolve_ui_target", "scroll_and_resolve_ui_target", "scroll_and_tap_element", "install_app", "list_js_debug_targets", "launch_app", "list_devices", "measure_android_performance", "measure_ios_performance", "start_session", "run_flow", "take_screenshot", "tap", "tap_element", "terminate_app", "type_text", "type_into_element", "wait_for_ui", "end_session"];
  }

  async invoke(toolName: "capture_js_console_logs", input: CaptureJsConsoleLogsInput): Promise<ToolResult<CaptureJsConsoleLogsData>>;
  async invoke(toolName: "capture_js_network_events", input: CaptureJsNetworkEventsInput): Promise<ToolResult<CaptureJsNetworkEventsData>>;
  async invoke(toolName: "collect_debug_evidence", input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>>;
  async invoke(toolName: "collect_diagnostics", input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>>;
  async invoke(toolName: "describe_capabilities", input: DescribeCapabilitiesInput): Promise<ToolResult<DescribeCapabilitiesData>>;
  async invoke(toolName: "doctor", input: DoctorInput): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>>;
  async invoke(toolName: "get_crash_signals", input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>>;
  async invoke(toolName: "get_logs", input: GetLogsInput): Promise<ToolResult<GetLogsData>>;
  async invoke(toolName: "inspect_ui", input: InspectUiInput): Promise<ToolResult>;
  async invoke(toolName: "query_ui", input: QueryUiInput): Promise<ToolResult<QueryUiData>>;
  async invoke(toolName: "resolve_ui_target", input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>>;
  async invoke(toolName: "scroll_and_resolve_ui_target", input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>>;
  async invoke(toolName: "scroll_and_tap_element", input: ScrollAndTapElementInput): Promise<ToolResult<ScrollAndTapElementData>>;
  async invoke(toolName: "install_app", input: InstallAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_js_debug_targets", input: ListJsDebugTargetsInput): Promise<ToolResult<ListJsDebugTargetsData>>;
  async invoke(toolName: "launch_app", input: LaunchAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_devices", input: ListDevicesInput): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  async invoke(toolName: "measure_android_performance", input: MeasureAndroidPerformanceInput): Promise<ToolResult<MeasureAndroidPerformanceData>>;
  async invoke(toolName: "measure_ios_performance", input: MeasureIosPerformanceInput): Promise<ToolResult<MeasureIosPerformanceData>>;
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
    input: CaptureJsConsoleLogsInput | CaptureJsNetworkEventsInput | CollectDebugEvidenceInput | CollectDiagnosticsInput | DescribeCapabilitiesInput | DoctorInput | GetCrashSignalsInput | GetLogsInput | InspectUiInput | QueryUiInput | ResolveUiTargetInput | ScrollAndResolveUiTargetInput | ScrollAndTapElementInput | InstallAppInput | ListJsDebugTargetsInput | LaunchAppInput | ListDevicesInput | MeasureAndroidPerformanceInput | MeasureIosPerformanceInput | StartSessionInput | RunFlowInput | ScreenshotInput | TapInput | TapElementInput | TerminateAppInput | TypeTextInput | TypeIntoElementInput | WaitForUiInput | EndSessionInput,
  ): Promise<
    | ToolResult<CaptureJsConsoleLogsData>
    | ToolResult<CaptureJsNetworkEventsData>
    | ToolResult<CollectDebugEvidenceData>
    | ToolResult<CollectDiagnosticsData>
    | ToolResult<DescribeCapabilitiesData>
    | ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>
    | ToolResult<GetCrashSignalsData>
    | ToolResult<GetLogsData>
    | ToolResult<ListJsDebugTargetsData>
    | ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>
    | ToolResult<MeasureAndroidPerformanceData>
    | ToolResult<MeasureIosPerformanceData>
    | ToolResult<Session>
    | ToolResult<QueryUiData>
    | ToolResult<ResolveUiTargetData>
    | ToolResult<ScrollAndResolveUiTargetData>
    | ToolResult<ScrollAndTapElementData>
    | ToolResult<TapElementData>
    | ToolResult<TypeIntoElementData>
    | ToolResult<WaitForUiData>
    | ToolResult
    | ToolResult<{ closed: boolean; endedAt: string }>
  > {
    if (toolName === "capture_js_console_logs") return this.tools.capture_js_console_logs(input as CaptureJsConsoleLogsInput);
    if (toolName === "capture_js_network_events") return this.tools.capture_js_network_events(input as CaptureJsNetworkEventsInput);
    if (toolName === "collect_debug_evidence") return this.tools.collect_debug_evidence(input as CollectDebugEvidenceInput);
    if (toolName === "collect_diagnostics") return this.tools.collect_diagnostics(input as CollectDiagnosticsInput);
    if (toolName === "describe_capabilities") return this.tools.describe_capabilities(input as DescribeCapabilitiesInput);
    if (toolName === "doctor") return this.tools.doctor(input as DoctorInput);
    if (toolName === "get_crash_signals") return this.tools.get_crash_signals(input as GetCrashSignalsInput);
    if (toolName === "get_logs") return this.tools.get_logs(input as GetLogsInput);
    if (toolName === "inspect_ui") return this.tools.inspect_ui(input as InspectUiInput);
    if (toolName === "query_ui") return this.tools.query_ui(input as QueryUiInput);
    if (toolName === "resolve_ui_target") return this.tools.resolve_ui_target(input as ResolveUiTargetInput);
    if (toolName === "scroll_and_resolve_ui_target") return this.tools.scroll_and_resolve_ui_target(input as ScrollAndResolveUiTargetInput);
    if (toolName === "scroll_and_tap_element") return this.tools.scroll_and_tap_element(input as ScrollAndTapElementInput);
    if (toolName === "install_app") return this.tools.install_app(input as InstallAppInput);
    if (toolName === "list_js_debug_targets") return this.tools.list_js_debug_targets(input as ListJsDebugTargetsInput);
    if (toolName === "launch_app") return this.tools.launch_app(input as LaunchAppInput);
    if (toolName === "list_devices") return this.tools.list_devices(input as ListDevicesInput);
    if (toolName === "measure_android_performance") return this.tools.measure_android_performance(input as MeasureAndroidPerformanceInput);
    if (toolName === "measure_ios_performance") return this.tools.measure_ios_performance(input as MeasureIosPerformanceInput);
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
