import type {
  AndroidPerformancePreset,
  ExecutionEvidence,
  IosPerformanceTemplate,
  MeasureAndroidPerformanceData,
  MeasureAndroidPerformanceInput,
  MeasureIosPerformanceData,
  MeasureIosPerformanceInput,
  ReasonCode,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_ANDROID_DEVICE_ID,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_IOS_SIMULATOR_UDID,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import { resolveIosSimulatorAttachTarget } from "./device-runtime-ios.js";
import {
  buildIosExportInspectionManifest,
  buildAndroidPerformanceData,
  buildIosPerformanceData,
  buildPerformanceMarkdownReport,
  buildPerformanceNextSuggestions,
  parseTraceProcessorTsv,
  summarizeAndroidPerformance,
  summarizeIosPerformance,
} from "./performance-model.js";
import {
  buildAndroidPerformancePlan,
  buildIosPerformancePlan,
  buildTraceProcessorScript,
  buildTraceProcessorShellCommand,
  resolveTraceProcessorPath,
} from "./performance-runtime.js";
import { buildFailureReason, buildExecutionEvidence, executeRunner, shellEscape, type CommandExecution } from "./runtime-shared.js";

const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;

function buildPerformanceEvidence(artifactPaths: string[], supportLevel: "full" | "partial", planned = false): ExecutionEvidence[] {
  return artifactPaths.map((artifactPath) => {
    const lower = artifactPath.toLowerCase();
    if (lower.endsWith(".trace") || lower.endsWith(".perfetto-trace")) {
      return buildExecutionEvidence("performance_trace", artifactPath, supportLevel, planned ? "Planned performance trace artifact path." : "Captured performance trace artifact.");
    }
    if (lower.endsWith(".xml") || lower.endsWith(".txt") || lower.endsWith(".pbtx")) {
      return buildExecutionEvidence("performance_export", artifactPath, supportLevel, planned ? "Planned performance export or raw analysis artifact path." : "Captured performance export or raw analysis artifact.");
    }
    return buildExecutionEvidence("performance_summary", artifactPath, supportLevel, planned ? "Planned performance summary artifact path." : "Generated performance summary artifact.");
  });
}

async function runTraceProcessorScript(params: {
  repoRoot: string;
  traceProcessorPath: string;
  tracePath: string;
  sqlPath: string;
  statements: string[];
  timeoutMs?: number;
}): Promise<CommandExecution> {
  await writeFile(params.sqlPath, buildTraceProcessorScript(params.statements), "utf8");
  return runCommandSafely(
    buildTraceProcessorShellCommand(params.traceProcessorPath, params.tracePath, params.sqlPath),
    params.repoRoot,
    params.timeoutMs,
  );
}

async function runCommandSafely(command: string[], repoRoot: string, timeoutMs = DEFAULT_DEVICE_COMMAND_TIMEOUT_MS): Promise<CommandExecution> {
  try {
    return await executeRunner(command, repoRoot, process.env, { timeoutMs });
  } catch (error) {
    return {
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkCommandAvailable(repoRoot: string, command: string[], timeoutMs = DEFAULT_DEVICE_COMMAND_TIMEOUT_MS): Promise<CommandExecution> {
  return runCommandSafely(command, repoRoot, timeoutMs);
}

function buildIosPerformanceTranscript(params: {
  plan: {
    template: IosPerformanceTemplate;
    templateName: string;
    steps: Array<{ label: string; command: string[] }>;
  };
  deviceId: string;
  appId?: string;
  attachTarget?: string;
  tocXml?: string;
  exportXml?: string;
  executions?: Array<{ label: string; execution: CommandExecution }>;
}): string {
  const lines = [
    `template=${params.plan.template}`,
    `templateName=${params.plan.templateName}`,
    `deviceId=${params.deviceId}`,
    `appId=${params.appId ?? ""}`,
    `attachTarget=${params.attachTarget ?? ""}`,
  ];

  for (const step of params.plan.steps) {
    lines.push(`command.${step.label}=${step.command.map((part) => shellEscape(part)).join(" ")}`);
  }
  for (const item of params.executions ?? []) {
    lines.push(`exitCode.${item.label}=${String(item.execution.exitCode)}`);
    lines.push(`stdout.${item.label}=${JSON.stringify(item.execution.stdout.slice(0, 400))}`);
    lines.push(`stderr.${item.label}=${JSON.stringify(item.execution.stderr.slice(0, 400))}`);
  }

  if (params.tocXml || params.exportXml) {
    const inspection = buildIosExportInspectionManifest({ tocXml: params.tocXml, exportXml: params.exportXml });
    lines.push(`captureScope=${inspection.captureScope}`);
    lines.push(`targetProcess=${inspection.targetProcess ?? ""}`);
    lines.push(`schemaNames=${inspection.schemaNames.join(",")}`);
    lines.push(`rowCount=${String(inspection.rowCount)}`);
  }

  return `${lines.join(String.fromCharCode(10))}${String.fromCharCode(10)}`;
}

function reasonCodeForExecution(execution: CommandExecution): ReasonCode {
  if (execution.exitCode === null && execution.stderr.includes("Command timed out after")) {
    return REASON_CODES.timeout;
  }
  return buildFailureReason(`${execution.stderr}\n${execution.stdout}`, execution.exitCode);
}

async function resolveAndroidSdkLevel(repoRoot: string, deviceId: string): Promise<number | undefined> {
  const execution = await runCommandSafely(["adb", "-s", deviceId, "shell", "getprop", "ro.build.version.sdk"], repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS);
  if (execution.exitCode !== 0) {
    return undefined;
  }
  const parsed = Number.parseInt(execution.stdout.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isPerfettoShellProbeAvailable(execution: CommandExecution): boolean {
  const output = execution.stdout.trim();
  return execution.exitCode === 0 && output.length > 0 && output !== "missing";
}

function buildAndroidPerformancePresetSuggestion(preset: AndroidPerformancePreset): string {
  if (preset === "startup") {
    return "Inspect startup slices and launch-related frame work in the trace next.";
  }
  if (preset === "scroll") {
    return "Inspect frame timeline and UI thread slices around the scroll window next.";
  }
  if (preset === "interaction") {
    return "Inspect the heaviest UI and RenderThread slices in the sampled interaction next.";
  }
  return "Inspect the summary and raw trace together to narrow CPU vs jank vs memory next.";
}

function buildIosTemplateSuggestion(template: IosPerformanceTemplate): string {
  if (template === "animation-hitches") {
    return "Inspect the exported hitch-related tables next; this template is best for animation stalls.";
  }
  if (template === "memory") {
    return "Inspect the exported allocation tables next; this template is best for memory growth signals.";
  }
  return "Inspect the exported Time Profiler tables next; this template is best for CPU-heavy windows.";
}

export function buildIosAppScopeNote(appId?: string, attachTarget?: string): string {
  if (attachTarget && appId) {
    return `iOS MVP note: appId '${appId}' was attached by pid ${attachTarget} for this run, but other templates may still fall back to all-process capture.`;
  }
  return appId
    ? `iOS MVP note: appId '${appId}' could not be attached by pid and may fall back to all-process capture.`
    : "iOS MVP note: xctrace capture records all processes in the selected time window unless a narrower launch/attach flow is added later.";
}

export function shouldResolveIosAttachTarget(params: {
  dryRun?: boolean;
  template: IosPerformanceTemplate;
  appId?: string;
}): boolean {
  return !params.dryRun
    && Boolean(params.appId)
    && (params.template === "memory" || params.template === "time-profiler");
}

function buildIosRecordFailureSuggestions(appId: string | undefined, template: IosPerformanceTemplate, stderr: string, attachTarget?: string): string[] {
  const suggestions: string[] = [];
  const lowered = stderr.toLowerCase();
  if (lowered.includes("not supported on this platform")) {
    suggestions.push(`The ${template} template is not supported on this simulator/runtime combination; try a different simulator or keep using Time Profiler for MVP validation.`);
  } else if (lowered.includes("cannot handle a target type of 'all processes'")) {
    suggestions.push(`The ${template} template cannot record All Processes; keep the target app running so the tool can attach directly by pid.`);
  } else {
    suggestions.push("xctrace recording failed. Ensure the simulator/device is available and retry the sampled window.");
  }
  suggestions.push(buildIosAppScopeNote(appId, attachTarget));
  return suggestions;
}

export async function measureAndroidPerformanceWithRuntime(input: MeasureAndroidPerformanceInput): Promise<ToolResult<MeasureAndroidPerformanceData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, "android", runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? DEFAULT_ANDROID_DEVICE_ID;
  const appId = input.appId ?? selection.appId;
  const androidSdkLevel = input.dryRun ? undefined : await resolveAndroidSdkLevel(repoRoot, deviceId);
  const plan = buildAndroidPerformancePlan({ ...input, appId }, runnerProfile, deviceId, androidSdkLevel);
  const supportLevel: "full" = "full";

  await mkdir(path.resolve(repoRoot, plan.outputPath), { recursive: true });
  if (plan.artifacts.configPath) {
    await writeFile(path.resolve(repoRoot, plan.artifacts.configPath), plan.configContent, "utf8");
  }

  const plannedArtifactPaths = [
    plan.artifacts.configPath,
    plan.artifacts.tracePath,
    plan.artifacts.rawAnalysisPath,
    plan.artifacts.summaryPath,
    plan.artifacts.reportPath,
  ].filter((value): value is string => Boolean(value));
  const plannedEvidence = buildPerformanceEvidence(plannedArtifactPaths, supportLevel, true);

  if (input.dryRun) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: true,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: 0,
      supportLevel,
      artifactPaths: plannedArtifactPaths,
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plannedEvidence,
    });
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: [
        "Run measure_android_performance without dryRun to capture a live Perfetto trace.",
        "Install trace_processor on the host before running the Android performance MVP analysis path.",
        `Android SDK strategy preview: ${plan.androidSdkLevel === undefined ? "undetected" : `SDK ${String(plan.androidSdkLevel)}`}, config via ${plan.configTransport}, trace pull via ${plan.tracePullMode}.`,
      ],
    };
  }

  let traceProcessorPath: string | undefined;
  try {
    traceProcessorPath = resolveTraceProcessorPath();
  } catch (error) {
    traceProcessorPath = undefined;
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: null,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [error instanceof Error ? error.message : String(error)],
    };
  }
  if (!traceProcessorPath) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: null,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [
        "Install trace_processor on the host or set TRACE_PROCESSOR_PATH before retrying measure_android_performance.",
      ],
    };
  }
  const traceProcessorProbe = await checkCommandAvailable(repoRoot, [traceProcessorPath, "--help"]);
  if (traceProcessorProbe.exitCode !== 0) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: traceProcessorProbe.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [
        "Install trace_processor on the host and ensure it is on PATH before retrying measure_android_performance.",
      ],
    };
  }

  const perfettoProbe = await checkCommandAvailable(repoRoot, plan.steps[0].command);
  if (!isPerfettoShellProbeAvailable(perfettoProbe)) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: perfettoProbe.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: buildFailureReason(`${perfettoProbe.stderr}\n${perfettoProbe.stdout}`, perfettoProbe.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: [
        "Ensure the Android device is connected and that the device-side perfetto binary is available before retrying.",
      ],
    };
  }

  const pushExecution = plan.configTransport === "remote_file"
    ? await runCommandSafely(plan.steps[1].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS)
    : { exitCode: 0, stdout: "Config will be streamed over stdin.", stderr: "" };
  if (pushExecution.exitCode !== 0) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: pushExecution.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: buildFailureReason(pushExecution.stderr, pushExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: ["Failed to push the Perfetto config to the device. Check adb connectivity and retry."],
    };
  }

  const recordExecution = await runCommandSafely(plan.steps[2].command, repoRoot, plan.durationMs + 15000);
  if (recordExecution.exitCode !== 0) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: recordExecution.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.configPath ? buildPerformanceEvidence([plan.artifacts.configPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: reasonCodeForExecution(recordExecution),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.configPath ? [plan.artifacts.configPath] : [],
      data,
      nextSuggestions: ["Perfetto trace capture did not complete cleanly. Check device health and retry the sampled window."],
    };
  }

  const pullExecution = await runCommandSafely(plan.steps[3].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS);
  const traceArtifacts = [plan.artifacts.configPath, plan.artifacts.tracePath].filter((value): value is string => Boolean(value));
  if (pullExecution.exitCode !== 0 || !plan.artifacts.tracePath) {
    const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames: [] });
    const data = buildAndroidPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      preset: plan.preset,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: pullExecution.exitCode,
      supportLevel,
      artifactPaths: traceArtifacts,
      artifactsByKind: plan.artifacts,
      summary,
      evidence: buildPerformanceEvidence(traceArtifacts, supportLevel),
    });
    return {
      status: "partial",
      reasonCode: buildFailureReason(pullExecution.stderr, pullExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: traceArtifacts,
      data,
      nextSuggestions: ["Trace capture may have succeeded on-device, but the trace could not be pulled locally. Inspect adb pull permissions and retry."],
    };
  }

  const analysisCommandLabels = [...plan.steps.map((step) => step.label)];
  const analysisCommands = [...plan.steps.map((step) => step.command)];
  const tablesOutputPath = plan.traceProcessorScripts.tables;
  const tablesExecution = await runTraceProcessorScript({
    repoRoot,
    traceProcessorPath,
    tracePath: path.resolve(repoRoot, plan.artifacts.tracePath),
    sqlPath: path.resolve(repoRoot, tablesOutputPath),
    statements: ["SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"],
    timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
  });
  analysisCommandLabels.push("trace_processor_tables");
  analysisCommands.push(buildTraceProcessorShellCommand(traceProcessorPath, path.resolve(repoRoot, plan.artifacts.tracePath), path.resolve(repoRoot, tablesOutputPath)));
  const artifactPaths = [...traceArtifacts];
  let status: ToolResult<MeasureAndroidPerformanceData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  let tableNames: string[] = [];
  let cpuRows: string[][] | undefined;
  let hotspotRows: string[][] | undefined;
  let frameRows: string[][] | undefined;
  let memoryRows: string[][] | undefined;
  let cpuSource: "sched" | "thread_state" | undefined;
  let frameSource: "actual_frame_timeline_slice" | "slice_name_heuristic" | undefined;
  let memorySource: "process_counter_track" | "counter_track_heuristic" | undefined;
  const analysisSections: string[] = [];
  if (tablesExecution.exitCode === 0) {
    tableNames = parseTraceProcessorTsv(tablesExecution.stdout).map((row) => row[0] ?? "").filter(Boolean);
    analysisSections.push("# tables", tablesExecution.stdout.trim(), "");
    const queryRuns: Array<{ key: "cpu" | "hotspots" | "frame" | "memory"; statements: string[][] }> = [
      {
        key: "cpu",
        statements: [
          [`SELECT COALESCE(process.name, '<unknown>'), ROUND(SUM(CAST(sched.dur AS FLOAT)) / 1000000.0, 2) FROM sched JOIN thread USING (utid) LEFT JOIN process USING (upid) WHERE sched.dur > 0 GROUP BY COALESCE(process.name, '<unknown>') ORDER BY SUM(sched.dur) DESC LIMIT 5;`],
          [`SELECT COALESCE(process.name, '<unknown>'), ROUND(SUM(CAST(thread_state.dur AS FLOAT)) / 1000000.0, 2) FROM thread_state JOIN thread USING (utid) LEFT JOIN process USING (upid) WHERE thread_state.dur > 0 AND lower(thread_state.state) = 'running' GROUP BY COALESCE(process.name, '<unknown>') ORDER BY SUM(thread_state.dur) DESC LIMIT 5;`],
        ],
      },
      {
        key: "hotspots",
        statements: [
          [
            `SELECT COALESCE(process.name, '<unknown>'), slice.name, ROUND(SUM(CAST(slice.dur AS FLOAT)) / 1000000.0, 2), COUNT(*) FROM slice LEFT JOIN thread_track ON slice.track_id = thread_track.id LEFT JOIN thread USING (utid) LEFT JOIN process USING (upid) WHERE slice.dur > 0 AND slice.name IS NOT NULL GROUP BY COALESCE(process.name, '<unknown>'), slice.name ORDER BY CASE WHEN ${appId ? `(process.name = ${JSON.stringify(appId)} OR process.name LIKE ${JSON.stringify(`${appId}:%`)})` : "0"} THEN 0 ELSE 1 END, SUM(slice.dur) DESC LIMIT 8;`,
          ],
          ["SELECT '<unknown>', name, ROUND(SUM(CAST(dur AS FLOAT)) / 1000000.0, 2), COUNT(*) FROM slice WHERE dur > 0 AND name IS NOT NULL GROUP BY name ORDER BY SUM(dur) DESC LIMIT 8;"],
        ],
      },
      {
        key: "frame",
        statements: [
          ["SELECT SUM(CASE WHEN dur > 16666666 THEN 1 ELSE 0 END), SUM(CASE WHEN dur > 700000000 THEN 1 ELSE 0 END), ROUND(AVG(CAST(dur AS FLOAT)) / 1000000.0, 2), ROUND(MAX(CAST(dur AS FLOAT)) / 1000000.0, 2) FROM actual_frame_timeline_slice;"],
          ["SELECT SUM(CASE WHEN dur > 16666666 THEN 1 ELSE 0 END), SUM(CASE WHEN dur > 700000000 THEN 1 ELSE 0 END), ROUND(AVG(CAST(dur AS FLOAT)) / 1000000.0, 2), ROUND(MAX(CAST(dur AS FLOAT)) / 1000000.0, 2) FROM slice WHERE dur > 0 AND name IS NOT NULL AND (lower(name) LIKE '%frame%' OR lower(name) LIKE '%choreographer%' OR lower(name) LIKE '%vsync%' OR lower(name) LIKE '%drawframe%');"],
        ],
      },
      {
        key: "memory",
        statements: [
          [`SELECT ROUND(MIN(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)) - MIN(CAST(counter.value AS FLOAT)), 2) FROM counter JOIN process_counter_track ON counter.track_id = process_counter_track.id LEFT JOIN process ON process_counter_track.upid = process.upid WHERE lower(process_counter_track.name) LIKE '%rss%'${appId ? ` AND (process.name = ${JSON.stringify(appId)} OR process.name LIKE ${JSON.stringify(`${appId}:%`)})` : ""};`],
          ["SELECT ROUND(MIN(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)), 2), ROUND(MAX(CAST(counter.value AS FLOAT)) - MIN(CAST(counter.value AS FLOAT)), 2) FROM counter JOIN counter_track ON counter.track_id = counter_track.id WHERE lower(counter_track.name) LIKE '%rss%' OR lower(counter_track.name) LIKE '%mem%' OR lower(counter_track.name) LIKE '%heap%';"],
        ],
      },
    ];
    for (const queryRun of queryRuns) {
      const sqlPath = path.resolve(repoRoot, plan.traceProcessorScripts[queryRun.key]);
      let execution: CommandExecution | undefined;
      let resolvedStatements: string[] | undefined;
      for (const statements of queryRun.statements) {
        const attempt = await runTraceProcessorScript({
          repoRoot,
          traceProcessorPath,
          tracePath: path.resolve(repoRoot, plan.artifacts.tracePath),
          sqlPath,
          statements,
          timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
        });
        if (attempt.exitCode === 0) {
          execution = attempt;
          resolvedStatements = statements;
          break;
        }
        execution = attempt;
      }
      analysisCommandLabels.push(`trace_processor_${queryRun.key}`);
      analysisCommands.push(buildTraceProcessorShellCommand(traceProcessorPath, path.resolve(repoRoot, plan.artifacts.tracePath), sqlPath));
      if (!execution || execution.exitCode !== 0) {
        analysisSections.push(`# ${queryRun.key}`, execution?.stderr.trim() ?? "", "");
        continue;
      }
      const parsed = parseTraceProcessorTsv(execution.stdout);
      analysisSections.push(`# ${queryRun.key}`, ...(resolvedStatements ?? []), execution.stdout.trim(), "");
      if (queryRun.key === "cpu") {
        cpuRows = parsed;
        cpuSource = resolvedStatements?.[0]?.includes("thread_state") ? "thread_state" : "sched";
      }
      if (queryRun.key === "hotspots") hotspotRows = parsed;
      if (queryRun.key === "frame") {
        frameRows = parsed;
        frameSource = resolvedStatements?.[0]?.includes("actual_frame_timeline_slice") ? "actual_frame_timeline_slice" : "slice_name_heuristic";
      }
      if (queryRun.key === "memory") {
        memoryRows = parsed;
        memorySource = resolvedStatements?.[0]?.includes("process_counter_track") ? "process_counter_track" : "counter_track_heuristic";
      }
    }
  } else {
    status = "partial";
    reasonCode = REASON_CODES.adapterError;
    analysisSections.push("# tables", tablesExecution.stderr.trim(), "");
  }

  if (plan.artifacts.rawAnalysisPath) {
    await writeFile(path.resolve(repoRoot, plan.artifacts.rawAnalysisPath), analysisSections.join(String.fromCharCode(10)), "utf8");
    artifactPaths.push(plan.artifacts.rawAnalysisPath);
  }
  const summary = summarizeAndroidPerformance({ durationMs: plan.durationMs, appId, tableNames, cpuRows, hotspotRows, frameRows, memoryRows, cpuSource, frameSource, memorySource });
  const data = buildAndroidPerformanceData({
    dryRun: false,
    runnerProfile,
    outputPath: plan.outputPath,
    durationMs: plan.durationMs,
    captureMode: "time_window",
    preset: plan.preset,
    appId,
    commandLabels: analysisCommandLabels,
    commands: analysisCommands,
    exitCode: status === "success" ? 0 : 1,
    supportLevel,
    artifactPaths: [...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath],
    artifactsByKind: plan.artifacts,
    summary,
    evidence: buildPerformanceEvidence([...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath], supportLevel),
  });
  await writeFile(path.resolve(repoRoot, plan.artifacts.summaryPath), JSON.stringify(data.summary, null, 2) + String.fromCharCode(10), "utf8");
  await writeFile(path.resolve(repoRoot, plan.artifacts.reportPath), buildPerformanceMarkdownReport({
    title: `Android Performance Summary (${runnerProfile})`,
    supportLevel,
    summary: data.summary,
    suspectAreas: data.suspectAreas,
    diagnosisBriefing: data.diagnosisBriefing,
    artifactPaths: data.artifactPaths,
  }), "utf8");
  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: data.artifactPaths,
    data,
    nextSuggestions: [...buildPerformanceNextSuggestions(data.summary, plan.artifacts), buildAndroidPerformancePresetSuggestion(plan.preset)],
  };
}

