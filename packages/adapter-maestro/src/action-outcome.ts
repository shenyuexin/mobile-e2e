import {
  type ActionOutcomeSummary,
  type CompareAgainstBaselineData,
  type CompareAgainstBaselineInput,
  type EvidenceDeltaSummary,
  type ExplainLastFailureData,
  type ExplainLastFailureInput,
  type FailureAttribution,
  type FailureSignature,
  type FindSimilarFailuresData,
  type FindSimilarFailuresInput,
  type GetActionOutcomeData,
  type GetActionOutcomeInput,
  type RankFailureCandidatesData,
  type RankFailureCandidatesInput,
  REASON_CODES,
  type SimilarFailure,
  type SuggestKnownRemediationData,
  type SuggestKnownRemediationInput,
  type SessionTimelineEvent,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import {
  loadActionRecord,
  loadBaselineIndex,
  loadFailureIndex,
  loadLatestActionRecordForSession,
  loadSessionRecord,
  queryTimelineAroundAction,
  recordFailureSignature,
} from "@mobile-e2e-mcp/core";
import { resolveRepoPath } from "./harness-config.js";

function uniqueNonEmpty(values: Array<string | undefined>, limit = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

function prioritizeSuggestionBuckets(...buckets: string[][]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    for (const item of bucket) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }
  }
  return ordered.slice(0, 5);
}

