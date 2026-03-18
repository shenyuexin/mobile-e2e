import type {
  CaptureJsConsoleLogsData,
  CaptureJsConsoleLogsInput,
  CaptureJsNetworkEventsData,
  CaptureJsNetworkEventsInput,
  CompareAgainstBaselineData,
  CompareAgainstBaselineInput,
  CollectDebugEvidenceData,
  CollectDebugEvidenceInput,
  CollectDiagnosticsData,
  CollectDiagnosticsInput,
  ClassifyInterruptionData,
  ClassifyInterruptionInput,
  DetectInterruptionData,
  DetectInterruptionInput,
  DescribeCapabilitiesData,
  DescribeCapabilitiesInput,
  DeviceInfo,
  DoctorData,
  DoctorCheck,
  DoctorInput,
  EndSessionInput,
  ExecuteIntentData,
  ExecuteIntentInput,
  ExplainLastFailureData,
  ExplainLastFailureInput,
  CompleteTaskData,
  CompleteTaskInput,
  ExportSessionFlowData,
  ExportSessionFlowInput,
  FindSimilarFailuresData,
  FindSimilarFailuresInput,
  GetActionOutcomeData,
  GetActionOutcomeInput,
  GetScreenSummaryData,
  GetScreenSummaryInput,
  GetSessionStateData,
  GetSessionStateInput,
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
  PerformActionWithEvidenceData,
  PerformActionWithEvidenceInput,
  QueryUiData,
  QueryUiInput,
  RankFailureCandidatesData,
  RankFailureCandidatesInput,
  RecordScreenData,
  RecordScreenInput,
  RecordTaskFlowData,
  RecordTaskFlowInput,
  RecoverToKnownStateData,
  RecoverToKnownStateInput,
  ResolveInterruptionData,
  ResolveInterruptionInput,
  ResetAppStateData,
  ResetAppStateInput,
  ResumeInterruptedActionData,
  ResumeInterruptedActionInput,
  ReplayLastStablePathData,
  ReplayLastStablePathInput,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  RunFlowInput,
  ScreenshotInput,
  SuggestKnownRemediationData,
  SuggestKnownRemediationInput,
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
  compare_against_baseline: (input: CompareAgainstBaselineInput) => Promise<ToolResult<CompareAgainstBaselineData>>;
  collect_debug_evidence: (input: CollectDebugEvidenceInput) => Promise<ToolResult<CollectDebugEvidenceData>>;
  collect_diagnostics: (input: CollectDiagnosticsInput) => Promise<ToolResult<CollectDiagnosticsData>>;
  detect_interruption: (input: DetectInterruptionInput) => Promise<ToolResult<DetectInterruptionData>>;
  classify_interruption: (input: ClassifyInterruptionInput) => Promise<ToolResult<ClassifyInterruptionData>>;
  describe_capabilities: (input: DescribeCapabilitiesInput) => Promise<ToolResult<DescribeCapabilitiesData>>;
  doctor: (input: DoctorInput) => Promise<ToolResult<DoctorData>>;
  execute_intent: (input: ExecuteIntentInput) => Promise<ToolResult<ExecuteIntentData>>;
  complete_task: (input: CompleteTaskInput) => Promise<ToolResult<CompleteTaskData>>;
  export_session_flow: (input: ExportSessionFlowInput) => Promise<ToolResult<ExportSessionFlowData>>;
  record_task_flow: (input: RecordTaskFlowInput) => Promise<ToolResult<RecordTaskFlowData>>;
  explain_last_failure: (input: ExplainLastFailureInput) => Promise<ToolResult<ExplainLastFailureData>>;
  find_similar_failures: (input: FindSimilarFailuresInput) => Promise<ToolResult<FindSimilarFailuresData>>;
  get_action_outcome: (input: GetActionOutcomeInput) => Promise<ToolResult<GetActionOutcomeData>>;
  get_crash_signals: (input: GetCrashSignalsInput) => Promise<ToolResult<GetCrashSignalsData>>;
  get_logs: (input: GetLogsInput) => Promise<ToolResult<GetLogsData>>;
  get_screen_summary: (input: GetScreenSummaryInput) => Promise<ToolResult<GetScreenSummaryData>>;
  get_session_state: (input: GetSessionStateInput) => Promise<ToolResult<GetSessionStateData>>;
  inspect_ui: (input: InspectUiInput) => Promise<ToolResult>;
  query_ui: (input: QueryUiInput) => Promise<ToolResult<QueryUiData>>;
  recover_to_known_state: (input: RecoverToKnownStateInput) => Promise<ToolResult<RecoverToKnownStateData>>;
  resolve_interruption: (input: ResolveInterruptionInput) => Promise<ToolResult<ResolveInterruptionData>>;
  resume_interrupted_action: (input: ResumeInterruptedActionInput) => Promise<ToolResult<ResumeInterruptedActionData>>;
  resolve_ui_target: (input: ResolveUiTargetInput) => Promise<ToolResult<ResolveUiTargetData>>;
  replay_last_stable_path: (input: ReplayLastStablePathInput) => Promise<ToolResult<ReplayLastStablePathData>>;
  scroll_and_resolve_ui_target: (input: ScrollAndResolveUiTargetInput) => Promise<ToolResult<ScrollAndResolveUiTargetData>>;
  scroll_and_tap_element: (input: ScrollAndTapElementInput) => Promise<ToolResult<ScrollAndTapElementData>>;
  install_app: (input: InstallAppInput) => Promise<ToolResult>;
  list_js_debug_targets: (input: ListJsDebugTargetsInput) => Promise<ToolResult<ListJsDebugTargetsData>>;
  launch_app: (input: LaunchAppInput) => Promise<ToolResult>;
  list_devices: (input: ListDevicesInput) => Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  measure_android_performance: (input: MeasureAndroidPerformanceInput) => Promise<ToolResult<MeasureAndroidPerformanceData>>;
  measure_ios_performance: (input: MeasureIosPerformanceInput) => Promise<ToolResult<MeasureIosPerformanceData>>;
  perform_action_with_evidence: (input: PerformActionWithEvidenceInput) => Promise<ToolResult<PerformActionWithEvidenceData>>;
  rank_failure_candidates: (input: RankFailureCandidatesInput) => Promise<ToolResult<RankFailureCandidatesData>>;
  record_screen: (input: RecordScreenInput) => Promise<ToolResult<RecordScreenData>>;
  reset_app_state: (input: ResetAppStateInput) => Promise<ToolResult<ResetAppStateData>>;
  start_session: (input: StartSessionInput) => Promise<ToolResult<Session>>;
  run_flow: (input: RunFlowInput) => Promise<ToolResult>;
  take_screenshot: (input: ScreenshotInput) => Promise<ToolResult>;
  suggest_known_remediation: (input: SuggestKnownRemediationInput) => Promise<ToolResult<SuggestKnownRemediationData>>;
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
    return ["capture_js_console_logs", "capture_js_network_events", "compare_against_baseline", "collect_debug_evidence", "collect_diagnostics", "detect_interruption", "classify_interruption", "describe_capabilities", "doctor", "execute_intent", "complete_task", "export_session_flow", "record_task_flow", "explain_last_failure", "find_similar_failures", "get_action_outcome", "get_crash_signals", "get_logs", "get_screen_summary", "get_session_state", "inspect_ui", "query_ui", "rank_failure_candidates", "record_screen", "recover_to_known_state", "resolve_interruption", "resume_interrupted_action", "replay_last_stable_path", "reset_app_state", "resolve_ui_target", "scroll_and_resolve_ui_target", "scroll_and_tap_element", "install_app", "list_js_debug_targets", "launch_app", "list_devices", "measure_android_performance", "measure_ios_performance", "perform_action_with_evidence", "start_session", "run_flow", "suggest_known_remediation", "take_screenshot", "tap", "tap_element", "terminate_app", "type_text", "type_into_element", "wait_for_ui", "end_session"];
  }

  async invoke(toolName: "capture_js_console_logs", input: CaptureJsConsoleLogsInput): Promise<ToolResult<CaptureJsConsoleLogsData>>;
  async invoke(toolName: "capture_js_network_events", input: CaptureJsNetworkEventsInput): Promise<ToolResult<CaptureJsNetworkEventsData>>;
  async invoke(toolName: "compare_against_baseline", input: CompareAgainstBaselineInput): Promise<ToolResult<CompareAgainstBaselineData>>;
  async invoke(toolName: "collect_debug_evidence", input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>>;
  async invoke(toolName: "collect_diagnostics", input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>>;
  async invoke(toolName: "detect_interruption", input: DetectInterruptionInput): Promise<ToolResult<DetectInterruptionData>>;
  async invoke(toolName: "classify_interruption", input: ClassifyInterruptionInput): Promise<ToolResult<ClassifyInterruptionData>>;
  async invoke(toolName: "describe_capabilities", input: DescribeCapabilitiesInput): Promise<ToolResult<DescribeCapabilitiesData>>;
  async invoke(toolName: "doctor", input: DoctorInput): Promise<ToolResult<DoctorData>>;
  async invoke(toolName: "execute_intent", input: ExecuteIntentInput): Promise<ToolResult<ExecuteIntentData>>;
  async invoke(toolName: "complete_task", input: CompleteTaskInput): Promise<ToolResult<CompleteTaskData>>;
  async invoke(toolName: "export_session_flow", input: ExportSessionFlowInput): Promise<ToolResult<ExportSessionFlowData>>;
  async invoke(toolName: "record_task_flow", input: RecordTaskFlowInput): Promise<ToolResult<RecordTaskFlowData>>;
  async invoke(toolName: "explain_last_failure", input: ExplainLastFailureInput): Promise<ToolResult<ExplainLastFailureData>>;
  async invoke(toolName: "find_similar_failures", input: FindSimilarFailuresInput): Promise<ToolResult<FindSimilarFailuresData>>;
  async invoke(toolName: "get_action_outcome", input: GetActionOutcomeInput): Promise<ToolResult<GetActionOutcomeData>>;
  async invoke(toolName: "get_crash_signals", input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>>;
  async invoke(toolName: "get_logs", input: GetLogsInput): Promise<ToolResult<GetLogsData>>;
  async invoke(toolName: "get_screen_summary", input: GetScreenSummaryInput): Promise<ToolResult<GetScreenSummaryData>>;
  async invoke(toolName: "get_session_state", input: GetSessionStateInput): Promise<ToolResult<GetSessionStateData>>;
  async invoke(toolName: "inspect_ui", input: InspectUiInput): Promise<ToolResult>;
  async invoke(toolName: "query_ui", input: QueryUiInput): Promise<ToolResult<QueryUiData>>;
  async invoke(toolName: "recover_to_known_state", input: RecoverToKnownStateInput): Promise<ToolResult<RecoverToKnownStateData>>;
  async invoke(toolName: "resolve_interruption", input: ResolveInterruptionInput): Promise<ToolResult<ResolveInterruptionData>>;
  async invoke(toolName: "resume_interrupted_action", input: ResumeInterruptedActionInput): Promise<ToolResult<ResumeInterruptedActionData>>;
  async invoke(toolName: "resolve_ui_target", input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>>;
  async invoke(toolName: "replay_last_stable_path", input: ReplayLastStablePathInput): Promise<ToolResult<ReplayLastStablePathData>>;
  async invoke(toolName: "scroll_and_resolve_ui_target", input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>>;
  async invoke(toolName: "scroll_and_tap_element", input: ScrollAndTapElementInput): Promise<ToolResult<ScrollAndTapElementData>>;
  async invoke(toolName: "install_app", input: InstallAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_js_debug_targets", input: ListJsDebugTargetsInput): Promise<ToolResult<ListJsDebugTargetsData>>;
  async invoke(toolName: "launch_app", input: LaunchAppInput): Promise<ToolResult>;
  async invoke(toolName: "list_devices", input: ListDevicesInput): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>>;
  async invoke(toolName: "measure_android_performance", input: MeasureAndroidPerformanceInput): Promise<ToolResult<MeasureAndroidPerformanceData>>;
  async invoke(toolName: "measure_ios_performance", input: MeasureIosPerformanceInput): Promise<ToolResult<MeasureIosPerformanceData>>;
  async invoke(toolName: "perform_action_with_evidence", input: PerformActionWithEvidenceInput): Promise<ToolResult<PerformActionWithEvidenceData>>;
  async invoke(toolName: "rank_failure_candidates", input: RankFailureCandidatesInput): Promise<ToolResult<RankFailureCandidatesData>>;
  async invoke(toolName: "record_screen", input: RecordScreenInput): Promise<ToolResult<RecordScreenData>>;
  async invoke(toolName: "start_session", input: StartSessionInput): Promise<ToolResult<Session>>;
  async invoke(toolName: "reset_app_state", input: ResetAppStateInput): Promise<ToolResult<ResetAppStateData>>;
  async invoke(toolName: "run_flow", input: RunFlowInput): Promise<ToolResult>;
  async invoke(toolName: "suggest_known_remediation", input: SuggestKnownRemediationInput): Promise<ToolResult<SuggestKnownRemediationData>>;
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
    input: CaptureJsConsoleLogsInput | CaptureJsNetworkEventsInput | CompareAgainstBaselineInput | CollectDebugEvidenceInput | CollectDiagnosticsInput | DetectInterruptionInput | ClassifyInterruptionInput | DescribeCapabilitiesInput | DoctorInput | ExecuteIntentInput | CompleteTaskInput | ExportSessionFlowInput | RecordTaskFlowInput | ExplainLastFailureInput | FindSimilarFailuresInput | GetActionOutcomeInput | GetCrashSignalsInput | GetLogsInput | GetScreenSummaryInput | GetSessionStateInput | InspectUiInput | QueryUiInput | RankFailureCandidatesInput | RecordScreenInput | RecoverToKnownStateInput | ResolveInterruptionInput | ResumeInterruptedActionInput | ReplayLastStablePathInput | ResetAppStateInput | ResolveUiTargetInput | ScrollAndResolveUiTargetInput | ScrollAndTapElementInput | InstallAppInput | ListJsDebugTargetsInput | LaunchAppInput | ListDevicesInput | MeasureAndroidPerformanceInput | MeasureIosPerformanceInput | PerformActionWithEvidenceInput | StartSessionInput | RunFlowInput | ScreenshotInput | SuggestKnownRemediationInput | TapInput | TapElementInput | TerminateAppInput | TypeTextInput | TypeIntoElementInput | WaitForUiInput | EndSessionInput,
  ): Promise<
      | ToolResult<CaptureJsConsoleLogsData>
      | ToolResult<CaptureJsNetworkEventsData>
      | ToolResult<CompareAgainstBaselineData>
      | ToolResult<CollectDebugEvidenceData>
      | ToolResult<CollectDiagnosticsData>
      | ToolResult<DetectInterruptionData>
      | ToolResult<ClassifyInterruptionData>
      | ToolResult<DescribeCapabilitiesData>
      | ToolResult<DoctorData>
      | ToolResult<ExecuteIntentData>
      | ToolResult<CompleteTaskData>
      | ToolResult<ExportSessionFlowData>
      | ToolResult<RecordTaskFlowData>
      | ToolResult<ExplainLastFailureData>
      | ToolResult<FindSimilarFailuresData>
      | ToolResult<GetActionOutcomeData>
      | ToolResult<GetCrashSignalsData>
      | ToolResult<GetLogsData>
     | ToolResult<GetScreenSummaryData>
     | ToolResult<GetSessionStateData>
     | ToolResult<ListJsDebugTargetsData>
    | ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>
      | ToolResult<MeasureAndroidPerformanceData>
      | ToolResult<MeasureIosPerformanceData>
      | ToolResult<PerformActionWithEvidenceData>
      | ToolResult<RankFailureCandidatesData>
      | ToolResult<RecordScreenData>
      | ToolResult<RecoverToKnownStateData>
      | ToolResult<ResolveInterruptionData>
      | ToolResult<ResumeInterruptedActionData>
      | ToolResult<ReplayLastStablePathData>
      | ToolResult<ResetAppStateData>
      | ToolResult<Session>
      | ToolResult<SuggestKnownRemediationData>
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
    if (toolName === "compare_against_baseline") return this.tools.compare_against_baseline(input as CompareAgainstBaselineInput);
    if (toolName === "collect_debug_evidence") return this.tools.collect_debug_evidence(input as CollectDebugEvidenceInput);
    if (toolName === "collect_diagnostics") return this.tools.collect_diagnostics(input as CollectDiagnosticsInput);
    if (toolName === "detect_interruption") return this.tools.detect_interruption(input as DetectInterruptionInput);
    if (toolName === "classify_interruption") return this.tools.classify_interruption(input as ClassifyInterruptionInput);
    if (toolName === "describe_capabilities") return this.tools.describe_capabilities(input as DescribeCapabilitiesInput);
    if (toolName === "doctor") return this.tools.doctor(input as DoctorInput);
    if (toolName === "execute_intent") return this.tools.execute_intent(input as ExecuteIntentInput);
    if (toolName === "complete_task") return this.tools.complete_task(input as CompleteTaskInput);
    if (toolName === "export_session_flow") return this.tools.export_session_flow(input as ExportSessionFlowInput);
    if (toolName === "record_task_flow") return this.tools.record_task_flow(input as RecordTaskFlowInput);
    if (toolName === "explain_last_failure") return this.tools.explain_last_failure(input as ExplainLastFailureInput);
    if (toolName === "find_similar_failures") return this.tools.find_similar_failures(input as FindSimilarFailuresInput);
    if (toolName === "get_action_outcome") return this.tools.get_action_outcome(input as GetActionOutcomeInput);
    if (toolName === "get_crash_signals") return this.tools.get_crash_signals(input as GetCrashSignalsInput);
    if (toolName === "get_logs") return this.tools.get_logs(input as GetLogsInput);
    if (toolName === "get_screen_summary") return this.tools.get_screen_summary(input as GetScreenSummaryInput);
    if (toolName === "get_session_state") return this.tools.get_session_state(input as GetSessionStateInput);
    if (toolName === "inspect_ui") return this.tools.inspect_ui(input as InspectUiInput);
    if (toolName === "query_ui") return this.tools.query_ui(input as QueryUiInput);
    if (toolName === "recover_to_known_state") return this.tools.recover_to_known_state(input as RecoverToKnownStateInput);
    if (toolName === "resolve_interruption") return this.tools.resolve_interruption(input as ResolveInterruptionInput);
    if (toolName === "resume_interrupted_action") return this.tools.resume_interrupted_action(input as ResumeInterruptedActionInput);
    if (toolName === "resolve_ui_target") return this.tools.resolve_ui_target(input as ResolveUiTargetInput);
    if (toolName === "replay_last_stable_path") return this.tools.replay_last_stable_path(input as ReplayLastStablePathInput);
    if (toolName === "scroll_and_resolve_ui_target") return this.tools.scroll_and_resolve_ui_target(input as ScrollAndResolveUiTargetInput);
    if (toolName === "scroll_and_tap_element") return this.tools.scroll_and_tap_element(input as ScrollAndTapElementInput);
    if (toolName === "install_app") return this.tools.install_app(input as InstallAppInput);
    if (toolName === "list_js_debug_targets") return this.tools.list_js_debug_targets(input as ListJsDebugTargetsInput);
    if (toolName === "launch_app") return this.tools.launch_app(input as LaunchAppInput);
    if (toolName === "list_devices") return this.tools.list_devices(input as ListDevicesInput);
    if (toolName === "measure_android_performance") return this.tools.measure_android_performance(input as MeasureAndroidPerformanceInput);
    if (toolName === "measure_ios_performance") return this.tools.measure_ios_performance(input as MeasureIosPerformanceInput);
    if (toolName === "perform_action_with_evidence") return this.tools.perform_action_with_evidence(input as PerformActionWithEvidenceInput);
    if (toolName === "rank_failure_candidates") return this.tools.rank_failure_candidates(input as RankFailureCandidatesInput);
    if (toolName === "record_screen") return this.tools.record_screen(input as RecordScreenInput);
    if (toolName === "start_session") return this.tools.start_session(input as StartSessionInput);
    if (toolName === "reset_app_state") return this.tools.reset_app_state(input as ResetAppStateInput);
    if (toolName === "run_flow") return this.tools.run_flow(input as RunFlowInput);
    if (toolName === "suggest_known_remediation") return this.tools.suggest_known_remediation(input as SuggestKnownRemediationInput);
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
