import type { CapabilityGroup, CapabilityProfile, CapabilitySupportLevel, Platform, RunnerProfile, ToolCapability } from "@mobile-e2e-mcp/contracts";
import { DEFAULT_OCR_FALLBACK_POLICY } from "@mobile-e2e-mcp/adapter-vision";

const FULL: CapabilitySupportLevel = "full";
const PARTIAL: CapabilitySupportLevel = "partial";
const UNSUPPORTED: CapabilitySupportLevel = "unsupported";

function buildToolCapability(toolName: string, supportLevel: CapabilitySupportLevel, note: string, requiresSession = true): ToolCapability {
  return { toolName, supportLevel, note, requiresSession };
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
    buildToolCapability("measure_android_performance", FULL, "Android time-window performance capture is supported through Perfetto plus trace_processor summary generation."),
    buildToolCapability("measure_ios_performance", UNSUPPORTED, "iOS performance capture is not available on Android targets."),
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
    buildToolCapability("capture_js_console_logs", PARTIAL, "JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false),
    buildToolCapability("capture_js_network_events", PARTIAL, "JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false),
    buildToolCapability("collect_debug_evidence", FULL, "iOS simulator debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability("describe_capabilities", FULL, "Capability discovery is fully supported for iOS sessions and simulators.", false),
    buildToolCapability("collect_diagnostics", FULL, "iOS simulator diagnostics bundle capture is supported."),
    buildToolCapability("doctor", FULL, "Environment and simulator readiness checks are fully supported.", false),
    buildToolCapability("get_crash_signals", FULL, "iOS simulator crash manifest capture is supported."),
    buildToolCapability("get_logs", FULL, "iOS simulator log capture is supported."),
    buildToolCapability("measure_android_performance", UNSUPPORTED, "Android Perfetto performance capture is not available on iOS targets."),
    buildToolCapability("measure_ios_performance", PARTIAL, "iOS time-window performance capture is partial: Time Profiler is real-validated on simulator, Allocations can be real-validated via attach-to-app, and Animation Hitches remains platform-limited on current simulator/runtime combinations."),
    buildToolCapability("inspect_ui", PARTIAL, "iOS can capture hierarchy artifacts through idb, but downstream query and action parity remains partial."),
    buildToolCapability("query_ui", FULL, "iOS query_ui can filter captured hierarchy nodes through idb-backed structured matching."),
    buildToolCapability("resolve_ui_target", FULL, "iOS target resolution can resolve structured hierarchy matches through idb-backed capture."),
    buildToolCapability("scroll_and_resolve_ui_target", FULL, "iOS scroll-assisted target resolution is supported through idb hierarchy capture and swipe gestures."),
    buildToolCapability("install_app", FULL, "iOS simulator app installation is supported."),
    buildToolCapability("launch_app", FULL, "iOS simulator app launch is supported."),
    buildToolCapability("list_devices", FULL, "iOS simulator discovery is supported.", false),
    buildToolCapability("start_session", FULL, "iOS session initialization is supported.", false),
    buildToolCapability("run_flow", FULL, "iOS flow execution is supported, subject to current runner-profile constraints."),
    buildToolCapability("take_screenshot", FULL, "iOS simulator screenshot capture is supported."),
    buildToolCapability("tap", FULL, "Direct iOS coordinate tap is supported through idb when the simulator companion is available."),
    buildToolCapability("tap_element", FULL, "iOS element tap is supported after idb-backed target resolution."),
    buildToolCapability("terminate_app", FULL, "iOS simulator app termination is supported."),
    buildToolCapability("type_text", FULL, "Direct iOS text input is supported through idb when the simulator companion is available."),
    buildToolCapability("type_into_element", FULL, "iOS element text input is supported after idb-backed target resolution."),
    buildToolCapability("wait_for_ui", FULL, "iOS wait_for_ui actively polls simulator hierarchy through idb capture."),
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
    ocrFallback: {
      supported: process.platform === "darwin",
      deterministicFirst: true,
      hostRequirement: "darwin",
      defaultProvider: process.platform === "darwin" ? "mac-vision" : undefined,
      configuredProviders: process.platform === "darwin" ? ["mac-vision"] : [],
      allowedActions: ["tap", "assertText"],
      blockedActions: ["delete", "purchase", "confirmPayment"],
      minConfidenceForAssert: DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForAssert,
      minConfidenceForTap: DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap,
      maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail,
      retryLimit: DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount,
    },
    groups: [
      summarizeGroup(toolCapabilities, "session_management", ["describe_capabilities", "start_session", "run_flow", "end_session"], "Session lifecycle and capability discovery layer."),
      summarizeGroup(toolCapabilities, "app_lifecycle", ["install_app", "launch_app", "terminate_app"], "Install, launch, and terminate application workflows."),
      summarizeGroup(toolCapabilities, "artifacts_and_diagnostics", ["take_screenshot", "get_logs", "get_crash_signals", "collect_debug_evidence", "collect_diagnostics", "measure_android_performance", "measure_ios_performance"], "Evidence capture, diagnostics collection, and lightweight performance analysis tools."),
      summarizeGroup(toolCapabilities, "ui_inspection", ["inspect_ui", "query_ui", "resolve_ui_target", "wait_for_ui", "scroll_and_resolve_ui_target"], "Hierarchy capture, querying, target resolution, and wait logic."),
      summarizeGroup(toolCapabilities, "ui_actions", ["tap", "tap_element", "type_text", "type_into_element"], "Coordinate and element-level UI action tooling."),
    ],
  };
}
