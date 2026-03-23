import {
  type ActionIntent,
  type CompleteTaskData,
  type CompleteTaskInput,
  type ExecuteIntentData,
  type ExecuteIntentInput,
  type ExecuteIntentStepInput,
  type LaunchAppData,
  type LaunchAppInput,
  type PerformActionWithEvidenceData,
  type ReasonCode,
  REASON_CODES,
  type RunnerProfile,
  type SupportedActionType,
  type TapElementData,
  type TapElementInput,
  type TaskStepOutcome,
  type TaskStepPlan,
  type TerminateAppData,
  type TerminateAppInput,
  type ToolResult,
  type TypeIntoElementData,
  type TypeIntoElementInput,
  type WaitForUiData,
  type WaitForUiInput,
} from "@mobile-e2e-mcp/contracts";

export interface TaskPlannerDeps {
  performActionWithEvidenceWithMaestro: (input: {
    sessionId: string;
    platform?: "android" | "ios";
    runnerProfile?: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    dryRun?: boolean;
    action: ActionIntent;
    includeDebugSignals?: boolean;
  }) => Promise<ToolResult<PerformActionWithEvidenceData>>;
  tapElementWithMaestro: (input: TapElementInput) => Promise<ToolResult<TapElementData>>;
  typeIntoElementWithMaestro: (input: TypeIntoElementInput) => Promise<ToolResult<TypeIntoElementData>>;
  waitForUiWithMaestro: (input: WaitForUiInput) => Promise<ToolResult<WaitForUiData>>;
  launchAppWithMaestro: (input: LaunchAppInput) => Promise<ToolResult<LaunchAppData>>;
  terminateAppWithMaestro: (input: TerminateAppInput) => Promise<ToolResult<TerminateAppData>>;
}

function isTerminalOutcome(data: ExecuteIntentData): boolean {
  const readiness = data.postStateSummary?.readiness;
  if (readiness === "backend_failed_terminal" || readiness === "offline_terminal") {
    return true;
  }
  return data.outcome.failureCategory === "blocked" && data.postStateSummary?.readiness !== "ready";
}

export async function executeIntentWithMaestro(
  params: {
    sessionId: string;
    platform: "android" | "ios";
    runnerProfile: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    dryRun?: boolean;
  },
  action: ActionIntent,
  deps: Pick<TaskPlannerDeps, "tapElementWithMaestro" | "typeIntoElementWithMaestro" | "waitForUiWithMaestro" | "launchAppWithMaestro" | "terminateAppWithMaestro">,
): Promise<ToolResult<TapElementData | TypeIntoElementData | WaitForUiData | LaunchAppData | TerminateAppData>> {
  if (action.actionType === "tap_element") {
    return deps.tapElementWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
      limit: action.limit,
      dryRun: params.dryRun,
    });
  }
  if (action.actionType === "type_into_element") {
    return deps.typeIntoElementWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
      limit: action.limit,
      value: action.value ?? "",
      dryRun: params.dryRun,
    });
  }
  if (action.actionType === "wait_for_ui") {
    return deps.waitForUiWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      resourceId: action.resourceId,
      contentDesc: action.contentDesc,
      text: action.text,
      className: action.className,
      clickable: action.clickable,
      limit: action.limit,
      timeoutMs: action.timeoutMs,
      intervalMs: action.intervalMs,
      waitUntil: action.waitUntil,
      dryRun: params.dryRun,
    });
  }
  if (action.actionType === "launch_app") {
    return deps.launchAppWithMaestro({
      sessionId: params.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.harnessConfigPath,
      deviceId: params.deviceId,
      appId: action.appId ?? params.appId,
      launchUrl: action.launchUrl,
      dryRun: params.dryRun,
    });
  }
  return deps.terminateAppWithMaestro({
    sessionId: params.sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    harnessConfigPath: params.harnessConfigPath,
    deviceId: params.deviceId,
    appId: action.appId ?? params.appId,
    dryRun: params.dryRun,
  });
}

function inferCandidateActionTypes(intent: string): SupportedActionType[] {
  const lower = intent.toLowerCase();
  const candidates: SupportedActionType[] = [];
  if (lower.includes("launch") || lower.includes("open") || lower.includes("启动") || lower.includes("打开")) {
    candidates.push("launch_app");
  }
  if (lower.includes("type") || lower.includes("input") || lower.includes("输入")) {
    candidates.push("type_into_element");
  }
  if (lower.includes("wait") || lower.includes("等待") || lower.includes("visible") || lower.includes("出现")) {
    candidates.push("wait_for_ui");
  }
  if (lower.includes("terminate") || lower.includes("close") || lower.includes("kill") || lower.includes("关闭") || lower.includes("退出")) {
    candidates.push("terminate_app");
  }
  if (candidates.length === 0) {
    candidates.push("tap_element");
  }
  return candidates;
}

