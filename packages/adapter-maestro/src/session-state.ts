import type {
  DebugSignalSummary,
  GetScreenSummaryData,
  GetScreenSummaryInput,
  GetSessionStateData,
  GetSessionStateInput,
  InspectUiSummary,
  LogSummary,
  ManualHandoffRecommendation,
  SessionTimelineEvent,
  StateSummary,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES as REASON_CODES_VALUES } from "@mobile-e2e-mcp/contracts";
import { loadSessionRecord, persistSessionState } from "@mobile-e2e-mcp/core";
import path from "node:path";
import { buildCapabilityProfile } from "./capability-model.js";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";
import { getCrashSignalsWithRuntime as getCrashSignalsWithMaestro, getLogsWithRuntime as getLogsWithMaestro } from "./device-runtime.js";
import { classifyDebugSignal } from "./js-debug.js";
import { inspectUiWithMaestroTool } from "./ui-tools.js";
import { computeTreeHash, sampleNodeSignatures } from "./ui-tree-hash.js";

function isInterestingDebugLine(line: string): boolean {
  const normalized = line.toLowerCase();
  if (
    line.startsWith("#")
    || normalized.includes("<no crash entries found>")
    || normalized.includes("<no crash snippets collected>")
    || normalized.includes("/library/logs/crashreporter")
    || normalized.endsWith("crashreporter")
  ) {
    return false;
  }
  return normalized.includes("fatal")
    || normalized.includes("exception")
    || normalized.includes("error")
    || normalized.includes("crash")
    || normalized.includes("anr")
    || normalized.includes("timeout")
    || normalized.includes("failed")
    || normalized.includes("unable to");
}

function uniqueNonEmpty(values: Array<string | undefined>, limit = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

function toScreenId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : undefined;
}

function detectBlockingSignals(visibleTexts: string[], candidateActions: string[]): string[] {
  const signals = new Set<string>();
  const combined = [...visibleTexts, ...candidateActions].map((value) => value.toLowerCase());

  for (const value of combined) {
    // Use word-boundary matching to avoid false positives like "Spoken" matching "ok"
    const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, "i").test(value);

    if (value.includes("permission") || hasWord("allow") || value.includes("while using") || value.includes("don't allow")) {
      signals.add("permission_prompt");
    }
    if (value.includes("loading") || value.includes("please wait") || value.includes("signing in") || value.includes("progress")) {
      signals.add("loading_indicator");
    }
    if (value.includes("offline") || value.includes("network") || value.includes("connection") || value.includes("timeout")) {
      signals.add("network_instability");
    }
    if (value.includes("try again") || value.includes("retry") || value.includes("failed") || value.includes("error")) {
      signals.add("error_state");
    }
    if (value.includes("empty") || value.includes("no items") || value.includes("no results") || value.includes("nothing here")) {
      signals.add("empty_state");
    }
    // Dialog actions: match standalone button labels only (word-boundary)
    if (hasWord("cancel") || hasWord("not now") || hasWord("ok") || hasWord("open settings")) {
      signals.add("dialog_actions");
    }
  }

  return [...signals].slice(0, 6);
}

function buildRecentFailures(logSummary?: LogSummary, crashSummary?: LogSummary): string[] {
  return uniqueNonEmpty([
    ...(crashSummary?.topSignals.map((signal) => signal.sample) ?? []),
    ...(logSummary?.topSignals.map((signal) => signal.sample) ?? []),
  ], 5);
}

function inferPageHints(visibleTexts: string[], candidateActions: string[]): string[] {
  const normalized = [...visibleTexts, ...candidateActions].map((value) => value.toLowerCase());
  const hints = new Set<string>();
  for (const value of normalized) {
    if (
      value.includes("login")
      || value.includes("sign in")
      || value.includes("password")
      || value.includes("email")
      || value.includes("验证码")
      || value.includes("verification code")
      || value.includes("sms code")
      || value.includes("手机号")
    ) {
      hints.add("authentication");
    }
    if (value.includes("category") || value.includes("mobile phones") || value.includes("search")) {
      hints.add("catalog");
    }
    if (value.includes("details") || value.includes("description") || value.includes("add to cart")) {
      hints.add("detail");
    }
    if (value.includes("empty") || value.includes("no results") || value.includes("nothing here")) {
      hints.add("empty");
    }
  }
  return [...hints].slice(0, 5);
}

