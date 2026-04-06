import {
  type ActionOutcomeSummary,
  type BaselineComparison,
  type CheckpointDivergence,
  type CompareAgainstBaselineData,
  type CompareAgainstBaselineInput,
  type DiagnosisPacket,
  type EvidenceDeltaSummary,
  type ExplainLastFailureData,
  type ExplainLastFailureInput,
  type FailureAttribution,
  type FailureSignature,
  type ReplayValue,
  type FindSimilarFailuresData,
  type FindSimilarFailuresInput,
  type GetActionOutcomeData,
  type GetActionOutcomeInput,
  type RankFailureCandidatesData,
  type RankFailureCandidatesInput,
  REASON_CODES,
  type StateReadiness,
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
  type PersistedBaselineIndexEntry,
} from "@mobile-e2e-mcp/core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveRepoPath } from "./harness-config.js";
import { buildSkillGuidedRemediation } from "./readiness-guidance.js";

interface IosStartupExecutionEvidence {
  startupPhase?: string;
  primaryFailurePhase?: string;
  reasonCode?: string;
  summaryLine?: string;
  fallbackUsed?: boolean;
  attemptedBackend?: string;
  executedBackend?: string;
}

function isIosSignaturePreflightEvidence(evidence?: IosStartupExecutionEvidence): boolean {
  if (!evidence) {
    return false;
  }
  const startupPhase = evidence.primaryFailurePhase
    && evidence.primaryFailurePhase !== "none"
    ? evidence.primaryFailurePhase
    : evidence.startupPhase;
  if (startupPhase !== "preflight" || evidence.reasonCode !== REASON_CODES.configurationError) {
    return false;
  }
  const summary = evidence.summaryLine?.toLowerCase() ?? "";
  return summary.includes("code signature")
    || summary.includes("identity used to sign")
    || summary.includes("0xe8008018")
    || summary.includes("无法验证其完整性");
}

function buildIosStartupPhaseRemediation(evidence?: IosStartupExecutionEvidence): string[] {
  if (!evidence) {
    return [];
  }
  if (!evidence.reasonCode || evidence.reasonCode === REASON_CODES.ok) {
    return [];
  }
  const startupPhase = evidence.primaryFailurePhase
    && evidence.primaryFailurePhase !== "none"
    ? evidence.primaryFailurePhase
    : evidence.startupPhase;

  if (!startupPhase) {
    return [];
  }

  if (startupPhase === "preflight") {
    if (isIosSignaturePreflightEvidence(evidence)) {
      return ["iOS startup preflight failed at runner signing validation: use a currently valid Apple Development identity and matching provisioning profile for the target device UDID, then rebuild the runner/xctestrun artifacts before retry."];
    }
    return ["iOS startup preflight failed: unlock the device, keep screen awake, and rerun the bounded action."];
  }
  if (startupPhase === "bundle_mapping") {
    return ["iOS bundle mapping failed: verify xctestrun TestHostBundleIdentifier and installed xctrunner bundle alignment before retry."];
  }
  if (startupPhase === "xctest_handshake") {
    return ["iOS XCTest handshake failed (code74/dtxproxy): inspect startup execution evidence first, then retry after channel bootstrap prerequisites are stable."];
  }
  if (startupPhase === "startup_timeout") {
    return ["iOS startup timed out: validate runner readiness and increase startup timeout window (for example MAESTRO_DRIVER_STARTUP_TIMEOUT=180000)."];
  }
  if (startupPhase === "runner_execution") {
    return ["iOS runner execution failed post-dispatch: inspect execution artifact command/stderr and rerun once root cause is addressed."];
  }
  return [];
}

function parseIosStartupExecutionEvidenceMarkdown(markdown: string): IosStartupExecutionEvidence {
  const lines = markdown.split(/\r?\n/);
  const kv = new Map<string, string>();
  for (const line of lines) {
    if (!line.startsWith("- ")) {
      continue;
    }
    const marker = line.indexOf(":");
    if (marker <= 2) {
      continue;
    }
    const key = line.slice(2, marker).trim();
    const value = line.slice(marker + 1).trim();
    kv.set(key, value);
  }
  const summaryIndex = lines.findIndex((line) => line.trim() === "## Summary");
  const summaryLine = summaryIndex >= 0
    ? lines.slice(summaryIndex + 1).find((line) => line.trim().length > 0)
    : undefined;
  return {
    startupPhase: kv.get("startupPhase"),
    primaryFailurePhase: kv.get("primaryFailurePhase"),
    reasonCode: kv.get("reasonCode"),
    summaryLine,
    fallbackUsed: kv.get("fallbackUsed") === "true",
    attemptedBackend: kv.get("attemptedBackend"),
    executedBackend: kv.get("executedBackend"),
  };
}

