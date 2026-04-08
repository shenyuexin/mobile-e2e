import {
  type ActionIntent,
  type ManualHandoffRecommendation,
  type ActionOutcomeSummary,
  type NetworkReadinessProbe,
  type NetworkRecoveryStrategy,
  type PerformActionWithEvidenceData,
  type PerformActionWithEvidenceInput,
  type Platform,
  REASON_CODES,
  type ResolveInterruptionData,
  type ResolveInterruptionInput,
  type ResumeInterruptedActionData,
  type ResumeInterruptedActionInput,
  type RunnerProfile,
  type RetryDecisionTrace,
  type SessionTimelineEvent,
  type ScreenshotData,
  type ScreenshotInput,
  type StateSummary,
  type TapData,
  type TapInput,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import type { MacVisionOcrProvider } from "@mobile-e2e-mcp/adapter-vision";
import { loadSessionRecord, persistActionRecord, persistSessionState, recordBaselineEntry } from "@mobile-e2e-mcp/core";
import { randomUUID } from "node:crypto";
import {
  buildActionabilityReview,
  buildActionEvidenceDelta,
  classifyActionProgressMarker,
  classifyPostconditionStatus,
  classifyStateChangeCategory,
  buildActionOutcomeConfidence,
  buildCheckpointDecisionTraceForAction,
  buildPostActionVerificationTrace,
  buildRetryRecommendation,
  buildRetryRecommendations,
  classifyActionFailureCategory,
  classifyNetworkReadiness,
  classifyNetworkRecoveryStrategy,
  classifyRetryRecommendationTier,
  classifyStepState,
  classifyTargetQuality,
  computeEvidenceConfidence,
  readResolutionSignal,
  retryBackoffClassForStep,
  shouldAttemptPostActionRefresh,
  shouldRetryStep,
  uniqueNonEmpty,
} from "./action-orchestrator-model.js";
import {
  probeNetworkReadiness,
} from "./network-probe.js";
import {
  canAttemptOcrFallback,
  executeOcrFallback,
} from "./action-orchestrator-ocr.js";
import { getScreenSummaryWithMaestro } from "./session-state.js";
import { tapWithMaestroTool } from "./ui-tools.js";
import { resolveInterruptionWithMaestro, resumeInterruptedActionWithMaestro, buildInterruptionCheckpoint } from "./interruption-tools.js";
import { takeScreenshotWithRuntime } from "./device-runtime.js";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";

export interface OcrFallbackTestHooks {
  createProvider?: () => Pick<MacVisionOcrProvider, "extractTextRegions">;
  takeScreenshot?: (input: ScreenshotInput) => Promise<ToolResult<ScreenshotData>>;
  tap?: (input: TapInput) => Promise<ToolResult<TapData>>;
  getScreenSummary?: typeof getScreenSummaryWithMaestro;
  now?: () => string;
}

export interface InterruptionGuardTestHooks {
  resolveInterruption?: (input: ResolveInterruptionInput) => Promise<ToolResult<ResolveInterruptionData>>;
  resumeInterruptedAction?: (input: ResumeInterruptedActionInput) => Promise<ToolResult<ResumeInterruptedActionData>>;
}

export interface ActionOrchestratorDeps {
  executeIntentWithMaestro?: (
    params: {
      sessionId: string;
      platform: Platform;
      runnerProfile: RunnerProfile;
      harnessConfigPath?: string;
      deviceId?: string;
      appId?: string;
      dryRun?: boolean;
    },
    action: ActionIntent,
  ) => Promise<ToolResult<unknown>>;
}

let ocrFallbackTestHooks: OcrFallbackTestHooks | undefined;
let interruptionGuardTestHooks: InterruptionGuardTestHooks | undefined;

export function setOcrFallbackTestHooksForTesting(hooks: OcrFallbackTestHooks | undefined): void {
  ocrFallbackTestHooks = hooks;
}

export function resetOcrFallbackTestHooksForTesting(): void {
  ocrFallbackTestHooks = undefined;
}

export function setInterruptionGuardTestHooksForTesting(hooks: InterruptionGuardTestHooks | undefined): void {
  interruptionGuardTestHooks = hooks;
}

export function resetInterruptionGuardTestHooksForTesting(): void {
  interruptionGuardTestHooks = undefined;
}

function isInterruptionGuardPassed(status: ResolveInterruptionData["status"] | undefined): boolean {
  return status === "resolved" || status === "not_needed";
}

function requiredManualHandoff(state?: StateSummary): ManualHandoffRecommendation | undefined {
  return state?.manualHandoff?.required ? state.manualHandoff : undefined;
}

function buildManualHandoffReview(params: {
  recommendation: ManualHandoffRecommendation;
  phase: "pre" | "post";
  stateSummary?: StateSummary;
}): string[] {
  return uniqueNonEmpty([
    `manual_handoff_required:${params.recommendation.reason}`,
    `manual_handoff_phase:${params.phase}`,
    "manual_handoff_blocking:true",
    params.recommendation.summary ? `manual_handoff_summary:${params.recommendation.summary}` : undefined,
    params.stateSummary?.protectedPage?.suspected ? "protected_page_suspected:true" : undefined,
    params.stateSummary?.protectedPage?.observability ? `protected_page_observability:${params.stateSummary.protectedPage.observability}` : undefined,
  ], 6);
}

function buildManualHandoffNextSuggestions(recommendation?: ManualHandoffRecommendation): string[] {
  if (!recommendation) {
    return [];
  }
  return uniqueNonEmpty([
    "Call request_manual_handoff before continuing this workflow.",
    ...(recommendation.suggestedOperatorActions ?? []),
    ...(recommendation.resumeHints ?? []),
  ], 5);
}

export async function performActionWithEvidenceWithMaestro(
  input: PerformActionWithEvidenceInput,
  deps: ActionOrchestratorDeps = {},
): Promise<ToolResult<PerformActionWithEvidenceData>> {
  const startTime = Date.now();
  const actionId = `action-${randomUUID()}`;
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: false,
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.1,
          outcome: "unknown",
        },
        evidenceDelta: { uiDiffSummary: "Action was not executed because platform could not be resolved." },
        lowLevelStatus: "failed",
        lowLevelReasonCode: REASON_CODES.configurationError,
      },
      nextSuggestions: ["Provide platform explicitly or start a session before calling perform_action_with_evidence."],
    };
  }

  const executeIntent = deps.executeIntentWithMaestro;
  if (!executeIntent) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: Boolean(sessionRecord),
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.1,
          outcome: "unknown",
        },
        evidenceDelta: { uiDiffSummary: "Action executor is not configured." },
        lowLevelStatus: "failed",
        lowLevelReasonCode: REASON_CODES.configurationError,
      },
      nextSuggestions: ["Action executor is unavailable in current runtime context."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const getScreenSummary = ocrFallbackTestHooks?.getScreenSummary ?? getScreenSummaryWithMaestro;
  const resolveInterruptionExecutor = interruptionGuardTestHooks?.resolveInterruption ?? resolveInterruptionWithMaestro;
  const resumeInterruptionExecutor = interruptionGuardTestHooks?.resumeInterruptedAction
    ?? ((resumeInput: ResumeInterruptedActionInput) => resumeInterruptedActionWithMaestro(resumeInput, { executeIntentWithMaestro: executeIntent }));

  const preActionInterruption = await resolveInterruptionExecutor({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    actionId,
    checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
    dryRun: input.dryRun,
  });
  if (!isInterruptionGuardPassed(preActionInterruption.data.status)) {
    const guardReasonCode = preActionInterruption.reasonCode === REASON_CODES.ok ? REASON_CODES.interruptionResolutionFailed : preActionInterruption.reasonCode;
    return {
      status: "failed",
      reasonCode: guardReasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: preActionInterruption.artifacts,
      data: {
        sessionRecordFound: Boolean(sessionRecord),
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.2,
          failureCategory: "blocked",
          outcome: "failed",
        },
        evidenceDelta: {
          uiDiffSummary: `Action was blocked by unresolved interruption (${preActionInterruption.data.status}).`,
        },
        lowLevelStatus: "failed",
        lowLevelReasonCode: guardReasonCode,
        preActionInterruption: preActionInterruption.data,
      },
      nextSuggestions: preActionInterruption.nextSuggestions.length > 0
        ? preActionInterruption.nextSuggestions
        : ["Resolve interruption manually or adjust policy/signature rules before retrying the action."],
    };
  }

  const preStateResult = await getScreenSummary({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: input.includeDebugSignals ?? true,
    dryRun: input.dryRun,
  });
  const preStateSummary = preStateResult.data.screenSummary;
  const preActionManualHandoff = requiredManualHandoff(preStateSummary);
  const manualHandoffPreblocked = Boolean(preActionManualHandoff);
  const lowLevelResult = manualHandoffPreblocked
    ? {
      status: "failed" as const,
      reasonCode: REASON_CODES.manualHandoffRequired,
      sessionId: input.sessionId,
      durationMs: 0,
      attempts: 0,
      artifacts: [] as string[],
      data: {},
      nextSuggestions: buildManualHandoffNextSuggestions(preActionManualHandoff),
    }
    : await executeIntent({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      dryRun: input.dryRun,
    }, input.action);

  const ocrFallbackResult = !manualHandoffPreblocked && canAttemptOcrFallback(input.action, lowLevelResult)
    ? await executeOcrFallback({
      input,
      platform,
      runnerProfile,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      preStateSummary,
      deps: {
        createProvider: ocrFallbackTestHooks?.createProvider,
        takeScreenshot: ocrFallbackTestHooks?.takeScreenshot ?? takeScreenshotWithRuntime,
        tap: ocrFallbackTestHooks?.tap ?? tapWithMaestroTool,
        getScreenSummary: ocrFallbackTestHooks?.getScreenSummary ?? getScreenSummaryWithMaestro,
        now: ocrFallbackTestHooks?.now,
      },
    })
    : undefined;

  let actionStatus = ocrFallbackResult?.attempted ? ocrFallbackResult.status : lowLevelResult.status;
  let actionReasonCode = ocrFallbackResult?.attempted ? ocrFallbackResult.reasonCode : lowLevelResult.reasonCode;
  const fallbackUsed = Boolean(ocrFallbackResult?.used);
  const postStateResult = manualHandoffPreblocked
    ? preStateResult
    : ocrFallbackResult?.postStateResult ?? await getScreenSummary({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: input.includeDebugSignals ?? true,
    dryRun: input.dryRun,
  });

  let postStateSummary = postStateResult.data.screenSummary;
  let stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
  const targetResolution = readResolutionSignal(lowLevelResult.data);
  let evidenceDelta = buildActionEvidenceDelta({
    preState: preStateSummary,
    postState: postStateSummary,
    preLogSummary: preStateResult.data.logSummary,
    postLogSummary: postStateResult.data.logSummary,
    preCrashSummary: preStateResult.data.crashSummary,
    postCrashSummary: postStateResult.data.crashSummary,
  });
  let failureCategory = classifyActionFailureCategory({
    finalStatus: actionStatus,
    finalReasonCode: actionReasonCode,
    preStateSummary,
    postStateSummary,
    lowLevelResult,
    stateChanged,
    targetResolution,
  });
  let stepState = classifyStepState({
    finalStatus: actionStatus,
    stateChanged,
    postState: postStateSummary,
    failureCategory,
  });
  let evidenceConfidence = computeEvidenceConfidence({
    stateChanged,
    preState: preStateSummary,
    postState: postStateSummary,
    evidenceDelta,
  });
  let manualHandoffContext: {
    phase: "pre" | "post";
    recommendation: ManualHandoffRecommendation;
    stateSummary: StateSummary;
  } | undefined = manualHandoffPreblocked
    ? { phase: "pre" as const, recommendation: preActionManualHandoff!, stateSummary: preStateSummary }
    : undefined;
  if (!manualHandoffContext) {
    const postActionManualHandoff = requiredManualHandoff(postStateSummary);
    if (postActionManualHandoff) {
      manualHandoffContext = { phase: "post" as const, recommendation: postActionManualHandoff, stateSummary: postStateSummary };
    }
  }
  if (manualHandoffContext) {
    actionStatus = manualHandoffContext.phase === "pre" ? "failed" : "partial";
    actionReasonCode = REASON_CODES.manualHandoffRequired;
    failureCategory = "blocked";
    stepState = "terminal_stop";
  }
  const maxRetryAttempts = stepState === "recoverable_waiting" || stepState === "partial_progress" ? 3 : stepState === "degraded_but_continue_safe" ? 2 : 1;
  let retryAttemptIndex = 1;
  let retryStopReason: string | undefined = manualHandoffContext ? "manual_handoff_required" : undefined;

  while (shouldRetryStep({ stepState, evidenceConfidence, attemptIndex: retryAttemptIndex, maxAttempts: maxRetryAttempts })) {
    const retryPostStateResult = await getScreenSummary({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      includeDebugSignals: input.includeDebugSignals ?? true,
      dryRun: input.dryRun,
    });
    retryAttemptIndex += 1;
    postStateSummary = retryPostStateResult.data.screenSummary;
    stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
    evidenceDelta = buildActionEvidenceDelta({
      preState: preStateSummary,
      postState: postStateSummary,
      preLogSummary: preStateResult.data.logSummary,
      postLogSummary: retryPostStateResult.data.logSummary,
      preCrashSummary: preStateResult.data.crashSummary,
      postCrashSummary: retryPostStateResult.data.crashSummary,
    });
    failureCategory = classifyActionFailureCategory({
      finalStatus: actionStatus,
      finalReasonCode: actionReasonCode,
      preStateSummary,
      postStateSummary,
      lowLevelResult,
      stateChanged,
      targetResolution,
    });
    stepState = classifyStepState({
      finalStatus: actionStatus,
      stateChanged,
      postState: postStateSummary,
      failureCategory,
    });
    evidenceConfidence = computeEvidenceConfidence({
      stateChanged,
      preState: preStateSummary,
      postState: postStateSummary,
      evidenceDelta,
    });
    const retryManualHandoff = requiredManualHandoff(postStateSummary);
    if (retryManualHandoff) {
      manualHandoffContext = { phase: "post", recommendation: retryManualHandoff, stateSummary: postStateSummary };
      actionStatus = "partial";
      actionReasonCode = REASON_CODES.manualHandoffRequired;
      failureCategory = "blocked";
      stepState = "terminal_stop";
      retryStopReason = "manual_handoff_required";
    }
    if (stateChanged || stepState === "checkpoint_candidate") {
      break;
    }
  }

  if (!stateChanged && retryAttemptIndex >= maxRetryAttempts && (stepState === "recoverable_waiting" || stepState === "partial_progress" || stepState === "degraded_but_continue_safe")) {
    retryStopReason = "retry_budget_exhausted_without_state_change";
    actionStatus = "failed";
    actionReasonCode = postStateSummary.readiness === "waiting_network"
      ? REASON_CODES.networkWaitRetryExhausted
      : REASON_CODES.retryExhaustedNoStateChange;
  }

  if (postStateSummary.readiness === "backend_failed_terminal") {
    actionStatus = "failed";
    actionReasonCode = REASON_CODES.networkBackendTerminal;
    stepState = "terminal_stop";
    retryStopReason = "backend_terminal_stop_early";
  }
  if (postStateSummary.readiness === "offline_terminal") {
    actionStatus = "failed";
    actionReasonCode = REASON_CODES.networkOfflineTerminal;
    stepState = "terminal_stop";
    retryStopReason = "offline_terminal_stop_early";
  }

  const retryDecisionTrace: RetryDecisionTrace = {
    stepState,
    evidenceConfidence,
    retryAllowed: shouldRetryStep({ stepState, evidenceConfidence, attemptIndex: retryAttemptIndex, maxAttempts: maxRetryAttempts }),
    maxAttempts: maxRetryAttempts,
    attemptIndex: retryAttemptIndex,
    backoffClass: retryBackoffClassForStep(stepState),
    stateChangeRequired: true,
    stopReason: retryStopReason,
  };

  const postActionVerificationTrace = buildPostActionVerificationTrace({
    actionType: input.action.actionType,
    finalStatus: actionStatus,
    stepState,
    stateChanged,
    preState: preStateSummary,
    postState: postStateSummary,
    attempts: retryAttemptIndex,
  });
  const checkpointDecisionTrace = buildCheckpointDecisionTraceForAction({
    actionId,
    stepState,
    failureCategory,
    stateChanged,
  });

  let postActionRefreshAttempted = false;
  let refreshedPostStateSummary: StateSummary | undefined;
  if (!manualHandoffContext && shouldAttemptPostActionRefresh({ failureCategory, finalStatus: actionStatus, stateChanged })) {
    postActionRefreshAttempted = true;
    const refreshedPostStateResult = await getScreenSummary({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      includeDebugSignals: input.includeDebugSignals ?? true,
      dryRun: input.dryRun,
    });
    refreshedPostStateSummary = refreshedPostStateResult.data.screenSummary;
    if (JSON.stringify(postStateSummary) !== JSON.stringify(refreshedPostStateSummary)) {
      postStateSummary = refreshedPostStateSummary;
      stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
      evidenceDelta = buildActionEvidenceDelta({
        preState: preStateSummary,
        postState: postStateSummary,
        preLogSummary: preStateResult.data.logSummary,
        postLogSummary: refreshedPostStateResult.data.logSummary,
        preCrashSummary: preStateResult.data.crashSummary,
        postCrashSummary: refreshedPostStateResult.data.crashSummary,
      });
      failureCategory = classifyActionFailureCategory({
        finalStatus: actionStatus,
        finalReasonCode: actionReasonCode,
        preStateSummary,
        postStateSummary,
        lowLevelResult,
        stateChanged,
        targetResolution,
      });
      const refreshedManualHandoff = requiredManualHandoff(postStateSummary);
      if (refreshedManualHandoff) {
        manualHandoffContext = { phase: "post", recommendation: refreshedManualHandoff, stateSummary: postStateSummary };
        actionStatus = "partial";
        actionReasonCode = REASON_CODES.manualHandoffRequired;
        failureCategory = "blocked";
        stepState = "terminal_stop";
        retryStopReason = "manual_handoff_required";
      }
    }
  }

  const outcome: ActionOutcomeSummary = {
    actionId,
    actionType: input.action.actionType,
    resolutionStrategy: fallbackUsed ? "ocr" : "deterministic",
    preState: preStateSummary,
    postState: postStateSummary,
    stateChanged,
    fallbackUsed,
    retryCount: (ocrFallbackResult?.retryCount ?? 0) + Math.max(0, retryAttemptIndex - 1),
    stepState,
    progressMarker: classifyActionProgressMarker({
      finalStatus: actionStatus,
      stateChanged,
      postconditionStatus: postActionVerificationTrace.postconditionStatus ?? classifyPostconditionStatus({
        actionType: input.action.actionType,
        finalStatus: actionStatus,
        stateChanged,
        stepState,
        postState: postStateSummary,
      }),
    }),
    evidenceConfidence,
    stateChangeCategory: classifyStateChangeCategory({
      stateChanged,
      preState: preStateSummary,
      postState: postStateSummary,
    }),
    stateChangeConfidence: evidenceConfidence,
    networkReadinessClass: classifyNetworkReadiness(postStateSummary),
    postconditionMet: postActionVerificationTrace.postconditionMet,
    postconditionStatus: postActionVerificationTrace.postconditionStatus,
    targetQuality: classifyTargetQuality({ failureCategory, finalStatus: actionStatus, fallbackUsed, stateChanged }),
    failureCategory,
    confidence: ocrFallbackResult?.ocrEvidence?.ocrConfidence ?? buildActionOutcomeConfidence(actionStatus, stateChanged),
    ocrEvidence: ocrFallbackResult?.ocrEvidence,
    outcome: actionStatus === "success" ? "success" : actionStatus === "partial" ? "partial" : "failed",
  };

  const evidence = [...(preStateResult.data.evidence ?? []), ...(postStateResult.data.evidence ?? [])];
  const artifacts = Array.from(new Set([
    ...preStateResult.artifacts,
    ...lowLevelResult.artifacts,
    ...(ocrFallbackResult?.artifacts ?? []),
    ...postStateResult.artifacts,
  ]));
  const actionEvent: SessionTimelineEvent = {
    eventId: actionId,
    timestamp: new Date().toISOString(),
    type: "action_outcome_recorded",
    detail: evidenceDelta.uiDiffSummary,
    eventType: "action_outcome",
    actionId,
    layer: "action",
    summary: `${input.action.actionType} -> ${outcome.outcome}`,
    artifactRefs: artifacts,
    stateSummary: postStateSummary,
    evidenceCompleteness: {
      level: artifacts.length >= 3 ? "complete" : artifacts.length > 0 ? "partial" : "missing",
      capturedKinds: evidence.map((item) => item.kind),
      missingEvidence: artifacts.length > 0 ? [] : ["pre/post evidence was not captured"],
    },
  };

  const persistedSessionState = sessionRecord
    ? await persistSessionState(repoRoot, input.sessionId, postStateSummary, actionEvent, artifacts)
    : undefined;
  const retryTimelineMarkers = uniqueNonEmpty([
    `step_state:${stepState}`,
    `evidence_confidence:${evidenceConfidence}`,
    retryStopReason,
  ], 6);
  if (sessionRecord && retryTimelineMarkers.length > 0) {
    await persistSessionState(repoRoot, input.sessionId, postStateSummary, {
      timestamp: new Date().toISOString(),
      type: "action_retry_decision",
      eventType: "retry_decision",
      actionId,
      layer: "action",
      detail: retryTimelineMarkers.join("; "),
      summary: retryDecisionTrace.retryAllowed ? "retry_allowed" : "retry_stopped",
      artifactRefs: artifacts,
      stateSummary: postStateSummary,
    }, artifacts);
  }
  if (outcome.outcome === "success") {
    await recordBaselineEntry(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      actionType: outcome.actionType,
      screenId: outcome.postState?.screenId ?? outcome.preState?.screenId,
      readiness: outcome.postState?.readiness ?? outcome.preState?.readiness,
      progressMarker: outcome.progressMarker,
      stateChangeCategory: outcome.stateChangeCategory,
      replayValue: outcome.outcome === "success"
        ? (outcome.progressMarker === "full" || outcome.postconditionStatus === "met" ? "high" : "medium")
        : "low",
      fallbackUsed: outcome.fallbackUsed,
      evidenceFingerprint: uniqueNonEmpty([
        evidenceDelta.uiDiffSummary ? `ui:${evidenceDelta.uiDiffSummary}` : undefined,
        evidenceDelta.networkDeltaSummary ? `network:${evidenceDelta.networkDeltaSummary}` : undefined,
        evidenceDelta.runtimeDeltaSummary ? `runtime:${evidenceDelta.runtimeDeltaSummary}` : undefined,
        evidenceDelta.logDeltaSummary ? `log:${evidenceDelta.logDeltaSummary}` : undefined,
      ], 4).join("|") || undefined,
      baselineRelation: "same_checkpoint",
      updatedAt: new Date().toISOString(),
    });
  }

  const actionabilityReview = buildActionabilityReview({
    preStateSummary,
    postStateSummary,
    latestKnownState: sessionRecord?.session.latestStateSummary,
    lowLevelStatus: actionStatus,
    lowLevelReasonCode: actionReasonCode,
    targetResolution,
    stateChanged,
  });
  if (postActionRefreshAttempted) {
    const refreshSignal = refreshedPostStateSummary && JSON.stringify(postStateResult.data.screenSummary) !== JSON.stringify(refreshedPostStateSummary)
      ? "post_action_refresh_detected_additional_state_change"
      : "post_action_refresh_no_additional_change";
    actionabilityReview.unshift(refreshSignal);
    if (refreshSignal === "post_action_refresh_no_additional_change") {
      actionabilityReview.unshift("refresh_signal:noop");
      actionabilityReview.unshift(actionabilityReview.some((item) => item.startsWith("stale_state_candidate:"))
        ? "retry_tier_code:refresh_context_stale_state"
        : "retry_tier_code:refresh_context_noop");
    }
  }
  if (manualHandoffContext) {
    actionabilityReview.unshift(...buildManualHandoffReview(manualHandoffContext).reverse());
  }

  const retryRecommendationTier = classifyRetryRecommendationTier({
    finalStatus: actionStatus,
    stateChanged,
    postActionRefreshAttempted,
    actionabilityReview,
    failureCategory,
    ocrFallbackSuggestions: ocrFallbackResult?.nextSuggestions,
  });
  const retryRecommendation = buildRetryRecommendation({
    tier: retryRecommendationTier ?? "none",
    failureCategory,
    actionabilityReview,
  });

  const persistedAction = await persistActionRecord(repoRoot, {
    actionId,
    sessionId: input.sessionId,
    intent: input.action,
    outcome,
    retryRecommendationTier,
    retryRecommendation,
    retryDecisionTrace,
    postActionVerificationTrace,
    checkpointDecisionTrace,
    actionabilityReview,
    evidenceDelta,
    evidence,
    lowLevelStatus: actionStatus,
    lowLevelReasonCode: actionReasonCode,
    updatedAt: new Date().toISOString(),
  });
  let allArtifacts = persistedAction.relativePath ? [persistedAction.relativePath, ...artifacts] : artifacts;

  const postActionInterruption = await resolveInterruptionExecutor({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    actionId,
    checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
    dryRun: input.dryRun,
  });

  let finalToolStatus = actionStatus;
  let finalToolReasonCode = actionReasonCode;
  let finalOutcome = outcome;
  const finalActionabilityReview = [...actionabilityReview];
  let finalLowLevelStatus = actionStatus;
  let finalLowLevelReasonCode = actionReasonCode;

  allArtifacts = Array.from(new Set([...allArtifacts, ...postActionInterruption.artifacts]));

  if (!isInterruptionGuardPassed(postActionInterruption.data.status)) {
    finalToolStatus = "failed";
    finalToolReasonCode = postActionInterruption.reasonCode === REASON_CODES.ok
      ? REASON_CODES.interruptionResolutionFailed
      : postActionInterruption.reasonCode;
    finalLowLevelStatus = "failed";
    finalLowLevelReasonCode = finalToolReasonCode;
    finalOutcome = {
      ...finalOutcome,
      outcome: "failed",
      failureCategory: "blocked",
      confidence: Math.min(finalOutcome.confidence ?? 0.5, 0.4),
    };
    finalActionabilityReview.unshift(`post_interruption_status:${postActionInterruption.data.status}`);
  } else if (postActionInterruption.data.status === "resolved") {
    const resumed = await resumeInterruptionExecutor({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
      dryRun: input.dryRun,
    });
    allArtifacts = Array.from(new Set([...allArtifacts, ...resumed.artifacts]));
    if (!resumed.data.resumed) {
      finalToolStatus = "failed";
      finalToolReasonCode = resumed.reasonCode === REASON_CODES.ok
        ? REASON_CODES.interruptionRecoveryStateDrift
        : resumed.reasonCode;
      finalLowLevelStatus = "failed";
      finalLowLevelReasonCode = finalToolReasonCode;
      finalOutcome = {
        ...finalOutcome,
        outcome: "failed",
        failureCategory: "blocked",
      };
      finalActionabilityReview.unshift("post_interruption_resume_failed");
    }
  }

  if (finalToolStatus !== actionStatus || finalToolReasonCode !== actionReasonCode) {
    const persistedAfterInterruption = await persistActionRecord(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      intent: input.action,
      outcome: finalOutcome,
      retryRecommendationTier,
      retryRecommendation,
      retryDecisionTrace,
      postActionVerificationTrace,
      checkpointDecisionTrace,
      actionabilityReview: finalActionabilityReview,
      evidenceDelta,
      evidence,
      lowLevelStatus: finalLowLevelStatus,
      lowLevelReasonCode: finalLowLevelReasonCode,
      updatedAt: new Date().toISOString(),
    });
    if (persistedAfterInterruption.relativePath) {
      allArtifacts = Array.from(new Set([persistedAfterInterruption.relativePath, ...allArtifacts]));
    }
  }

  // Plan 18-01: Network probe in failure path only — do NOT modify happy path
  const networkRelatedCategories = ["waiting", "transport", "no_state_change"];
  const shouldProbeNetwork = finalToolStatus !== "success"
    && networkRelatedCategories.includes(finalOutcome.failureCategory ?? "");

  let networkProbeResult: NetworkReadinessProbe | undefined;
  let networkRecoveryStrategyResult: NetworkRecoveryStrategy | undefined;
  if (shouldProbeNetwork) {
    const probeSessionRecord = sessionRecord;
    const probeDeviceId = input.deviceId ?? probeSessionRecord?.session.deviceId;
    const probeAppId = input.appId ?? probeSessionRecord?.session.appId;
    if (probeDeviceId) {
      try {
        const probeResult = await probeNetworkReadiness({
          sessionId: input.sessionId,
          platform,
          runnerProfile,
          harnessConfigPath: input.harnessConfigPath,
          deviceId: probeDeviceId,
          appId: probeAppId,
        });
        networkProbeResult = probeResult.data.probe;
        networkRecoveryStrategyResult = probeResult.data.recoveryStrategy;
      } catch {
        // Best-effort: do not fail the action outcome if network probe itself fails
      }
    }
  }

  const networkNextSuggestions = networkRecoveryStrategyResult && networkRecoveryStrategyResult.strategy !== "none"
    ? [
        `Network recovery: ${networkRecoveryStrategyResult.strategy} — ${networkRecoveryStrategyResult.reason}`,
      ]
    : [];

  return {
    status: finalToolStatus,
    reasonCode: finalToolReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: allArtifacts,
    data: {
      sessionRecordFound: Boolean(sessionRecord),
      outcome: finalOutcome,
      evidenceDelta,
      preStateSummary,
      postStateSummary,
      postActionRefreshAttempted: postActionRefreshAttempted || undefined,
      retryRecommendationTier,
      retryRecommendation,
      retryDecisionTrace,
      postActionVerificationTrace,
      checkpointDecisionTrace,
      timelineDecisionMarkers: uniqueNonEmpty([
        ...retryTimelineMarkers,
        postActionInterruption.data.status !== "not_needed" ? `post_interruption:${postActionInterruption.data.status}` : undefined,
      ], 8),
      actionabilityReview: finalActionabilityReview,
      manualHandoffRequired: manualHandoffContext?.recommendation.required,
      manualHandoffReason: manualHandoffContext?.recommendation.reason,
      lowLevelStatus: finalLowLevelStatus,
      lowLevelReasonCode: finalLowLevelReasonCode,
      evidence,
      sessionAuditPath: persistedSessionState?.auditPath,
      preActionInterruption: preActionInterruption.data,
      postActionInterruption: postActionInterruption.data,
      crashAttribution: postStateResult.data.crashAttribution,
      networkProbe: networkProbeResult,
      networkRecoveryStrategy: networkRecoveryStrategyResult,
    },
    nextSuggestions: uniqueNonEmpty([
      ...networkNextSuggestions,
      ...buildManualHandoffNextSuggestions(manualHandoffContext?.recommendation),
      ...buildRetryRecommendations({
        finalStatus: finalToolStatus,
        stateChanged,
        postActionRefreshAttempted,
        actionabilityReview: finalActionabilityReview,
        failureCategory: finalOutcome.failureCategory,
        ocrFallbackSuggestions: ocrFallbackResult?.nextSuggestions,
      }),
    ], 8),
  };
}