function inferProtectedPageAssessment(params: {
  visibleTexts: string[];
  candidateActions: string[];
  uiSummary?: InspectUiSummary;
}): StateSummary["protectedPage"] | undefined {
  const combined = [...params.visibleTexts, ...params.candidateActions]
    .map((value) => value.toLowerCase());
  const signals = new Set<string>();

  for (const value of combined) {
    if (value.includes("验证码") || value.includes("verification code") || value.includes("sms code")) {
      signals.add("otp_surface");
    }
    if (value.includes("滑块") || value.includes("captcha") || value.includes("人机验证")) {
      signals.add("human_verification");
    }
    if (value.includes("已阅读并同意") || value.includes("服务协议") || value.includes("隐私权政策")) {
      signals.add("consent_gate");
    }
    if (value.includes("安全键盘") || value.includes("secure keyboard")) {
      signals.add("secure_input_surface");
    }
  }

  if (signals.size === 0) {
    return undefined;
  }

  const signalList = [...signals].slice(0, 6);
  const uiTreeOnly = Boolean(params.uiSummary && params.uiSummary.totalNodes > 0);
  const note = signalList.includes("human_verification")
    ? "A verification or challenge surface is visible; treat screenshots and deterministic selectors as potentially constrained."
    : "This screen likely belongs to a login, consent, or verification boundary with higher automation friction.";

  return {
    suspected: true,
    observability: uiTreeOnly ? "ui_tree_only" : "limited",
    signals: signalList,
    note,
  };
}

function inferManualHandoffRecommendation(params: {
  visibleTexts: string[];
  candidateActions: string[];
  protectedPage?: StateSummary["protectedPage"];
}): ManualHandoffRecommendation | undefined {
  const combined = [...params.visibleTexts, ...params.candidateActions]
    .map((value) => value.toLowerCase());
  const containsAny = (...patterns: string[]): boolean =>
    patterns.some((pattern) => combined.some((value) => value.includes(pattern)));

  if (containsAny("请输入验证码", "验证码", "verification code", "sms code")) {
    return {
      required: true,
      reason: "otp_required",
      summary: "A one-time verification code step is visible and should be completed by a human operator.",
      suggestedOperatorActions: [
        "Read the verification code from the trusted channel and enter it on-device.",
        "Do not expose or persist the one-time code in automation logs.",
      ],
      resumeHints: [
        "After the code is entered, run get_screen_summary or get_session_state to confirm the post-login state.",
      ],
    };
  }

  if (containsAny("滑块", "captcha", "人机验证")) {
    return {
      required: true,
      reason: "captcha_required",
      summary: "A human verification challenge is visible and requires manual completion.",
      suggestedOperatorActions: [
        "Complete the verification challenge directly on the device.",
        "Resume automation only after the challenge surface is fully dismissed.",
      ],
      resumeHints: [
        "Re-query the current screen after challenge dismissal before issuing write actions.",
      ],
    };
  }

  if (containsAny("已阅读并同意", "服务协议", "隐私权政策")) {
    return {
      required: false,
      reason: "consent_required",
      summary: "A consent gate is visible; automation may proceed only after explicit user acknowledgement or an allowed consent interaction.",
      suggestedOperatorActions: [
        "Confirm the consent text is acceptable for the current environment before continuing.",
      ],
      resumeHints: [
        "If policy allows, the agent may tap the consent checkbox before continuing the flow.",
      ],
    };
  }

  if (params.protectedPage?.suspected) {
    return {
      required: false,
      reason: "protected_page",
      summary: "This screen appears to be a protected automation boundary; validate observability before attempting high-risk actions.",
      suggestedOperatorActions: [
        "Prefer bounded actions and explicit post-action checks while on this surface.",
      ],
      resumeHints: [
        "Escalate to request_manual_handoff if the next step requires secrets, OTP, or challenge completion.",
      ],
    };
  }

  return undefined;
}

