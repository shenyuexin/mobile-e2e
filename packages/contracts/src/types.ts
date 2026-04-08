import type { ReasonCode } from "./reason-codes.js";

export type Platform = "android" | "ios";
export type ToolStatus = "success" | "failed" | "partial";
export type RunnerProfile = "phase1" | "native_android" | "native_ios" | "flutter_android";
export type CapabilitySupportLevel = "full" | "conditional" | "partial" | "unsupported";
export type ManualHandoffReason = "otp_required" | "captcha_required" | "consent_required" | "protected_page" | "secure_input_required" | "unknown";
export type ProtectedPageObservability = "normal" | "ui_tree_only" | "screenshot_limited" | "limited";
export type ExecutionEvidenceKind = "ui_dump" | "screenshot" | "screen_recording" | "log" | "crash_signal" | "diagnostics_bundle" | "debug_summary" | "performance_trace" | "performance_summary" | "performance_export";
export type AppPhase = "launching" | "ready" | "loading" | "blocked" | "backgrounded" | "crashed" | "authentication" | "detail" | "catalog" | "empty" | "unknown";
export type StateReadiness = "ready" | "waiting_network" | "waiting_ui" | "degraded_success" | "backend_failed_terminal" | "offline_terminal" | "interrupted" | "unknown";
export type OrchestrationStepState = "ready_to_execute" | "recoverable_waiting" | "partial_progress" | "degraded_but_continue_safe" | "checkpoint_candidate" | "replay_recommended" | "terminal_stop";
export type EvidenceConfidence = "strong" | "moderate" | "weak" | "none";
export type ActionProgressMarker = "full" | "partial" | "none" | "ambiguous";
export type PostconditionStatus = "met" | "partial" | "not_met" | "unknown";
export type StateChangeCategory = "screen_transition" | "screen_title_transition" | "readiness_transition" | "blocking_signal_transition" | "same_screen_delta" | "no_material_change";
export type DiagnosisEscalationThreshold = "none" | "if_summary_inconclusive" | "if_no_action_record";
export type ReplayValue = "high" | "medium" | "low" | "unknown";
export type CheckpointDivergence = "none" | "screen_mismatch" | "readiness_mismatch" | "outcome_mismatch" | "signal_mismatch" | "unknown";
export type RetryBackoffClass = "none" | "short_ui_settle" | "bounded_wait_ready" | "reason_aware_retry";
export type TimelineEventLayer = "session" | "ui" | "state" | "action" | "log" | "crash" | "network" | "runtime" | "performance" | "environment" | "unknown";
export type EvidenceCompletenessLevel = "complete" | "partial" | "minimal" | "missing";
export type ActionResolutionStrategy = "deterministic" | "semantic" | "ocr" | "cv";
export type ActionOutcomeStatus = "success" | "failed" | "partial" | "unknown";
export type SupportedActionType = "tap_element" | "type_into_element" | "wait_for_ui" | "launch_app" | "terminate_app" | "swipe";
export type AffectedLayer = "ui_locator" | "ui_state" | "interruption" | "network" | "backend" | "runtime" | "crash" | "performance" | "environment" | "test_logic" | "unknown";
export type RecoveryStrategy = "none" | "wait_until_ready" | "relaunch_app" | "replay_last_successful_action";
export type OcrAllowedAction = "tap" | "assertText" | "longPress";
export type OcrBlockedAction = "delete" | "purchase" | "confirmPayment";
export type OcrMatchType = "exact" | "normalized" | "fuzzy" | "ai-reranked";
export type CrashType = "anr" | "native_crash" | "oom" | "uncaught_exception" | "watchdog" | "unknown";

export interface CrashAttribution {
  crashTypes: CrashType[];
  primaryCrashType: CrashType;
  processName?: string;
  signal?: string;
  faultAddress?: string;
  crashedThread?: {
    name?: string;
    state?: string;
    topFrames: string[];
  };
  suspectedCause?: string;
  confidence: "high" | "medium" | "low";
  relatedSignals: string[];
  suggestedActions: string[];
}
export type InterruptionType = "system_alert" | "action_sheet" | "permission_prompt" | "app_modal" | "overlay" | "keyboard_blocking" | "unknown";
export type InterruptionSignalSource = "ui_tree" | "state_summary" | "runtime" | "visual";
export type InterruptionActionSlot = "primary" | "secondary" | "cancel" | "destructive";
export type InterruptionResolutionStatus = "resolved" | "denied" | "not_needed" | "failed";
export type InterruptionResolutionStrategy = "choose_slot" | "tap_selector" | "coordinate_tap" | "none";

export interface OcrBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OcrInput {
  screenshotPath: string;
  platform: Platform;
  languageHints?: string[];
  crop?: OcrBounds;
}

export interface OcrTextBlock {
  text: string;
  confidence: number;
  bounds: OcrBounds;
}

export interface OcrOutput {
  provider: string;
  engine: string;
  model?: string;
  durationMs: number;
  screenshotPath: string;
  capturedAt: string;
  blocks: OcrTextBlock[];
}

export interface OcrProvider {
  extractTextRegions(input: OcrInput): Promise<OcrOutput>;
}

export interface ResolveTextTargetInput {
  targetText: string;
  blocks: OcrTextBlock[];
  exact?: boolean;
  fuzzy?: boolean;
  maxCandidatesBeforeFail?: number;
}

export interface ResolveTextTargetResult {
  matched: boolean;
  confidence: number;
  bestCandidate?: OcrTextBlock;
  candidates: OcrTextBlock[];
  matchType?: OcrMatchType;
}

