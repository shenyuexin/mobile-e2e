import { TOOL_NAMES } from "@mobile-e2e-mcp/contracts";
import { CAPABILITY_GROUPS } from "./constants/capability-groups.js";
import { DEFAULT_OCR_FALLBACK_POLICY } from "@mobile-e2e-mcp/adapter-vision";
import type { CapabilityGroup, CapabilityProfile, CapabilitySupportLevel, Platform, RunnerProfile, SupportPromotionGate, ToolCapability } from "@mobile-e2e-mcp/contracts";
import { buildOcrHostSupportSummary } from "./toolchain-runtime.js";

const FULL: CapabilitySupportLevel = "full";
const CONDITIONAL: CapabilitySupportLevel = "conditional";
const PARTIAL: CapabilitySupportLevel = "partial";
const UNSUPPORTED: CapabilitySupportLevel = "unsupported";

export const IOS_CONDITIONAL_TOOL_FRONTIER = [
  TOOL_NAMES.captureJsConsoleLogs,
  TOOL_NAMES.captureJsNetworkEvents,
  TOOL_NAMES.measureIosPerformance,
  TOOL_NAMES.inspectUi,
  TOOL_NAMES.resetAppState,
  TOOL_NAMES.startRecordSession,
  TOOL_NAMES.getRecordSessionStatus,
  TOOL_NAMES.endRecordSession,
  TOOL_NAMES.cancelRecordSession,
  TOOL_NAMES.recordScreen,
  TOOL_NAMES.tap,
  TOOL_NAMES.tapElement,
  TOOL_NAMES.navigateBack,
  TOOL_NAMES.typeText,
  TOOL_NAMES.typeIntoElement,
] as const;

export const IOS_CONDITIONAL_GROUP_FRONTIER = [
  CAPABILITY_GROUPS.appLifecycle,
  CAPABILITY_GROUPS.recordingAndReplay,
  CAPABILITY_GROUPS.artifactsAndDiagnostics,
  CAPABILITY_GROUPS.uiInspection,
  CAPABILITY_GROUPS.uiActions,
] as const;

const IOS_CONDITIONAL_NOTE = "Code-complete but platform-dependent: works on iOS simulator; physical-device execution requires Apple signing entitlements.";

export const ANDROID_CONDITIONAL_TOOL_FRONTIER = [
  TOOL_NAMES.captureJsConsoleLogs,
  TOOL_NAMES.captureJsNetworkEvents,
] as const;

const ANDROID_CONDITIONAL_NOTE = "Code-complete but requires a running Metro inspector (RN/Expo debug runtime).";

function buildToolCapability(toolName: string, supportLevel: CapabilitySupportLevel, note: string, requiresSession = true, promotionGate?: SupportPromotionGate, condition?: string): ToolCapability {
  return { toolName, supportLevel, note, requiresSession, promotionGate, condition };
}

