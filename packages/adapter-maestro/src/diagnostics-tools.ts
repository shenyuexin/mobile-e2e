import type {
  CollectDebugEvidenceData,
  CollectDebugEvidenceInput,
  DiagnosisPacket,
  DebugSignalSummary,
  JsConsoleLogEntry,
  JsConsoleLogSummary,
  JsNetworkFailureSummary,
  LogSummary,
  PerformActionWithEvidenceData,
  ReasonCode,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  captureJsConsoleLogsWithMaestro,
  captureJsNetworkEventsWithMaestro,
  buildJsDebugTargetSelectionNarrativeLine,
  buildJsNetworkSuspectSentences,
  formatJsConsoleEntry,
  listJsDebugTargetsWithMaestro,
  normalizeMetroBaseUrl,
  selectPreferredJsDebugTargetWithReason,
} from "./js-debug.js";
import {
  collectDiagnosticsWithRuntime,
  getCrashSignalsWithRuntime,
  getLogsWithRuntime,
} from "./device-runtime.js";
import { buildExecutionEvidence, normalizePositiveInteger } from "./runtime-shared.js";

const DEFAULT_DEBUG_PACKET_JS_TIMEOUT_MS = 1000;

interface IosPhysicalStartupEvidenceSummary {
  artifactPath: string;
  attemptedBackend?: string;
  executedBackend?: string;
  fallbackUsed?: boolean;
  primaryFailurePhase?: string;
  startupPhase?: string;
  reasonCode?: ReasonCode;
  summaryLine?: string;
}

function parseIosPhysicalExecutionEvidenceMarkdown(markdown: string): IosPhysicalStartupEvidenceSummary {
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
  const reasonCode = kv.get("reasonCode");
  return {
    artifactPath: "",
    attemptedBackend: kv.get("attemptedBackend"),
    executedBackend: kv.get("executedBackend"),
    fallbackUsed: kv.get("fallbackUsed") === "true",
    primaryFailurePhase: kv.get("primaryFailurePhase"),
    startupPhase: kv.get("startupPhase"),
    reasonCode: reasonCode as ReasonCode | undefined,
    summaryLine,
  };
}

async function loadLatestIosPhysicalStartupEvidence(repoRoot: string, sessionId: string): Promise<IosPhysicalStartupEvidenceSummary | undefined> {
  const evidenceRoot = path.resolve(repoRoot, "artifacts", "ios-physical-actions", sessionId);
  let entries: Array<{ name: string; mtimeMs: number }> = [];
  try {
    const listed = await readdir(evidenceRoot, { withFileTypes: true });
    entries = await Promise.all(
      listed
        .filter((entry) => entry.isFile() && entry.name.endsWith(".execution.md"))
        .map(async (entry) => {
          const absolutePath = path.join(evidenceRoot, entry.name);
          const fileStat = await stat(absolutePath);
          return { name: entry.name, mtimeMs: fileStat.mtimeMs };
        }),
    );
  } catch {
    return undefined;
  }
  if (entries.length === 0) {
    return undefined;
  }
  const latest = entries.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  const absolutePath = path.join(evidenceRoot, latest.name);
  const relativePath = path.posix.join("artifacts", "ios-physical-actions", sessionId, latest.name);
  try {
    const markdown = await readFile(absolutePath, "utf8");
    const parsed = parseIosPhysicalExecutionEvidenceMarkdown(markdown);
    return {
      ...parsed,
      artifactPath: relativePath,
    };
  } catch {
    return undefined;
  }
}