export interface OcrFallbackPolicy {
  enabled: boolean;
  allowedActions: OcrAllowedAction[];
  blockedActions: OcrBlockedAction[];
  minConfidenceForAssert: number;
  minConfidenceForTap: number;
  minConfidenceForRiskyAction: number;
  maxCandidatesBeforeFail: number;
  maxScreenshotAgeMs: number;
  retryLimit: number;
}

export interface OcrEvidence {
  provider: string;
  engine: string;
  model?: string;
  durationMs: number;
  matchedText?: string;
  candidateCount: number;
  matchType?: OcrMatchType;
  ocrConfidence?: number;
  screenshotPath?: string;
  selectedBounds?: OcrBounds;
  fallbackReason?: string;
  postVerificationResult?: "passed" | "failed" | "not_run";
}

export interface OcrCapabilitySummary {
  supported: boolean;
  deterministicFirst: boolean;
  hostRequirement: "darwin";
  defaultProvider?: string;
  configuredProviders: string[];
  allowedActions: OcrAllowedAction[];
  blockedActions: OcrBlockedAction[];
  minConfidenceForAssert: number;
  minConfidenceForTap: number;
  maxCandidatesBeforeFail: number;
  retryLimit: number;
}

export interface InterruptionSignal {
  source: InterruptionSignalSource;
  key: string;
  value?: string;
  confidence: number;
  evidence?: string;
}

export interface InterruptionClassification {
  type: InterruptionType;
  confidence: number;
  rationale: string[];
  ownerPackage?: string;
  ownerBundle?: string;
  containerRole?: string;
  buttonSlots?: InterruptionActionSlot[];
}

export interface InterruptionPolicySignature {
  ownerPackage?: string;
  ownerBundle?: string;
  containerRole?: string;
  requiredSignals?: string[];
  anyText?: string[];
}

export interface InterruptionPolicyRuleV2 {
  id: string;
  platform: Platform;
  type: InterruptionType;
  priority: "high" | "medium" | "low";
  auto: boolean;
  signature: InterruptionPolicySignature;
  action: {
    strategy: InterruptionResolutionStrategy;
    slot?: InterruptionActionSlot;
    tapText?: string;
    tapResourceId?: string;
    firstAvailableText?: string[];
  };
  retry?: {
    maxAttempts: number;
  };
}

export interface ResumeCheckpoint {
  actionId: string;
  sessionId: string;
  platform: Platform;
  actionType: SupportedActionType;
  selector?: InspectUiQuery;
  params?: Record<string, unknown>;
  createdAt: string;
}

export interface InterruptionEvent {
  eventId: string;
  timestamp: string;
  actionId?: string;
  type: InterruptionType;
  confidence: number;
  source: InterruptionSignalSource;
  ruleId?: string;
  status: InterruptionResolutionStatus;
  detail?: string;
  artifactRefs: string[];
  signals: InterruptionSignal[];
  classification?: InterruptionClassification;
}

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
  condition?: string;
  promotionGate?: SupportPromotionGate;
}

export interface CapabilityGroup {
  groupName: string;
  supportLevel: CapabilitySupportLevel;
  toolNames: string[];
  note?: string;
  condition?: string;
  promotionGate?: SupportPromotionGate;
}

export interface SupportPromotionGate {
  blocked: boolean;
  requiredProofLanes: Array<"simulator" | "real_device">;
  blockingReasons: string[];
}

export interface CapabilityProfile {
  platform: Platform;
  runnerProfile: RunnerProfile | null;
  toolCapabilities: ToolCapability[];
  groups: CapabilityGroup[];
  ocrFallback?: OcrCapabilitySummary;
}

export interface ProtectedPageAssessment {
  suspected: boolean;
  observability: ProtectedPageObservability;
  signals: string[];
  note?: string;
}

export interface ManualHandoffRecommendation {
  required: boolean;
  reason: ManualHandoffReason;
  summary: string;
  suggestedOperatorActions: string[];
  resumeHints: string[];
}

