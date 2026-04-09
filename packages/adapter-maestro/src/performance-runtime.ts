import { CLI_COMMANDS } from "./constants/cli-commands.js";
import type {
  AndroidPerformancePreset,
  IosPerformanceTemplate,
  MeasureAndroidPerformanceInput,
  MeasureIosPerformanceInput,
  PerformanceArtifactBundle,
  RunnerProfile,
} from "@mobile-e2e-mcp/contracts";
import path from "node:path";
import { normalizePositiveInteger, shellEscape } from "./runtime-shared.js";
import { resolveTraceProcessorPath } from "./toolchain-runtime.js";

export { resolveTraceProcessorPath };

export interface PerformanceCommandStep {
  label: string;
  command: string[];
}

export interface AndroidPerformanceCapturePlan {
  durationMs: number;
  runnerProfile: RunnerProfile;
  preset: AndroidPerformancePreset;
  appId?: string;
  outputPath: string;
  artifacts: PerformanceArtifactBundle;
  androidSdkLevel?: number;
  configTransport: "remote_file" | "stdin";
  tracePullMode: "adb_pull" | "exec_out_cat";
  configContent: string;
  traceProcessorScripts: Record<"tables" | "cpu" | "hotspots" | "frame" | "memory", string>;
  remoteConfigPath: string;
  remoteTracePath: string;
  steps: PerformanceCommandStep[];
}

export interface IosPerformanceCapturePlan {
  durationMs: number;
  runnerProfile: RunnerProfile;
  template: IosPerformanceTemplate;
  appId?: string;
  attachTarget?: string;
  outputPath: string;
  artifacts: PerformanceArtifactBundle;
  templateName: string;
  exportXPath: string;
  steps: PerformanceCommandStep[];
}

export const DEFAULT_PERFORMANCE_DURATION_MS = 15000;
export const ANDROID_PERFETTO_CONFIG_DIR = "/data/misc/perfetto-configs";
export const ANDROID_PERFETTO_TRACE_DIR = "/data/misc/perfetto-traces";

function buildPerformanceOutputRoot(sessionId: string, explicitOutputPath: string | undefined): string {
  return explicitOutputPath ?? path.posix.join("artifacts", "performance", sessionId);
}

function buildAndroidArtifacts(outputRoot: string, runnerProfile: RunnerProfile, preset: AndroidPerformancePreset): PerformanceArtifactBundle {
  const prefix = `android-${runnerProfile}`;
  return {
    configPath: path.posix.join(outputRoot, `${prefix}.${preset}.pbtx`),
    tracePath: path.posix.join(outputRoot, `${prefix}.perfetto-trace`),
    rawAnalysisPath: path.posix.join(outputRoot, `${prefix}.analysis.txt`),
    summaryPath: path.posix.join(outputRoot, `${prefix}.summary.json`),
    reportPath: path.posix.join(outputRoot, `${prefix}.md`),
  };
}

function buildIosArtifacts(outputRoot: string, runnerProfile: RunnerProfile, template: IosPerformanceTemplate): PerformanceArtifactBundle {
  const prefix = `ios-${runnerProfile}`;
  return {
    traceBundlePath: path.posix.join(outputRoot, `${prefix}.${template}.trace`),
    tocPath: path.posix.join(outputRoot, `${prefix}.${template}.toc.xml`),
    exportPath: path.posix.join(outputRoot, `${prefix}.${template}.export.xml`),
    rawAnalysisPath: path.posix.join(outputRoot, `${prefix}.${template}.analysis.txt`),
    summaryPath: path.posix.join(outputRoot, `${prefix}.${template}.summary.json`),
    reportPath: path.posix.join(outputRoot, `${prefix}.${template}.md`),
  };
}

function templateNameForIos(template: IosPerformanceTemplate): string {
  if (template === "animation-hitches") {
    return "Animation Hitches";
  }
  if (template === "memory") {
    return "Allocations";
  }
  return "Time Profiler";
}

function buildAndroidAtraceCategories(preset: AndroidPerformancePreset): string[] {
  if (preset === "startup") {
    return ["am", "wm", "gfx", "view", "binder_driver"];
  }
  if (preset === "scroll") {
    return ["gfx", "view", "input", "binder_driver"];
  }
  if (preset === "interaction") {
    return ["gfx", "view", "input", "am", "wm", "binder_driver"];
  }
  return ["am", "wm", "gfx", "view", "input", "binder_driver", "freq", "idle"];
}