function buildStateConfidence(params: { appPhase: StateSummary["appPhase"]; readiness: StateSummary["readiness"]; uiSummary?: InspectUiSummary; blockingSignals: string[]; recentFailures: string[] }): number {
  let confidence = (params.uiSummary?.totalNodes ?? 0) > 0 ? 0.55 : 0.2;
  if (params.appPhase !== "unknown") confidence += 0.15;
  if (params.readiness !== "unknown") confidence += 0.1;
  if (params.blockingSignals.length > 0) confidence += 0.1;
  if (params.recentFailures.length > 0) confidence += 0.05;
  return Math.max(0.1, Math.min(0.98, Number(confidence.toFixed(2))));
}

export function buildLogSummary(content: string, query?: string): LogSummary {
  const lines = content.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean);
  const queryText = query?.trim();
  const queryLower = queryText?.toLowerCase();
  const matchedLines = queryLower ? lines.filter((line) => line.toLowerCase().includes(queryLower)) : lines;
  const interestingLines = matchedLines.filter(isInterestingDebugLine);
  const bucket = new Map<string, DebugSignalSummary>();

  for (const line of interestingLines) {
    const category = classifyDebugSignal(line);
    const key = `${category}:${line}`;
    const current = bucket.get(key);
    if (current) {
      current.count += 1;
    } else {
      bucket.set(key, { category, count: 1, sample: line });
    }
  }

  const topSignals = [...bucket.values()]
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
    .slice(0, 8);
  const sampleLines = interestingLines.slice(0, 8);

  return {
    totalLines: lines.length,
    matchedLines: matchedLines.length,
    query: queryText,
    topSignals,
    sampleLines,
  };
}

export function summarizeStateDelta(previous: StateSummary | undefined, current: StateSummary): string[] {
  if (!previous) {
    return [];
  }
  return uniqueNonEmpty([
    previous.appPhase !== current.appPhase ? `appPhase:${previous.appPhase}->${current.appPhase}` : undefined,
    previous.readiness !== current.readiness ? `readiness:${previous.readiness}->${current.readiness}` : undefined,
    JSON.stringify(previous.blockingSignals ?? []) !== JSON.stringify(current.blockingSignals ?? []) ? `blockingSignals:${(previous.blockingSignals ?? []).join(",")}->${(current.blockingSignals ?? []).join(",")}` : undefined,
    previous.screenTitle !== current.screenTitle ? `screenTitle:${previous.screenTitle ?? "unknown"}->${current.screenTitle ?? "unknown"}` : undefined,
    previous.screenId !== current.screenId ? `screenId:${previous.screenId ?? "unknown"}->${current.screenId ?? "unknown"}` : undefined,
  ], 6);
}

/**
 * Determine whether two StateSummary objects differ in material state fields.
 *
 * This comparator explicitly EXCLUDES pageIdentity from the comparison, because
 * pageIdentity is a supplementary identification signal, not a state-change
 * detector. Using JSON.stringify on full StateSummary objects will silently
 * change behavior when pageIdentity is present.
 *
 * Returns true when the summaries differ in any material field.
 */