export interface StateSummary {
  screenId?: string;
  screenTitle?: string;
  routeName?: string;
  appPhase: AppPhase;
  readiness: StateReadiness;
  blockingSignals: string[];
   stateConfidence?: number;
   pageHints?: string[];
  derivedSignals?: string[];
  visibleTargetCount?: number;
  candidateActions?: string[];
  recentFailures?: string[];
  topVisibleTexts?: string[];
  protectedPage?: ProtectedPageAssessment;
  manualHandoff?: ManualHandoffRecommendation;
}
export interface EvidenceCompleteness {
  level: EvidenceCompletenessLevel;
  capturedKinds: ExecutionEvidenceKind[];
  missingEvidence: string[];
}
export interface ActionIntent {
  actionType: SupportedActionType;
  identifier?: string;
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
  limit?: number;
  value?: string;
  appId?: string;
  launchUrl?: string;
  timeoutMs?: number;
  intervalMs?: number;
  waitUntil?: WaitForUiMode;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  durationMs?: number;
}
export interface EvidenceDeltaSummary {
  uiDiffSummary?: string;
  networkDeltaSummary?: string;
  runtimeDeltaSummary?: string;
  logDeltaSummary?: string;
}
export interface ActionOutcomeSummary {
  actionId: string;
  actionType: SupportedActionType;
  resolutionStrategy: ActionResolutionStrategy;
  preState?: StateSummary;
  postState?: StateSummary;
  stateChanged: boolean;
  fallbackUsed: boolean;
  retryCount: number;
  stepState?: OrchestrationStepState;
  progressMarker?: ActionProgressMarker;
  evidenceConfidence?: EvidenceConfidence;
  stateChangeCategory?: StateChangeCategory;
  stateChangeConfidence?: EvidenceConfidence;
  networkReadinessClass?: "retryable_waiting" | "degraded_success" | "terminal_backend_failed" | "terminal_offline" | "unknown";
  postconditionMet?: boolean;
  postconditionStatus?: PostconditionStatus;
  targetQuality?: "high" | "medium" | "low";
  failureCategory?: "selector_missing" | "selector_ambiguous" | "blocked" | "waiting" | "no_state_change" | "transport" | "unsupported";
  confidence?: number;
  ocrEvidence?: OcrEvidence;
  outcome: ActionOutcomeStatus;
}
export interface FailureAttribution {
  affectedLayer: AffectedLayer;
  mostLikelyCause: string;
  candidateCauses: string[];
  missingEvidence: string[];
  recommendedNextProbe?: string;
  recommendedRecovery?: string;
}
export interface DiagnosisPacket {
  strongestSuspectLayer: AffectedLayer;
  strongestCausalSignal: string;
  confidence: EvidenceConfidence;
  recommendedNextProbe?: string;
  recommendedRecovery?: string;
  escalationThreshold: DiagnosisEscalationThreshold;
}
export interface RecoverySummary {
  strategy: RecoveryStrategy;
  recovered: boolean;
  note: string;
  stateBefore?: StateSummary;
  stateAfter?: StateSummary;
  replayedActionId?: string;
  stopReasonCode?: ReasonCode;
  checkpointDecision?: CheckpointDecisionTrace;
  replayValue?: ReplayValue;
  checkpointDivergence?: CheckpointDivergence;
}
export interface RetryDecisionTrace {
  stepState: OrchestrationStepState;
  evidenceConfidence: EvidenceConfidence;
  retryAllowed: boolean;
  maxAttempts: number;
  attemptIndex: number;
  backoffClass: RetryBackoffClass;
  stateChangeRequired: boolean;
  stopReason?: string;
}
export interface PostActionVerificationTrace {
  postconditionMet: boolean;
  postconditionStatus?: PostconditionStatus;
  progressMarker?: ActionProgressMarker;
  attempts: number;
  verificationSignals: string[];
}
export interface CheckpointDecisionTrace {
  checkpointCandidate: boolean;
  checkpointActionId?: string;
  replayRecommended: boolean;
  replayRefused: boolean;
  replayRefusalReason?: string;
  stableBoundaryReason?: string;
}
export type AutoRemediationStopReason =
  | "not_requested"
  | "action_succeeded"
  | "manual_handoff_required"
  | "missing_session_record"
  | "missing_evidence_window"
  | "selector_missing"
  | "selector_ambiguous"
  | "target_obscured"
  | "blocked_by_state"
  | "low_target_quality"
  | "weak_attribution"
  | "allowlist_miss"
  | "policy_denied"
  | "audit_unavailable"
  | "already_attempted"
  | "high_risk_replay"
  | "retry_exhausted_no_state_change"
  | "backend_terminal"
  | "offline_terminal"
  | "recovery_failed"
  | "recovery_not_recovered"
  | "recovered";