export function buildAndroidPerfettoConfig(durationMs: number, preset: AndroidPerformancePreset, appId?: string): string {
  const categories = buildAndroidAtraceCategories(preset);
  const categoryLines = categories.map((category) => `        atrace_categories: ${JSON.stringify(category)}`).join("\n");
  const appLine = appId ? `\n        atrace_apps: ${JSON.stringify(appId)}` : "";
  return [
    "buffers {",
    "  size_kb: 32768",
    "  fill_policy: RING_BUFFER",
    "}",
    "data_sources {",
    "  config {",
    '    name: "linux.ftrace"',
    "    target_buffer: 0",
    "    ftrace_config {",
    '      ftrace_events: "sched/sched_switch"',
    '      ftrace_events: "sched/sched_wakeup"',
    '      ftrace_events: "sched/sched_wakeup_new"',
    '      ftrace_events: "power/cpu_frequency"',
    '      ftrace_events: "power/cpu_idle"',
    categoryLines + appLine,
    "    }",
    "  }",
    "}",
    "data_sources {",
    "  config {",
    '    name: "linux.process_stats"',
    "    target_buffer: 0",
    "    process_stats_config {",
    "      proc_stats_poll_ms: 1000",
    "      scan_all_processes_on_start: true",
    "    }",
    "  }",
    "}",
    "data_sources {",
    "  config {",
    '    name: "android.surfaceflinger.frametimeline"',
    "    target_buffer: 0",
    "  }",
    "}",
    `duration_ms: ${String(durationMs)}`,
    "write_into_file: true",
    "file_write_period_ms: 2500",
    "flush_period_ms: 2500",
    "incremental_state_config {",
    "  clear_period_ms: 5000",
    "}",
  ].join("\n");
}

export function resolveAndroidPerformancePlanStrategy(androidSdkLevel: number | undefined): { configTransport: "remote_file" | "stdin"; tracePullMode: "adb_pull" | "exec_out_cat" } {
  if (androidSdkLevel !== undefined && androidSdkLevel < 29) {
    return { configTransport: "stdin", tracePullMode: "exec_out_cat" };
  }
  if (androidSdkLevel !== undefined && androidSdkLevel < 31) {
    return { configTransport: "stdin", tracePullMode: "adb_pull" };
  }
  return { configTransport: "remote_file", tracePullMode: "adb_pull" };
}

export function buildAndroidPerfettoRecordViaStdinCommand(deviceId: string, configPath: string, remoteTracePath: string): string[] {
  return [
    "sh",
    "-lc",
    `${shellEscape("adb")} -s ${shellEscape(deviceId)} shell perfetto --txt -c - -o ${shellEscape(remoteTracePath)} < ${shellEscape(configPath)}`,
  ];
}

export function buildAndroidExecOutPullCommand(deviceId: string, remoteTracePath: string, localTracePath: string): string[] {
  return [
    "sh",
    "-lc",
    `${shellEscape("adb")} -s ${shellEscape(deviceId)} exec-out cat ${shellEscape(remoteTracePath)} > ${shellEscape(localTracePath)}`,
  ];
}