function buildActionIntentFromStep(step: ExecuteIntentStepInput): { action: ActionIntent; decision: string; candidates: SupportedActionType[] } {
  const candidates = inferCandidateActionTypes(step.intent);
  const selectedActionType = step.actionType ?? candidates[0];
  return {
    action: {
      actionType: selectedActionType,
      resourceId: step.resourceId,
      contentDesc: step.contentDesc,
      text: step.text,
      className: step.className,
      clickable: step.clickable,
      limit: step.limit,
      value: step.value,
      appId: step.appId,
      launchUrl: step.launchUrl,
      timeoutMs: step.timeoutMs,
      intervalMs: step.intervalMs,
      waitUntil: step.waitUntil,
    },
    decision: step.actionType
      ? `Selected explicit actionType '${step.actionType}'.`
      : `Inferred actionType '${selectedActionType}' from intent keywords.`,
    candidates,
  };
}

export async function executeIntentPlanWithMaestro(
  input: ExecuteIntentInput,
  deps: Pick<TaskPlannerDeps, "performActionWithEvidenceWithMaestro">,
): Promise<ToolResult<ExecuteIntentData>> {
  const startTime = Date.now();
  const planned = buildActionIntentFromStep(input);
  const result = await deps.performActionWithEvidenceWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    appId: input.appId,
    dryRun: input.dryRun,
    action: planned.action,
  });

  return {
    status: result.status,
    reasonCode: result.reasonCode,
    sessionId: result.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: result.artifacts,
    data: {
      intent: input.intent,
      selectedAction: planned.action,
      decision: planned.decision,
      candidateActionTypes: planned.candidates,
      outcome: result.data.outcome,
      preStateSummary: result.data.preStateSummary,
      postStateSummary: result.data.postStateSummary,
      retryRecommendationTier: result.data.retryRecommendationTier,
      actionabilityReview: result.data.actionabilityReview,
    },
    nextSuggestions: result.nextSuggestions,
  };
}

export async function completeTaskWithMaestro(
  input: CompleteTaskInput,
  deps: Pick<TaskPlannerDeps, "performActionWithEvidenceWithMaestro">,
): Promise<ToolResult<CompleteTaskData>> {
  const startTime = Date.now();
  const maxSteps = Math.max(1, Math.min(input.maxSteps ?? 8, 8));
  const rawSteps: ExecuteIntentStepInput[] = input.steps && input.steps.length > 0 ? input.steps : [{ intent: input.goal }];
  const selectedSteps = rawSteps.slice(0, maxSteps);
  const plannedSteps: TaskStepPlan[] = selectedSteps.map((step: ExecuteIntentStepInput, index: number) => {
    const planned = buildActionIntentFromStep(step);
    return {
      stepNumber: index + 1,
      intent: step.intent,
      selectedAction: planned.action,
      decision: planned.decision,
    };
  });

  const outcomes: TaskStepOutcome[] = [];
  const artifacts: string[] = [];
  const stopOnFailure = input.stopOnFailure ?? true;
  let finalStatus: ToolResult["status"] = "success";
  let finalReasonCode: ReasonCode = REASON_CODES.ok;

  for (let index = 0; index < selectedSteps.length; index += 1) {
    const step = selectedSteps[index];
    const result = await executeIntentPlanWithMaestro({
      sessionId: input.sessionId,
      intent: step.intent,
      actionType: step.actionType,
      resourceId: step.resourceId,
      contentDesc: step.contentDesc,
      text: step.text,
      className: step.className,
      clickable: step.clickable,
      limit: step.limit,
      value: step.value,
      appId: step.appId ?? input.appId,
      launchUrl: step.launchUrl,
      timeoutMs: step.timeoutMs,
      intervalMs: step.intervalMs,
      waitUntil: step.waitUntil,
      platform: input.platform,
      runnerProfile: input.runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      dryRun: input.dryRun,
    }, deps);
    artifacts.push(...result.artifacts);
    outcomes.push({
      stepNumber: index + 1,
      intent: step.intent,
      status: result.status,
      reasonCode: result.reasonCode,
      actionId: result.data.outcome.actionId,
      artifacts: result.artifacts,
      decision: result.data.decision,
    });
    if (result.status !== "success") {
      finalStatus = result.status === "partial" ? "partial" : "failed";
      finalReasonCode = result.reasonCode;
      if (stopOnFailure) {
        break;
      }
    }
    if (isTerminalOutcome(result.data)) {
      finalStatus = "failed";
      finalReasonCode = result.reasonCode;
      break;
    }
  }

  const executedSteps = outcomes.length;
  const completed = finalStatus === "success" && executedSteps === selectedSteps.length;
  if (!completed && finalStatus === "success") {
    finalStatus = "partial";
    finalReasonCode = REASON_CODES.timeout;
  }

  return {
    status: finalStatus,
    reasonCode: finalReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: Array.from(new Set(artifacts)),
    data: {
      goal: input.goal,
      plannedSteps,
      outcomes,
      completed,
      executedSteps,
      totalSteps: selectedSteps.length,
    },
    nextSuggestions: completed
      ? []
      : [
        "Inspect the failed or partial step outcome and rerun complete_task with refined step selectors.",
      ],
  };
}