export interface AutoRemediationResult {
  attempted: boolean;
  actionId?: string;
  triggerReason: string;
  selectedRecovery?: RecoveryStrategy;
  recovered: boolean;
  stopReason: AutoRemediationStopReason;
  stopDetail: string;
  stateMachineStatus?: OrchestrationStepState;
  stateMachineTrace?: string[];
  stateBefore?: StateSummary;
  stateAfter?: StateSummary;
  artifactRefs: string[];
  attribution?: FailureAttribution;
  remediationSuggestions: string[];
  candidateLayers?: AffectedLayer[];
  policyProfile?: string;
}
export interface FailureSignature {
  actionType: SupportedActionType;
  screenId?: string;
  affectedLayer: AffectedLayer;
  topSignal?: string;
  interruptionCategory?: string;
  readiness?: StateReadiness;
  progressMarker?: ActionProgressMarker;
  stateChangeCategory?: StateChangeCategory;
}
export interface SimilarFailure {
  actionId: string;
  sessionId: string;
  signature: FailureSignature;
  matchScore: number;
  matchedSignals?: string[];
  replayValue?: ReplayValue;
}
export interface BaselineComparison {
  baselineActionId?: string;
  comparedActionId: string;
  differences: string[];
  matched: boolean;
  divergenceSignals?: string[];
  replayValue?: ReplayValue;
  checkpointDivergence?: CheckpointDivergence;
}
export interface TimelineEvent {
  eventId?: string;
  timestamp: string;
  type: string;
  detail?: string;
  eventType?: string;
  actionId?: string;
  layer?: TimelineEventLayer;
  summary?: string;
  artifactRefs?: string[];
  stateSummary?: StateSummary;
  evidenceCompleteness?: EvidenceCompleteness;
}
export interface SessionTimelineEvent extends TimelineEvent {}
export interface Session { sessionId: string; platform: Platform; deviceId: string; appId: string; policyProfile: string; startedAt: string; artifactsRoot: string; timeline: SessionTimelineEvent[]; profile?: RunnerProfile | null; phase?: string | null; sampleName?: string | null; capabilities?: CapabilityProfile; latestStateSummary?: StateSummary; interruptionEvents?: InterruptionEvent[]; lastInterruptedActionCheckpoint?: ResumeCheckpoint; }
export interface ToolResult<TData = unknown> { status: ToolStatus; reasonCode: ReasonCode; sessionId: string; durationMs: number; attempts: number; artifacts: string[]; data: TData; nextSuggestions: string[]; }
export interface DeviceInfo { id: string; name?: string; platform: Platform; state: string; available: boolean; capabilities?: CapabilityProfile; }
export interface DoctorCheck { name: string; status: "pass" | "warn" | "fail"; detail: string; }
export interface DoctorGuidanceItem { dependency: string; status: "pass" | "warn" | "fail"; platformScope: "android" | "ios" | "cross"; installCommands: string[]; verifyCommands: string[]; envHints: string[]; }
export interface DoctorData { checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] }; guidance: DoctorGuidanceItem[]; }
export interface DoctorInput { includeUnavailable?: boolean; }
export interface InspectUiNode {
  index?: number;
  depth?: number;
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
  matchQuality?: "exact" | "prefix" | "substring" | "boolean";
  scoreBreakdown?: string[];
  isOffScreen?: boolean;
  viewportOverlapPercent?: number;
  distanceToViewportCenter?: number;
  obscuredByHigherRanked?: boolean;
  overlapPercentWithHigherRanked?: number;
  visibilityHeuristics?: string[];
}
export type UiTargetResolutionStatus = "resolved" | "no_match" | "ambiguous" | "missing_bounds" | "disabled_match" | "off_screen" | "unsupported" | "not_executed";
export interface AmbiguityDiff {
  scoreDelta?: number;
  differingFields: Array<{
    field: "resourceId" | "contentDesc" | "text" | "className" | "clickable" | "enabled" | "bounds";
    left?: string;
    right?: string;
  }>;
  suggestedSelectors: InspectUiQuery[];
}
export interface UiTargetResolution {
  status: UiTargetResolutionStatus;
  matchCount: number;
  query: InspectUiQuery;
  matches: InspectUiMatch[];
  bestCandidate?: InspectUiMatch;
  ambiguityReason?: string;
  ambiguityDiff?: AmbiguityDiff;
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
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  outputPath?: string;
  lines?: number;
  sinceSeconds?: number;
  query?: string;
  /** Minimum log level to include. Android: V/D/I/W/E/F. iOS: approximate mapping (see docs). Default: include all. */
  minLogLevel?: "V" | "D" | "I" | "W" | "E" | "F";
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
  /** Whether the requested minLogLevel was actually applied (iOS may return false for I/D/V levels). */
  actualLevelFilterApplied?: boolean;
  /** Platform-specific note when the requested level cannot be exactly matched (e.g., iOS INFO-only filtering not supported). */
  platformLevelNote?: string;
}
export interface GetCrashSignalsInput {
  sessionId: string;
  platform?: Platform;
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
  /** Structured crash attribution (Phase 11-03). Only present when crash signals are detected. */
  crashAttribution?: CrashAttribution;
}
export interface CollectDiagnosticsInput {
  sessionId: string;
  platform?: Platform;
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
  platform?: Platform;
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
  jsInspectorTimeoutMs?: number;
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
  diagnosisPacket?: DiagnosisPacket;
  diagnosisBriefing: string[];
  suspectAreas: string[];
  interestingSignals: DebugSignalSummary[];
  evidencePaths: string[];
  evidenceCount: number;
  evidence?: ExecutionEvidence[];
  narrative: string[];
}
export type PerformanceCaptureMode = "time_window";
export type PerformanceLikelihood = "yes" | "no" | "unknown";
export type PerformanceSuspectCategory = "cpu" | "jank" | "memory" | "unknown";
export type PerformanceSeverity = "none" | "low" | "moderate" | "high" | "unknown";
export type AndroidPerformancePreset = "general" | "startup" | "interaction" | "scroll";
export type IosPerformanceTemplate = "time-profiler" | "animation-hitches" | "memory";
export interface PerformanceArtifactBundle {
  configPath?: string;
  tracePath?: string;
  traceBundlePath?: string;
  exportPath?: string;
  tocPath?: string;
  rawAnalysisPath?: string;
  summaryPath: string;
  reportPath: string;
}
export interface PerformanceProcessSignal {
  name: string;
  cpuPercent?: number;
  scheduledMs?: number;
}
export interface PerformanceHotspot {
  name: string;
  processName?: string;
  totalDurMs?: number;
  occurrences?: number;
}
export interface PerformanceSignalSummary {
  status: PerformanceSeverity;
  note: string;
}
export interface PerformanceCpuSummary extends PerformanceSignalSummary {
  topProcess?: string;
  topProcessCpuPercent?: number;
  topProcesses: PerformanceProcessSignal[];
  topHotspots: PerformanceHotspot[];
}
export interface PerformanceJankSummary extends PerformanceSignalSummary {
  slowFrameCount?: number;
  frozenFrameCount?: number;
  avgFrameTimeMs?: number;
  worstFrameTimeMs?: number;
}
export interface PerformanceMemorySummary extends PerformanceSignalSummary {
  rssDeltaKb?: number;
  peakRssKb?: number;
  dominantProcess?: string;
  allocationRowCount?: number;
  largestAllocationKb?: number;
  totalAllocatedKb?: number;
  topAllocationCategories?: string[];
  allocationCountByProcess?: Record<string, number>;
  memoryPressureSignal?: "growth_spike" | "steady" | "unknown";
  captureScope?: "attached_process" | "all_processes" | "unknown";
}
export interface PerformanceStructuredSummary {
  captureMode: PerformanceCaptureMode;
  durationMs: number;
  supportLevel: "full" | "partial";
  performanceProblemLikely: PerformanceLikelihood;
  likelyCategory: PerformanceSuspectCategory;
  confidence: "low" | "medium" | "high";
  cpu: PerformanceCpuSummary;
  jank: PerformanceJankSummary;
  memory: PerformanceMemorySummary;
}
export interface MeasureAndroidPerformanceInput {
  sessionId: string;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  durationMs?: number;
  preset?: AndroidPerformancePreset;
  outputPath?: string;
  dryRun?: boolean;
}
export interface MeasureAndroidPerformanceData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  durationMs: number;
  captureMode: PerformanceCaptureMode;
  preset: AndroidPerformancePreset;
  appId?: string;
  commandLabels: string[];
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  artifactPaths: string[];
  artifactsByKind: PerformanceArtifactBundle;
  summary: PerformanceStructuredSummary;
  suspectAreas: string[];
  diagnosisBriefing: string[];
  evidence?: ExecutionEvidence[];
}
export interface MeasureIosPerformanceInput {
  sessionId: string;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  durationMs?: number;
  template?: IosPerformanceTemplate;
  outputPath?: string;
  dryRun?: boolean;
}
export interface MeasureIosPerformanceData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  durationMs: number;
  captureMode: PerformanceCaptureMode;
  template: IosPerformanceTemplate;
  appId?: string;
  commandLabels: string[];
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  artifactPaths: string[];
  artifactsByKind: PerformanceArtifactBundle;
  summary: PerformanceStructuredSummary;
  suspectAreas: string[];
  diagnosisBriefing: string[];
  evidence?: ExecutionEvidence[];
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
export interface GetScreenSummaryInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  outputPath?: string;
  includeDebugSignals?: boolean;
  dryRun?: boolean;
}
export interface GetScreenSummaryData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  summarySource: "ui_only" | "ui_and_debug_signals";
  screenSummary: StateSummary;
  evidence?: ExecutionEvidence[];
  content?: string;
  uiSummary?: InspectUiSummary;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  /** Crash attribution from internal getCrashSignals call (Phase 11). Only present when crash signals detected. */
  crashAttribution?: CrashAttribution;
}
export interface GetSessionStateInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  dryRun?: boolean;
}
export interface GetSessionStateData {
  dryRun: boolean;
  platform: Platform;
  runnerProfile: RunnerProfile;
  sessionRecordFound: boolean;
  state: StateSummary;
  latestKnownState?: StateSummary;
  latestKnownStateDelta?: string[];
  capabilities: CapabilityProfile;
  screenSummary: StateSummary;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  /** Crash attribution from internal getCrashSignals call (Phase 11). Only present when crash signals detected. */
  crashAttribution?: CrashAttribution;
  evidence?: ExecutionEvidence[];
}
export interface RequestManualHandoffInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  reason: ManualHandoffReason;
  summary?: string;
  suggestedOperatorActions?: string[];
  resumeHints?: string[];
  blocking?: boolean;
  artifactRefs?: string[];
  stateSummary?: StateSummary;
  dryRun?: boolean;
}
export interface RequestManualHandoffData {
  requested: boolean;
  handoffId: string;
  reason: ManualHandoffReason;
  blocking: boolean;
  recordedAt: string;
  operatorPrompt: string;
  stateSummary?: StateSummary;
}
export interface PerformActionWithEvidenceInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  backendUrl?: string;
  includeDebugSignals?: boolean;
  autoRemediate?: boolean;
  action: ActionIntent;
  dryRun?: boolean;
}
export interface PerformActionWithEvidenceData {
  sessionRecordFound: boolean;
  outcome: ActionOutcomeSummary;
  evidenceDelta: EvidenceDeltaSummary;
  preStateSummary?: StateSummary;
  postStateSummary?: StateSummary;
  postActionRefreshAttempted?: boolean;
  retryRecommendationTier?: "none" | "inspect_only" | "refine_selector" | "wait_then_retry" | "refresh_context" | "recover_first" | "handoff_required";
  retryRecommendation?: RetryRecommendation;
  retryDecisionTrace?: RetryDecisionTrace;
  postActionVerificationTrace?: PostActionVerificationTrace;
  checkpointDecisionTrace?: CheckpointDecisionTrace;
  timelineDecisionMarkers?: string[];
  actionabilityReview?: string[];
  manualHandoffRequired?: boolean;
  manualHandoffReason?: ManualHandoffReason;
  lowLevelStatus: ToolStatus;
  lowLevelReasonCode: ReasonCode;
  evidence?: ExecutionEvidence[];
  sessionAuditPath?: string;
  autoRemediation?: AutoRemediationResult;
  preActionInterruption?: ResolveInterruptionData;
  postActionInterruption?: ResolveInterruptionData;
  /** Structured crash attribution from post-action state. Only present when crash signals detected. */
  crashAttribution?: CrashAttribution;
  /** Network probe result attached when failure category is network-related (Plan 18-01). */
  networkProbe?: NetworkReadinessProbe;
  /** Recovery strategy derived from network probe (Plan 18-01). */
  networkRecoveryStrategy?: NetworkRecoveryStrategy;
}
export interface DetectInterruptionInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  actionId?: string;
  dryRun?: boolean;
}
export interface DetectInterruptionData {
  detected: boolean;
  sessionRecordFound: boolean;
  stateSummary?: StateSummary;
  classification?: InterruptionClassification;
  signals: InterruptionSignal[];
  evidence?: ExecutionEvidence[];
}
export interface ClassifyInterruptionInput extends DetectInterruptionInput {
  signals?: InterruptionSignal[];
}
export interface ClassifyInterruptionData {
  found: boolean;
  classification?: InterruptionClassification;
  signals: InterruptionSignal[];
}
export interface ResolveInterruptionInput extends DetectInterruptionInput {
  classification?: InterruptionClassification;
  preferredSlot?: InterruptionActionSlot;
  checkpoint?: ResumeCheckpoint;
}
export interface ResolveInterruptionData {
  attempted: boolean;
  status: InterruptionResolutionStatus;
  strategy: InterruptionResolutionStrategy;
  classification?: InterruptionClassification;
  matchedRuleId?: string;
  selectedSlot?: InterruptionActionSlot;
  resolutionAttempts?: number;
  verifiedCleared?: boolean;
  event?: InterruptionEvent;
}
export interface ResumeInterruptedActionInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  checkpoint?: ResumeCheckpoint;
  dryRun?: boolean;
}
export interface ResumeInterruptedActionData {
  attempted: boolean;
  resumed: boolean;
  checkpoint?: ResumeCheckpoint;
  stateBefore?: StateSummary;
  stateAfter?: StateSummary;
  driftDetected?: boolean;
}
export interface GetActionOutcomeInput {
  sessionId?: string;
  actionId: string;
}
export interface GetActionOutcomeData {
  found: boolean;
  actionId: string;
  sessionId?: string;
  outcome?: ActionOutcomeSummary;
  diagnosisPacket?: DiagnosisPacket;
  retryRecommendationTier?: PerformActionWithEvidenceData["retryRecommendationTier"];
  retryRecommendation?: RetryRecommendation;
  retryDecisionTrace?: RetryDecisionTrace;
  postActionVerificationTrace?: PostActionVerificationTrace;
  checkpointDecisionTrace?: CheckpointDecisionTrace;
  evidenceDelta?: EvidenceDeltaSummary;
  evidence?: ExecutionEvidence[];
  lowLevelStatus?: ToolStatus;
  lowLevelReasonCode?: ReasonCode;
}
export interface ExplainLastFailureInput {
  sessionId: string;
}
export interface ExplainLastFailureData {
  found: boolean;
  actionId?: string;
  outcome?: ActionOutcomeSummary;
  diagnosisPacket?: DiagnosisPacket;
  retryRecommendationTier?: PerformActionWithEvidenceData["retryRecommendationTier"];
  retryRecommendation?: RetryRecommendation;
  attribution?: FailureAttribution;
}
export interface RetryRecommendation {
  tier: NonNullable<PerformActionWithEvidenceData["retryRecommendationTier"]>;
  reason: string;
  suggestedAction: string;
}
export interface RankFailureCandidatesInput {
  sessionId: string;
}
export interface RankFailureCandidatesData {
  found: boolean;
  actionId?: string;
  candidates: FailureAttribution[];
}
export interface RecoverToKnownStateInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  dryRun?: boolean;
}
export interface RecoverToKnownStateData {
  summary: RecoverySummary;
}
export interface ReplayLastStablePathInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  dryRun?: boolean;
}
export interface ReplayLastStablePathData {
  summary: RecoverySummary;
  replayedOutcome?: ActionOutcomeSummary;
}

