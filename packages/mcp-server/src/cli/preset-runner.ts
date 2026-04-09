import type {
  CollectDebugEvidenceInput,
  ExplainLastFailureInput,
  GetCrashSignalsInput,
  GetLogsInput,
  GetScreenSummaryInput,
  LaunchAppInput,
  Platform,
  QueryUiInput,
  RankFailureCandidatesInput,
  RunnerProfile,
  ScreenshotInput,
  StartSessionInput,
  SuggestKnownRemediationInput,
  TapElementInput,
  ToolResult,
  WaitForUiInput,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { TOOL_NAMES } from "@mobile-e2e-mcp/contracts";
import { loadSessionRecord } from "@mobile-e2e-mcp/core";
import type { MobileE2EMcpServer } from "../server.js";
import type { CliOptions, PresetName } from "./types.js";
import type { ResolvedContextMeta } from "./context-resolver.js";

/** The subset of tools used by preset flows. Derived from TOOL_NAMES. */
type PresetStepTool = (typeof TOOL_NAMES)[
  | "startSession"
  | "getScreenSummary"
  | "getLogs"
  | "getCrashSignals"
  | "collectDebugEvidence"
  | "launchApp"
  | "queryUi"
  | "tapElement"
  | "waitForUi"
  | "takeScreenshot"
  | "explainLastFailure"
  | "rankFailureCandidates"
  | "suggestKnownRemediation"];

interface PresetStep {
  tool: PresetStepTool;
  onFailure?: "stop" | "continue";
}

interface PresetDefinition {
  platform: Platform;
  stopOnFailure: boolean;
  steps: PresetStep[];
}

const PRESETS: Record<PresetName, PresetDefinition> = {
  quick_debug_ios: {
    platform: "ios",
    stopOnFailure: true,
    steps: [
      { tool: TOOL_NAMES.startSession },
      { tool: TOOL_NAMES.getScreenSummary },
      { tool: TOOL_NAMES.getLogs },
      { tool: TOOL_NAMES.getCrashSignals },
      { tool: TOOL_NAMES.collectDebugEvidence },
    ],
  },
  quick_e2e_android: {
    platform: "android",
    stopOnFailure: true,
    steps: [
      { tool: TOOL_NAMES.startSession },
      { tool: TOOL_NAMES.launchApp },
      { tool: TOOL_NAMES.queryUi },
      { tool: TOOL_NAMES.tapElement },
      { tool: TOOL_NAMES.waitForUi },
      { tool: TOOL_NAMES.takeScreenshot },
    ],
  },
  crash_triage_android: {
    platform: "android",
    stopOnFailure: true,
    steps: [
      { tool: TOOL_NAMES.getCrashSignals },
      { tool: TOOL_NAMES.explainLastFailure },
      { tool: TOOL_NAMES.rankFailureCandidates },
      { tool: TOOL_NAMES.suggestKnownRemediation },
    ],
  },
};

interface PresetStepResult {
  tool: PresetStepTool;
  status: ToolResult["status"];
  reasonCode: ToolResult["reasonCode"];
  artifacts: string[];
  nextSuggestions: string[];
}

function pushArtifacts(target: string[], source: string[]): void {
  for (const item of source) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}

function defaultSelector(cliOptions: CliOptions): { resourceId?: string; contentDesc?: string; text?: string; className?: string; clickable?: boolean; limit?: number } {
  return {
    resourceId: cliOptions.queryResourceId,
    contentDesc: cliOptions.queryContentDesc ?? "View products",
    text: cliOptions.queryText ?? cliOptions.text,
    className: cliOptions.queryClassName,
    clickable: cliOptions.queryClickable,
    limit: cliOptions.queryLimit,
  };
}

async function invokePresetStep(
  server: MobileE2EMcpServer,
  tool: PresetStepTool,
  cliOptions: CliOptions,
  sessionId: string,
): Promise<ToolResult<unknown>> {
  const selector = defaultSelector(cliOptions);
  if (tool === TOOL_NAMES.startSession) {
    return server.invoke("start_session", {
      platform: cliOptions.platform,
      profile: cliOptions.runnerProfile ?? null,
      policyProfile: cliOptions.policyProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      sessionId,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
    } satisfies StartSessionInput);
  }
  if (tool === TOOL_NAMES.getScreenSummary) {
    return server.invoke("get_screen_summary", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      outputPath: cliOptions.outputPath,
      dryRun: cliOptions.dryRun,
    } satisfies GetScreenSummaryInput);
  }
  if (tool === TOOL_NAMES.getLogs) {
    return server.invoke("get_logs", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      outputPath: cliOptions.outputPath,
      lines: cliOptions.lines,
      sinceSeconds: cliOptions.sinceSeconds,
      query: cliOptions.queryText ?? cliOptions.text,
      dryRun: cliOptions.dryRun,
    } satisfies GetLogsInput);
  }
  if (tool === TOOL_NAMES.getCrashSignals) {
    return server.invoke("get_crash_signals", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      outputPath: cliOptions.outputPath,
      lines: cliOptions.lines,
      dryRun: cliOptions.dryRun,
    } satisfies GetCrashSignalsInput);
  }
  if (tool === TOOL_NAMES.collectDebugEvidence) {
    return server.invoke("collect_debug_evidence", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      metroBaseUrl: cliOptions.metroBaseUrl,
      outputPath: cliOptions.outputPath,
      logLines: cliOptions.lines,
      targetId: cliOptions.targetId,
      webSocketDebuggerUrl: cliOptions.webSocketDebuggerUrl,
      includeJsInspector: true,
      jsInspectorTimeoutMs: cliOptions.jsInspectorTimeoutMs,
      sinceSeconds: cliOptions.sinceSeconds,
      query: cliOptions.queryText ?? cliOptions.text,
      includeDiagnostics: cliOptions.includeDiagnostics,
      dryRun: cliOptions.dryRun,
    } satisfies CollectDebugEvidenceInput);
  }
  if (tool === TOOL_NAMES.launchApp) {
    return server.invoke("launch_app", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      appId: cliOptions.appId,
      launchUrl: cliOptions.launchUrl,
      dryRun: cliOptions.dryRun,
    } satisfies LaunchAppInput);
  }
  if (tool === TOOL_NAMES.queryUi) {
    return server.invoke("query_ui", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      ...selector,
      dryRun: cliOptions.dryRun,
    } satisfies QueryUiInput);
  }
  if (tool === TOOL_NAMES.tapElement) {
    return server.invoke("tap_element", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      ...selector,
      dryRun: cliOptions.dryRun,
    } satisfies TapElementInput);
  }
  if (tool === TOOL_NAMES.waitForUi) {
    return server.invoke("wait_for_ui", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      ...selector,
      timeoutMs: cliOptions.timeoutMs,
      intervalMs: cliOptions.intervalMs,
      waitUntil: cliOptions.waitUntil,
      dryRun: cliOptions.dryRun,
    } satisfies WaitForUiInput);
  }
  if (tool === TOOL_NAMES.takeScreenshot) {
    return server.invoke("take_screenshot", {
      sessionId,
      platform: cliOptions.platform,
      runnerProfile: cliOptions.runnerProfile,
      harnessConfigPath: cliOptions.harnessConfigPath,
      deviceId: cliOptions.deviceId,
      outputPath: cliOptions.outputPath,
      dryRun: cliOptions.dryRun,
    } satisfies ScreenshotInput);
  }
  if (tool === TOOL_NAMES.explainLastFailure) {
    return server.invoke("explain_last_failure", { sessionId } satisfies ExplainLastFailureInput);
  }
  if (tool === TOOL_NAMES.rankFailureCandidates) {
    return server.invoke("rank_failure_candidates", { sessionId } satisfies RankFailureCandidatesInput);
  }
  return server.invoke("suggest_known_remediation", { sessionId, actionId: cliOptions.actionId } satisfies SuggestKnownRemediationInput);
}

