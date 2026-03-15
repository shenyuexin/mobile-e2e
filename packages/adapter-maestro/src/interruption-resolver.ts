import type {
  InterruptionClassification,
  InterruptionEvent,
  InterruptionResolutionStatus,
  InterruptionSignal,
  Platform,
} from "@mobile-e2e-mcp/contracts";
import type { InterruptionResolutionPlan } from "@mobile-e2e-mcp/core";
import { resolveInterruptionPlan } from "@mobile-e2e-mcp/core";

export interface ResolveInterruptionDecision {
  status: InterruptionResolutionStatus;
  matchedRuleId?: string;
  selectedSlot?: "primary" | "secondary" | "cancel" | "destructive";
  tapText?: string;
  tapResourceId?: string;
  reason?: string;
}

function resolveTapTextFromRule(
  signals: InterruptionSignal[],
  ruleAction: import("@mobile-e2e-mcp/contracts").InterruptionPolicyRuleV2["action"],
): string | undefined {
  if (ruleAction.tapText) {
    return ruleAction.tapText;
  }
  const firstAvailable = (ruleAction as unknown as { firstAvailableText?: string[] }).firstAvailableText ?? [];
  if (firstAvailable.length === 0) {
    return undefined;
  }
  const visibleTexts = new Set(
    signals
      .filter((signal) => signal.key === "visible_text")
      .map((signal) => signal.value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const matched = firstAvailable.find((candidate: string) => visibleTexts.has(candidate.trim().toLowerCase()));
  return matched ?? firstAvailable[0];
}

export function decideInterruptionResolution(params: {
  platform: Platform;
  classification: InterruptionClassification;
  signals: InterruptionSignal[];
  policyRules: import("@mobile-e2e-mcp/contracts").InterruptionPolicyRuleV2[];
  preferredSlot?: "primary" | "secondary" | "cancel" | "destructive";
}): { plan: InterruptionResolutionPlan; decision: ResolveInterruptionDecision } {
  const plan = resolveInterruptionPlan(params.signals, params.policyRules, params.preferredSlot);
  if (!plan.matchedRule) {
    return {
      plan,
      decision: {
        status: "failed",
        reason: plan.reason ?? "No matching interruption rule.",
      },
    };
  }

  if (plan.denied) {
    return {
      plan,
      decision: {
        status: "denied",
        matchedRuleId: plan.matchedRule.id,
        reason: plan.reason,
      },
    };
  }

  return {
    plan,
    decision: {
      status: "resolved",
      matchedRuleId: plan.matchedRule.id,
      selectedSlot: plan.selectedSlot,
      tapText: resolveTapTextFromRule(params.signals, plan.matchedRule.action),
      tapResourceId: plan.matchedRule.action.tapResourceId,
    },
  };
}

export function buildInterruptionEvent(params: {
  actionId?: string;
  classification: InterruptionClassification;
  signals: InterruptionSignal[];
  decision: ResolveInterruptionDecision;
  source: InterruptionEvent["source"];
  artifacts: string[];
}): InterruptionEvent {
  return {
    eventId: `interruption-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionId: params.actionId,
    type: params.classification.type,
    confidence: params.classification.confidence,
    source: params.source,
    ruleId: params.decision.matchedRuleId,
    status: params.decision.status,
    detail: params.decision.reason,
    artifactRefs: params.artifacts,
    signals: params.signals,
    classification: params.classification,
  };
}
