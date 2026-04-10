import type {
  ActionIntent,
  AndroidReplayOptions,
  AndroidPerformancePreset,
  IosPerformanceTemplate,
  Platform,
  ResetAppStateStrategy,
  RunnerProfile,
  UiScrollDirection,
  WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";

export interface CliOptions {
  captureJsConsoleLogs: boolean;
  captureJsNetworkEvents: boolean;
  compareAgainstBaseline: boolean;
  collectDebugEvidence: boolean;
  collectDiagnostics: boolean;
  describeCapabilities: boolean;
  platform: Platform;
  doctor: boolean;
  explainLastFailure: boolean;
  findSimilarFailures: boolean;
  dryRun: boolean;
  getCrashSignals: boolean;
  getActionOutcome: boolean;
  getScreenSummary: boolean;
  getSessionState: boolean;
  includeUnavailable: boolean;
  getLogs: boolean;
  inspectUi: boolean;
  installApp: boolean;
  listJsDebugTargets: boolean;
  launchApp: boolean;
  listDevices: boolean;
  measureAndroidPerformance: boolean;
  measureIosPerformance: boolean;
  performActionWithEvidence: boolean;
  requestManualHandoff: boolean;
  autoRemediate: boolean;
  rankFailureCandidates: boolean;
  recordScreen: boolean;
  recoverToKnownState: boolean;
  replayLastStablePath: boolean;
  resetAppState: boolean;
  queryUi: boolean;
  resolveUiTarget: boolean;
  scrollAndResolveUiTarget: boolean;
  scrollAndTapElement: boolean;
  scrollOnly: boolean;
  takeScreenshot: boolean;
  suggestKnownRemediation: boolean;
  tap: boolean;
  tapElement: boolean;
  terminateApp: boolean;
  durationMs?: number;
  resetStrategy?: ResetAppStateStrategy;
  bitrateMbps?: number;
  performancePreset?: AndroidPerformancePreset;
  performanceTemplate?: IosPerformanceTemplate;
  typeText: boolean;
  typeIntoElement: boolean;
  waitForUi: boolean;
  runCount: number;
  artifactPath?: string;
  outputPath?: string;
  lines?: number;
  sinceSeconds?: number;
  jsInspectorTimeoutMs?: number;
  includeDiagnostics?: boolean;
  x?: number;
  y?: number;
  launchUrl?: string;
  appId?: string;
  deviceId?: string;
  handoffReason?: "otp_required" | "captcha_required" | "consent_required" | "protected_page" | "secure_input_required" | "unknown";
  handoffSummary?: string;
  handoffActions?: string[];
  handoffResumeHints?: string[];
  handoffBlocking?: boolean;
  queryClassName?: string;
  queryClickable?: boolean;
  queryContentDesc?: string;
  queryLimit?: number;
  queryResourceId?: string;
  queryText?: string;
  text?: string;
  value?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  flowPath?: string;
  harnessConfigPath?: string;
  androidReplayOptions?: AndroidReplayOptions;
  sessionId?: string;
  metroBaseUrl?: string;
  targetId?: string;
  webSocketDebuggerUrl?: string;
  actionId?: string;
  actionType?: ActionIntent["actionType"];
  timeoutMs?: number;
  maxLogs?: number;
  maxEvents?: number;
  failuresOnly?: boolean;
  intervalMs?: number;
  waitUntil?: WaitForUiMode;
  maxSwipes?: number;
  swipeDirection?: UiScrollDirection;
  swipeDurationMs?: number;
  /** Gesture input for scroll_only tool. */
  gestureDirection?: "up" | "down" | "left" | "right";
  gestureStartRatio?: number;
  gestureEndRatio?: number;
  settleDelayMs?: number;
  platformProvided: boolean;
  useContextAlias: boolean;
  presetName?: "quick_debug_ios" | "quick_e2e_android" | "crash_triage_android";
}

export type PresetName = NonNullable<CliOptions["presetName"]>;