export async function executePreset(
  server: MobileE2EMcpServer,
  cliOptions: CliOptions,
  presetName: PresetName,
  resolvedContext?: ResolvedContextMeta,
): Promise<ToolResult<{ presetName: PresetName; overallStatus: ToolResult["status"]; steps: PresetStepResult[]; resolvedContext?: ResolvedContextMeta }>> {
  const preset = PRESETS[presetName];
  if (!preset) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: `preset-${Date.now()}`,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: { presetName, overallStatus: "failed", steps: [], resolvedContext },
      nextSuggestions: ["Unknown preset-name. Use one of quick_debug_ios, quick_e2e_android, crash_triage_android."],
    };
  }

  const includesStartSession = preset.steps.some((step) => step.tool === "start_session");
  if (includesStartSession && cliOptions.sessionId) {
    if (resolvedContext?.sessionId === "alias") {
      cliOptions.sessionId = undefined;
      resolvedContext.sessionId = "default";
    }
  }

  if (includesStartSession && cliOptions.sessionId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: cliOptions.sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: { presetName, overallStatus: "failed", steps: [], resolvedContext },
      nextSuggestions: [
        `Preset ${presetName} includes start_session and cannot reuse an explicit --session-id.`,
        "Remove --session-id for this preset, or run atomic tools directly on the existing session.",
      ],
    };
  }

  if (cliOptions.sessionId) {
    const repoRoot = resolveRepoPath();
    const sessionRecord = await loadSessionRecord(repoRoot, cliOptions.sessionId);
    if (sessionRecord && !sessionRecord.closed && sessionRecord.session.platform !== preset.platform) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId: cliOptions.sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: [],
        data: { presetName, overallStatus: "failed", steps: [], resolvedContext },
        nextSuggestions: [
          `Preset ${presetName} requires platform ${preset.platform}, but session '${cliOptions.sessionId}' is ${sessionRecord.session.platform}.`,
          "Use a matching session/platform pair or omit --session-id so preset can initialize context.",
        ],
      };
    }
  }

  if (!cliOptions.platformProvided && resolvedContext?.platform === "alias" && cliOptions.platform !== preset.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: cliOptions.sessionId ?? `preset-${Date.now()}`,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: { presetName, overallStatus: "failed", steps: [], resolvedContext },
      nextSuggestions: [
        `Preset ${presetName} expects platform ${preset.platform}, but context alias resolved platform ${cliOptions.platform}.`,
        `Pass --platform ${preset.platform} to override alias precedence, or use --no-context-alias for this run.`,
      ],
    };
  }

  if (!cliOptions.platformProvided && resolvedContext?.platform !== "alias") {
    cliOptions.platform = preset.platform;
    if (resolvedContext) {
      resolvedContext.platform = "preset";
    }
  } else if (cliOptions.platform !== preset.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: cliOptions.sessionId ?? `preset-${Date.now()}`,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: { presetName, overallStatus: "failed", steps: [], resolvedContext },
      nextSuggestions: [`Preset ${presetName} requires platform ${preset.platform}.`],
    };
  }

  const startTime = Date.now();
  let sessionId = cliOptions.sessionId ?? `${presetName}-${Date.now()}`;
  const steps: PresetStepResult[] = [];
  const artifacts: string[] = [];
  let overallStatus: ToolResult["status"] = "success";
  let firstFailureReasonCode: ToolResult["reasonCode"] = REASON_CODES.ok;
  const nextSuggestions: string[] = [];

  for (const step of preset.steps) {
    const result = await invokePresetStep(server, step.tool, cliOptions, sessionId);
    if (step.tool === "start_session" && result.status === "success") {
      const sessionData = result.data as { sessionId?: string; deviceId?: string; appId?: string; profile?: RunnerProfile | null };
      if (sessionData.sessionId) {
        sessionId = sessionData.sessionId;
        cliOptions.sessionId = sessionData.sessionId;
      }
      if (!cliOptions.deviceId && sessionData.deviceId) {
        cliOptions.deviceId = sessionData.deviceId;
      }
      if (!cliOptions.appId && sessionData.appId) {
        cliOptions.appId = sessionData.appId;
      }
      if (!cliOptions.runnerProfile && sessionData.profile) {
        cliOptions.runnerProfile = sessionData.profile;
      }
    }

    pushArtifacts(artifacts, result.artifacts);
    if (result.nextSuggestions.length > 0) {
      pushArtifacts(nextSuggestions, result.nextSuggestions);
    }
    steps.push({
      tool: step.tool,
      status: result.status,
      reasonCode: result.reasonCode,
      artifacts: result.artifacts,
      nextSuggestions: result.nextSuggestions,
    });

    if (result.status === "failed") {
      overallStatus = "failed";
      if (firstFailureReasonCode === REASON_CODES.ok) {
        firstFailureReasonCode = result.reasonCode;
      }
      if ((step.onFailure ?? (preset.stopOnFailure ? "stop" : "continue")) === "stop") {
        break;
      }
    } else if (result.status === "partial" && overallStatus === "success") {
      overallStatus = "partial";
      if (firstFailureReasonCode === REASON_CODES.ok) {
        firstFailureReasonCode = result.reasonCode;
      }
    }
  }

  return {
    status: overallStatus,
    reasonCode: firstFailureReasonCode,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts,
    data: {
      presetName,
      overallStatus,
      steps,
      resolvedContext,
    },
    nextSuggestions,
  };
}