export function hasStateChanged(a: StateSummary, b: StateSummary): boolean {
  if (a === b) return false;
  // Compare all fields EXCEPT pageIdentity
  const aComparable: Omit<StateSummary, "pageIdentity"> = {
    screenId: a.screenId,
    screenTitle: a.screenTitle,
    routeName: a.routeName,
    appPhase: a.appPhase,
    readiness: a.readiness,
    blockingSignals: a.blockingSignals,
    stateConfidence: a.stateConfidence,
    pageHints: a.pageHints,
    derivedSignals: a.derivedSignals,
    visibleTargetCount: a.visibleTargetCount,
    candidateActions: a.candidateActions,
    recentFailures: a.recentFailures,
    topVisibleTexts: a.topVisibleTexts,
    protectedPage: a.protectedPage,
    manualHandoff: a.manualHandoff,
  };
  const bComparable: Omit<StateSummary, "pageIdentity"> = {
    screenId: b.screenId,
    screenTitle: b.screenTitle,
    routeName: b.routeName,
    appPhase: b.appPhase,
    readiness: b.readiness,
    blockingSignals: b.blockingSignals,
    stateConfidence: b.stateConfidence,
    pageHints: b.pageHints,
    derivedSignals: b.derivedSignals,
    visibleTargetCount: b.visibleTargetCount,
    candidateActions: b.candidateActions,
    recentFailures: b.recentFailures,
    topVisibleTexts: b.topVisibleTexts,
    protectedPage: b.protectedPage,
    manualHandoff: b.manualHandoff,
  };
  return JSON.stringify(aComparable) !== JSON.stringify(bComparable);
}

export function buildStateSummaryFromSignals(params: {
  uiSummary?: InspectUiSummary;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
}): StateSummary {
  const sampleNodes = params.uiSummary?.sampleNodes ?? [];
  const visibleTexts = uniqueNonEmpty(sampleNodes.flatMap((node) => [node.text, node.contentDesc]));
  const candidateActions = uniqueNonEmpty(sampleNodes.filter((node) => node.clickable).flatMap((node) => [node.text, node.contentDesc, node.resourceId]));
  const blockingSignals = detectBlockingSignals(visibleTexts, candidateActions);
  const recentFailures = buildRecentFailures(params.logSummary, params.crashSummary);
  const pageHints = inferPageHints(visibleTexts, candidateActions);
  const topCrash = params.crashSummary?.topSignals[0]?.sample?.toLowerCase();
  const topLog = params.logSummary?.topSignals[0]?.sample?.toLowerCase();
  const hasCrash = Boolean(topCrash && (topCrash.includes("crash") || topCrash.includes("fatal") || topCrash.includes("anr")));
  const hasLoading = blockingSignals.includes("loading_indicator");
  const hasInterruption = blockingSignals.includes("permission_prompt") || blockingSignals.includes("dialog_actions");
  const hasNetworkInstability = blockingSignals.includes("network_instability") || Boolean(topLog && (topLog.includes("network") || topLog.includes("http") || topLog.includes("timeout")));
  const hasErrorState = blockingSignals.includes("error_state") || Boolean(topLog && (topLog.includes("failed") || topLog.includes("error") || topLog.includes("exception")));
  const hasOfflineSignal = Boolean(
    topLog
    && (topLog.includes("offline")
      || topLog.includes("no internet")
      || topLog.includes("network is unreachable")
      || topLog.includes("dns")),
  ) || visibleTexts.some((value) => {
    const normalized = value.toLowerCase();
    return normalized.includes("offline") || normalized.includes("no internet") || normalized.includes("connection lost");
  });
  const hasBackendTerminal = hasErrorState
    && !hasLoading
    && Boolean(topLog && (topLog.includes("http 5") || topLog.includes("server error") || topLog.includes("service unavailable") || topLog.includes("backend")));
  const hasEmptyState = blockingSignals.includes("empty_state") || pageHints.includes("empty");
  const hasDegradedSuccess = hasNetworkInstability
    && !hasLoading
    && !hasOfflineSignal
    && !hasBackendTerminal
    && (params.uiSummary?.clickableNodes ?? 0) > 0;
  const appPhase = hasCrash
    ? "crashed"
    : hasInterruption || hasErrorState
      ? "blocked"
      : pageHints.includes("authentication")
        ? "authentication"
        : pageHints.includes("detail")
          ? "detail"
          : pageHints.includes("catalog")
            ? "catalog"
            : hasEmptyState
              ? "empty"
      : hasLoading
        ? "loading"
        : (params.uiSummary?.totalNodes ?? 0) > 0
          ? "ready"
          : "unknown";
  const readiness = hasInterruption
    ? "interrupted"
    : hasOfflineSignal
      ? "offline_terminal"
      : hasBackendTerminal
        ? "backend_failed_terminal"
    : hasLoading
      ? (hasNetworkInstability || recentFailures.some((value) => value.toLowerCase().includes("http")) ? "waiting_network" : "waiting_ui")
      : hasDegradedSuccess
        ? "degraded_success"
      : hasNetworkInstability
        ? "waiting_network"
      : appPhase === "ready"
        ? "ready"
        : "unknown";
  const screenTitle = visibleTexts[0] ?? candidateActions[0];
  const derivedSignals = uniqueNonEmpty([
    hasCrash ? "crash_signal" : undefined,
    hasLoading ? "loading_indicator" : undefined,
    hasInterruption ? "interruption_signal" : undefined,
    hasNetworkInstability ? "network_instability" : undefined,
    hasOfflineSignal ? "offline_terminal_signal" : undefined,
    hasBackendTerminal ? "backend_terminal_signal" : undefined,
    hasDegradedSuccess ? "degraded_success_signal" : undefined,
    hasErrorState ? "error_state" : undefined,
    hasEmptyState ? "empty_state" : undefined,
    ...pageHints.map((hint) => `page_hint:${hint}`),
  ], 8);
  const protectedPage = inferProtectedPageAssessment({
    visibleTexts,
    candidateActions,
    uiSummary: params.uiSummary,
  });
  const manualHandoff = inferManualHandoffRecommendation({
    visibleTexts,
    candidateActions,
    protectedPage,
  });
  if (protectedPage?.suspected) {
    derivedSignals.push("protected_page_suspected");
  }
  if (manualHandoff?.required) {
    derivedSignals.push(`manual_handoff:${manualHandoff.reason}`);
  }
  const stateConfidence = buildStateConfidence({
    appPhase,
    readiness,
    uiSummary: params.uiSummary,
    blockingSignals,
    recentFailures,
  });

  return {
    screenId: toScreenId(screenTitle ?? visibleTexts.join("-")),
    screenTitle,
    appPhase,
    readiness,
    blockingSignals,
    stateConfidence,
    pageHints,
    derivedSignals,
    visibleTargetCount: params.uiSummary?.clickableNodes,
    candidateActions,
    recentFailures,
    topVisibleTexts: visibleTexts,
    protectedPage,
    manualHandoff,
    pageIdentity: derivePageIdentity(params.uiSummary),
  };
}