function buildDiagnosisPacket(params: {
  reasonCode: ReasonCode;
  suspectAreas: string[];
  environmentIssue?: string;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  jsConsoleSummary?: JsConsoleLogSummary;
  jsNetworkSummary?: JsNetworkFailureSummary;
}): DiagnosisPacket | undefined {
  const strongestCausalSignal = params.suspectAreas[0]
    ?? params.crashSummary?.topSignals[0]?.sample
    ?? params.logSummary?.topSignals[0]?.sample
    ?? "Summarized evidence is still inconclusive; inspect the strongest available clue before escalating.";

  const strongestSuspectLayer: DiagnosisPacket["strongestSuspectLayer"] = params.environmentIssue
    ? "environment"
    : params.crashSummary?.topSignals[0]
      ? "crash"
      : (params.jsConsoleSummary?.exceptionCount ?? 0) > 0
        ? "runtime"
        : (params.jsNetworkSummary?.failedRequestCount ?? 0) > 0
          ? "network"
          : params.logSummary?.topSignals[0]
            ? "runtime"
            : "environment";

  return {
    strongestSuspectLayer,
    strongestCausalSignal,
    confidence: params.environmentIssue || params.reasonCode !== REASON_CODES.ok ? "weak" : "moderate",
    recommendedNextProbe: params.environmentIssue
      ? "Restore device or Metro inspector availability before relying on summarized evidence."
      : strongestSuspectLayer === "network"
        ? "Inspect the failing API host, response status, and readiness transition around the action window."
        : strongestSuspectLayer === "crash"
          ? "Inspect the crash artifact and top crash signal before reading full logs."
          : "Inspect the strongest summarized suspect before escalating to heavier diagnostics.",
    recommendedRecovery: strongestSuspectLayer === "environment"
      ? "Restore environment readiness first, then re-run bounded evidence capture."
      : strongestSuspectLayer === "network"
        ? "Wait for network readiness or confirm terminal backend/offline state before retrying."
        : strongestSuspectLayer === "crash"
          ? "Stabilize or relaunch the app before retrying the same path."
          : "Use the summarized suspect to choose one bounded next probe before retrying.",
    escalationThreshold: "if_summary_inconclusive",
  };
}

function mergeSignalSummaries(...summaries: Array<LogSummary | undefined>): DebugSignalSummary[] {
  const merged = new Map<string, DebugSignalSummary>();

  for (const summary of summaries) {
    if (!summary) continue;
    for (const signal of summary.topSignals) {
      const key = `${signal.category}:${signal.sample}`;
      const current = merged.get(key);
      if (current) {
        current.count += signal.count;
      } else {
        merged.set(key, { ...signal });
      }
    }
  }

  return [...merged.values()].sort((left, right) => right.count - left.count).slice(0, 10);
}

function buildDebugNarrative(params: {
  appId?: string;
  appFilterApplied: boolean;
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  jsNetworkSummary?: JsNetworkFailureSummary;
  includeDiagnostics: boolean;
  diagnosticsArtifacts: number;
}): string[] {
  const narrative: string[] = [];

  if (params.appId) {
    narrative.push(params.appFilterApplied
      ? `Evidence capture is scoped to app ${params.appId}.`
      : `Evidence capture is not app-scoped yet for ${params.appId}; results may include device-wide noise.`);
  }

  if (params.crashSummary && params.crashSummary.topSignals.length > 0) {
    const topCrash = params.crashSummary.topSignals[0];
    narrative.push(`Crash evidence is present: ${topCrash.category} appears ${String(topCrash.count)} time(s).`);
  } else {
    narrative.push("No high-confidence crash signals were detected in the captured crash evidence.");
  }

  if (params.logSummary) {
    narrative.push(`Log capture scanned ${String(params.logSummary.totalLines)} lines and flagged ${String(params.logSummary.sampleLines.length)} interesting lines for AI review.`);
  }

  if (params.jsNetworkSummary && params.jsNetworkSummary.failedRequestCount > 0) {
    narrative.push(...buildJsNetworkSuspectSentences(params.jsNetworkSummary));
  }

  if (params.includeDiagnostics) {
    narrative.push(`Diagnostics bundle capture is included with ${String(params.diagnosticsArtifacts)} artifact path(s). Use it only if logs and crash summaries are insufficient.`);
  }

  return narrative;
}