export async function measureIosPerformanceWithRuntime(input: MeasureIosPerformanceInput): Promise<ToolResult<MeasureIosPerformanceData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, "ios", runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? DEFAULT_IOS_SIMULATOR_UDID;
  const appId = input.appId ?? selection.appId;
  const requestedTemplate = input.template ?? "time-profiler";
  const attachTarget = shouldResolveIosAttachTarget({
    dryRun: input.dryRun,
    template: requestedTemplate,
    appId,
  })
    ? await resolveIosSimulatorAttachTarget(repoRoot, deviceId, appId)
    : undefined;
  const plan = buildIosPerformancePlan({ ...input, appId }, runnerProfile, deviceId, attachTarget);
  const supportLevel: "partial" = "partial";

  await mkdir(path.resolve(repoRoot, plan.outputPath), { recursive: true });
  const plannedArtifactPaths = [plan.artifacts.traceBundlePath, plan.artifacts.tocPath, plan.artifacts.exportPath, plan.artifacts.rawAnalysisPath, plan.artifacts.summaryPath, plan.artifacts.reportPath].filter((value): value is string => Boolean(value));

  if (input.dryRun) {
    if (plan.artifacts.rawAnalysisPath) {
      await writeFile(path.resolve(repoRoot, plan.artifacts.rawAnalysisPath), buildIosPerformanceTranscript({
        plan,
        deviceId,
        appId,
        attachTarget,
      }), "utf8");
    }
    const summary = summarizeIosPerformance({ durationMs: plan.durationMs, template: plan.template });
    const data = buildIosPerformanceData({
      dryRun: true,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      template: plan.template,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: 0,
      supportLevel,
      artifactPaths: plannedArtifactPaths,
      artifactsByKind: plan.artifacts,
      summary,
      evidence: buildPerformanceEvidence(plannedArtifactPaths, supportLevel),
    });
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.rawAnalysisPath ? [plan.artifacts.rawAnalysisPath] : [],
      data,
      nextSuggestions: [
        "Run measure_ios_performance without dryRun to capture an xctrace bundle.",
        buildIosAppScopeNote(appId, attachTarget),
        buildIosTemplateSuggestion(plan.template),
      ],
    };
  }

  const recordExecution = await runCommandSafely(plan.steps[0].command, repoRoot, plan.durationMs + 30000);
  if (recordExecution.exitCode !== 0) {
    if (plan.artifacts.rawAnalysisPath) {
      await writeFile(path.resolve(repoRoot, plan.artifacts.rawAnalysisPath), buildIosPerformanceTranscript({
        plan,
        deviceId,
        appId,
        attachTarget,
        executions: [{ label: plan.steps[0]?.label ?? "record", execution: recordExecution }],
      }), "utf8");
    }
    const summary = summarizeIosPerformance({ durationMs: plan.durationMs, template: plan.template });
    const data = buildIosPerformanceData({
      dryRun: false,
      runnerProfile,
      outputPath: plan.outputPath,
      durationMs: plan.durationMs,
      captureMode: "time_window",
      template: plan.template,
      appId,
      commandLabels: plan.steps.map((step) => step.label),
      commands: plan.steps.map((step) => step.command),
      exitCode: recordExecution.exitCode,
      supportLevel,
      artifactPaths: plan.artifacts.rawAnalysisPath ? [plan.artifacts.rawAnalysisPath] : [],
      artifactsByKind: plan.artifacts,
      summary,
      evidence: plan.artifacts.rawAnalysisPath ? buildPerformanceEvidence([plan.artifacts.rawAnalysisPath], supportLevel) : undefined,
    });
    return {
      status: "failed",
      reasonCode: reasonCodeForExecution(recordExecution),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: plan.artifacts.rawAnalysisPath ? [plan.artifacts.rawAnalysisPath] : [],
      data,
      nextSuggestions: buildIosRecordFailureSuggestions(appId, plan.template, `${recordExecution.stderr}\n${recordExecution.stdout}`, attachTarget),
    };
  }

  let status: ToolResult<MeasureIosPerformanceData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  const artifactPaths = [plan.artifacts.traceBundlePath].filter((value): value is string => Boolean(value));
  const tocExecution = await runCommandSafely(plan.steps[1].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS + plan.durationMs);
  let tocXml = "";
  if (tocExecution.exitCode === 0 && plan.artifacts.tocPath) {
    tocXml = await readFile(path.resolve(repoRoot, plan.artifacts.tocPath), "utf8").catch(() => "");
    artifactPaths.push(plan.artifacts.tocPath);
  } else {
    status = "partial";
    reasonCode = reasonCodeForExecution(tocExecution);
  }

  const exportExecution = await runCommandSafely(plan.steps[2].command, repoRoot, DEFAULT_DEVICE_COMMAND_TIMEOUT_MS + plan.durationMs);
  let exportXml = "";
  if (exportExecution.exitCode === 0 && plan.artifacts.exportPath) {
    exportXml = await readFile(path.resolve(repoRoot, plan.artifacts.exportPath), "utf8").catch(() => "");
    artifactPaths.push(plan.artifacts.exportPath);
  } else {
    status = "partial";
    reasonCode = reasonCodeForExecution(exportExecution);
  }

  if (plan.artifacts.rawAnalysisPath) {
    await writeFile(path.resolve(repoRoot, plan.artifacts.rawAnalysisPath), buildIosPerformanceTranscript({
      plan,
      deviceId,
      appId,
      attachTarget,
      tocXml,
      exportXml,
      executions: [
        { label: plan.steps[0]?.label ?? "record", execution: recordExecution },
        { label: plan.steps[1]?.label ?? "toc", execution: tocExecution },
        { label: plan.steps[2]?.label ?? "export", execution: exportExecution },
      ],
    }), "utf8");
    artifactPaths.push(plan.artifacts.rawAnalysisPath);
  }

  const summary = summarizeIosPerformance({ durationMs: plan.durationMs, template: plan.template, tocXml, exportXml });
  const data = buildIosPerformanceData({
    dryRun: false,
    runnerProfile,
    outputPath: plan.outputPath,
    durationMs: plan.durationMs,
    captureMode: "time_window",
    template: plan.template,
    appId,
    commandLabels: plan.steps.map((step) => step.label),
    commands: plan.steps.map((step) => step.command),
    exitCode: status === "success" ? 0 : 1,
    supportLevel,
    artifactPaths: [...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath],
    artifactsByKind: plan.artifacts,
    summary,
    evidence: buildPerformanceEvidence([...artifactPaths, plan.artifacts.summaryPath, plan.artifacts.reportPath], supportLevel),
  });
  await writeFile(path.resolve(repoRoot, plan.artifacts.summaryPath), JSON.stringify(data.summary, null, 2) + String.fromCharCode(10), "utf8");
  await writeFile(path.resolve(repoRoot, plan.artifacts.reportPath), buildPerformanceMarkdownReport({
    title: `iOS Performance Summary (${runnerProfile})`,
    supportLevel,
    summary: data.summary,
    suspectAreas: data.suspectAreas,
    diagnosisBriefing: data.diagnosisBriefing,
    artifactPaths: data.artifactPaths,
  }), "utf8");
  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: data.artifactPaths,
    data,
    nextSuggestions: [...buildPerformanceNextSuggestions(data.summary, plan.artifacts), buildIosAppScopeNote(appId, attachTarget), buildIosTemplateSuggestion(plan.template)],
  };
}