function derivePageIdentity(uiSummary?: InspectUiSummary): import("@mobile-e2e-mcp/contracts").PageIdentity | undefined {
  if (!uiSummary) return undefined;

  const sampleNodes = uiSummary.sampleNodes ?? [];
  const headings = sampleNodes.filter(n => n.className?.includes("Heading") || n.className?.includes("StaticText"));
  const primaryHeading = headings[0]?.text ?? headings[0]?.contentDesc;

  // Detect back button: top-area button with common back labels
  const topButtons = sampleNodes.filter(n =>
    n.clickable &&
    n.bounds && (() => {
      const m = n.bounds.match(/^\[(\d+),(\d+)\]/);
      return m ? parseInt(m[2], 10) < 150 : false;
    })()
  );
  const backButton = topButtons.find(b =>
    ["Settings", "设置", "Back", "返回", "‹", "<"].includes(b.text ?? b.contentDesc ?? "")
  );

  // Compute tree hash using the shared algorithm from sample nodes.
  // NOTE: This hash is derived from InspectUiSummary.sampleNodes (a subset
  // of the full hierarchy) and is NOT cross-comparable with the stability
  // hash from wait_for_ui_stable, which hashes the full raw snapshot.
  const signatures = sampleNodeSignatures({ sampleNodes });
  const treeHash = computeTreeHash(signatures);

  return {
    treeHash: treeHash || undefined,
    visibleElementCount: uiSummary.totalNodes,
    hasBackAffordance: !!backButton,
    backAffordanceLabel: backButton?.text ?? backButton?.contentDesc,
    primaryHeading: primaryHeading ?? undefined,
    identitySource: primaryHeading ? "heading" : "tree-heuristic",
    identityConfidence: primaryHeading ? 0.9 : 0.6,
    isTopLevel: !backButton,
    probableParentScreenId: backButton ? "app-main" : undefined,
  };
}