async function loadIosStartupEvidenceFromActionRecord(
  repoRoot: string,
  record: Awaited<ReturnType<typeof loadActionRecord>>,
): Promise<IosStartupExecutionEvidence | undefined> {
  if (!record) {
    return undefined;
  }
  const executionEvidencePath = record.evidence
    .map((item) => item.path)
    .find((item) => item.includes("ios-physical-actions") && item.endsWith(".execution.md"));
  if (!executionEvidencePath) {
    return undefined;
  }
  try {
    const markdown = await readFile(path.resolve(repoRoot, executionEvidencePath), "utf8");
    return parseIosStartupExecutionEvidenceMarkdown(markdown);
  } catch {
    return undefined;
  }
}

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
  iosStartupEvidence?: IosStartupExecutionEvidence;
}): FailureAttribution {
  const postState = params.outcome.postState;
  const delta = params.evidenceDelta;
  const candidateCauses: string[] = [];
  let affectedLayer: FailureAttribution["affectedLayer"] = "unknown";
  let mostLikelyCause = "The current evidence is too weak to assign a precise cause.";
  let recommendedNextProbe = "Capture another bounded action with evidence to strengthen the timeline window.";
  let recommendedRecovery = "Retry only after confirming the current state is stable.";

  const startupReasonCode = params.iosStartupEvidence?.reasonCode;
  const startupPhase = params.iosStartupEvidence?.primaryFailurePhase
    && params.iosStartupEvidence.primaryFailurePhase !== "none"
    ? params.iosStartupEvidence.primaryFailurePhase
    : params.iosStartupEvidence?.startupPhase;
  if (startupReasonCode && startupReasonCode !== REASON_CODES.ok) {
    const startupSummary = params.iosStartupEvidence?.summaryLine
      ?? `iOS physical runner startup failed at phase ${startupPhase ?? "unknown"}.`;
    affectedLayer = startupPhase === "preflight" ? "environment" : "runtime";
    mostLikelyCause = startupSummary;
    candidateCauses.push(startupSummary);
    recommendedNextProbe = "Inspect iOS startup execution evidence first (startupPhase / primaryFailurePhase / reasonCode) before reading full raw logs.";
    recommendedRecovery = startupPhase === "preflight"
      ? isIosSignaturePreflightEvidence(params.iosStartupEvidence)
        ? "Fix runner signing/provisioning for the current device UDID (valid Apple Development identity + profile), rebuild xctestrun artifacts, then retry bounded execution."
        : "Unlock and stabilize the target device, then retry bounded action execution."
      : "Stabilize runner startup prerequisites (bundle mapping, handshake channel, timeout budget), then retry the bounded action.";
  } else

  if (postState?.blockingSignals.some((signal) => signal === "permission_prompt" || signal === "dialog_actions")) {
    affectedLayer = "interruption";
    mostLikelyCause = `Blocking UI interruption detected: ${postState.blockingSignals.join(", ")}.`;
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect the latest screen summary for blocking dialog text and action buttons.";
    recommendedRecovery = "Dismiss the interruption or grant the required permission, then replay the bounded action.";
  } else if (postState?.readiness === "offline_terminal") {
    affectedLayer = "network";
    mostLikelyCause = "Runtime entered offline_terminal readiness state.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Capture connectivity and network diagnostics before retrying.";
    recommendedRecovery = "Stop optimistic retries and wait for connectivity recovery.";
  } else if (postState?.readiness === "backend_failed_terminal") {
    affectedLayer = "backend";
    mostLikelyCause = "Runtime entered backend_failed_terminal readiness state.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect backend status/error payload evidence for the failing request path.";
    recommendedRecovery = "Stop optimistic retries and surface terminal backend failure.";
  } else if (!params.outcome.stateChanged && ["tap_element", "type_into_element", "wait_for_ui"].includes(params.outcome.actionType)) {
    affectedLayer = params.outcome.outcome === "partial" ? "ui_locator" : "ui_state";
    mostLikelyCause = params.outcome.outcome === "partial"
      ? "The selector-driven action did not execute fully, so locator ambiguity or unsupported resolution is most likely."
      : "The selector resolved but the app state did not change after the action.";
    candidateCauses.push(mostLikelyCause);
    recommendedNextProbe = "Inspect the pre/post screen summaries and selector resolution outcome for the bounded action.";
    recommendedRecovery = "Refine the selector or wait for a more stable screen before retrying.";
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

function buildEvidenceFingerprint(delta?: EvidenceDeltaSummary): string | undefined {
  const fingerprint = uniqueNonEmpty([
    delta?.uiDiffSummary ? `ui:${delta.uiDiffSummary}` : undefined,
    delta?.networkDeltaSummary ? `network:${delta.networkDeltaSummary}` : undefined,
    delta?.runtimeDeltaSummary ? `runtime:${delta.runtimeDeltaSummary}` : undefined,
    delta?.logDeltaSummary ? `log:${delta.logDeltaSummary}` : undefined,
  ], 4).join("|");
  return fingerprint || undefined;
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
    readiness: params.outcome.postState?.readiness ?? params.outcome.preState?.readiness,
    progressMarker: params.outcome.progressMarker,
    stateChangeCategory: params.outcome.stateChangeCategory,
  };
}

function buildDiagnosisPacketFromAttribution(attribution: FailureAttribution): DiagnosisPacket {
  return {
    strongestSuspectLayer: attribution.affectedLayer,
    strongestCausalSignal: attribution.mostLikelyCause,
    confidence: attribution.affectedLayer === "unknown" || attribution.missingEvidence.length > 0 ? "weak" : "moderate",
    recommendedNextProbe: attribution.recommendedNextProbe,
    recommendedRecovery: attribution.recommendedRecovery,
    escalationThreshold: attribution.affectedLayer === "unknown" || attribution.missingEvidence.length > 0
      ? "if_summary_inconclusive"
      : "none",
  };
}

function scoreSimilarFailure(left: FailureSignature, right: FailureSignature): number {
  let score = 0;
  if (left.actionType === right.actionType) score += 3;
  if (left.affectedLayer === right.affectedLayer) score += 3;
  if (left.screenId && left.screenId === right.screenId) score += 2;
  if (left.interruptionCategory && left.interruptionCategory === right.interruptionCategory) score += 1;
  if (left.topSignal && right.topSignal && left.topSignal === right.topSignal) score += 2;
  if (left.readiness && left.readiness === right.readiness) score += 1;
  if (left.progressMarker && left.progressMarker === right.progressMarker) score += 1;
  if (left.stateChangeCategory && left.stateChangeCategory === right.stateChangeCategory) score += 1;
  return score;
}

function matchedSignalsForSimilarFailure(left: FailureSignature, right: FailureSignature): string[] {
  return [
    left.actionType === right.actionType ? "action_type" : undefined,
    left.affectedLayer === right.affectedLayer ? "affected_layer" : undefined,
    left.screenId && left.screenId === right.screenId ? "screen_id" : undefined,
    left.interruptionCategory && left.interruptionCategory === right.interruptionCategory ? "interruption_category" : undefined,
    left.topSignal && right.topSignal && left.topSignal === right.topSignal ? "top_signal" : undefined,
    left.readiness && left.readiness === right.readiness ? "readiness" : undefined,
    left.progressMarker && left.progressMarker === right.progressMarker ? "progress_marker" : undefined,
    left.stateChangeCategory && left.stateChangeCategory === right.stateChangeCategory ? "state_change_category" : undefined,
  ].filter((value): value is string => Boolean(value));
}

function deriveReplayValueFromOutcome(outcome: ActionOutcomeSummary): ReplayValue {
  if (outcome.outcome !== "success") return "low";
  if (outcome.progressMarker === "full" || outcome.postconditionStatus === "met") return "high";
  if (outcome.progressMarker === "partial" || outcome.postconditionStatus === "partial") return "medium";
  return "medium";
}

function deriveCheckpointDivergence(params: {
  baselineScreenId?: string;
  baselineReadiness?: StateReadiness;
  current: ActionOutcomeSummary;
}): CheckpointDivergence {
  const currentScreenId = params.current.postState?.screenId ?? params.current.preState?.screenId;
  const currentReadiness = params.current.postState?.readiness ?? params.current.preState?.readiness;
  if (params.baselineScreenId && currentScreenId && params.baselineScreenId !== currentScreenId) {
    return "screen_mismatch";
  }
  if (params.baselineReadiness && currentReadiness && params.baselineReadiness !== currentReadiness) {
    return "readiness_mismatch";
  }
  if (params.current.outcome !== "success") {
    return "outcome_mismatch";
  }
  if (params.current.progressMarker && params.current.progressMarker !== "full") {
    return "signal_mismatch";
  }
  return "none";
}

function buildBaselineComparison(params: {
  baseline: { actionId: string; screenId?: string; readiness?: FailureSignature["readiness"]; progressMarker?: FailureSignature["progressMarker"]; stateChangeCategory?: FailureSignature["stateChangeCategory"]; replayValue?: ReplayValue } | undefined;
  current: { actionId: string; outcome: ActionOutcomeSummary };
}): BaselineComparison | undefined {
  if (!params.baseline) return undefined;
  const differences: string[] = [];
  const divergenceSignals: string[] = [];
  const currentScreenId = params.current.outcome.postState?.screenId ?? params.current.outcome.preState?.screenId;
  const currentReadiness = params.current.outcome.postState?.readiness ?? params.current.outcome.preState?.readiness;
  if (currentScreenId !== params.baseline.screenId) {
    differences.push(`screen ${currentScreenId ?? "unknown"} != ${params.baseline.screenId ?? "unknown"}`);
    divergenceSignals.push("screen_mismatch");
  }
  if (currentReadiness !== params.baseline.readiness) {
    differences.push(`readiness ${currentReadiness ?? "unknown"} != ${params.baseline.readiness ?? "unknown"}`);
    divergenceSignals.push("readiness_mismatch");
  }
  if (params.current.outcome.outcome !== "success") {
    differences.push(`outcome ${params.current.outcome.outcome} differs from successful baseline`);
    divergenceSignals.push("outcome_mismatch");
  }
  if (params.current.outcome.progressMarker && params.current.outcome.progressMarker !== params.baseline.progressMarker) {
    differences.push(`progress ${params.current.outcome.progressMarker} != ${params.baseline.progressMarker ?? "unknown"}`);
    divergenceSignals.push("signal_mismatch");
  }
  const checkpointDivergence = deriveCheckpointDivergence({
    baselineScreenId: params.baseline.screenId,
    baselineReadiness: params.baseline.readiness,
    current: params.current.outcome,
  });
  const replayValue: ReplayValue = checkpointDivergence === "none"
    ? (params.baseline.replayValue ?? deriveReplayValueFromOutcome(params.current.outcome))
    : divergenceSignals.length >= 2
      ? "low"
      : "medium";
  return {
    baselineActionId: params.baseline.actionId,
    comparedActionId: params.current.actionId,
    differences,
    matched: differences.length === 0,
    divergenceSignals,
    replayValue,
    checkpointDivergence,
  };
}

function scoreBaselineCandidate(current: ActionOutcomeSummary, candidate: PersistedBaselineIndexEntry): number {
  let score = 0;
  if (candidate.actionType === current.actionType) score += 5;
  const currentScreenId = current.postState?.screenId ?? current.preState?.screenId;
  const currentReadiness = current.postState?.readiness ?? current.preState?.readiness;
  if (candidate.screenId && candidate.screenId === currentScreenId) score += 4;
  if (candidate.readiness && candidate.readiness === currentReadiness) score += 3;
  if (candidate.progressMarker && candidate.progressMarker === current.progressMarker) score += 2;
  if (candidate.stateChangeCategory && candidate.stateChangeCategory === current.stateChangeCategory) score += 2;
  if (candidate.replayValue === "high") score += 1;
  if (candidate.fallbackUsed === current.fallbackUsed) score += 1;
  return score;
}

function selectBestBaseline(current: ActionOutcomeSummary, baselines: PersistedBaselineIndexEntry[], currentActionId: string): PersistedBaselineIndexEntry | undefined {
  return baselines
    .filter((entry) => entry.actionId !== currentActionId && entry.actionType === current.actionType)
    .map((entry) => ({ entry, score: scoreBaselineCandidate(current, entry) }))
    .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))[0]?.entry;
}

