import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import type {
  ActionIntent,
  ClassifyInterruptionData,
  ClassifyInterruptionInput,
  DetectInterruptionData,
  DetectInterruptionInput,
  InterruptionEvent,
  InterruptionPolicyRuleV2,
  Platform,
  ReasonCode,
  ResumeCheckpoint,
  ResumeInterruptedActionData,
  ResumeInterruptedActionInput,
  ResolveInterruptionData,
  ResolveInterruptionInput,
  RunnerProfile,
  SessionTimelineEvent,
  TapElementInput,
  ToolResult,
  WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  appendSessionTimelineEvent,
  isHighRiskInterruptionActionAllowed,
  isToolAllowedByProfile,
  loadInterruptionPolicyConfig,
  loadSessionRecord,
  persistInterruptionEvent,
  type InterruptionPolicyContext,
} from "@mobile-e2e-mcp/core";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";
import { classifyInterruptionFromSignals } from "./interruption-classifier.js";
import { detectInterruptionFromSummary } from "./interruption-detector.js";
import { buildInterruptionTimelineEvent, buildResumeCheckpoint, hasStateDrift, pickEventSource, summarizeInterruptionDetail } from "./interruption-orchestrator.js";
import { buildInterruptionEvent, decideInterruptionResolution } from "./interruption-resolver.js";
import { getScreenSummaryWithMaestro } from "./session-state.js";
import { tapElementWithMaestroTool } from "./ui-tools.js";

type ExecuteIntentWithMaestro = (
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

interface InterruptionToolsDeps {
  executeIntentWithMaestro?: ExecuteIntentWithMaestro;
}

function buildInterruptionPersistenceEvent(
  status:
    | "interruption_detected"
    | "interruption_classified"
    | "interruption_resolved"
    | "interrupted_action_resumed"
    | "interruption_escalated",
  actionId: string | undefined,
  detail: string,
  stateSummary: SessionTimelineEvent["stateSummary"],
  artifacts: string[],
): SessionTimelineEvent {
  return buildInterruptionTimelineEvent({
    type: status,
    actionId,
    detail,
    stateSummary,
    artifacts,
  });
}

function buildTapInputFromResolution(params: {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  tapText?: string;
  tapResourceId?: string;
  dryRun?: boolean;
}): TapElementInput | undefined {
  if (!params.tapText && !params.tapResourceId) {
    return undefined;
  }
  return {
    sessionId: params.sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    harnessConfigPath: params.harnessConfigPath,
    deviceId: params.deviceId,
    text: params.tapText,
    resourceId: params.tapResourceId,
    clickable: true,
    dryRun: params.dryRun,
  };
}

function interruptionResolutionRequiresTapScope(strategy: InterruptionPolicyRuleV2["action"]["strategy"] | undefined): boolean {
  return strategy === "tap_selector" || strategy === "choose_slot" || strategy === "coordinate_tap";
}

export function buildInterruptionCheckpoint(
  sessionId: string,
  platform: Platform,
  actionId: string,
  action?: ActionIntent,
): ResumeCheckpoint {
  const selector = action
    ? {
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
    }
    : undefined;
  return buildResumeCheckpoint({
    actionId,
    sessionId,
    platform,
    actionType: action?.actionType ?? ACTION_TYPES.tapElement,
    selector: selector && Object.values(selector).some((value) => value !== undefined) ? selector : undefined,
    args: {
      resourceId: action?.resourceId,
      contentDesc: action?.contentDesc,
      text: action?.text,
      className: action?.className,
      clickable: action?.clickable,
      value: action?.value,
      timeoutMs: action?.timeoutMs,
      intervalMs: action?.intervalMs,
      waitUntil: action?.waitUntil,
      appId: action?.appId,
      launchUrl: action?.launchUrl,
    },
  });
}

function toActionIntentFromCheckpoint(checkpoint: ResumeCheckpoint): ActionIntent {
  const params = checkpoint.params ?? {};
  return {
    actionType: checkpoint.actionType,
    resourceId: typeof params.resourceId === "string" ? params.resourceId : checkpoint.selector?.resourceId,
    contentDesc: typeof params.contentDesc === "string" ? params.contentDesc : checkpoint.selector?.contentDesc,
    text: typeof params.text === "string" ? params.text : checkpoint.selector?.text,
    className: typeof params.className === "string" ? params.className : checkpoint.selector?.className,
    clickable: typeof params.clickable === "boolean" ? params.clickable : checkpoint.selector?.clickable,
    value: typeof params.value === "string" ? params.value : undefined,
    timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
    intervalMs: typeof params.intervalMs === "number" ? params.intervalMs : undefined,
    waitUntil: typeof params.waitUntil === "string" ? params.waitUntil as WaitForUiMode : undefined,
    appId: typeof params.appId === "string" ? params.appId : undefined,
    launchUrl: typeof params.launchUrl === "string" ? params.launchUrl : undefined,
  };
}

export async function detectInterruptionWithMaestro(
  input: DetectInterruptionInput,
): Promise<ToolResult<DetectInterruptionData>> {
  const startTime = Date.now();
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
        detected: false,
        sessionRecordFound: false,
        signals: [],
      },
      nextSuggestions: ["Provide platform explicitly or run start_session before detecting interruptions."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const summaryResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: true,
    dryRun: input.dryRun,
  });
  const detected = detectInterruptionFromSummary({
    platform,
    stateSummary: summaryResult.data.screenSummary,
    uiSummary: summaryResult.data.uiSummary,
  });

  return {
    status: detected.detected ? "success" : "partial",
    reasonCode: detected.detected ? REASON_CODES.ok : REASON_CODES.interruptionUnclassified,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: summaryResult.artifacts,
    data: {
      detected: detected.detected,
      sessionRecordFound: Boolean(sessionRecord),
      stateSummary: summaryResult.data.screenSummary,
      classification: detected.classification,
      signals: detected.signals,
      evidence: summaryResult.data.evidence,
    },
    nextSuggestions: detected.detected
      ? []
      : ["No strong interruption signal was detected. Capture a fresh UI summary after the blocking event appears."],
  };
}