export function buildAndroidPerformancePlan(input: MeasureAndroidPerformanceInput, runnerProfile: RunnerProfile, deviceId: string, androidSdkLevel?: number): AndroidPerformanceCapturePlan {
  const durationMs = normalizePositiveInteger(input.durationMs, DEFAULT_PERFORMANCE_DURATION_MS);
  const preset = input.preset ?? "general";
  const outputRoot = buildPerformanceOutputRoot(input.sessionId, input.outputPath);
  const artifacts = buildAndroidArtifacts(outputRoot, runnerProfile, preset);
  const strategy = resolveAndroidPerformancePlanStrategy(androidSdkLevel);
  const remoteConfigPath = `${ANDROID_PERFETTO_CONFIG_DIR}/${input.sessionId}-${preset}.pbtx`;
  const remoteTracePath = `${ANDROID_PERFETTO_TRACE_DIR}/${input.sessionId}-${runnerProfile}.perfetto-trace`;
  const configContent = buildAndroidPerfettoConfig(durationMs, preset, input.appId);
  const recordTraceCommand = strategy.configTransport === "remote_file"
    ? [CLI_COMMANDS.adb, "-s", deviceId, "shell", "perfetto", "--txt", "-c", remoteConfigPath, "-o", remoteTracePath]
    : buildAndroidPerfettoRecordViaStdinCommand(deviceId, artifacts.configPath ?? outputRoot, remoteTracePath);
  const pullTraceCommand = strategy.tracePullMode === "adb_pull"
    ? [CLI_COMMANDS.adb, "-s", deviceId, "pull", remoteTracePath, artifacts.tracePath ?? outputRoot]
    : buildAndroidExecOutPullCommand(deviceId, remoteTracePath, artifacts.tracePath ?? outputRoot);
  return {
    durationMs,
    runnerProfile,
    preset,
    appId: input.appId,
    outputPath: outputRoot,
    artifacts,
    androidSdkLevel,
    configTransport: strategy.configTransport,
    tracePullMode: strategy.tracePullMode,
    configContent,
    traceProcessorScripts: {
      tables: path.posix.join(outputRoot, `${artifacts.rawAnalysisPath ? path.posix.basename(artifacts.rawAnalysisPath) : "android.analysis"}.tables.sql`),
      cpu: path.posix.join(outputRoot, `${artifacts.rawAnalysisPath ? path.posix.basename(artifacts.rawAnalysisPath) : "android.analysis"}.cpu.sql`),
      hotspots: path.posix.join(outputRoot, `${artifacts.rawAnalysisPath ? path.posix.basename(artifacts.rawAnalysisPath) : "android.analysis"}.hotspots.sql`),
      frame: path.posix.join(outputRoot, `${artifacts.rawAnalysisPath ? path.posix.basename(artifacts.rawAnalysisPath) : "android.analysis"}.frame.sql`),
      memory: path.posix.join(outputRoot, `${artifacts.rawAnalysisPath ? path.posix.basename(artifacts.rawAnalysisPath) : "android.analysis"}.memory.sql`),
    },
    remoteConfigPath,
    remoteTracePath,
    steps: [
      {
        label: "check_perfetto",
        command: [CLI_COMMANDS.adb, "-s", deviceId, "shell", "perfetto", "--version"],
      },
      {
        label: "push_config",
        command: [CLI_COMMANDS.adb, "-s", deviceId, "push", artifacts.configPath ?? outputRoot, remoteConfigPath],
      },
      {
        label: "record_trace",
        command: recordTraceCommand,
      },
      {
        label: "pull_trace",
        command: pullTraceCommand,
      },
    ],
  };
}

export function buildIosPerformancePlan(input: MeasureIosPerformanceInput, runnerProfile: RunnerProfile, deviceId: string, attachTarget?: string): IosPerformanceCapturePlan {
  const durationMs = normalizePositiveInteger(input.durationMs, DEFAULT_PERFORMANCE_DURATION_MS);
  const template = input.template ?? "time-profiler";
  const outputRoot = buildPerformanceOutputRoot(input.sessionId, input.outputPath);
  const artifacts = buildIosArtifacts(outputRoot, runnerProfile, template);
  const templateName = templateNameForIos(template);
  const exportXPath = "/trace-toc/run[@number='1']/data/table";
  const recordTargetArgs = attachTarget ? ["--attach", attachTarget] : ["--all-processes"];
  return {
    durationMs,
    runnerProfile,
    template,
    appId: input.appId,
    attachTarget,
    outputPath: outputRoot,
    artifacts,
    templateName,
    exportXPath,
    steps: [
      {
        label: "record_trace",
        command: [
          "xcrun",
          "xctrace",
          "record",
          "--template",
          templateName,
          "--device",
          deviceId,
          ...recordTargetArgs,
          "--time-limit",
          `${String(durationMs)}ms`,
          "--output",
          artifacts.traceBundlePath ?? outputRoot,
          "--no-prompt",
        ],
      },
      {
        label: "export_toc",
        command: [CLI_COMMANDS.xcrun, "xctrace", "export", "--input", artifacts.traceBundlePath ?? outputRoot, "--toc", "--output", artifacts.tocPath ?? outputRoot],
      },
      {
        label: "export_data",
        command: [CLI_COMMANDS.xcrun, "xctrace", "export", "--input", artifacts.traceBundlePath ?? outputRoot, "--xpath", exportXPath, "--output", artifacts.exportPath ?? outputRoot],
      },
    ],
  };
}

export function buildTraceProcessorScript(statements: string[]): string {
  return `${[".mode tabs", ".headers off", ...statements].join("\n")}\n`;
}

export function buildTraceProcessorShellCommand(traceProcessorPath: string, tracePath: string, scriptPath: string): string[] {
  return [
    "sh",
    "-lc",
    `${shellEscape(traceProcessorPath)} ${shellEscape(tracePath)} < ${shellEscape(scriptPath)}`,
  ];
}