function buildSuspectAreas(params: {
  crashSummary?: LogSummary;
  logSummary?: LogSummary;
  jsConsoleSummary?: JsConsoleLogSummary;
  jsNetworkSummary?: JsNetworkFailureSummary;
  jsConsoleLogs?: JsConsoleLogEntry[];
  environmentIssue?: string;
}): string[] {
  const suspects: string[] = [];

  if (params.environmentIssue) {
    suspects.push(`Environment suspect: ${params.environmentIssue}`);
  }

  const topCrash = params.crashSummary?.topSignals[0];
  if (topCrash) {
    suspects.push(`Crash suspect: ${topCrash.sample}`);
  }

  const topLog = params.logSummary?.topSignals[0];
  if (topLog && (!topCrash || topLog.sample !== topCrash.sample)) {
    suspects.push(`Runtime log suspect: ${topLog.sample}`);
  }

  if ((params.jsConsoleSummary?.exceptionCount ?? 0) > 0) {
    const firstException = params.jsConsoleLogs?.find((entry) => entry.level === "exception");
    suspects.push(firstException
      ? `JS exception suspect: ${firstException.exceptionType ?? "Exception"} at ${firstException.sourceUrl ?? "<unknown>"}:${String(firstException.lineNumber ?? 0)}:${String(firstException.columnNumber ?? 0)}.`
      : `JS exception suspect: ${String(params.jsConsoleSummary?.exceptionCount ?? 0)} inspector exception event(s) captured.`);
  }

  const topNetworkStatus = params.jsNetworkSummary?.statusGroups[0];
  if (params.jsNetworkSummary && (topNetworkStatus || params.jsNetworkSummary.errorGroups[0])) {
    suspects.push(...buildJsNetworkSuspectSentences(params.jsNetworkSummary));
  }

  return suspects.slice(0, 5);
}

export function buildDiagnosisBriefing(params: {
  status: ToolResult["status"];
  reasonCode: ReasonCode;
  appId?: string;
  suspectAreas: string[];
  jsDebugTargetId?: string;
  jsConsoleLogCount?: number;
  jsNetworkEventCount?: number;
  retryRecommendationTier?: PerformActionWithEvidenceData["retryRecommendationTier"];
  retryRecommendation?: PerformActionWithEvidenceData["retryRecommendation"];
}): string[] {
  const briefing: string[] = [];

  if (params.appId) {
    briefing.push(`Target app: ${params.appId}.`);
  }

  if (params.suspectAreas.length > 0) {
    briefing.push(...params.suspectAreas.slice(0, 3));
  }

  if (params.jsDebugTargetId) {
    briefing.push(`JS inspector target: ${params.jsDebugTargetId}.`);
  }

  if ((params.jsConsoleLogCount ?? 0) > 0 || (params.jsNetworkEventCount ?? 0) > 0) {
    briefing.push(`JS evidence captured: ${String(params.jsConsoleLogCount ?? 0)} console event(s), ${String(params.jsNetworkEventCount ?? 0)} network event(s).`);
  }

  if (params.retryRecommendationTier && params.retryRecommendationTier !== "none") {
    briefing.push(`Recommended next-action tier: ${params.retryRecommendationTier}.`);
  }
  if (params.retryRecommendation) {
    briefing.push(`Recommended follow-up: ${params.retryRecommendation.suggestedAction}`);
  }

  if (params.status !== "success") {
    briefing.push(`Current packet status is ${params.status} (${params.reasonCode}).`);
  }

  return briefing.slice(0, 5);
}