export async function classifyInterruptionWithMaestro(
  input: ClassifyInterruptionInput,
): Promise<ToolResult<ClassifyInterruptionData>> {
  const startTime = Date.now();
  const detected = await detectInterruptionWithMaestro(input);
  if (detected.status === "failed") {
    return {
      status: "failed",
      reasonCode: detected.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: detected.artifacts,
      data: {
        found: false,
        classification: undefined,
        signals: input.signals ?? detected.data.signals,
      },
      nextSuggestions: detected.nextSuggestions,
    };
  }
  const signals = input.signals ?? detected.data.signals;
  const classification = classifyInterruptionFromSignals(signals);
  return {
    status: classification.type === "unknown" ? "partial" : "success",
    reasonCode: classification.type === "unknown" ? REASON_CODES.interruptionUnclassified : REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: detected.artifacts,
    data: {
      found: classification.type !== "unknown",
      classification,
      signals,
    },
    nextSuggestions: classification.type === "unknown"
      ? ["Add or refine interruption signatures for this screen in configs/policies/interruption/*.yaml."]
      : [],
  };
}

export async function resolveInterruptionWithMaestro(
  input: ResolveInterruptionInput,
  policyContext?: InterruptionPolicyContext,
): Promise<ToolResult<ResolveInterruptionData>> {
  const startTime = Date.now();
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
        attempted: false,
        status: "failed",
        strategy: "none",
      },
      nextSuggestions: ["Provide platform explicitly or run start_session before resolving interruptions."],
    };
  }

  const detected = await detectInterruptionWithMaestro(input);
  if (!detected.data.detected) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: detected.artifacts,
      data: {
        attempted: false,
        status: "not_needed",
        strategy: "none",
        classification: detected.data.classification,
      },
      nextSuggestions: [],
    };
  }
  const classification = input.classification ?? classifyInterruptionFromSignals(detected.data.signals);
  if (sessionRecord && detected.data.stateSummary) {
    await appendSessionTimelineEvent(
      repoRoot,
      input.sessionId,
      buildInterruptionPersistenceEvent(
        "interruption_detected",
        input.actionId,
        summarizeInterruptionDetail({ classification: detected.data.classification ?? classification, signals: detected.data.signals }),
        detected.data.stateSummary,
        detected.artifacts,
      ),
      detected.artifacts,
    );
    await appendSessionTimelineEvent(
      repoRoot,
      input.sessionId,
      buildInterruptionPersistenceEvent(
        "interruption_classified",
        input.actionId,
        summarizeInterruptionDetail({ classification, signals: detected.data.signals }),
        detected.data.stateSummary,
        detected.artifacts,
      ),
      detected.artifacts,
    );
  }
  const policyConfig = await loadInterruptionPolicyConfig(repoRoot, platform);
  const decision = decideInterruptionResolution({
    platform,
    classification,
    signals: detected.data.signals,
    policyRules: policyConfig.rules,
    preferredSlot: input.preferredSlot,
  });

  const matchedRule = decision.plan.matchedRule;
  const accessProfile = policyContext?.accessProfile;
  if (matchedRule && accessProfile) {
    const highRiskCheck = isHighRiskInterruptionActionAllowed(matchedRule, accessProfile);
    if (!highRiskCheck.allowed) {
      const deniedEvent: InterruptionEvent = buildInterruptionEvent({
        actionId: input.actionId,
        classification,
        signals: detected.data.signals,
        decision: {
          ...decision.decision,
          status: "denied",
          reason: highRiskCheck.reason,
        },
        source: pickEventSource(detected.data.signals),
        artifacts: detected.artifacts,
      });
      if (sessionRecord && detected.data.stateSummary) {
        await persistInterruptionEvent(
          repoRoot,
          input.sessionId,
          deniedEvent,
          detected.data.stateSummary,
          buildInterruptionPersistenceEvent("interruption_escalated", input.actionId, highRiskCheck.reason ?? "Denied by high-risk policy gate.", detected.data.stateSummary, detected.artifacts),
          detected.artifacts,
        );
      }
      return {
        status: "failed",
        reasonCode: REASON_CODES.policyDenied,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: detected.artifacts,
        data: {
          attempted: false,
          status: "denied",
          strategy: matchedRule.action.strategy,
          classification,
          matchedRuleId: matchedRule.id,
          event: deniedEvent,
        },
        nextSuggestions: [highRiskCheck.reason ?? "Interruption action was denied by policy profile."],
      };
    }
  }

  if (
    matchedRule
    && decision.decision.status === "resolved"
    && accessProfile
    && interruptionResolutionRequiresTapScope(matchedRule.action.strategy)
    && !isToolAllowedByProfile(accessProfile, ACTION_TYPES.tapElement)
  ) {
    const deniedEvent: InterruptionEvent = buildInterruptionEvent({
      actionId: input.actionId,
      classification,
      signals: detected.data.signals,
      decision: {
        ...decision.decision,
        status: "denied",
        reason: "Interruption resolution requires tap scope, but the current policy profile denies it.",
      },
      source: pickEventSource(detected.data.signals),
      artifacts: detected.artifacts,
    });
    if (sessionRecord && detected.data.stateSummary) {
      await persistInterruptionEvent(
        repoRoot,
        input.sessionId,
        deniedEvent,
        detected.data.stateSummary,
        buildInterruptionPersistenceEvent(
          "interruption_escalated",
          input.actionId,
          "Interruption resolution requires tap scope, but policy denied it.",
          detected.data.stateSummary,
          detected.artifacts,
        ),
        detected.artifacts,
      );
    }
    return {
      status: "failed",
      reasonCode: REASON_CODES.policyDenied,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: detected.artifacts,
      data: {
        attempted: false,
        status: "denied",
        strategy: matchedRule.action.strategy,
        classification,
        matchedRuleId: matchedRule.id,
        event: deniedEvent,
      },
      nextSuggestions: ["Switch to a policy profile that allows tap scope for interruption resolution."],
    };
  }

  let resolutionStatus = decision.decision.status;
  let resolutionAttempts = 0;
  let verifiedCleared = resolutionStatus === "not_needed";
  let resolutionArtifacts = [...detected.artifacts];
  let resolutionReasonCode: ReasonCode = resolutionStatus === "resolved" ? REASON_CODES.ok : REASON_CODES.interruptionResolutionFailed;
  if (resolutionStatus === "resolved" && matchedRule) {
    const tapInput = buildTapInputFromResolution({
      sessionId: input.sessionId,
      platform,
      runnerProfile: input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      tapText: decision.decision.tapText,
      tapResourceId: decision.decision.tapResourceId,
      dryRun: input.dryRun,
    });

    if (!tapInput) {
      resolutionStatus = "failed";
      resolutionReasonCode = REASON_CODES.interruptionResolutionFailed;
    } else {
      const maxAttempts = Math.max(1, Math.min(3, matchedRule.retry?.maxAttempts ?? 1));
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        resolutionAttempts = attempt;
        const tapResult = await tapElementWithMaestroTool(tapInput);
        resolutionArtifacts = Array.from(new Set([...resolutionArtifacts, ...tapResult.artifacts]));
        if (tapResult.status === "failed" || tapResult.status === "partial") {
          resolutionStatus = "failed";
          resolutionReasonCode = REASON_CODES.interruptionResolutionFailed;
          continue;
        }

        const verification = await detectInterruptionWithMaestro({
          sessionId: input.sessionId,
          platform,
          runnerProfile: input.runnerProfile,
          harnessConfigPath: input.harnessConfigPath,
          deviceId: input.deviceId,
          appId: input.appId,
          actionId: input.actionId,
          dryRun: input.dryRun,
        });
        resolutionArtifacts = Array.from(new Set([...resolutionArtifacts, ...verification.artifacts]));
        if (!verification.data.detected) {
          resolutionStatus = "resolved";
          resolutionReasonCode = REASON_CODES.ok;
          verifiedCleared = true;
          break;
        }

        resolutionStatus = "failed";
        resolutionReasonCode = REASON_CODES.interruptionResolutionFailed;
      }
    }
  }

  const event = buildInterruptionEvent({
    actionId: input.actionId,
    classification,
    signals: detected.data.signals,
    decision: {
      ...decision.decision,
      status: resolutionStatus,
    },
    source: pickEventSource(detected.data.signals),
    artifacts: resolutionArtifacts,
  });

  if (sessionRecord && detected.data.stateSummary) {
    const checkpoint = resolutionStatus === "resolved"
      ? input.checkpoint ?? (input.actionId ? buildInterruptionCheckpoint(input.sessionId, platform, input.actionId) : undefined)
      : undefined;
    await persistInterruptionEvent(
      repoRoot,
      input.sessionId,
      event,
      detected.data.stateSummary,
      buildInterruptionPersistenceEvent(
        resolutionStatus === "resolved" ? "interruption_resolved" : "interruption_escalated",
        input.actionId,
        summarizeInterruptionDetail({ classification, signals: detected.data.signals }),
        detected.data.stateSummary,
        resolutionArtifacts,
      ),
      resolutionArtifacts,
      checkpoint,
    );
  }

  return {
    status: resolutionStatus === "resolved" || resolutionStatus === "not_needed" ? "success" : "failed",
    reasonCode: resolutionStatus === "resolved" ? REASON_CODES.ok : resolutionStatus === "denied" ? REASON_CODES.policyDenied : resolutionReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: Math.max(1, resolutionAttempts),
    artifacts: resolutionArtifacts,
    data: {
      attempted: true,
      status: resolutionStatus,
      strategy: matchedRule?.action.strategy ?? "none",
      classification,
      matchedRuleId: matchedRule?.id,
      selectedSlot: decision.decision.selectedSlot,
      resolutionAttempts: Math.max(1, resolutionAttempts),
      verifiedCleared,
      event,
    },
    nextSuggestions: resolutionStatus === "resolved"
      ? []
      : [decision.decision.reason ?? "Interruption could not be resolved automatically."],
  };
}