export async function getActionOutcomeWithMaestro(
  input: GetActionOutcomeInput,
): Promise<ToolResult<GetActionOutcomeData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const record = await loadActionRecord(repoRoot, input.actionId);
  const found = Boolean(record) && (input.sessionId === undefined || record?.sessionId === input.sessionId);
  const diagnosisPacket = record
    ? buildDiagnosisPacketFromAttribution(buildFailureAttribution({
      outcome: record.outcome,
      evidenceDelta: record.evidenceDelta,
    }))
    : undefined;

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
        diagnosisPacket,
        retryRecommendationTier: record?.retryRecommendationTier,
        retryRecommendation: record?.retryRecommendation,
        evidenceDelta: record?.evidenceDelta,
        evidence: record?.evidence,
        retryDecisionTrace: record?.retryDecisionTrace,
        postActionVerificationTrace: record?.postActionVerificationTrace,
        checkpointDecisionTrace: record?.checkpointDecisionTrace,
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
  const iosStartupEvidence = await loadIosStartupEvidenceFromActionRecord(repoRoot, record);
  const attribution = buildFailureAttribution({
    outcome: record.outcome,
    evidenceDelta: record.evidenceDelta,
    surroundingEvents: timelineWindow.surroundingEvents,
    iosStartupEvidence,
  });
  const diagnosisPacket = buildDiagnosisPacketFromAttribution(attribution);
  await recordFailureSignature(repoRoot, {
    actionId: resolvedActionId,
    sessionId: input.sessionId,
    signature: buildFailureSignature({
      outcome: record.outcome,
      attribution,
      evidenceDelta: record.evidenceDelta,
    }),
    causalSignals: attribution.candidateCauses.slice(0, 3),
    replayValue: deriveReplayValueFromOutcome(record.outcome),
    checkpointDivergence: record.outcome.outcome === "success" ? "none" : "outcome_mismatch",
    fallbackUsed: record.outcome.fallbackUsed,
    evidenceFingerprint: buildEvidenceFingerprint(record.evidenceDelta),
    baselineRelation: record.outcome.outcome === "success" ? "same_checkpoint" : "drifted_checkpoint",
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
      diagnosisPacket,
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
        matchedSignals: matchedSignalsForSimilarFailure(signature, entry.signature),
        replayValue: entry.replayValue,
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
  const baseline = selectBestBaseline(current.outcome, baselines, current.actionId);
  const comparison = buildBaselineComparison({
    baseline,
    current: { actionId: current.actionId, outcome: current.outcome },
  });

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
      comparison,
    },
    nextSuggestions: baseline ? [] : ["No successful baseline exists yet for this action type; create one by recording a successful bounded action."],
  };
}

