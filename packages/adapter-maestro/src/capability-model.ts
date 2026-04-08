import { DEFAULT_OCR_FALLBACK_POLICY } from "@mobile-e2e-mcp/adapter-vision";
import type { CapabilityGroup, CapabilityProfile, CapabilitySupportLevel, Platform, RunnerProfile, SupportPromotionGate, ToolCapability } from "@mobile-e2e-mcp/contracts";
import { buildOcrHostSupportSummary } from "./toolchain-runtime.js";

const FULL: CapabilitySupportLevel = "full";
const CONDITIONAL: CapabilitySupportLevel = "conditional";
const PARTIAL: CapabilitySupportLevel = "partial";
const UNSUPPORTED: CapabilitySupportLevel = "unsupported";

export const IOS_CONDITIONAL_TOOL_FRONTIER = [
  "capture_js_console_logs",
  "capture_js_network_events",
  "measure_ios_performance",
  "inspect_ui",
  "reset_app_state",
  "start_record_session",
  "get_record_session_status",
  "end_record_session",
  "cancel_record_session",
  "record_screen",
  "tap",
  "tap_element",
  "type_text",
  "type_into_element",
] as const;

export const IOS_CONDITIONAL_GROUP_FRONTIER = [
  "app_lifecycle",
  "recording_and_replay",
  "artifacts_and_diagnostics",
  "ui_inspection",
  "ui_actions",
] as const;

const IOS_CONDITIONAL_NOTE = "Code-complete but platform-dependent: works on iOS simulator; physical-device execution requires Apple signing entitlements.";

export const ANDROID_CONDITIONAL_TOOL_FRONTIER = [
  "capture_js_console_logs",
  "capture_js_network_events",
] as const;

const ANDROID_CONDITIONAL_NOTE = "Code-complete but requires a running Metro inspector (RN/Expo debug runtime).";

function buildToolCapability(toolName: string, supportLevel: CapabilitySupportLevel, note: string, requiresSession = true, promotionGate?: SupportPromotionGate, condition?: string): ToolCapability {
  return { toolName, supportLevel, note, requiresSession, promotionGate, condition };
}

