/**
 * Canonical tool name constants for the mobile-e2e-mcp server.
 *
 * Values must match MobileE2EMcpToolName (keyof MobileE2EMcpToolContractMap
 * in server.ts) exactly. MobileE2EMcpToolName is the authoritative source;
 * this constant provides consumer-friendly camelCase keys.
 *
 * If a tool is added to MobileE2EMcpToolContractMap, add it here too.
 */
export const TOOL_NAMES = {
  // Session lifecycle
  startSession: "start_session",
  endSession: "end_session",
  runFlow: "run_flow",
  describeCapabilities: "describe_capabilities",
  requestManualHandoff: "request_manual_handoff",
  doctor: "doctor",

  // Recording & replay
  startRecordSession: "start_record_session",
  getRecordSessionStatus: "get_record_session_status",
  endRecordSession: "end_record_session",
  cancelRecordSession: "cancel_record_session",
  exportSessionFlow: "export_session_flow",
  recordTaskFlow: "record_task_flow",
  replayLastStablePath: "replay_last_stable_path",
  replayCheckpointChain: "replay_checkpoint_chain",

  // Action & intent execution
  performActionWithEvidence: "perform_action_with_evidence",
  executeIntent: "execute_intent",
  completeTask: "complete_task",
  recoverToKnownState: "recover_to_known_state",

  // Failure intelligence
  explainLastFailure: "explain_last_failure",
  findSimilarFailures: "find_similar_failures",
  getActionOutcome: "get_action_outcome",
  rankFailureCandidates: "rank_failure_candidates",
  suggestKnownRemediation: "suggest_known_remediation",
  compareAgainstBaseline: "compare_against_baseline",
  compareVisualBaseline: "compare_visual_baseline",

  // Interruption handling
  detectInterruption: "detect_interruption",
  classifyInterruption: "classify_interruption",
  resolveInterruption: "resolve_interruption",
  resumeInterruptedAction: "resume_interrupted_action",

  // UI inspection
  inspectUi: "inspect_ui",
  queryUi: "query_ui",
  resolveUiTarget: "resolve_ui_target",
  waitForUi: "wait_for_ui",
  waitForUiStable: "wait_for_ui_stable",
  getScreenSummary: "get_screen_summary",
  getSessionState: "get_session_state",
  getPageContext: "get_page_context",

  // UI actions
  tap: "tap",
  tapElement: "tap_element",
  typeText: "type_text",
  typeIntoElement: "type_into_element",
  scrollAndResolveUiTarget: "scroll_and_resolve_ui_target",
  scrollOnly: "scroll_only",
  scrollAndTapElement: "scroll_and_tap_element",
  navigateBack: "navigate_back",

  // App lifecycle
  installApp: "install_app",
  launchApp: "launch_app",
  terminateApp: "terminate_app",
  resetAppState: "reset_app_state",

  // Diagnostics & evidence
  takeScreenshot: "take_screenshot",
  captureElementScreenshot: "capture_element_screenshot",
  recordScreen: "record_screen",
  getLogs: "get_logs",
  getCrashSignals: "get_crash_signals",
  collectDebugEvidence: "collect_debug_evidence",
  collectDiagnostics: "collect_diagnostics",
  measureAndroidPerformance: "measure_android_performance",
  measureIosPerformance: "measure_ios_performance",

  // JS debug targets (React Native / Expo)
  captureJsConsoleLogs: "capture_js_console_logs",
  captureJsNetworkEvents: "capture_js_network_events",
  listJsDebugTargets: "list_js_debug_targets",

  // Validation & network
  validateFlow: "validate_flow",
  probeNetworkReadiness: "probe_network_readiness",

  // Device discovery
  listDevices: "list_devices",
} as const;