export async function suggestKnownRemediationWithMaestro(
  input: SuggestKnownRemediationInput,
): Promise<ToolResult<SuggestKnownRemediationData>> {
  const explained = await explainLastFailureWithMaestro({ sessionId: input.sessionId });
  if (explained.status === "failed") {
    return {
      status: "failed",
      reasonCode: explained.reasonCode,
      sessionId: input.sessionId,
      durationMs: explained.durationMs,
      attempts: 1,
      artifacts: explained.artifacts,
      data: { found: false, remediation: [] },
      nextSuggestions: explained.nextSuggestions,
    };
  }
  const similar = await findSimilarFailuresWithMaestro({ sessionId: input.sessionId, actionId: input.actionId });
  const baseline = await compareAgainstBaselineWithMaestro({ sessionId: input.sessionId, actionId: input.actionId });
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const failureIndex = await loadFailureIndex(repoRoot);
  const actionId = input.actionId ?? explained.data.actionId ?? similar.data.actionId ?? baseline.data.actionId;
  const actionRecord = actionId ? await loadActionRecord(repoRoot, actionId) : undefined;
  const iosStartupEvidence = await loadIosStartupEvidenceFromActionRecord(repoRoot, actionRecord);
  const startupRemediation = explained.data.outcome?.outcome === "success"
    ? []
    : buildIosStartupPhaseRemediation(iosStartupEvidence);
  const indexedRemediation = actionId ? failureIndex.find((entry) => entry.actionId === actionId)?.remediation ?? [] : [];
  const skillGuidance = buildSkillGuidedRemediation({
    platform: input.platform ?? sessionRecord?.session.platform,
    attribution: explained.data.attribution,
  });
  const remediation = uniqueNonEmpty([
    ...startupRemediation,
    ...indexedRemediation,
    ...(similar.data.similarFailures.length > 0 ? ["This failure resembles previous incidents; inspect the closest matching signature before changing selectors."] : []),
    ...(baseline.data.comparison?.differences.length ? ["Current action diverges from a successful baseline; inspect the listed differences first."] : []),
    skillGuidance.firstFix,
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
      skillGuidance,
    },
    nextSuggestions: remediation.length > 0
      ? prioritizeSuggestionBuckets(
        remediation,
        skillGuidance.askForNext,
        skillGuidance.handoffSkill ? [`When the contract gap is clear, hand off to ${skillGuidance.handoffSkill}.`] : [],
      )
      : ["No known remediation was indexed yet; explain the failure first to seed local memory."],
  };
}