function buildActionPacketSignalSuggestions(actionabilityReview?: string[]): string[] {
  if (!actionabilityReview || actionabilityReview.length === 0) {
    return [];
  }
  const selector = actionabilityReview.find((item) => item.startsWith("target_suggested_selector:"))?.replace("target_suggested_selector:", "");
  const scoreDelta = actionabilityReview.find((item) => item.startsWith("target_score_delta:"))?.replace("target_score_delta:", "");
  const visibility = actionabilityReview.find((item) => item.startsWith("target_visibility:"))?.replace("target_visibility:", "");
  const refreshCode = actionabilityReview.find((item) => item.startsWith("retry_tier_code:"))?.replace("retry_tier_code:", "");

  return [
    selector ? `Action packet selector candidate: ${selector}.` : undefined,
    scoreDelta ? `Action packet selector score delta: ${scoreDelta}.` : undefined,
    visibility ? `Action packet visibility signals: ${visibility}.` : undefined,
    refreshCode ? `Action packet refresh retry code: ${refreshCode}.` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function buildFailureAttribution(params: {
  outcome: ActionOutcomeSummary;
  evidenceDelta?: EvidenceDeltaSummary;
  surroundingEvents?: SessionTimelineEvent[];
}): FailureAttribution {
  const postState = params.outcome.postState;
  const delta = params.evidenceDelta;
  const candidateCauses: string[] = [];
  let affectedLayer: FailureAttribution["affectedLayer"] = "unknown";
  let mostLikelyCause = "The current evidence is too weak to assign a precise cause.";
  let recommendedNextProbe = "Capture another bounded action with evidence to strengthen the timeline window.";
  let recommendedRecovery = "Retry only after confirming the current state is stable.";

  if (postState?.blockingSignals.some((signal) => signal === "permission_prompt" || signal === "dialog_actions")) {
    affectedLayer = "interruption";
    mostLikelyCause = `Blocking UI interruption detected: ${postState.blockingSignals.join(", ")}.`;
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect the latest screen summary for blocking dialog text and action buttons.";
    recommendedRecovery = "Dismiss the interruption or grant the required permission, then replay the bounded action.";
  } else if ((delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("crash") || (delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("anr")) {
    affectedLayer = "crash";
    mostLikelyCause = delta?.runtimeDeltaSummary ?? "Crash-like runtime signal detected after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect crash-signal artifacts captured around the action window.";
    recommendedRecovery = "Relaunch the app before retrying the same action.";
  } else if ((delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("network") || (delta?.logDeltaSummary ?? "").toLowerCase().includes("http")) {
    affectedLayer = "network";
    mostLikelyCause = delta?.logDeltaSummary ?? "New network-related signal detected after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect JS/network deltas and backend response status around the action.";
    recommendedRecovery = "Wait for network readiness or retry after the dependent request stabilizes.";
  } else if ((delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("exception") || (delta?.runtimeDeltaSummary ?? "").toLowerCase().includes("runtime")) {
    affectedLayer = "runtime";
    mostLikelyCause = delta?.runtimeDeltaSummary ?? "Runtime exception-like signal detected after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect runtime and JS console deltas after the action.";
    recommendedRecovery = "Stabilize the runtime error before retrying the same path.";
  } else if (!params.outcome.stateChanged && ["tap_element", "type_into_element", "wait_for_ui"].includes(params.outcome.actionType)) {
    affectedLayer = params.outcome.outcome === "partial" ? "ui_locator" : "ui_state";
    mostLikelyCause = params.outcome.outcome === "partial"
      ? "The selector-driven action did not execute fully, so locator ambiguity or unsupported resolution is most likely."
      : "The selector resolved but the app state did not change after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect the pre/post screen summaries and selector resolution outcome for the bounded action.";
    recommendedRecovery = "Refine the selector or wait for a more stable screen before retrying.";
  }

  for (const event of params.surroundingEvents ?? []) {
    if (event.type !== "action_outcome_recorded" && event.detail) {
      candidateCauses.push(event.detail);
    }
  }

  return {
    affectedLayer,
    mostLikelyCause,
    candidateCauses: uniqueNonEmpty(candidateCauses, 5),
    missingEvidence: params.outcome.preState && params.outcome.postState ? [] : ["pre/post state summaries are incomplete"],
    recommendedNextProbe,
    recommendedRecovery,
  };
}

function topRuntimeSignal(delta?: EvidenceDeltaSummary): string | undefined {
  return delta?.runtimeDeltaSummary ?? delta?.logDeltaSummary;
}

function buildFailureSignature(params: {
  outcome: ActionOutcomeSummary;
  attribution: FailureAttribution;
  evidenceDelta?: EvidenceDeltaSummary;
}): FailureSignature {
  return {
    actionType: params.outcome.actionType,
    screenId: params.outcome.postState?.screenId ?? params.outcome.preState?.screenId,
    affectedLayer: params.attribution.affectedLayer,
    topSignal: topRuntimeSignal(params.evidenceDelta),
    interruptionCategory: params.outcome.postState?.blockingSignals[0],
  };
}

function scoreSimilarFailure(left: FailureSignature, right: FailureSignature): number {
  let score = 0;
  if (left.actionType === right.actionType) score += 3;
  if (left.affectedLayer === right.affectedLayer) score += 3;
  if (left.screenId && left.screenId === right.screenId) score += 2;
  if (left.interruptionCategory && left.interruptionCategory === right.interruptionCategory) score += 1;
  if (left.topSignal && right.topSignal && left.topSignal === right.topSignal) score += 2;
  return score;
}

export async function getActionOutcomeWithMaestro(
  input: GetActionOutcomeInput,
): Promise<ToolResult<GetActionOutcomeData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const record = await loadActionRecord(repoRoot, input.actionId);
  const found = Boolean(record) && (input.sessionId === undefined || record?.sessionId === input.sessionId);

  return {
    status: found ? "success" : "failed",
    reasonCode: found ? REASON_CODES.ok : REASON_CODES.configurationError,
    sessionId: input.sessionId ?? record?.sessionId ?? input.actionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: found ? [`artifacts/actions/${input.actionId}.json`] : [],
    data: found
      ? {
        found: true,
        actionId: input.actionId,
        sessionId: record?.sessionId,
        outcome: record?.outcome,
        retryRecommendationTier: record?.retryRecommendationTier,
        retryRecommendation: record?.retryRecommendation,
        evidenceDelta: record?.evidenceDelta,
        evidence: record?.evidence,
        lowLevelStatus: record?.lowLevelStatus,
        lowLevelReasonCode: record?.lowLevelReasonCode,
      }
      : {
        found: false,
        actionId: input.actionId,
        sessionId: input.sessionId,
      },
    nextSuggestions: found ? [] : ["Use perform_action_with_evidence first, then retrieve the action record by actionId."],
  };
}

export async function explainLastFailureWithMaestro(
  input: ExplainLastFailureInput,
): Promise<ToolResult<ExplainLastFailureData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const lastActionEvent = sessionRecord?.session.timeline.filter((event) => event.type === "action_outcome_recorded").slice(-1)[0];
  const fallbackActionRecord = !lastActionEvent?.actionId ? await loadLatestActionRecordForSession(repoRoot, input.sessionId) : undefined;
  const resolvedActionId = lastActionEvent?.actionId ?? fallbackActionRecord?.actionId;

  if (!resolvedActionId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false },
      nextSuggestions: ["Run perform_action_with_evidence first so the session contains an attributable action window."],
    };
  }

  const record = fallbackActionRecord ?? await loadActionRecord(repoRoot, resolvedActionId);
  if (!record) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false, actionId: resolvedActionId },
      nextSuggestions: ["The session references an actionId without a persisted action record; rerun the bounded action."],
    };
  }

  const timelineWindow = sessionRecord ? await queryTimelineAroundAction(repoRoot, input.sessionId, resolvedActionId) : { surroundingEvents: [] };
  const attribution = buildFailureAttribution({
    outcome: record.outcome,
    evidenceDelta: record.evidenceDelta,
    surroundingEvents: timelineWindow.surroundingEvents,
  });
  await recordFailureSignature(repoRoot, {
    actionId: resolvedActionId,
    sessionId: input.sessionId,
    signature: buildFailureSignature({
      outcome: record.outcome,
      attribution,
      evidenceDelta: record.evidenceDelta,
    }),
    remediation: [attribution.recommendedRecovery, attribution.recommendedNextProbe].filter((value): value is string => Boolean(value)),
    updatedAt: new Date().toISOString(),
  });
  const status = record.outcome.outcome === "success" ? "partial" : "success";

  return {
    status,
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [`artifacts/actions/${resolvedActionId}.json`],
    data: {
      found: true,
      actionId: resolvedActionId,
      outcome: record.outcome,
      retryRecommendationTier: record.retryRecommendationTier,
      retryRecommendation: record.retryRecommendation,
      attribution,
    },
    nextSuggestions: status === "success"
      ? []
      : prioritizeSuggestionBuckets(
        [`Retry tier suggests: ${record.retryRecommendationTier ?? "inspect_only"}.`],
        record.retryRecommendation?.suggestedAction ? [record.retryRecommendation.suggestedAction] : [],
        buildActionPacketSignalSuggestions(record.actionabilityReview),
        attribution.recommendedRecovery ? [attribution.recommendedRecovery] : [],
        attribution.recommendedNextProbe ? [attribution.recommendedNextProbe] : [],
      ),
  };
}