function buildDebugNextSuggestions(params: {
  reasonCode: ReasonCode;
  suspectAreas: string[];
  includeDiagnostics: boolean;
  jsDebugTargetId?: string;
  jsConsoleLogCount?: number;
  jsNetworkEventCount?: number;
  iosStartupEvidence?: IosPhysicalStartupEvidenceSummary;
}): string[] {
  const suggestions: string[] = [];

  const startupSummary = params.iosStartupEvidence?.summaryLine?.toLowerCase() ?? "";
  const isSignaturePreflight = params.reasonCode === REASON_CODES.configurationError
    && (startupSummary.includes("code signature")
      || startupSummary.includes("identity used to sign")
      || startupSummary.includes("0xe8008018")
      || startupSummary.includes("无法验证其完整性"));

  const startupPhase = params.iosStartupEvidence?.primaryFailurePhase
    && params.iosStartupEvidence.primaryFailurePhase !== "none"
    ? params.iosStartupEvidence.primaryFailurePhase
    : params.iosStartupEvidence?.startupPhase;
  if (startupPhase === "preflight") {
    suggestions.push(
      isSignaturePreflight
        ? "iOS startup preflight failed at runner installation/signing validation: verify a valid Apple Development identity + provisioning profile for this device UDID, then rebuild xctestrun artifacts before rerun."
        : "iOS startup preflight failed: unlock the target device and keep it awake, then rerun bounded evidence capture.",
    );
  } else if (startupPhase === "bundle_mapping") {
    suggestions.push("iOS startup failed at bundle mapping: verify xctestrun TestHostBundleIdentifier and installed xctrunner bundle id alignment.");
  } else if (startupPhase === "xctest_handshake") {
    suggestions.push("iOS startup handshake failed (code74/dtxproxy): inspect XCTestManager channel bootstrap evidence before retrying.");
  } else if (startupPhase === "startup_timeout") {
    suggestions.push("iOS startup timed out: validate runner readiness and increase startup timeout window (for example MAESTRO_DRIVER_STARTUP_TIMEOUT=180000).");
  } else if (startupPhase === "runner_execution") {
    suggestions.push("iOS runner execution failed after dispatch: inspect startup execution artifact command and stderr first.");
  }

  if (params.iosStartupEvidence?.artifactPath) {
    suggestions.push(`Inspect startup execution artifact first: ${params.iosStartupEvidence.artifactPath}`);
  }

  if (params.reasonCode === REASON_CODES.deviceUnavailable) {
    suggestions.push("Restore device or simulator connectivity first, then re-run collect_debug_evidence.");
  }
  if (params.reasonCode === REASON_CODES.configurationError && !params.jsDebugTargetId) {
    suggestions.push("Start Metro or Expo dev server, then re-run collect_debug_evidence to include JS inspector evidence.");
  }
  if (params.suspectAreas.some((item) => item.toLowerCase().includes("network suspect"))) {
    suggestions.push("Inspect the failing API host and response path first; network evidence is the strongest current clue.");
  }
  if (params.suspectAreas.some((item) => item.toLowerCase().includes("js exception suspect"))) {
    suggestions.push("Inspect the reported JS exception source and top stack frame before reading the full raw logs.");
  }
  if (params.suspectAreas.some((item) => item.toLowerCase().includes("crash suspect"))) {
    suggestions.push("Inspect the top crash suspect in the crash artifact before escalating to heavier diagnostics.");
  }
  if (params.includeDiagnostics) {
    suggestions.push("Diagnostics capture is already enabled; use the bundle only after exhausting the summarized clues.");
  } else if ((params.jsConsoleLogCount ?? 0) === 0 && (params.jsNetworkEventCount ?? 0) === 0) {
    suggestions.push("Use the debug evidence summary first; escalate to collect_diagnostics only when the summarized native clues are still inconclusive.");
  }

  return [...new Set(suggestions)].slice(0, 5);
}