// --- Plan 18-02: Multi-Step Checkpoint Chain ---

export interface ReplayStepResult {
  stepIndex: number;
  actionId: string;
  actionType: string;
  status: "success" | "diverged" | "failed" | "skipped";
  reason?: string;
  originalOutcome?: ActionOutcomeSummary;
  replayedOutcome?: ActionOutcomeSummary;
}

export interface ReplayCheckpointChainInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  fromStep?: number;
  maxSteps?: number;
  dryRun?: boolean;
}

export interface ReplayCheckpointChainData {
  anchorActionId: string;
  replayedCount: number;
  succeededCount: number;
  divergedCount: number;
  skippedCount: number;
  perStepResults: ReplayStepResult[];
  overallStatus: "full" | "partial" | "failed";
  checkpointDecision?: CheckpointDecisionTrace;
  note: string;
}

export interface FindSimilarFailuresInput {
  sessionId: string;
  actionId?: string;
}
export interface FindSimilarFailuresData {
  found: boolean;
  actionId?: string;
  signature?: FailureSignature;
  similarFailures: SimilarFailure[];
}
export interface CompareAgainstBaselineInput {
  sessionId: string;
  actionId?: string;
}
export interface CompareAgainstBaselineData {
  found: boolean;
  actionId?: string;
  comparison?: BaselineComparison;
}
export interface SuggestKnownRemediationInput {
  sessionId: string;
  actionId?: string;
  platform?: Platform;
}
export interface SkillGuidedRemediation {
  route: string[];
  mostLikelyGap: string;
  why: string;
  askForNext: string[];
  firstFix: string;
  handoffSkill?: string;
}
export interface SuggestKnownRemediationData {
  found: boolean;
  actionId?: string;
  remediation: string[];
  skillGuidance?: SkillGuidedRemediation;
}
export interface ExecuteIntentStepInput {
  intent: string;
  actionType?: SupportedActionType;
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
  limit?: number;
  value?: string;
  appId?: string;
  launchUrl?: string;
  timeoutMs?: number;
  intervalMs?: number;
  waitUntil?: WaitForUiMode;
}
export interface ExecuteIntentInput extends ExecuteIntentStepInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  dryRun?: boolean;
}
export interface ExecuteIntentData {
  intent: string;
  selectedAction: ActionIntent;
  decision: string;
  candidateActionTypes: SupportedActionType[];
  outcome: ActionOutcomeSummary;
  preStateSummary?: StateSummary;
  postStateSummary?: StateSummary;
  retryRecommendationTier?: PerformActionWithEvidenceData["retryRecommendationTier"];
  actionabilityReview?: string[];
}
export interface TaskStepPlan {
  stepNumber: number;
  intent: string;
  selectedAction: ActionIntent;
  decision: string;
}
export interface TaskStepOutcome {
  stepNumber: number;
  intent: string;
  status: ToolStatus;
  reasonCode: ReasonCode;
  actionId?: string;
  artifacts: string[];
  decision: string;
}
export interface CompleteTaskInput {
  sessionId: string;
  goal: string;
  steps?: ExecuteIntentStepInput[];
  maxSteps?: number;
  stopOnFailure?: boolean;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  dryRun?: boolean;
}
export interface CompleteTaskData {
  goal: string;
  plannedSteps: TaskStepPlan[];
  outcomes: TaskStepOutcome[];
  completed: boolean;
  executedSteps: number;
  totalSteps: number;
}
export interface ExportSessionFlowInput {
  sessionId: string;
  outputPath?: string;
  includeLaunchStep?: boolean;
}
export interface ExportSessionFlowData {
  outputPath: string;
  stepCount: number;
  skippedCount: number;
  warnings: string[];
  preview: string;
}
export interface RecordTaskFlowInput extends ExportSessionFlowInput {
  goal?: string;
}
export interface RecordTaskFlowData extends ExportSessionFlowData {
  goal?: string;
}
export type RecordSessionStatus = "running" | "ended" | "cancelled";
export type RecordedEventType = "tap" | "type" | "swipe" | "back" | "home" | "app_switch";
export type RecordedStepConfidence = "high" | "medium" | "low";
export interface RawRecordedEvent {
  eventId: string;
  recordSessionId: string;
  timestamp: string;
  eventMonotonicMs?: number;
  eventType: RecordedEventType;
  x?: number;
  y?: number;
  normalizedPoint?: {
    x: number;
    y: number;
  };
  gesture?: {
    kind: "tap" | "swipe";
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    durationMs?: number;
  };
  resolvedSelector?: {
    identifier?: string;
    resourceId?: string;
    text?: string;
    value?: string;
    contentDesc?: string;
    className?: string;
  };
  textDelta?: string;
  foregroundApp?: string;
  uiSnapshotRef?: string;
  rawLine?: string;
}
export interface RecordedStep {
  stepNumber: number;
  eventId: string;
  timestamp: string;
  actionType: ActionIntent["actionType"] | "tap";
  actionIntent?: ActionIntent;
  x?: number;
  y?: number;
  confidence: RecordedStepConfidence;
  reason: string;
  warnings?: string[];
}
export interface StartRecordSessionInput {
  sessionId: string;
  platform?: Platform;
  deviceId?: string;
  appId?: string;
  recordingProfile?: string;
  dryRun?: boolean;
}
export interface StartRecordSessionData {
  recordSessionId: string;
  sessionId: string;
  platform: Platform;
  deviceId: string;
  appId?: string;
  recordingProfile: string;
  status: RecordSessionStatus;
  startedAt: string;
  captureChannels: string[];
  rawEventsPath: string;
  pid?: number;
}
export interface GetRecordSessionStatusInput {
  recordSessionId: string;
}
export interface RecordSessionStatusData {
  recordSessionId: string;
  sessionId: string;
  platform: Platform;
  deviceId: string;
  appId?: string;
  status: RecordSessionStatus;
  startedAt: string;
  endedAt?: string;
  rawEventCount: number;
  recordedStepCount: number;
  rawEventsPath: string;
  flowPath?: string;
  warnings: string[];
}
export interface ReplayDryRunSummary {
  status: ToolStatus;
  reasonCode: ReasonCode;
}
export type ReplayExecutionMode = "runner_compat" | "step_orchestrated";
export type ReplayStepStatus = "pending" | "running" | "success" | "partial" | "failed" | "skipped";
export interface ReplayProgressSummary {
  totalSteps: number;
  currentStepNumber?: number;
  completedSteps: number[];
  partialSteps: number[];
  failedSteps: number[];
  skippedSteps: number[];
  remainingSteps: number[];
  lastSuccessfulStepNumber?: number;
  firstFailedStepNumber?: number;
}
export interface ReplayStepOutcome {
  replayStepId: string;
  stepNumber: number;
  status: ReplayStepStatus;
  reasonCode: ReasonCode;
  actionId?: string;
  attempts: number;
  boundedRecoveryAttempted: boolean;
  selectedRecovery?: "none" | "wait_until_ready" | "recover_to_known_state" | "replay_last_stable_path";
  outcome?: ActionOutcomeSummary;
  retryDecisionTrace?: RetryDecisionTrace;
  postActionVerificationTrace?: PostActionVerificationTrace;
  checkpointDecisionTrace?: CheckpointDecisionTrace;
  actionabilityReview?: string[];
  artifacts: string[];
  evidence?: ExecutionEvidence[];
  blockingStepNumber?: number;
  stopReason?: string;
}
export interface FlowGenerationReport {
  flowPath?: string;
  stepCount: number;
  warnings: string[];
  confidenceSummary: {
    high: number;
    medium: number;
    low: number;
  };
  reviewRequired: boolean;
  replayDryRun?: ReplayDryRunSummary;
}
export interface EndRecordSessionInput {
  recordSessionId: string;
  autoExport?: boolean;
  outputPath?: string;
  runReplayDryRun?: boolean;
  includeLaunchStep?: boolean;
  dryRun?: boolean;
}
export interface EndRecordSessionData {
  recordSessionId: string;
  status: RecordSessionStatus;
  endedAt: string;
  report: FlowGenerationReport;
}
export interface CancelRecordSessionInput {
  recordSessionId: string;
}
export interface CancelRecordSessionData {
  recordSessionId: string;
  cancelled: boolean;
  status: RecordSessionStatus;
  endedAt?: string;
}
export interface InspectUiInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface InspectUiQueryInput extends InspectUiInput, InspectUiQuery {}
export interface QueryUiInput extends InspectUiQueryInput {}
export interface InstallAppInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; artifactPath?: string; deviceId?: string; dryRun?: boolean; }
export interface InstallAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  artifactPath?: string;
  installCommand: string[];
  exitCode: number | null;
}
export interface LaunchAppInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; launchUrl?: string; dryRun?: boolean; }
export interface LaunchAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  appId: string;
  launchUrl?: string;
  launchCommand: string[];
  exitCode: number | null;
}
export interface ListDevicesInput { includeUnavailable?: boolean; }
export interface ScreenshotInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface ScreenshotData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
  evidence?: ExecutionEvidence[];
}
export type ResetAppStateStrategy = "clear_data" | "uninstall_reinstall" | "keychain_reset";
export interface ResetAppStateInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  artifactPath?: string;
  strategy?: ResetAppStateStrategy;
  dryRun?: boolean;
}
export interface ResetAppStateData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  strategy: ResetAppStateStrategy;
  appId?: string;
  artifactPath?: string;
  commandLabels: string[];
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
}
export interface RecordScreenInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  outputPath?: string;
  durationMs?: number;
  bitrateMbps?: number;
  dryRun?: boolean;
}
export interface RecordScreenData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  durationMs: number;
  bitrateMbps?: number;
  commandLabels: string[];
  commands: string[][];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  evidence?: ExecutionEvidence[];
}
export interface TapInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; x: number; y: number; dryRun?: boolean; }
export interface TapData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  x: number;
  y: number;
  command: string[];
  exitCode: number | null;
}
export interface TerminateAppInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; dryRun?: boolean; }
export interface TerminateAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  appId: string;
  command: string[];
  exitCode: number | null;
}
export interface TypeTextInput { sessionId: string; platform?: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; text: string; dryRun?: boolean; }
export interface TypeTextData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  text: string;
  command: string[];
  exitCode: number | null;
}
export interface TapElementInput extends InspectUiQuery {
  sessionId: string;
  platform?: Platform;
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
  platform?: Platform;
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
  platform?: Platform;
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
export type AndroidTextInputStrategy = "auto" | "maestro" | "oem_fallback";
export interface AndroidReplayOptions {
  userId?: string;
  textInputStrategy?: AndroidTextInputStrategy;
  expectedAppPhase?: AppPhase;
}
export interface RunFlowInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  flowPath?: string;
  harnessConfigPath?: string;
  runnerScript?: string;
  runCount?: number;
  dryRun?: boolean;
  artifactRoot?: string;
  deviceId?: string;
  appId?: string;
  launchUrl?: string;
  env?: Record<string, string>;
  androidReplayOptions?: AndroidReplayOptions;
}
export interface RunFlowData {
  dryRun: boolean;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  artifactsDir: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  command: string[];
  exitCode: number | null;
  summaryLine?: string;
  executionMode?: ReplayExecutionMode;
  replayProgress?: ReplayProgressSummary;
  stepOutcomes?: ReplayStepOutcome[];
  finalReplayState?: OrchestrationStepState;
  checkpointSummary?: {
    lastCheckpointStepNumber?: number;
    replayRecommendedFromStepNumber?: number;
  };
}
export interface StartSessionInput { platform: Platform; sessionId?: string; deviceId?: string; appId?: string; policyProfile?: string; phase?: string | null; profile?: RunnerProfile | null; sampleName?: string | null; artifactsRoot?: string; harnessConfigPath?: string; }
export interface EndSessionInput { sessionId: string; artifacts?: string[]; }
export interface EndSessionData { closed: boolean; endedAt: string; }
export interface ListDevicesData { android: DeviceInfo[]; ios: DeviceInfo[]; }

