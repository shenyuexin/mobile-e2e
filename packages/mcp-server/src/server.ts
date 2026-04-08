import type {
  CancelRecordSessionData,
  CancelRecordSessionInput,
  CaptureJsConsoleLogsData,
  CaptureJsConsoleLogsInput,
  CaptureJsNetworkEventsData,
  CaptureJsNetworkEventsInput,
  ClassifyInterruptionData,
  ClassifyInterruptionInput,
  CollectDebugEvidenceData,
  CollectDebugEvidenceInput,
  CollectDiagnosticsData,
  CollectDiagnosticsInput,
  CompareAgainstBaselineData,
  CompareAgainstBaselineInput,
  CompleteTaskData,
  CompleteTaskInput,
  DescribeCapabilitiesData,
  DescribeCapabilitiesInput,
  DetectInterruptionData,
  DetectInterruptionInput,
  DeviceInfo,
  DoctorData,
  DoctorInput,
  ElementScreenshotData,
  ElementScreenshotInput,
  EndRecordSessionData,
  EndRecordSessionInput,
  EndSessionInput,
  ExecuteIntentData,
  ExecuteIntentInput,
  ExplainLastFailureData,
  ExplainLastFailureInput,
  ExportSessionFlowData,
  ExportSessionFlowInput,
  FindSimilarFailuresData,
  FindSimilarFailuresInput,
  GetActionOutcomeData,
  GetActionOutcomeInput,
  GetCrashSignalsData,
  GetCrashSignalsInput,
  GetLogsData,
  GetLogsInput,
  GetRecordSessionStatusInput,
  GetScreenSummaryData,
  GetScreenSummaryInput,
  GetSessionStateData,
  GetSessionStateInput,
  InspectUiData,
  InspectUiInput,
  InstallAppData,
  InstallAppInput,
  LaunchAppData,
  LaunchAppInput,
  ListDevicesInput,
  ListJsDebugTargetsData,
  ListJsDebugTargetsInput,
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
  RecordSessionStatusData,
  RecordTaskFlowData,
  RecordTaskFlowInput,
  RequestManualHandoffData,
  RequestManualHandoffInput,
  RecoverToKnownStateData,
  RecoverToKnownStateInput,
  ReplayLastStablePathData,
  ReplayLastStablePathInput,
  ReplayCheckpointChainInput,
  ReplayCheckpointChainData,
  ResolveInterruptionData,
  ResolveInterruptionInput,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  ResetAppStateData,
  ResetAppStateInput,
  ResumeInterruptedActionData,
  ResumeInterruptedActionInput,
  RunFlowData,
  RunFlowInput,
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
  ScrollAndTapElementData,
  ScrollAndTapElementInput,
  ScreenshotData,
  ScreenshotInput,
  Session,
  StartRecordSessionData,
  StartRecordSessionInput,
  StartSessionInput,
  SuggestKnownRemediationData,
  SuggestKnownRemediationInput,
  TapData,
  TapElementData,
  TapElementInput,
  TapInput,
  TerminateAppData,
  TerminateAppInput,
  ToolResult,
  TypeIntoElementData,
  TypeIntoElementInput,
  TypeTextData,
  TypeTextInput,
  ValidateFlowData,
  ValidateFlowInput,
  VisualDiffData,
  VisualDiffInput,
  WaitForUiData,
  WaitForUiInput,
  EndSessionData,
  ListDevicesData,
} from "@mobile-e2e-mcp/contracts";

interface ToolContract<TInput, TOutputData> {
  input: TInput;
  outputData: TOutputData;
}