export async function resumeInterruptedActionWithMaestro(
  input: ResumeInterruptedActionInput,
  deps: InterruptionToolsDeps = {},
): Promise<ToolResult<ResumeInterruptedActionData>> {
  const startTime = Date.now();
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
      data: { attempted: false, resumed: false },
      nextSuggestions: ["Provide platform explicitly or run start_session before resuming interrupted actions."],
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
      data: { attempted: false, resumed: false },
      nextSuggestions: ["Interruption resume executor is not configured in the current runtime context."],
    };
  }

  const checkpoint = input.checkpoint ?? sessionRecord?.session.lastInterruptedActionCheckpoint;
  if (!checkpoint) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { attempted: false, resumed: false },
      nextSuggestions: ["No interruption checkpoint exists for this session."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const stateBeforeResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: true,
    dryRun: input.dryRun,
  });

  const replayResult = await executeIntent({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    dryRun: input.dryRun,
  }, toActionIntentFromCheckpoint(checkpoint));

  const stateAfterResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: true,
    dryRun: input.dryRun,
  });

  const driftDetected = hasStateDrift(stateBeforeResult.data.screenSummary, stateAfterResult.data.screenSummary);
  const resumed = replayResult.status === "success" && !driftDetected;
  const artifacts = Array.from(new Set([
    ...stateBeforeResult.artifacts,
    ...replayResult.artifacts,
    ...stateAfterResult.artifacts,
  ]));

  if (sessionRecord) {
    const signals = detectInterruptionFromSummary({
      platform,
      stateSummary: stateAfterResult.data.screenSummary,
      uiSummary: stateAfterResult.data.uiSummary,
    }).signals;
    const classification = classifyInterruptionFromSignals(signals);
    const event = buildInterruptionEvent({
      actionId: checkpoint.actionId,
      classification,
      signals,
      decision: {
        status: resumed ? "resolved" : "failed",
        reason: resumed ? "Interrupted action resumed successfully." : "Interrupted action replay failed or drifted.",
      },
      source: "state_summary",
      artifacts,
    });
    await persistInterruptionEvent(
      repoRoot,
      input.sessionId,
      event,
      stateAfterResult.data.screenSummary,
      buildInterruptionPersistenceEvent(
        resumed ? "interrupted_action_resumed" : "interruption_escalated",
        checkpoint.actionId,
        resumed ? "Interrupted action resumed." : "Interrupted action resume failed.",
        stateAfterResult.data.screenSummary,
        artifacts,
      ),
      artifacts,
      checkpoint,
    );
  }

  return {
    status: resumed ? "success" : "partial",
    reasonCode: resumed ? REASON_CODES.ok : driftDetected ? REASON_CODES.interruptionRecoveryStateDrift : replayResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts,
    data: {
      attempted: true,
      resumed,
      checkpoint,
      stateBefore: stateBeforeResult.data.screenSummary,
      stateAfter: stateAfterResult.data.screenSummary,
      driftDetected,
    },
    nextSuggestions: resumed
      ? []
      : ["Resume replay did not reach a stable ready state. Inspect latest interruption event and state summary."],
  };
}