function buildSessionStateTimelineEvent(params: {
  screenSummary: StateSummary;
  artifacts: string[];
  dryRun: boolean;
}): SessionTimelineEvent {
  const timestamp = new Date().toISOString();
  return {
    eventId: `state-summary-${Date.now()}`,
    timestamp,
    type: "state_summary_captured",
    detail: params.dryRun ? "Captured session state summary in dry-run mode." : "Captured session state summary.",
    eventType: "state_summary",
    layer: "state",
    summary: params.screenSummary.screenTitle ?? params.screenSummary.appPhase,
    artifactRefs: params.artifacts,
    stateSummary: params.screenSummary,
    evidenceCompleteness: {
      level: params.artifacts.length >= 3 ? "complete" : params.artifacts.length > 0 ? "partial" : "missing",
      capturedKinds: params.artifacts.map((artifactPath) => artifactPath.includes("ui-dumps") ? "ui_dump" : artifactPath.includes("logs") ? "log" : artifactPath.includes("crash") ? "crash_signal" : "debug_summary"),
      missingEvidence: params.artifacts.length >= 3 ? [] : ["ui/log/crash evidence is not fully populated"],
    },
  };
}

export async function getScreenSummaryWithMaestro(
  input: GetScreenSummaryInput,
): Promise<ToolResult<GetScreenSummaryData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const fallbackState: StateSummary = { appPhase: "unknown", readiness: "unknown", blockingSignals: [] };
    return {
      status: "failed",
      reasonCode: REASON_CODES_VALUES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: input.outputPath ?? path.posix.join("artifacts", "state-summaries", input.sessionId, `unknown-${runnerProfile}.json`),
        command: [],
        exitCode: null,
        supportLevel: "partial",
        summarySource: "ui_only",
        screenSummary: fallbackState,
      },
      nextSuggestions: ["Provide platform explicitly, or call get_screen_summary with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const inspectResult = await inspectUiWithMaestroTool({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    dryRun: input.dryRun,
  });
  const includeDebugSignals = input.includeDebugSignals ?? false;
  const logOutputPath = path.posix.join("artifacts", "state-summaries", input.sessionId, `${input.platform}-${runnerProfile}.logs.txt`);
  const crashOutputPath = path.posix.join("artifacts", "state-summaries", input.sessionId, `${input.platform}-${runnerProfile}.crash.txt`);
  const logResult = includeDebugSignals
    ? await getLogsWithMaestro({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      outputPath: logOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;
  const crashResult = includeDebugSignals
    ? await getCrashSignalsWithMaestro({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      appId: input.appId,
      outputPath: crashOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;
  const screenSummary = buildStateSummaryFromSignals({
    uiSummary: inspectResult.data.summary,
    logSummary: logResult?.data.summary,
    crashSummary: crashResult?.data.summary,
  });
  const artifacts = Array.from(new Set([...inspectResult.artifacts, ...(logResult?.artifacts ?? []), ...(crashResult?.artifacts ?? [])]));
  const evidence = [
    ...(inspectResult.data.evidence ?? []),
    ...(logResult?.data.evidence ?? []),
    ...(crashResult?.data.evidence ?? []),
  ];
  const status = inspectResult.status === "failed"
    ? "failed"
    : ((logResult?.status === "failed" || crashResult?.status === "failed") ? "partial" : inspectResult.status);
  const reasonCode = inspectResult.status === "failed"
    ? inspectResult.reasonCode
    : logResult?.status === "failed"
      ? logResult.reasonCode
      : crashResult?.status === "failed"
        ? crashResult.reasonCode
        : inspectResult.reasonCode;

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1 + (logResult?.attempts ?? 0) + (crashResult?.attempts ?? 0),
    artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      outputPath: inspectResult.data.outputPath,
      command: inspectResult.data.command,
      exitCode: inspectResult.data.exitCode,
      supportLevel: inspectResult.data.supportLevel,
      summarySource: includeDebugSignals ? "ui_and_debug_signals" : "ui_only",
      screenSummary,
      evidence: evidence.length > 0 ? evidence : undefined,
      content: inspectResult.data.content,
      uiSummary: inspectResult.data.summary,
      logSummary: logResult?.data.summary,
      crashSummary: crashResult?.data.summary,
      crashAttribution: crashResult?.data.crashAttribution,
    },
    nextSuggestions: Array.from(new Set([
      ...inspectResult.nextSuggestions,
      ...(logResult?.nextSuggestions ?? []),
      ...(crashResult?.nextSuggestions ?? []),
      ...(screenSummary.manualHandoff?.required
        ? [
          `Manual handoff recommended: ${screenSummary.manualHandoff.summary}`,
          "Call request_manual_handoff to record the operator checkpoint in the active session timeline.",
        ]
        : []),
    ])).slice(0, 5),
  };
}

export async function getSessionStateWithMaestro(
  input: GetSessionStateInput,
): Promise<ToolResult<GetSessionStateData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES_VALUES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        platform: "android",
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        sessionRecordFound: false,
        state: {
          appPhase: "unknown",
          readiness: "unknown",
          blockingSignals: [],
        },
        capabilities: buildCapabilityProfile("android", input.runnerProfile ?? DEFAULT_RUNNER_PROFILE),
        screenSummary: {
          appPhase: "unknown",
          readiness: "unknown",
          blockingSignals: [],
        },
      },
      nextSuggestions: ["Provide platform explicitly or call start_session first so get_session_state can infer session defaults."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const screenSummaryResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: true,
    dryRun: input.dryRun,
  });
  const capabilities = buildCapabilityProfile(platform, runnerProfile);
  const persisted = sessionRecord && screenSummaryResult.status !== "failed"
    ? await persistSessionState(
      repoRoot,
      input.sessionId,
      screenSummaryResult.data.screenSummary,
      buildSessionStateTimelineEvent({
        screenSummary: screenSummaryResult.data.screenSummary,
        artifacts: screenSummaryResult.artifacts,
        dryRun: Boolean(input.dryRun),
      }),
      screenSummaryResult.artifacts,
    )
    : { updated: false as const, relativePath: undefined };
  const artifacts = persisted.relativePath
    ? Array.from(new Set([persisted.relativePath, ...screenSummaryResult.artifacts]))
    : screenSummaryResult.artifacts;
  const latestKnownStateDelta = summarizeStateDelta(sessionRecord?.session.latestStateSummary, screenSummaryResult.data.screenSummary);

  return {
    status: screenSummaryResult.status,
    reasonCode: screenSummaryResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: screenSummaryResult.attempts,
    artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      platform,
      runnerProfile,
      sessionRecordFound: Boolean(sessionRecord),
      state: screenSummaryResult.data.screenSummary,
      latestKnownState: sessionRecord?.session.latestStateSummary,
      latestKnownStateDelta: latestKnownStateDelta.length > 0 ? latestKnownStateDelta : undefined,
      capabilities,
      screenSummary: screenSummaryResult.data.screenSummary,
      logSummary: screenSummaryResult.data.logSummary,
      crashSummary: screenSummaryResult.data.crashSummary,
      crashAttribution: screenSummaryResult.data.crashAttribution,
      evidence: screenSummaryResult.data.evidence,
    },
    nextSuggestions: sessionRecord
      ? Array.from(new Set([
        ...screenSummaryResult.nextSuggestions,
        ...(screenSummaryResult.data.screenSummary.manualHandoff?.required
          ? ["Use request_manual_handoff if a human operator must complete OTP, captcha, or protected-page steps."]
          : []),
      ])).slice(0, 5)
      : Array.from(new Set([
        "start_session before long-running execution if you want state snapshots persisted across tools.",
        ...screenSummaryResult.nextSuggestions,
      ])).slice(0, 5),
  };
}