// --- Plan 18-04: Element Screenshot & Visual Baseline ---

export interface ElementScreenshotInput {
  sessionId: string;
  selector: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
    role?: string;
  };
  outputPath?: string;
  cropPadding?: number;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  dryRun?: boolean;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementScreenshotData {
  fullScreenshotPath: string;
  croppedElementPath: string;
  elementBounds: ElementBounds;
  cropPadding: number;
  confidence: number;
}

export interface VisualDiffInput {
  sessionId?: string;
  selector?: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
    role?: string;
  };
  baselinePath?: string;
  currentPath?: string;
  threshold?: number;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  dryRun?: boolean;
}

export interface VisualStructuralDiff {
  addedElements?: string[];
  removedElements?: string[];
  changedText?: string[];
}

export interface VisualDiffData {
  baselinePath: string;
  currentPath: string;
  diffPath?: string;
  pixelDiffPercent: number;
  threshold: number;
  passed: boolean;
  structuralDiff?: VisualStructuralDiff;
}

// --- Plan 18-03: Flow Validation Before Export ---

export interface FlowStepValidation {
  stepIndex: number;
  stepType: string;
  resourceId?: string;
  status: "pass" | "fail" | "warn";
  reason?: string;
  suggestion?: string;
}

export interface ValidateFlowInput {
  sessionId?: string;
  flowPath?: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  dryRun?: boolean;
}

export interface ValidateFlowData {
  valid: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: FlowStepValidation[];
  warnedSteps: FlowStepValidation[];
  overallConfidence: number;
  validationSummary: string;
}

// --- Plan 18-01: Network-Aware Orchestration ---

export interface NetworkReadinessProbe {
  connected: boolean;
  latencyMs?: number;
  type: "wifi" | "cellular" | "ethernet" | "unknown";
  dnsOk: boolean;
  backendReachable: boolean;
  backendLatencyMs?: number;
  platform: "android" | "ios";
  /** Additional context about probe limitations (e.g., physical device probing is limited). */
  probeNote?: string;
}

export interface NetworkRecoveryStrategy {
  strategy: "toggle_airplane_mode" | "retry_extended_timeout" | "check_network_config" | "wait_and_retry" | "bounded_wait_for_backend" | "none";
  reason: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface NetworkProbeInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  appId?: string;
  backendUrl?: string;
  dryRun?: boolean;
}

export interface NetworkProbeData {
  probe: NetworkReadinessProbe;
  recoveryStrategy?: NetworkRecoveryStrategy;
  durationMs: number;
}