function buildAndroidToolCapabilities(): ToolCapability[] {
  return [
    buildToolCapability(TOOL_NAMES.captureJsConsoleLogs, CONDITIONAL, "JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false, undefined, ANDROID_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.captureJsNetworkEvents, CONDITIONAL, "JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached.", false, undefined, ANDROID_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.collectDebugEvidence, FULL, "Android debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability(TOOL_NAMES.describeCapabilities, FULL, "Capability discovery is fully supported for Android sessions and devices.", false),
    buildToolCapability(TOOL_NAMES.collectDiagnostics, FULL, "Android diagnostics collection is supported through adb bugreport capture."),
    buildToolCapability(TOOL_NAMES.doctor, FULL, "Environment and device readiness checks are fully supported.", false),
    buildToolCapability(TOOL_NAMES.getCrashSignals, FULL, "Android crash and ANR signal capture is supported."),
    buildToolCapability(TOOL_NAMES.getLogs, FULL, "Android logcat capture is supported."),
    buildToolCapability(TOOL_NAMES.requestManualHandoff, FULL, "Android sessions can record explicit operator handoff checkpoints for OTP, consent, and protected-page workflows."),
    buildToolCapability(TOOL_NAMES.measureAndroidPerformance, FULL, "Android time-window performance capture is supported through Perfetto plus trace_processor summary generation."),
    buildToolCapability(TOOL_NAMES.measureIosPerformance, UNSUPPORTED, "iOS performance capture is not available on Android targets."),
    buildToolCapability(TOOL_NAMES.inspectUi, FULL, "Android UI hierarchy capture is fully supported."),
    buildToolCapability(TOOL_NAMES.queryUi, FULL, "Android UI query filtering is fully supported."),
    buildToolCapability(TOOL_NAMES.resolveUiTarget, FULL, "Android target resolution is fully supported."),
    buildToolCapability(TOOL_NAMES.scrollOnly, FULL, "Android standalone scroll gestures are fully supported when you want explicit control before wait_for_ui or resolve_ui_target."),
    buildToolCapability(TOOL_NAMES.scrollAndResolveUiTarget, FULL, "Android scroll-assisted target resolution is fully supported."),
    buildToolCapability(TOOL_NAMES.installApp, FULL, "Android app installation is supported."),
    buildToolCapability(TOOL_NAMES.launchApp, FULL, "Android app launch is supported."),
    buildToolCapability(TOOL_NAMES.resetAppState, FULL, "Android app state reset is supported via clear_data and uninstall_reinstall strategies."),
    buildToolCapability(TOOL_NAMES.startRecordSession, FULL, "Android passive recording supports getevent-based capture with UI snapshots and flow export."),
    buildToolCapability(TOOL_NAMES.getRecordSessionStatus, FULL, "Android passive recording status reporting is fully supported."),
    buildToolCapability(TOOL_NAMES.endRecordSession, FULL, "Android passive recording supports event mapping and flow export."),
    buildToolCapability(TOOL_NAMES.cancelRecordSession, FULL, "Android passive recording cancellation is fully supported."),
    buildToolCapability(TOOL_NAMES.listDevices, FULL, "Android device discovery is supported.", false),
    buildToolCapability(TOOL_NAMES.startSession, FULL, "Android session initialization is supported.", false),
    buildToolCapability(TOOL_NAMES.runFlow, FULL, "Android flow execution uses owned-adb primary backend for physical-device replay (no helper-app install required for all common commands: launchApp, tapOn with selector or coordinates, inputText, assertVisible, assertNotVisible, swipe, back, home, hideKeyboard, stopApp, clearState). Maestro helper-app lane is fallback only for edge-case commands (runFlow with complex sub-flows, extendedWaitUntil, setClipboard, openLink)."),
    buildToolCapability(TOOL_NAMES.takeScreenshot, FULL, "Android screenshot capture is supported."),
    buildToolCapability(TOOL_NAMES.recordScreen, FULL, "Android screen recording is supported through adb shell screenrecord."),
    buildToolCapability(TOOL_NAMES.tap, FULL, "Android coordinate tap is supported."),
    buildToolCapability(TOOL_NAMES.tapElement, FULL, "Android element tap is supported after resolution."),
    buildToolCapability(TOOL_NAMES.navigateBack, FULL, "Android back navigation uses deterministic adb keyevent 4 dispatch. May navigate page-back or exit the current app depending on app state; verify screen transition separately."),
    buildToolCapability(TOOL_NAMES.terminateApp, FULL, "Android app termination is supported."),
    buildToolCapability(TOOL_NAMES.typeText, FULL, "Android text input is supported."),
    buildToolCapability(TOOL_NAMES.typeIntoElement, FULL, "Android element text input is supported after resolution."),
    buildToolCapability(TOOL_NAMES.waitForUi, FULL, "Android UI polling is supported."),
    buildToolCapability(TOOL_NAMES.waitForUiStable, FULL, "Android UI stabilization polling waits for the visible hierarchy to stop animating before returning."),
    buildToolCapability(TOOL_NAMES.endSession, FULL, "Android session shutdown is supported."),
  ];
}

function buildIosToolCapabilities(): ToolCapability[] {
  return [
    buildToolCapability(TOOL_NAMES.captureJsConsoleLogs, CONDITIONAL, `JS console capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached. ${IOS_CONDITIONAL_NOTE}`, false, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.captureJsNetworkEvents, CONDITIONAL, `JS network capture requires a running Metro inspector target and is available when the RN/Expo debug runtime is attached. ${IOS_CONDITIONAL_NOTE}`, false, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.collectDebugEvidence, FULL, "iOS simulator debug evidence summarization is supported through log and crash digest capture."),
    buildToolCapability(TOOL_NAMES.describeCapabilities, FULL, "Capability discovery is fully supported for iOS sessions and simulators.", false),
    buildToolCapability(TOOL_NAMES.collectDiagnostics, FULL, "iOS simulator diagnostics bundle capture is supported."),
    buildToolCapability(TOOL_NAMES.doctor, FULL, "Environment and simulator readiness checks are fully supported.", false),
    buildToolCapability(TOOL_NAMES.getCrashSignals, FULL, "iOS simulator crash manifest capture is supported."),
    buildToolCapability(TOOL_NAMES.getLogs, FULL, "iOS simulator log capture is supported."),
    buildToolCapability(TOOL_NAMES.requestManualHandoff, FULL, "iOS sessions can record explicit operator handoff checkpoints for OTP, consent, and protected-page workflows."),
    buildToolCapability(TOOL_NAMES.measureAndroidPerformance, UNSUPPORTED, "Android Perfetto performance capture is not available on iOS targets."),
    buildToolCapability(TOOL_NAMES.measureIosPerformance, CONDITIONAL, `iOS time-window performance capture: Time Profiler is real-validated on simulator, Allocations can be real-validated via attach-to-app, and Animation Hitches remains platform-limited on current simulator/runtime combinations. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.inspectUi, CONDITIONAL, `iOS hierarchy capture uses axe describe-ui (simulators) or WDA /source (physical devices). Query and action parity is full for simulators with axe, partial for physical devices. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.queryUi, FULL, "iOS query_ui filters captured hierarchy nodes through axe-backed hierarchy (simulators) or WDA /source (physical devices)."),
    buildToolCapability(TOOL_NAMES.resolveUiTarget, FULL, "iOS target resolution uses axe-backed hierarchy for simulators and WDA /source for physical devices."),
    buildToolCapability(TOOL_NAMES.scrollOnly, FULL, "iOS standalone scroll gestures are supported for explicit swipe control before wait_for_ui or resolve_ui_target."),
    buildToolCapability(TOOL_NAMES.scrollAndResolveUiTarget, UNSUPPORTED, "scroll_and_resolve_ui_target is Android-only. On iOS, use scroll_only → wait_for_ui → resolve_ui_target instead."),
    buildToolCapability(TOOL_NAMES.scrollAndTapElement, UNSUPPORTED, "scroll_and_tap_element is Android-only. On iOS, use scroll_only → wait_for_ui → resolve_ui_target → tap_element instead."),
    buildToolCapability(TOOL_NAMES.installApp, FULL, "iOS simulator app installation is supported."),
    buildToolCapability(TOOL_NAMES.launchApp, FULL, "iOS simulator app launch is supported."),
    buildToolCapability(TOOL_NAMES.resetAppState, CONDITIONAL, `iOS simulator app reset is supported with strategy-specific caveats (simctl uninstall/reinstall and keychain reset); physical-device reset remains non-deterministic in the current adapter path and stays platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.startRecordSession, CONDITIONAL, `iOS recording uses simctl log-stream capture for simulators and devicectl/Maestro snapshot evidence for physical devices; physical-device sessions may produce sparse raw-event streams. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.getRecordSessionStatus, CONDITIONAL, `iOS recording status reporting is available with platform-specific guidance when capture remains sparse. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.endRecordSession, CONDITIONAL, `iOS recording supports bounded semantic mapping and flow export with confidence warnings. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.cancelRecordSession, CONDITIONAL, `iOS recording cancellation is supported for simulator/physical-device capture workers and snapshot loops. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.listDevices, FULL, "iOS simulator and physical-device discovery are supported when local Apple tooling can enumerate them.", false),
    buildToolCapability(TOOL_NAMES.startSession, FULL, "iOS session initialization is supported.", false),
    buildToolCapability(TOOL_NAMES.runFlow, FULL, "iOS flow execution is supported, subject to current runner-profile constraints."),
    buildToolCapability(TOOL_NAMES.takeScreenshot, FULL, "iOS simulator screenshot capture is supported."),
    buildToolCapability(TOOL_NAMES.recordScreen, CONDITIONAL, `iOS simulator screen recording is supported through simctl io recordVideo. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability(TOOL_NAMES.tap, CONDITIONAL, `Direct iOS coordinate tap uses axe (simulators) or WDA HTTP API (physical devices). Physical-device execution remains signing-dependent and platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability(TOOL_NAMES.tapElement, CONDITIONAL, `iOS element tap resolves targets through axe-backed hierarchy (simulators) or WDA HTTP API (physical devices), then executes tap. Physical-device execution remains platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability(TOOL_NAMES.navigateBack, CONDITIONAL, `iOS app-level back via selector-based back button tap is supported. iOS system back is unsupported (no universal OS back primitive). Provide a selector for deterministic back, or use inspect_ui to discover back button selectors. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.terminateApp, FULL, "iOS simulator app termination is supported."),
  buildToolCapability(TOOL_NAMES.typeText, CONDITIONAL, `Direct iOS text input uses axe (simulators) or WDA HTTP API (physical devices). Physical-device execution remains signing-dependent and platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
  buildToolCapability(TOOL_NAMES.typeIntoElement, CONDITIONAL, `iOS element text input resolves targets through axe-backed hierarchy (simulators) or WDA HTTP API (physical devices), then executes text input. Physical-device execution remains platform-dependent. ${IOS_CONDITIONAL_NOTE}`, true, undefined, IOS_CONDITIONAL_NOTE),
    buildToolCapability(TOOL_NAMES.waitForUi, FULL, "iOS wait_for_ui polls axe hierarchy capture for simulators; physical device wait uses WDA /source polling."),
  buildToolCapability(TOOL_NAMES.waitForUiStable, FULL, "iOS UI stabilization polling waits for the visible hierarchy to stop animating before returning."),
    buildToolCapability(TOOL_NAMES.endSession, FULL, "iOS session shutdown is supported."),
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
      allowedActions: [TOOL_NAMES.tap, "assertText"],
      blockedActions: ["delete", "purchase", "confirmPayment"],
      minConfidenceForAssert: DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForAssert,
      minConfidenceForTap: DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap,
      maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail,
      retryLimit: DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount,
    },
    groups: [
      summarizeGroup(toolCapabilities, CAPABILITY_GROUPS.sessionManagement, [TOOL_NAMES.describeCapabilities, TOOL_NAMES.startSession, TOOL_NAMES.requestManualHandoff, TOOL_NAMES.runFlow, TOOL_NAMES.endSession], "Session lifecycle, operator handoff, and capability discovery layer."),
      summarizeGroup(toolCapabilities, CAPABILITY_GROUPS.recordingAndReplay, [TOOL_NAMES.startRecordSession, TOOL_NAMES.getRecordSessionStatus, TOOL_NAMES.endRecordSession, TOOL_NAMES.cancelRecordSession, TOOL_NAMES.runFlow], "Passive record-session lifecycle and replay closure capabilities."),
      summarizeGroup(toolCapabilities, CAPABILITY_GROUPS.appLifecycle, [TOOL_NAMES.installApp, TOOL_NAMES.launchApp, TOOL_NAMES.terminateApp, TOOL_NAMES.resetAppState], "Install, launch, terminate, and reset application workflows."),
      summarizeGroup(toolCapabilities, CAPABILITY_GROUPS.artifactsAndDiagnostics, [TOOL_NAMES.takeScreenshot, TOOL_NAMES.recordScreen, TOOL_NAMES.getLogs, TOOL_NAMES.getCrashSignals, TOOL_NAMES.collectDebugEvidence, TOOL_NAMES.collectDiagnostics, TOOL_NAMES.measureAndroidPerformance, TOOL_NAMES.measureIosPerformance], "Evidence capture, diagnostics collection, and lightweight performance analysis tools."),
      summarizeGroup(toolCapabilities, CAPABILITY_GROUPS.uiInspection, [TOOL_NAMES.inspectUi, TOOL_NAMES.queryUi, TOOL_NAMES.resolveUiTarget, TOOL_NAMES.waitForUi, TOOL_NAMES.waitForUiStable, TOOL_NAMES.scrollAndResolveUiTarget], "Hierarchy capture, querying, target resolution, wait logic, and UI stabilization polling."),
      summarizeGroup(toolCapabilities, CAPABILITY_GROUPS.uiActions, [TOOL_NAMES.tap, TOOL_NAMES.tapElement, TOOL_NAMES.typeText, TOOL_NAMES.typeIntoElement, TOOL_NAMES.scrollOnly, TOOL_NAMES.navigateBack], "Coordinate, text, and standalone scroll action tooling including back navigation."),
    ],
  };
}