export async function rankFailureCandidatesWithMaestro(
  input: RankFailureCandidatesInput,
): Promise<ToolResult<RankFailureCandidatesData>> {
  const explained = await explainLastFailureWithMaestro({ sessionId: input.sessionId });
  if (explained.status === "failed") {
    return {
      status: "failed",
      reasonCode: explained.reasonCode,
      sessionId: input.sessionId,
      durationMs: explained.durationMs,
      attempts: 1,
      artifacts: explained.artifacts,
      data: { found: false, candidates: [] },
      nextSuggestions: explained.nextSuggestions,
    };
  }

  const primary = explained.data.attribution;
  const candidates: FailureAttribution[] = primary
    ? [
      primary,
      {
        ...primary,
        affectedLayer: primary.affectedLayer === "unknown" ? "ui_state" : "unknown",
        mostLikelyCause: primary.affectedLayer === "unknown" ? "No strong signal exists, but unchanged UI suggests a stale app state candidate." : "Unknown remains plausible because evidence is still incomplete.",
      },
    ]
    : [];

  return {
    status: explained.status,
    reasonCode: explained.reasonCode,
    sessionId: input.sessionId,
    durationMs: explained.durationMs,
    attempts: 1,
    artifacts: explained.artifacts,
    data: {
      found: Boolean(primary),
      actionId: explained.data.actionId,
      candidates,
    },
    nextSuggestions: prioritizeSuggestionBuckets(
      explained.nextSuggestions,
      primary?.recommendedRecovery ? [primary.recommendedRecovery] : [],
      primary?.recommendedNextProbe ? [primary.recommendedNextProbe] : [],
    ),
  };
}