export async function collectDebugEvidenceWithRuntime(input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        outputPath: input.outputPath ?? path.posix.join("artifacts", "debug-evidence", input.sessionId, "unknown.md"),
        supportLevel: "partial",
        appId: input.appId,
        diagnosisBriefing: ["Missing platform context"],
        suspectAreas: ["configuration"],
        interestingSignals: [],
        evidencePaths: [],
        evidenceCount: 0,
        narrative: ["Platform was not provided and could not be inferred from session context."],
      },
      nextSuggestions: ["Provide platform explicitly, or call collect_debug_evidence with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.md`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const logOutputPath = path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.logs.txt`);
  const crashOutputPath = path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.crash.txt`);
  const diagnosticsOutputPath = input.platform === "android"
    ? path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.diagnostics.zip`)
    : path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.diagnostics`);
  const effectiveAppId = input.appId ?? selection.appId;
  const iosStartupEvidence = input.platform === "ios" && !input.dryRun
    ? await loadLatestIosPhysicalStartupEvidence(repoRoot, input.sessionId)
    : undefined;
  const includeJsInspector = input.includeJsInspector ?? true;
  const jsInspectorTimeoutMs = normalizePositiveInteger(input.jsInspectorTimeoutMs, DEFAULT_DEBUG_PACKET_JS_TIMEOUT_MS);
  const effectiveMetroBaseUrl = normalizeMetroBaseUrl(input.metroBaseUrl);
  const discoveredTargetsResult = includeJsInspector && !input.targetId && !input.webSocketDebuggerUrl
    ? await listJsDebugTargetsWithMaestro({ sessionId: input.sessionId, metroBaseUrl: input.metroBaseUrl, timeoutMs: jsInspectorTimeoutMs, dryRun: input.dryRun })
    : undefined;
  const discoveredSelection = discoveredTargetsResult?.status === "success"
    ? selectPreferredJsDebugTargetWithReason(discoveredTargetsResult.data.targets)
    : undefined;
  const discoveredTarget = discoveredSelection?.target;
  const effectiveTargetId = input.targetId ?? discoveredTarget?.id;
  const effectiveWebSocketDebuggerUrl = input.webSocketDebuggerUrl ?? discoveredTarget?.webSocketDebuggerUrl;

  const logsResult = await getLogsWithRuntime({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    appId: effectiveAppId,
    outputPath: logOutputPath,
    lines: input.logLines,
    sinceSeconds: input.sinceSeconds,
    query: input.query,
    dryRun: input.dryRun,
  });
  const crashResult = await getCrashSignalsWithRuntime({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    appId: effectiveAppId,
    outputPath: crashOutputPath,
    lines: input.logLines,
    dryRun: input.dryRun,
  });
  const diagnosticsResult = input.includeDiagnostics
    ? await collectDiagnosticsWithRuntime({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      outputPath: diagnosticsOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;
  const jsConsoleResult = includeJsInspector
    ? await captureJsConsoleLogsWithMaestro({
      sessionId: input.sessionId,
      metroBaseUrl: undefined,
      targetId: effectiveTargetId,
      webSocketDebuggerUrl: effectiveWebSocketDebuggerUrl,
      maxLogs: input.logLines,
      timeoutMs: jsInspectorTimeoutMs,
      dryRun: input.dryRun,
    })
    : undefined;
  const jsNetworkResult = includeJsInspector
    ? await captureJsNetworkEventsWithMaestro({
      sessionId: input.sessionId,
      metroBaseUrl: undefined,
      targetId: effectiveTargetId,
      webSocketDebuggerUrl: effectiveWebSocketDebuggerUrl,
      maxEvents: input.logLines,
      timeoutMs: jsInspectorTimeoutMs,
      failuresOnly: true,
      dryRun: input.dryRun,
    })
    : undefined;

  const evidencePaths = [
    ...logsResult.artifacts,
    ...crashResult.artifacts,
    ...(diagnosticsResult?.artifacts ?? []),
    ...(iosStartupEvidence?.artifactPath ? [iosStartupEvidence.artifactPath] : []),
  ];
  const environmentIssue = logsResult.reasonCode === REASON_CODES.deviceUnavailable || crashResult.reasonCode === REASON_CODES.deviceUnavailable
    ? "device or simulator connectivity prevented native evidence capture"
    : jsConsoleResult?.reasonCode === REASON_CODES.configurationError || jsNetworkResult?.reasonCode === REASON_CODES.configurationError
      ? "Metro inspector was unavailable for JS evidence capture"
      : undefined;
  const interestingSignals = mergeSignalSummaries(logsResult.data.summary, crashResult.data.summary);
  const suspectAreas = buildSuspectAreas({
    crashSummary: crashResult.data.summary,
    logSummary: logsResult.data.summary,
    jsConsoleSummary: jsConsoleResult?.data.summary,
    jsNetworkSummary: jsNetworkResult?.data.summary,
    jsConsoleLogs: jsConsoleResult?.data.logs,
    environmentIssue,
  });
  if (iosStartupEvidence?.summaryLine) {
    suspectAreas.unshift(`iOS startup suspect: ${iosStartupEvidence.summaryLine}`);
  }
  const narrative = buildDebugNarrative({
    appId: effectiveAppId,
    appFilterApplied: logsResult.data.appFilterApplied,
    logSummary: logsResult.data.summary,
    crashSummary: crashResult.data.summary,
    jsNetworkSummary: jsNetworkResult?.data.summary,
    includeDiagnostics: Boolean(input.includeDiagnostics),
    diagnosticsArtifacts: diagnosticsResult?.data.artifactCount ?? 0,
  });
  if (jsConsoleResult) {
    narrative.push(jsConsoleResult.status === "success"
      ? `JS console snapshot collected ${String(jsConsoleResult.data.collectedCount)} event(s).`
      : "JS console snapshot was unavailable; check Metro inspector availability.");
  }
  if (jsNetworkResult) {
    narrative.push(jsNetworkResult.status === "success"
      ? `JS network snapshot collected ${String(jsNetworkResult.data.collectedCount)} event(s).`
      : "JS network snapshot was unavailable; check Metro inspector availability.");
  }
  if (iosStartupEvidence?.artifactPath) {
    const phase = iosStartupEvidence.primaryFailurePhase && iosStartupEvidence.primaryFailurePhase !== "none"
      ? iosStartupEvidence.primaryFailurePhase
      : iosStartupEvidence.startupPhase;
    narrative.push(
      `iOS startup evidence is available (${phase ?? "unknown_phase"}, ${iosStartupEvidence.reasonCode ?? "UNKNOWN"}) at ${iosStartupEvidence.artifactPath}.`,
    );
  }
  if (includeJsInspector && discoveredTargetsResult) {
    narrative.push(buildJsDebugTargetSelectionNarrativeLine(discoveredTarget, discoveredSelection?.reason));
  }

  const jsConsoleOk = !jsConsoleResult || jsConsoleResult.status === "success";
  const jsNetworkOk = !jsNetworkResult || jsNetworkResult.status === "success";
  const allSucceeded = logsResult.status === "success" && crashResult.status === "success" && (!diagnosticsResult || diagnosticsResult.status === "success") && jsConsoleOk && jsNetworkOk;
  const anySucceeded = logsResult.status === "success" || crashResult.status === "success" || diagnosticsResult?.status === "success" || jsConsoleResult?.status === "success" || jsNetworkResult?.status === "success";
  let status: ToolResult<CollectDebugEvidenceData>["status"] = allSucceeded ? "success" : anySucceeded ? "partial" : "failed";
  let reasonCode = allSucceeded
    ? REASON_CODES.ok
    : logsResult.reasonCode !== REASON_CODES.ok
      ? logsResult.reasonCode
      : crashResult.reasonCode !== REASON_CODES.ok
        ? crashResult.reasonCode
        : diagnosticsResult?.reasonCode ?? jsConsoleResult?.reasonCode ?? jsNetworkResult?.reasonCode ?? REASON_CODES.adapterError;
  if (
    reasonCode === REASON_CODES.ok
    && iosStartupEvidence?.reasonCode
    && iosStartupEvidence.reasonCode !== REASON_CODES.ok
  ) {
    status = "partial";
    reasonCode = iosStartupEvidence.reasonCode;
  }
  if (suspectAreas.length === 0) {
    if (reasonCode === REASON_CODES.deviceUnavailable) {
      suspectAreas.push("Environment suspect: device or simulator connectivity prevented evidence capture.");
    } else if (reasonCode === REASON_CODES.configurationError) {
      suspectAreas.push("Environment suspect: Metro inspector or local debug configuration prevented JS evidence capture.");
    }
  }
  const diagnosisBriefing = buildDiagnosisBriefing({
    status,
    reasonCode,
    appId: effectiveAppId,
    suspectAreas,
    jsDebugTargetId: effectiveTargetId,
    jsConsoleLogCount: jsConsoleResult?.data.collectedCount,
    jsNetworkEventCount: jsNetworkResult?.data.collectedCount,
  });
  const diagnosisPacket = buildDiagnosisPacket({
    reasonCode,
    suspectAreas,
    environmentIssue,
    logSummary: logsResult.data.summary,
    crashSummary: crashResult.data.summary,
    jsConsoleSummary: jsConsoleResult?.data.summary,
    jsNetworkSummary: jsNetworkResult?.data.summary,
  });
  const nextSuggestions = buildDebugNextSuggestions({
    reasonCode,
    suspectAreas,
    includeDiagnostics: Boolean(input.includeDiagnostics),
    jsDebugTargetId: effectiveTargetId,
    jsConsoleLogCount: jsConsoleResult?.data.collectedCount,
    jsNetworkEventCount: jsNetworkResult?.data.collectedCount,
    iosStartupEvidence,
  });
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (!input.dryRun) {
    const report = [
      "# Debug Evidence Summary",
      `- Platform: ${input.platform}`,
      `- Runner profile: ${runnerProfile}`,
      `- App: ${effectiveAppId ?? "<unknown>"}`,
      `- Query: ${input.query ?? "<none>"}`,
      `- JS inspector enabled: ${includeJsInspector ? "yes" : "no"}`,
      `- JS target: ${effectiveTargetId ?? "<none>"}`,
      "",
      "## Diagnosis Briefing",
      ...(diagnosisBriefing.length > 0 ? diagnosisBriefing.map((line) => `- ${line}`) : ["- <no briefing available>"]),
      "",
      "## Narrative",
      ...narrative.map((line) => `- ${line}`),
      "",
      "## JS Console Events",
      ...(jsConsoleResult?.data.logs?.length ? jsConsoleResult.data.logs.map(formatJsConsoleEntry) : ["- <no JS console events captured>"]),
      "",
      "## JS Network Events",
      ...(jsNetworkResult?.data.events?.length ? jsNetworkResult.data.events.map((entry) => `- [${entry.status ?? "pending"}] ${entry.method ?? "GET"} ${entry.url ?? "<unknown>"}${entry.errorText ? ` :: ${entry.errorText}` : ""}`) : ["- <no JS network events captured>"]),
      "",
      "## Top Signals",
      ...(interestingSignals.length > 0 ? interestingSignals.map((signal) => `- [${signal.category}] x${String(signal.count)} ${signal.sample}`) : ["- <no interesting signals detected>"]),
      "",
      "## Suspect Areas",
      ...(suspectAreas.length > 0 ? suspectAreas.map((item) => `- ${item}`) : ["- <no prioritized suspects yet>"]),
      "",
      "## Evidence Paths",
      ...(evidencePaths.length > 0 ? evidencePaths.map((item) => `- ${item}`) : ["- <no evidence paths recorded>"]),
    ].join(String.fromCharCode(10)) + String.fromCharCode(10);
    await writeFile(absoluteOutputPath, report, "utf8");
  }

  const summaryArtifactPath = input.dryRun ? [] : [relativeOutputPath];

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [...summaryArtifactPath, ...evidencePaths],
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      outputPath: relativeOutputPath,
      supportLevel: "full",
      appId: effectiveAppId,
      jsDebugMetroBaseUrl: includeJsInspector ? effectiveMetroBaseUrl : undefined,
      jsDebugTargetEndpoint: discoveredTargetsResult?.data.endpoint,
      jsDebugTargetCandidateCount: discoveredTargetsResult?.data.targetCount,
      jsDebugTargetId: effectiveTargetId,
      jsDebugTargetTitle: discoveredTarget?.title,
      jsDebugTargetSelectionReason: discoveredSelection?.reason,
      logSummary: logsResult.data.summary,
      crashSummary: crashResult.data.summary,
      jsConsoleLogCount: jsConsoleResult?.data.collectedCount,
      jsNetworkEventCount: jsNetworkResult?.data.collectedCount,
      jsConsoleSummary: jsConsoleResult?.data.summary,
      jsNetworkSummary: jsNetworkResult?.data.summary,
      diagnosisPacket,
      diagnosisBriefing,
      suspectAreas,
      interestingSignals,
      evidencePaths: [...summaryArtifactPath, ...evidencePaths],
      evidenceCount: summaryArtifactPath.length + evidencePaths.length,
      evidence: [
        ...summaryArtifactPath.map((artifactPath) => buildExecutionEvidence("debug_summary", artifactPath, "full", "Generated summarized debug evidence report.")),
        ...(logsResult.data.evidence ?? []),
        ...(crashResult.data.evidence ?? []),
        ...(diagnosticsResult?.data.evidence ?? []),
        ...(iosStartupEvidence?.artifactPath
          ? [
            buildExecutionEvidence(
              "log",
              iosStartupEvidence.artifactPath,
              "partial",
              "Captured iOS physical startup execution evidence with startup phase attribution.",
            ),
          ]
          : []),
        ...(jsConsoleResult?.data.logs?.length ? [buildExecutionEvidence("log", "metro://console-snapshot", "partial", "Captured JS console snapshot from Metro inspector.")] : []),
        ...(jsNetworkResult?.data.events?.length ? [buildExecutionEvidence("log", "metro://network-snapshot", "partial", "Captured JS network snapshot from Metro inspector.")] : []),
      ],
      narrative,
    },
    nextSuggestions: status === "success" ? [] : nextSuggestions,
  };
}

export const diagnosticsToolInternals = {
  parseIosPhysicalExecutionEvidenceMarkdown,
  buildDebugNextSuggestions,
};
