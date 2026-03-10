import type { ReasonCode } from "./reason-codes.js";

export type Platform = "android" | "ios";
export type ToolStatus = "success" | "failed" | "partial";
export type RunnerProfile = "phase1" | "native_android" | "native_ios" | "flutter_android";
export type CapabilitySupportLevel = "full" | "partial" | "unsupported";
export type ExecutionEvidenceKind = "ui_dump" | "screenshot" | "log" | "crash_signal" | "diagnostics_bundle" | "debug_summary";

export interface ExecutionEvidence {
  kind: ExecutionEvidenceKind;
  path: string;
  supportLevel: "full" | "partial";
  description: string;
}

export interface ToolCapability {
  toolName: string;
  supportLevel: CapabilitySupportLevel;
  note: string;
  requiresSession?: boolean;
}

export interface CapabilityGroup {
  groupName: string;
  supportLevel: CapabilitySupportLevel;
  toolNames: string[];
  note?: string;
}

export interface CapabilityProfile {
  platform: Platform;
  runnerProfile: RunnerProfile | null;
  toolCapabilities: ToolCapability[];
  groups: CapabilityGroup[];
}

export interface SessionTimelineEvent { timestamp: string; type: string; detail?: string; }
export interface Session { sessionId: string; platform: Platform; deviceId: string; appId: string; policyProfile: string; startedAt: string; artifactsRoot: string; timeline: SessionTimelineEvent[]; profile?: RunnerProfile | null; phase?: string | null; sampleName?: string | null; capabilities?: CapabilityProfile; }
export interface ToolResult<TData = unknown> { status: ToolStatus; reasonCode: ReasonCode; sessionId: string; durationMs: number; attempts: number; artifacts: string[]; data: TData; nextSuggestions: string[]; }
export interface DeviceInfo { id: string; name?: string; platform: Platform; state: string; available: boolean; capabilities?: CapabilityProfile; }
export interface DoctorCheck { name: string; status: "pass" | "warn" | "fail"; detail: string; }
export interface DoctorInput { includeUnavailable?: boolean; }
export interface InspectUiNode {
  index?: number;
  text?: string;
  resourceId?: string;
  className?: string;
  packageName?: string;
  contentDesc?: string;
  clickable: boolean;
  enabled: boolean;
  scrollable: boolean;
  bounds?: string;
}
export interface UiPoint {
  x: number;
  y: number;
}
export interface UiBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  center: UiPoint;
}
export interface InspectUiSummary {
  totalNodes: number;
  clickableNodes: number;
  scrollableNodes: number;
  nodesWithText: number;
  nodesWithContentDesc: number;
  sampleNodes: InspectUiNode[];
}
export type InspectUiMatchField = "resourceId" | "contentDesc" | "text" | "className" | "clickable";
export interface InspectUiQuery {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
  limit?: number;
}
export interface InspectUiMatch {
  node: InspectUiNode;
  matchedBy: InspectUiMatchField[];
  score?: number;
}
export type UiTargetResolutionStatus = "resolved" | "no_match" | "ambiguous" | "missing_bounds" | "unsupported" | "not_executed";
export interface UiTargetResolution {
  status: UiTargetResolutionStatus;
  matchCount: number;
  query: InspectUiQuery;
  matches: InspectUiMatch[];
  matchedNode?: InspectUiNode;
  resolvedBounds?: UiBounds;
  resolvedPoint?: UiPoint;
}
export interface InspectUiQueryResult {
  query: InspectUiQuery;
  totalMatches: number;
  matches: InspectUiMatch[];
}
export type QueryUiMatchField = InspectUiMatchField;
export interface QueryUiSelector extends InspectUiQuery {}
export interface QueryUiMatch extends InspectUiMatch {}
export interface QueryUiData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  query: InspectUiQuery;
  command: string[];
  exitCode: number | null;
  result: InspectUiQueryResult;
  supportLevel: "full" | "partial";
  evidence?: ExecutionEvidence[];
  content?: string;
  summary?: InspectUiSummary;
}
export interface GetLogsInput {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  outputPath?: string;
  lines?: number;
  sinceSeconds?: number;
  query?: string;
  dryRun?: boolean;
}
export interface DebugSignalSummary {
  category: "crash" | "anr" | "exception" | "error" | "warning" | "timeout" | "other";
  count: number;
  sample: string;
}
export interface LogSummary {
  totalLines: number;
  matchedLines: number;
  query?: string;
  topSignals: DebugSignalSummary[];
  sampleLines: string[];
}
export interface GetLogsData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  lineCount: number;
  linesRequested?: number;
  sinceSeconds: number;
  appId?: string;
  appFilterApplied: boolean;
  evidence?: ExecutionEvidence[];
  query?: string;
  content?: string;
  summary?: LogSummary;
}
export interface GetCrashSignalsInput {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  outputPath?: string;
  lines?: number;
  dryRun?: boolean;
}
export interface GetCrashSignalsData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  signalCount: number;
  linesRequested?: number;
  appId?: string;
  entries: string[];
  evidence?: ExecutionEvidence[];
  content?: string;
  summary?: LogSummary;
}
export interface CollectDiagnosticsInput {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  outputPath?: string;
  dryRun?: boolean;
}
export interface CollectDiagnosticsData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  artifactCount: number;
  artifacts: string[];
  evidence?: ExecutionEvidence[];
}
export interface CollectDebugEvidenceInput {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  metroBaseUrl?: string;
  outputPath?: string;
  logLines?: number;
  targetId?: string;
  webSocketDebuggerUrl?: string;
  includeJsInspector?: boolean;
  sinceSeconds?: number;
  query?: string;
  includeDiagnostics?: boolean;
  dryRun?: boolean;
}
export interface CollectDebugEvidenceData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  supportLevel: "full" | "partial";
  appId?: string;
  jsDebugMetroBaseUrl?: string;
  jsDebugTargetEndpoint?: string;
  jsDebugTargetCandidateCount?: number;
  jsDebugTargetId?: string;
  jsDebugTargetTitle?: string;
  jsDebugTargetSelectionReason?: string;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  jsConsoleLogCount?: number;
  jsNetworkEventCount?: number;
  jsConsoleSummary?: JsConsoleLogSummary;
  jsNetworkSummary?: JsNetworkFailureSummary;
  suspectAreas: string[];
  interestingSignals: DebugSignalSummary[];
  evidencePaths: string[];
  evidenceCount: number;
  evidence?: ExecutionEvidence[];
  narrative: string[];
}
export interface JsDebugTarget {
  id: string;
  title?: string;
  description?: string;
  deviceName?: string;
  webSocketDebuggerUrl?: string;
}
export interface ListJsDebugTargetsInput {
  sessionId?: string;
  metroBaseUrl?: string;
  timeoutMs?: number;
  dryRun?: boolean;
}
export interface ListJsDebugTargetsData {
  dryRun: boolean;
  metroBaseUrl: string;
  endpoint: string;
  targetCount: number;
  targets: JsDebugTarget[];
}
export interface JsConsoleLogEntry {
  level: string;
  text: string;
  timestamp?: number;
  exceptionId?: number;
  executionContextId?: number;
  sourceUrl?: string;
  lineNumber?: number;
  columnNumber?: number;
  exceptionType?: string;
  exceptionDescription?: string;
  stackTraceText?: string;
  remote?: boolean;
  stackFrameCount?: number;
  stackFrames?: JsStackFrame[];
}
export interface JsConsoleLogSummary {
  totalLogs: number;
  exceptionCount: number;
  levelCounts: Record<string, number>;
}
export interface JsStackFrame {
  functionName?: string;
  scriptId?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  native?: boolean;
}
export interface CaptureJsConsoleLogsInput {
  sessionId?: string;
  metroBaseUrl?: string;
  targetId?: string;
  webSocketDebuggerUrl?: string;
  maxLogs?: number;
  timeoutMs?: number;
  dryRun?: boolean;
}
export interface CaptureJsConsoleLogsData {
  dryRun: boolean;
  metroBaseUrl: string;
  targetId?: string;
  webSocketDebuggerUrl: string;
  collectedCount: number;
  logs: JsConsoleLogEntry[];
  summary: JsConsoleLogSummary;
}
export interface JsNetworkEvent {
  requestId: string;
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  errorText?: string;
  mimeType?: string;
}
export interface JsFailureGroup {
  key: string;
  count: number;
  sampleUrl?: string;
}
export interface JsNetworkFailureSummary {
  totalTrackedRequests: number;
  failedRequestCount: number;
  clientErrors: number;
  serverErrors: number;
  networkErrors: number;
  statusGroups: JsFailureGroup[];
  errorGroups: JsFailureGroup[];
  hostGroups: JsFailureGroup[];
}
export interface CaptureJsNetworkEventsInput {
  sessionId?: string;
  metroBaseUrl?: string;
  targetId?: string;
  webSocketDebuggerUrl?: string;
  maxEvents?: number;
  timeoutMs?: number;
  failuresOnly?: boolean;
  dryRun?: boolean;
}
export interface CaptureJsNetworkEventsData {
  dryRun: boolean;
  metroBaseUrl: string;
  targetId?: string;
  webSocketDebuggerUrl: string;
  collectedCount: number;
  failuresOnly: boolean;
  events: JsNetworkEvent[];
  summary: JsNetworkFailureSummary;
}
export interface DescribeCapabilitiesInput {
  sessionId?: string;
  platform: Platform;
  runnerProfile?: RunnerProfile | null;
}
export interface DescribeCapabilitiesData {
  platform: Platform;
  runnerProfile: RunnerProfile | null;
  capabilities: CapabilityProfile;
}
export interface InspectUiInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface InspectUiQueryInput extends InspectUiInput, InspectUiQuery {}
export interface QueryUiInput extends InspectUiQueryInput {}
export interface InstallAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; artifactPath?: string; deviceId?: string; dryRun?: boolean; }
export interface LaunchAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; launchUrl?: string; dryRun?: boolean; }
export interface ListDevicesInput { includeUnavailable?: boolean; }
export interface ScreenshotInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface TapInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; x: number; y: number; dryRun?: boolean; }
export interface TerminateAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; dryRun?: boolean; }
export interface TypeTextInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; text: string; dryRun?: boolean; }
export interface TapElementInput extends InspectUiQuery {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  outputPath?: string;
  dryRun?: boolean;
}
export interface TapElementData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  query: InspectUiQuery;
  matchCount?: number;
  resolution?: UiTargetResolution;
  matchedNode?: InspectUiNode;
  resolvedBounds?: UiBounds;
  resolvedX?: number;
  resolvedY?: number;
  command: string[];
  exitCode: number | null;
  supportLevel: "full" | "partial";
}
export interface ResolveUiTargetInput extends InspectUiQueryInput {}
export interface ResolveUiTargetData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  query: InspectUiQuery;
  command: string[];
  exitCode: number | null;
  result: InspectUiQueryResult;
  resolution: UiTargetResolution;
  supportLevel: "full" | "partial";
  content?: string;
  summary?: InspectUiSummary;
}
export interface TypeIntoElementInput extends InspectUiQueryInput {
  value: string;
}
export interface TypeIntoElementData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  query: InspectUiQuery;
  value: string;
  resolution: UiTargetResolution;
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
}
export type UiOrchestrationStep = "scroll_resolve" | "tap";
export interface UiOrchestrationStepResult {
  step: UiOrchestrationStep;
  status: ToolStatus;
  reasonCode: ReasonCode;
  note?: string;
}
export interface ScrollAndTapElementInput extends ScrollAndResolveUiTargetInput {}
export interface ScrollAndTapElementData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  query: InspectUiQuery;
  maxSwipes: number;
  swipeDirection: UiScrollDirection;
  swipeDurationMs: number;
  stepResults: UiOrchestrationStepResult[];
  resolveResult: ScrollAndResolveUiTargetData;
  tapResult?: TapElementData;
  supportLevel: "full" | "partial";
}
export interface InspectUiData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  evidence?: ExecutionEvidence[];
  platformSupportNote?: string;
  content?: string;
  summary?: InspectUiSummary;
}
export type WaitForUiMode = "visible" | "gone" | "unique";
export interface WaitForUiInput extends InspectUiQueryInput {
  timeoutMs?: number;
  intervalMs?: number;
  waitUntil?: WaitForUiMode;
}
export interface WaitForUiData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  query: InspectUiQuery;
  timeoutMs: number;
  intervalMs: number;
  waitUntil: WaitForUiMode;
  polls: number;
  command: string[];
  exitCode: number | null;
  result: InspectUiQueryResult;
  supportLevel: "full" | "partial";
  content?: string;
  summary?: InspectUiSummary;
}
export type UiScrollDirection = "up" | "down";
export interface ScrollAndResolveUiTargetInput extends ResolveUiTargetInput {
  maxSwipes?: number;
  swipeDirection?: UiScrollDirection;
  swipeDurationMs?: number;
}
export interface ScrollAndResolveUiTargetData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  query: InspectUiQuery;
  maxSwipes: number;
  swipeDirection: UiScrollDirection;
  swipeDurationMs: number;
  swipesPerformed: number;
  commandHistory: string[][];
  exitCode: number | null;
  result: InspectUiQueryResult;
  resolution: UiTargetResolution;
  supportLevel: "full" | "partial";
  content?: string;
  summary?: InspectUiSummary;
}
export interface RunFlowInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; flowPath?: string; harnessConfigPath?: string; runnerScript?: string; runCount?: number; dryRun?: boolean; artifactRoot?: string; deviceId?: string; appId?: string; launchUrl?: string; env?: Record<string, string>; }
export interface StartSessionInput { platform: Platform; sessionId?: string; deviceId?: string; appId?: string; policyProfile?: string; phase?: string | null; profile?: RunnerProfile | null; sampleName?: string | null; artifactsRoot?: string; harnessConfigPath?: string; }
export interface EndSessionInput { sessionId: string; artifacts?: string[]; }