export interface MobileE2EMcpToolContractMap {
  capture_js_console_logs: ToolContract<CaptureJsConsoleLogsInput, CaptureJsConsoleLogsData>;
  capture_js_network_events: ToolContract<CaptureJsNetworkEventsInput, CaptureJsNetworkEventsData>;
  capture_element_screenshot: ToolContract<ElementScreenshotInput, ElementScreenshotData>;
  compare_against_baseline: ToolContract<CompareAgainstBaselineInput, CompareAgainstBaselineData>;
  compare_visual_baseline: ToolContract<VisualDiffInput, VisualDiffData>;
  collect_debug_evidence: ToolContract<CollectDebugEvidenceInput, CollectDebugEvidenceData>;
  collect_diagnostics: ToolContract<CollectDiagnosticsInput, CollectDiagnosticsData>;
  detect_interruption: ToolContract<DetectInterruptionInput, DetectInterruptionData>;
  classify_interruption: ToolContract<ClassifyInterruptionInput, ClassifyInterruptionData>;
  describe_capabilities: ToolContract<DescribeCapabilitiesInput, DescribeCapabilitiesData>;
  doctor: ToolContract<DoctorInput, DoctorData>;
  execute_intent: ToolContract<ExecuteIntentInput, ExecuteIntentData>;
  complete_task: ToolContract<CompleteTaskInput, CompleteTaskData>;
  start_record_session: ToolContract<StartRecordSessionInput, StartRecordSessionData>;
  get_record_session_status: ToolContract<GetRecordSessionStatusInput, RecordSessionStatusData>;
  end_record_session: ToolContract<EndRecordSessionInput, EndRecordSessionData>;
  cancel_record_session: ToolContract<CancelRecordSessionInput, CancelRecordSessionData>;
  export_session_flow: ToolContract<ExportSessionFlowInput, ExportSessionFlowData>;
  record_task_flow: ToolContract<RecordTaskFlowInput, RecordTaskFlowData>;
  request_manual_handoff: ToolContract<RequestManualHandoffInput, RequestManualHandoffData>;
  explain_last_failure: ToolContract<ExplainLastFailureInput, ExplainLastFailureData>;
  find_similar_failures: ToolContract<FindSimilarFailuresInput, FindSimilarFailuresData>;
  get_action_outcome: ToolContract<GetActionOutcomeInput, GetActionOutcomeData>;
  get_crash_signals: ToolContract<GetCrashSignalsInput, GetCrashSignalsData>;
  get_logs: ToolContract<GetLogsInput, GetLogsData>;
  get_screen_summary: ToolContract<GetScreenSummaryInput, GetScreenSummaryData>;
  get_session_state: ToolContract<GetSessionStateInput, GetSessionStateData>;
  inspect_ui: ToolContract<InspectUiInput, InspectUiData>;
  query_ui: ToolContract<QueryUiInput, QueryUiData>;
  recover_to_known_state: ToolContract<RecoverToKnownStateInput, RecoverToKnownStateData>;
  resolve_interruption: ToolContract<ResolveInterruptionInput, ResolveInterruptionData>;
  resume_interrupted_action: ToolContract<ResumeInterruptedActionInput, ResumeInterruptedActionData>;
  resolve_ui_target: ToolContract<ResolveUiTargetInput, ResolveUiTargetData>;
  replay_last_stable_path: ToolContract<ReplayLastStablePathInput, ReplayLastStablePathData>;
  replay_checkpoint_chain: ToolContract<ReplayCheckpointChainInput, ReplayCheckpointChainData>;
  scroll_and_resolve_ui_target: ToolContract<ScrollAndResolveUiTargetInput, ScrollAndResolveUiTargetData>;
  scroll_and_tap_element: ToolContract<ScrollAndTapElementInput, ScrollAndTapElementData>;
  install_app: ToolContract<InstallAppInput, InstallAppData>;
  list_js_debug_targets: ToolContract<ListJsDebugTargetsInput, ListJsDebugTargetsData>;
  launch_app: ToolContract<LaunchAppInput, LaunchAppData>;
  list_devices: ToolContract<ListDevicesInput, ListDevicesData>;
  measure_android_performance: ToolContract<MeasureAndroidPerformanceInput, MeasureAndroidPerformanceData>;
  measure_ios_performance: ToolContract<MeasureIosPerformanceInput, MeasureIosPerformanceData>;
  perform_action_with_evidence: ToolContract<PerformActionWithEvidenceInput, PerformActionWithEvidenceData>;
  rank_failure_candidates: ToolContract<RankFailureCandidatesInput, RankFailureCandidatesData>;
  record_screen: ToolContract<RecordScreenInput, RecordScreenData>;
  start_session: ToolContract<StartSessionInput, Session>;
  reset_app_state: ToolContract<ResetAppStateInput, ResetAppStateData>;
  run_flow: ToolContract<RunFlowInput, RunFlowData>;
  take_screenshot: ToolContract<ScreenshotInput, ScreenshotData>;
  suggest_known_remediation: ToolContract<SuggestKnownRemediationInput, SuggestKnownRemediationData>;
  tap: ToolContract<TapInput, TapData>;
  tap_element: ToolContract<TapElementInput, TapElementData>;
  terminate_app: ToolContract<TerminateAppInput, TerminateAppData>;
  type_text: ToolContract<TypeTextInput, TypeTextData>;
  type_into_element: ToolContract<TypeIntoElementInput, TypeIntoElementData>;
  validate_flow: ToolContract<ValidateFlowInput, ValidateFlowData>;
  wait_for_ui: ToolContract<WaitForUiInput, WaitForUiData>;
  end_session: ToolContract<EndSessionInput, EndSessionData>;
}

export type MobileE2EMcpToolName = keyof MobileE2EMcpToolContractMap;

type ToolInput<TName extends MobileE2EMcpToolName> = MobileE2EMcpToolContractMap[TName]["input"];
type ToolOutputData<TName extends MobileE2EMcpToolName> = MobileE2EMcpToolContractMap[TName]["outputData"];
type ToolHandler<TName extends MobileE2EMcpToolName> = (input: ToolInput<TName>) => Promise<ToolResult<ToolOutputData<TName>>>;

export type MobileE2EMcpToolRegistry = {
  [TName in MobileE2EMcpToolName]: ToolHandler<TName>;
};

export class MobileE2EMcpServer {
  constructor(private readonly tools: MobileE2EMcpToolRegistry) {}

  listTools(): MobileE2EMcpToolName[] {
    return Object.keys(this.tools) as MobileE2EMcpToolName[];
  }

  async invoke<TName extends MobileE2EMcpToolName>(
    toolName: TName,
    input: ToolInput<TName>,
  ): Promise<ToolResult<ToolOutputData<TName>>> {
    return this.tools[toolName](input);
  }
}