function buildAndroidToolCapabilities(): ToolCapability[] {
  return [
    buildToolCapability("capture_js_console_logs", CONDITIONAL, "JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false, undefined, ANDROID_CONDITIONAL_NOTE),
    buildToolCapability("capture_js_network_events", CONDITIONAL, "JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false, undefined, ANDROID_CONDITIONAL_NOTE),
    buildToolCapability("collect_debug_evidence", FULL, "Android debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability("describe_capabilities", FULL, "Capability discovery is fully supported for Android sessions and devices.", false),
    buildToolCapability("collect_diagnostics", FULL, "Android diagnostics collection is supported through adb bugreport capture."),
    buildToolCapability("doctor", FULL, "Environment and device readiness checks are fully supported.", false),
    buildToolCapability("get_crash_signals", FULL, "Android crash and ANR signal capture is supported."),
    buildToolCapability("get_logs", FULL, "Android logcat capture is supported."),
    buildToolCapability("request_manual_handoff", FULL, "Android sessions can record explicit operator handoff checkpoints for OTP, consent, and protected-page workflows."),
    buildToolCapability("measure_android_performance", FULL, "Android time-window performance capture is supported through Perfetto plus trace_processor summary generation."),
    buildToolCapability("measure_ios_performance", UNSUPPORTED, "iOS performance capture is not available on Android targets."),
    buildToolCapability("inspect_ui", FULL, "Android UI hierarchy capture is fully supported."),
    buildToolCapability("query_ui", FULL, "Android UI query filtering is fully supported."),
    buildToolCapability("resolve_ui_target", FULL, "Android target resolution is fully supported."),
    buildToolCapability("scroll_and_resolve_ui_target", FULL, "Android scroll-assisted target resolution is fully supported."),
    buildToolCapability("install_app", FULL, "Android app installation is supported."),
    buildToolCapability("launch_app", FULL, "Android app launch is supported."),
    buildToolCapability("reset_app_state", FULL, "Android app state reset is supported via clear_data and uninstall_reinstall strategies."),
    buildToolCapability("start_record_session", FULL, "Android passive recording supports getevent-based capture with UI snapshots and flow export."),
    buildToolCapability("get_record_session_status", FULL, "Android passive recording status reporting is fully supported."),
    buildToolCapability("end_record_session", FULL, "Android passive recording supports event mapping and flow export."),
    buildToolCapability("cancel_record_session", FULL, "Android passive recording cancellation is fully supported."),
    buildToolCapability("list_devices", FULL, "Android device discovery is supported.", false),
    buildToolCapability("start_session", FULL, "Android session initialization is supported.", false),
    buildToolCapability("run_flow", FULL, "Android flow execution uses owned-adb primary backend for physical-device replay (no helper-app install required for all common commands: launchApp, tapOn with selector or coordinates, inputText, assertVisible, assertNotVisible, swipe, back, home, hideKeyboard, stopApp, clearState). Maestro helper-app lane is fallback only for edge-case commands (runFlow with complex sub-flows, extendedWaitUntil, setClipboard, openLink)."),
    buildToolCapability("take_screenshot", FULL, "Android screenshot capture is supported."),
    buildToolCapability("record_screen", FULL, "Android screen recording is supported through adb shell screenrecord."),
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
    buildToolCapability("capture_js_console_logs", CONDITIONAL, `JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached. ${IOS_CONDITIONAL_NOTE}`, false, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("capture_js_network_events", CONDITIONAL, `JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached. ${IOS_CONDITIONAL_NOTE}`, false, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("collect_debug_evidence", FULL, "iOS simulator debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability("describe_capabilities", FULL, "Capability discovery is fully supported for iOS sessions and simulators.", false),
    buildToolCapability("collect_diagnostics", FULL, "iOS simulator diagnostics bundle capture is supported."),
    buildToolCapability("doctor", FULL, "Environment and simulator readiness checks are fully supported.", false),
    buildToolCapability("get_crash_signals", FULL, "iOS simulator crash manifest capture is supported."),
    buildToolCapability("get_logs", FULL, "iOS simulator log capture is supported."),
    buildToolCapability("request_manual_handoff", FULL, "iOS sessions can record explicit operator handoff checkpoints for OTP, consent, and protected-page workflows."),
    buildToolCapability("measure_android_performance", UNSUPPORTED, "Android Perfetto performance capture is not available on iOS targets."),
    buildToolCapability("measure_ios_performance", CONDITIONAL, `iOS time-window performance capture: Time Profiler is real-validated on simulator, Allocations can be real-validated via attach-to-app, and Animation Hitches remains platform-limited on current simulator/runtime combinations. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("inspect_ui", CONDITIONAL, `iOS hierarchy capture uses axe describe-ui (simulators) or WDA /source (physical devices). Query and action parity is full for simulators with axe, partial for physical devices. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("query_ui", FULL, "iOS query_ui filters captured hierarchy nodes through axe-backed hierarchy (simulators) or WDA /source (physical devices)."),
    buildToolCapability("resolve_ui_target", FULL, "iOS target resolution uses axe-backed hierarchy for simulators and WDA /source for physical devices."),
    buildToolCapability("scroll_and_resolve_ui_target", FULL, "iOS scroll-assisted target resolution uses axe swipe for simulators and WDA drag API for physical devices."),
    buildToolCapability("install_app", FULL, "iOS simulator app installation is supported."),
    buildToolCapability("launch_app", FULL, "iOS simulator app launch is supported."),
    buildToolCapability("reset_app_state", CONDITIONAL, `iOS simulator app reset is supported with strategy-specific caveats (simctl uninstall/reinstall and keychain reset); physical-device reset remains non-deterministic in the current adapter path and stays platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("start_record_session", CONDITIONAL, `iOS recording uses simctl log-stream capture for simulators and devicectl/Maestro snapshot evidence for physical devices; physical-device sessions may produce sparse raw-event streams. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("get_record_session_status", CONDITIONAL, `iOS recording status reporting is available with platform-specific guidance when capture remains sparse. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("end_record_session", CONDITIONAL, `iOS recording supports bounded semantic mapping and flow export with confidence warnings. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("cancel_record_session", CONDITIONAL, `iOS recording cancellation is supported for simulator/physical-device capture workers and snapshot loops. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("list_devices", FULL, "iOS simulator and physical-device discovery are supported when local Apple tooling can enumerate them.", false),
    buildToolCapability("start_session", FULL, "iOS session initialization is supported.", false),
    buildToolCapability("run_flow", FULL, "iOS flow execution is supported, subject to current runner-profile constraints."),
    buildToolCapability("take_screenshot", FULL, "iOS simulator screenshot capture is supported."),
    buildToolCapability("record_screen", CONDITIONAL, `iOS simulator screen recording is supported through simctl io recordVideo. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability("tap", CONDITIONAL, `Direct iOS coordinate tap uses axe (simulators) or WDA HTTP API (physical devices). Physical-device execution remains signing-dependent and platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability("tap_element", CONDITIONAL, `iOS element tap resolves targets through axe-backed hierarchy (simulators) or WDA HTTP API (physical devices), then executes tap. Physical-device execution remains platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("terminate_app", FULL, "iOS simulator app termination is supported."),
  buildToolCapability("type_text", CONDITIONAL, `Direct iOS text input uses axe (simulators) or WDA HTTP API (physical devices). Physical-device execution remains signing-dependent and platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability("type_into_element", CONDITIONAL, `iOS element text input resolves targets through axe-backed hierarchy (simulators) or WDA HTTP API (physical devices), then executes text input. Physical-device execution remains platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability("wait_for_ui", FULL, "iOS wait_for_ui polls axe hierarchy capture for simulators; physical device wait uses WDA /source polling."),
    buildToolCapability("end_session", FULL, "iOS session shutdown is supported."),
  ];
}

function summarizeGroup(toolCapabilities: ToolCapability[], groupName: string, toolNames: string[], note?: string): CapabilityGroup {
  const relevantLevels = toolNames
    .map((toolName) => toolCapabilities.find((tool) => tool.toolName === toolName)?.supportLevel)
    .filter((level): level is CapabilitySupportLevel => level !== undefined && level !== "unsupported");
  const hasRelevantTools = relevantLevels.length > 0;
  const supportLevel = hasRelevantTools
    ? (relevantLevels.every((level) => level === FULL) ? FULL
      : relevantLevels.every((level) => level === FULL || level === CONDITIONAL) ? CONDITIONAL
      : PARTIAL)
    : "unsupported";
  const conditions = toolNames
    .map((toolName) => toolCapabilities.find((tool) => tool.toolName === toolName)?.condition)
    .filter(Boolean);
  const condition = conditions.length > 0 ? [...new Set(conditions as string[])].join("; ") : undefined;
  const gates = toolNames
    .map((toolName) => toolCapabilities.find((tool) => tool.toolName === toolName)?.promotionGate)
    .filter((gate): gate is SupportPromotionGate => Boolean(gate));
  const promotionGate = gates.length > 0
    ? {
        blocked: gates.some((gate) => gate.blocked),
        requiredProofLanes: [...new Set(gates.flatMap((gate) => gate.requiredProofLanes))],
        blockingReasons: [...new Set(gates.flatMap((gate) => gate.blockingReasons))],
      }
    : undefined;
  return { groupName, supportLevel, toolNames, note, condition, promotionGate };
}

export function buildCapabilityProfile(platform: Platform, runnerProfile: RunnerProfile | null = null): CapabilityProfile {
  const toolCapabilities = platform === "android" ? buildAndroidToolCapabilities() : buildIosToolCapabilities();
  const ocrHostSupport = buildOcrHostSupportSummary();

  return {
    platform,
    runnerProfile,
    toolCapabilities,
    ocrFallback: {
      supported: ocrHostSupport.supported,
      deterministicFirst: true,
      hostRequirement: "darwin",
      defaultProvider: ocrHostSupport.defaultProvider,
      configuredProviders: ocrHostSupport.configuredProviders,
      allowedActions: ["tap", "assertText"],
      blockedActions: ["delete", "purchase", "confirmPayment"],
      minConfidenceForAssert: DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForAssert,
      minConfidenceForTap: DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap,
      maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail,
      retryLimit: DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount,
    },
    groups: [
      summarizeGroup(toolCapabilities, "session_management", ["describe_capabilities", "start_session", "request_manual_handoff", "run_flow", "end_session"], "Session lifecycle, operator handoff, and capability discovery layer."),
      summarizeGroup(toolCapabilities, "recording_and_replay", ["start_record_session", "get_record_session_status", "end_record_session", "cancel_record_session", "run_flow"], "Passive record-session lifecycle and replay closure capabilities."),
      summarizeGroup(toolCapabilities, "app_lifecycle", ["install_app", "launch_app", "terminate_app", "reset_app_state"], "Install, launch, terminate, and reset application workflows."),
      summarizeGroup(toolCapabilities, "artifacts_and_diagnostics", ["take_screenshot", "record_screen", "get_logs", "get_crash_signals", "collect_debug_evidence", "collect_diagnostics", "measure_android_performance", "measure_ios_performance"], "Evidence capture, diagnostics collection, and lightweight performance analysis tools."),
      summarizeGroup(toolCapabilities, "ui_inspection", ["inspect_ui", "query_ui", "resolve_ui_target", "wait_for_ui", "scroll_and_resolve_ui_target"], "Hierarchy capture, querying, target resolution, and wait logic."),
      summarizeGroup(toolCapabilities, "ui_actions", ["tap", "tap_element", "type_text", "type_into_element"], "Coordinate and element-level UI action tooling."),
    ],
  };
}
