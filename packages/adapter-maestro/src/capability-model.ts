import type { CapabilityGroup, CapabilityProfile, CapabilitySupportLevel, Platform, RunnerProfile, ToolCapability } from "@mobile-e2e-mcp/contracts";

const FULL: CapabilitySupportLevel = "full";
const PARTIAL: CapabilitySupportLevel = "partial";

function buildToolCapability(toolName: string, supportLevel: CapabilitySupportLevel, note: string, requiresSession = true): ToolCapability {
  return { toolName, supportLevel, note, requiresSession };
}

function buildAndroidToolCapabilities(): ToolCapability[] {
  return [
    buildToolCapability("collect_debug_evidence", FULL, "Android debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability("describe_capabilities", FULL, "Capability discovery is fully supported for Android sessions and devices.", false),
    buildToolCapability("collect_diagnostics", FULL, "Android diagnostics collection is supported through adb bugreport capture."),
    buildToolCapability("doctor", FULL, "Environment and device readiness checks are fully supported.", false),
    buildToolCapability("get_crash_signals", FULL, "Android crash and ANR signal capture is supported."),
    buildToolCapability("get_logs", FULL, "Android logcat capture is supported."),
    buildToolCapability("inspect_ui", FULL, "Android UI hierarchy capture is fully supported."),
    buildToolCapability("query_ui", FULL, "Android UI query filtering is fully supported."),
    buildToolCapability("resolve_ui_target", FULL, "Android target resolution is fully supported."),
    buildToolCapability("scroll_and_resolve_ui_target", FULL, "Android scroll-assisted target resolution is fully supported."),
    buildToolCapability("install_app", FULL, "Android app installation is supported."),
    buildToolCapability("launch_app", FULL, "Android app launch is supported."),
    buildToolCapability("list_devices", FULL, "Android device discovery is supported.", false),
    buildToolCapability("start_session", FULL, "Android session initialization is supported.", false),
    buildToolCapability("run_flow", FULL, "Android flow execution is supported."),
    buildToolCapability("take_screenshot", FULL, "Android screenshot capture is supported."),
    buildToolCapability("tap", FULL, "Android coordinate tap is supported."),
    buildToolCapability("tap_element", FULL, "Android element tap is supported after resolution."),
    buildToolCapability("terminate_app", FULL, "Android app termination is supported."),
    buildToolCapability("type_text", FULL, "Android text input is supported."),
    buildToolCapability("type_into_element", FULL, "Android element text input is supported after resolution."),
    buildToolCapability("wait_for_ui", FULL, "Android UI polling is supported."),
    buildToolCapability("end_session", FULL, "Android session shutdown is supported."),
  ];
}

function buildIosToolCapabilities(): ToolCapability[] {
  return [
    buildToolCapability("collect_debug_evidence", FULL, "iOS simulator debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability("describe_capabilities", FULL, "Capability discovery is fully supported for iOS sessions and simulators.", false),
    buildToolCapability("collect_diagnostics", FULL, "iOS simulator diagnostics bundle capture is supported."),
    buildToolCapability("doctor", FULL, "Environment and simulator readiness checks are fully supported.", false),
    buildToolCapability("get_crash_signals", FULL, "iOS simulator crash manifest capture is supported."),
    buildToolCapability("get_logs", FULL, "iOS simulator log capture is supported."),
    buildToolCapability("inspect_ui", PARTIAL, "iOS can capture hierarchy artifacts through idb, but downstream query and action parity remains partial."),
    buildToolCapability("query_ui", PARTIAL, "iOS query_ui returns partial/unsupported-style results and does not match Android parity."),
    buildToolCapability("resolve_ui_target", PARTIAL, "iOS target resolution is discovery-only today and not Android-equivalent."),
    buildToolCapability("scroll_and_resolve_ui_target", PARTIAL, "iOS scroll-assisted target resolution is not implemented beyond partial discovery semantics."),
    buildToolCapability("install_app", FULL, "iOS simulator app installation is supported."),
    buildToolCapability("launch_app", FULL, "iOS simulator app launch is supported."),
    buildToolCapability("list_devices", FULL, "iOS simulator discovery is supported.", false),
    buildToolCapability("start_session", FULL, "iOS session initialization is supported.", false),
    buildToolCapability("run_flow", FULL, "iOS flow execution is supported, subject to current runner-profile constraints."),
    buildToolCapability("take_screenshot", FULL, "iOS simulator screenshot capture is supported."),
    buildToolCapability("tap", PARTIAL, "Direct iOS tap remains partial compared with Android coordinate actions."),
    buildToolCapability("tap_element", PARTIAL, "iOS element tap remains partial because live target resolution is not implemented."),
    buildToolCapability("terminate_app", FULL, "iOS simulator app termination is supported."),
    buildToolCapability("type_text", PARTIAL, "Direct iOS text input remains partial compared with Android."),
    buildToolCapability("type_into_element", PARTIAL, "iOS element text input remains partial because live target resolution is not implemented."),
    buildToolCapability("wait_for_ui", PARTIAL, "iOS wait_for_ui does not yet perform active polling beyond partial inspect semantics."),
    buildToolCapability("end_session", FULL, "iOS session shutdown is supported."),
  ];
}

function summarizeGroup(toolCapabilities: ToolCapability[], groupName: string, toolNames: string[], note?: string): CapabilityGroup {
  const levels = toolNames.map((toolName) => toolCapabilities.find((tool) => tool.toolName === toolName)?.supportLevel ?? "unsupported");
  const supportLevel = levels.every((level) => level === FULL) ? FULL : levels.some((level) => level === PARTIAL || level === FULL) ? PARTIAL : "unsupported";
  return { groupName, supportLevel, toolNames, note };
}

export function buildCapabilityProfile(platform: Platform, runnerProfile: RunnerProfile | null = null): CapabilityProfile {
  const toolCapabilities = platform === "android" ? buildAndroidToolCapabilities() : buildIosToolCapabilities();

  return {
    platform,
    runnerProfile,
    toolCapabilities,
    groups: [
      summarizeGroup(toolCapabilities, "session_management", ["describe_capabilities", "start_session", "run_flow", "end_session"], "Session lifecycle and capability discovery layer."),
      summarizeGroup(toolCapabilities, "app_lifecycle", ["install_app", "launch_app", "terminate_app"], "Install, launch, and terminate application workflows."),
      summarizeGroup(toolCapabilities, "artifacts_and_diagnostics", ["take_screenshot", "get_logs", "get_crash_signals", "collect_debug_evidence", "collect_diagnostics"], "Evidence capture and diagnostics collection tools."),
      summarizeGroup(toolCapabilities, "ui_inspection", ["inspect_ui", "query_ui", "resolve_ui_target", "wait_for_ui", "scroll_and_resolve_ui_target"], "Hierarchy capture, querying, target resolution, and wait logic."),
      summarizeGroup(toolCapabilities, "ui_actions", ["tap", "tap_element", "type_text", "type_into_element"], "Coordinate and element-level UI action tooling."),
    ],
  };
}