export async function findSimilarFailuresWithMaestro(
  input: FindSimilarFailuresInput,
): Promise<ToolResult<FindSimilarFailuresData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const actionId = input.actionId ?? (await loadLatestActionRecordForSession(repoRoot, input.sessionId))?.actionId;
  if (!actionId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false, similarFailures: [] },
      nextSuggestions: ["Explain or record a failed action first so a failure signature exists."],
    };
  }

  const explained = await explainLastFailureWithMaestro({ sessionId: input.sessionId });
  const signature = explained.data.attribution && explained.data.outcome
    ? buildFailureSignature({ outcome: explained.data.outcome, attribution: explained.data.attribution, evidenceDelta: (await loadActionRecord(repoRoot, actionId))?.evidenceDelta })
    : undefined;
  const failureIndex = await loadFailureIndex(repoRoot);
  const similarFailures: SimilarFailure[] = signature
    ? failureIndex
      .filter((entry) => entry.actionId !== actionId)
      .map((entry) => ({
        actionId: entry.actionId,
        sessionId: entry.sessionId,
        signature: entry.signature,
        matchScore: scoreSimilarFailure(signature, entry.signature),
      }))
      .filter((entry) => entry.matchScore > 0)
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, 5)
    : [];

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { found: Boolean(signature), actionId, signature, similarFailures },
    nextSuggestions: similarFailures.length > 0 ? [] : ["No strong similar failures were indexed yet; build more local history or inspect the baseline diff next."],
  };
}

export async function compareAgainstBaselineWithMaestro(
  input: CompareAgainstBaselineInput,
): Promise<ToolResult<CompareAgainstBaselineData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const current = input.actionId ? await loadActionRecord(repoRoot, input.actionId) : await loadLatestActionRecordForSession(repoRoot, input.sessionId);
  if (!current) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { found: false },
      nextSuggestions: ["Record an action outcome before comparing it against a baseline."],
    };
  }

  const baselines = await loadBaselineIndex(repoRoot);
  const baseline = baselines.find((entry) => entry.actionType === current.outcome.actionType && entry.actionId !== current.actionId);
  const differences: string[] = [];
  if (baseline) {
    if ((current.outcome.postState?.screenId ?? current.outcome.preState?.screenId) !== baseline.screenId) {
      differences.push(`screen ${current.outcome.postState?.screenId ?? current.outcome.preState?.screenId ?? "unknown"} != ${baseline.screenId ?? "unknown"}`);
    }
    if (current.outcome.outcome !== "success") {
      differences.push(`outcome ${current.outcome.outcome} differs from successful baseline`);
    }
  }

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      found: Boolean(baseline),
      actionId: current.actionId,
      comparison: {
        baselineActionId: baseline?.actionId,
        comparedActionId: current.actionId,
        differences,
        matched: differences.length === 0 && Boolean(baseline),
      },
    },
    nextSuggestions: baseline ? [] : ["No successful baseline exists yet for this action type; create one by recording a successful bounded action."],
  };
}

export async function suggestKnownRemediationWithMaestro(
  input: SuggestKnownRemediationInput,
): Promise<ToolResult<SuggestKnownRemediationData>> {
  const similar = await findSimilarFailuresWithMaestro({ sessionId: input.sessionId, actionId: input.actionId });
  const baseline = await compareAgainstBaselineWithMaestro({ sessionId: input.sessionId, actionId: input.actionId });
  const repoRoot = resolveRepoPath();
  const failureIndex = await loadFailureIndex(repoRoot);
  const actionId = similar.data.actionId ?? baseline.data.actionId;
  const indexedRemediation = actionId ? failureIndex.find((entry) => entry.actionId === actionId)?.remediation ?? [] : [];
  const remediation = uniqueNonEmpty([
    ...indexedRemediation,
    ...(similar.data.similarFailures.length > 0 ? ["This failure resembles previous incidents; inspect the closest matching signature before changing selectors."] : []),
    ...(baseline.data.comparison?.differences.length ? ["Current action diverges from a successful baseline; inspect the listed differences first."] : []),
  ], 5);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: {
      found: remediation.length > 0,
      actionId,
      remediation,
    },
    nextSuggestions: remediation.length > 0
      ? prioritizeSuggestionBuckets(remediation)
      : ["No known remediation was indexed yet; explain the failure first to seed local memory."],
  };
}
