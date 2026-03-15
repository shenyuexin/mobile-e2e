import type {
  InterruptionClassification,
  InterruptionEvent,
  InterruptionSignal,
  ResumeCheckpoint,
  StateSummary,
  SupportedActionType,
} from "@mobile-e2e-mcp/contracts";

export function buildInterruptionTimelineEvent(params: {
  type:
    | "interruption_detected"
    | "interruption_classified"
    | "interruption_resolved"
    | "interrupted_action_resumed"
    | "interruption_escalated";
  actionId?: string;
  detail: string;
  stateSummary?: StateSummary;
  artifacts?: string[];
}): import("@mobile-e2e-mcp/contracts").SessionTimelineEvent {
  return {
    eventId: `evt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: params.type,
    eventType: "interruption",
    actionId: params.actionId,
    layer: "state",
    detail: params.detail,
    summary: params.detail,
    artifactRefs: params.artifacts ?? [],
    stateSummary: params.stateSummary,
  };
}

export function buildResumeCheckpoint(params: {
  actionId: string;
  sessionId: string;
  platform: "ios" | "android";
  actionType: SupportedActionType;
  selector?: import("@mobile-e2e-mcp/contracts").InspectUiQuery;
  args?: Record<string, unknown>;
}): ResumeCheckpoint {
  return {
    actionId: params.actionId,
    sessionId: params.sessionId,
    platform: params.platform,
    actionType: params.actionType,
    selector: params.selector,
    params: params.args,
    createdAt: new Date().toISOString(),
  };
}

export function summarizeInterruptionDetail(params: {
  classification: InterruptionClassification;
  signals: InterruptionSignal[];
}): string {
  const topSignals = params.signals
    .slice(0, 3)
    .map((signal) => `${signal.key}:${signal.value ?? "n/a"}`)
    .join(", ");
  return `${params.classification.type} (confidence=${params.classification.confidence}) ${topSignals}`;
}

export function hasStateDrift(before: StateSummary | undefined, after: StateSummary | undefined): boolean {
  if (!before || !after) {
    return false;
  }
  const beforeHash = JSON.stringify({
    appPhase: before.appPhase,
    readiness: before.readiness,
    screenId: before.screenId,
    blockingSignals: before.blockingSignals,
  });
  const afterHash = JSON.stringify({
    appPhase: after.appPhase,
    readiness: after.readiness,
    screenId: after.screenId,
    blockingSignals: after.blockingSignals,
  });
  return beforeHash !== afterHash;
}

export function pickEventSource(signals: InterruptionSignal[]): InterruptionEvent["source"] {
  return signals[0]?.source ?? "state_summary";
}
