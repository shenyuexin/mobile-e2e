import { DEFAULT_OCR_FALLBACK_POLICY } from "@mobile-e2e-mcp/adapter-vision";
import type { CapabilityGroup, CapabilityProfile, CapabilitySupportLevel, Platform, RunnerProfile, SupportPromotionGate, ToolCapability } from "@mobile-e2e-mcp/contracts";
import { buildOcrHostSupportSummary } from "./toolchain-runtime.js";

const FULL: CapabilitySupportLevel = "full";
const PARTIAL: CapabilitySupportLevel = "partial";
const UNSUPPORTED: CapabilitySupportLevel = "unsupported";

export const IOS_PARTIAL_TOOL_FRONTIER = [
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

export const IOS_PARTIAL_GROUP_FRONTIER = [
  "app_lifecycle",
  "recording_and_replay",
  "artifacts_and_diagnostics",
  "ui_inspection",
  "ui_actions",
] as const;

const IOS_PROOF_GATE_NOTE = "Support promotion is blocked until simulator proof and real-device proof lanes are both explicitly established.";

function buildIosProofGate(): SupportPromotionGate {
  return {
    blocked: true,
    requiredProofLanes: ["simulator", "real_device"],
    blockingReasons: [IOS_PROOF_GATE_NOTE],
  };
}

function buildToolCapability(toolName: string, supportLevel: CapabilitySupportLevel, note: string, requiresSession = true, promotionGate?: SupportPromotionGate): ToolCapability {
  return { toolName, supportLevel, note, requiresSession, promotionGate };
}

function buildAndroidToolCapabilities(): ToolCapability[] {
  return [
    buildToolCapability("capture_js_console_logs", PARTIAL, "JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false),
    buildToolCapability("capture_js_network_events", PARTIAL, "JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false),
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
    buildToolCapability("run_flow", FULL, "Android flow execution uses owned-adb primary backend for physical-device replay (no helper-app install required for supported commands: launchApp, tapOn with selector, inputText with deterministic focus, assertVisible). Maestro helper-app lane is explicit fallback only."),
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
  const iosProofGate = buildIosProofGate();
  return [
    buildToolCapability("capture_js_console_logs", PARTIAL, `JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached. ${IOS_PROOF_GATE_NOTE}`, false, iosProofGate),
    buildToolCapability("capture_js_network_events", PARTIAL, `JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached. ${IOS_PROOF_GATE_NOTE}`, false, iosProofGate),
    buildToolCapability("collect_debug_evidence", FULL, "iOS simulator debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability("describe_capabilities", FULL, "Capability discovery is fully supported for iOS sessions and simulators.", false),
    buildToolCapability("collect_diagnostics", FULL, "iOS simulator diagnostics bundle capture is supported."),
    buildToolCapability("doctor", FULL, "Environment and simulator readiness checks are fully supported.", false),
    buildToolCapability("get_crash_signals", FULL, "iOS simulator crash manifest capture is supported."),
    buildToolCapability("get_logs", FULL, "iOS simulator log capture is supported."),
    buildToolCapability("request_manual_handoff", FULL, "iOS sessions can record explicit operator handoff checkpoints for OTP, consent, and protected-page workflows."),
    buildToolCapability("measure_android_performance", UNSUPPORTED, "Android Perfetto performance capture is not available on iOS targets."),
    buildToolCapability("measure_ios_performance", PARTIAL, `iOS time-window performance capture is partial: Time Profiler is real-validated on simulator, Allocations can be real-validated via attach-to-app, and Animation Hitches remains platform-limited on current simulator/runtime combinations. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("inspect_ui", PARTIAL, `iOS hierarchy capture uses xcrun simctl (simulators) or Maestro (physical devices). Query and action parity is full for simulators, partial for physical devices. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("query_ui", FULL, "iOS query_ui filters captured hierarchy nodes through structured matching (simctl for simulators, Maestro for physical devices)."),
    buildToolCapability("resolve_ui_target", FULL, "iOS target resolution uses simctl-backed hierarchy for simulators and Maestro-backed for physical devices."),
    buildToolCapability("scroll_and_resolve_ui_target", FULL, "iOS scroll-assisted target resolution uses simctl swipe for simulators and Maestro swipe flow for physical devices."),
    buildToolCapability("install_app", FULL, "iOS simulator app installation is supported."),
    buildToolCapability("launch_app", FULL, "iOS simulator app launch is supported."),
    buildToolCapability("reset_app_state", PARTIAL, `iOS simulator app reset is supported with strategy-specific caveats (simctl uninstall/reinstall and keychain reset); physical-device reset remains non-deterministic in the current adapter path and stays proof-gated. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("start_record_session", PARTIAL, `iOS recording uses simctl log-stream capture for simulators and devicectl/Maestro snapshot evidence for physical devices; physical-device sessions may produce sparse raw-event streams. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("get_record_session_status", PARTIAL, `iOS recording status reporting is available with platform-specific guidance when capture remains sparse. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("end_record_session", PARTIAL, `iOS recording supports bounded semantic mapping and flow export with confidence warnings. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("cancel_record_session", PARTIAL, `iOS recording cancellation is supported for simulator/physical-device capture workers and snapshot loops. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("list_devices", FULL, "iOS simulator and physical-device discovery are supported when local Apple tooling can enumerate them.", false),
    buildToolCapability("start_session", FULL, "iOS session initialization is supported.", false),
    buildToolCapability("run_flow", FULL, "iOS flow execution is supported, subject to current runner-profile constraints."),
    buildToolCapability("take_screenshot", FULL, "iOS simulator screenshot capture is supported."),
    buildToolCapability("record_screen", PARTIAL, `iOS simulator screen recording is supported through simctl io recordVideo. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
  buildToolCapability("tap", PARTIAL, `Direct iOS coordinate tap uses xcrun simctl io tap on simulators and Maestro flow YAML on physical devices. Physical-device execution remains signing-dependent and proof-gated. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
  buildToolCapability("tap_element", PARTIAL, `iOS element tap resolves targets through simctl-backed hierarchy (simulators) or Maestro flow (physical devices), then executes tap. Physical-device execution remains proof-gated. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("terminate_app", FULL, "iOS simulator app termination is supported."),
  buildToolCapability("type_text", PARTIAL, `Direct iOS text input uses xcrun simctl keyboard type on simulators and Maestro flow YAML on physical devices. Physical-device execution remains signing-dependent and proof-gated. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
  buildToolCapability("type_into_element", PARTIAL, `iOS element text input resolves targets through simctl-backed hierarchy (simulators) or Maestro flow (physical devices), then executes text input. Physical-device execution remains proof-gated. ${IOS_PROOF_GATE_NOTE}`, true, iosProofGate),
    buildToolCapability("wait_for_ui", FULL, "iOS wait_for_ui polls simctl hierarchy capture for simulators; physical device wait uses Maestro snapshot."),
    buildToolCapability("end_session", FULL, "iOS session shutdown is supported."),
  ];
}

function summarizeGroup(toolCapabilities: ToolCapability[], groupName: string, toolNames: string[], note?: string): CapabilityGroup {
  const levels = toolNames.map((toolName) => toolCapabilities.find((tool) => tool.toolName === toolName)?.supportLevel ?? "unsupported");
  const supportLevel = levels.every((level) => level === FULL) ? FULL : levels.some((level) => level === PARTIAL || level === FULL) ? PARTIAL : "unsupported";
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
  return { groupName, supportLevel, toolNames, note, promotionGate };
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
