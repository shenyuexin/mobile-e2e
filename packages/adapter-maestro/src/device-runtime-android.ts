import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeviceRuntimePlatformHooks } from "./device-runtime-platform.js";
import { boundedRemoteFileReadBatch, parseAnrTraceMetadata } from "./diagnostics-pull.js";
import { countNonEmptyLines, executeRunner } from "./runtime-shared.js";

const DEFAULT_GET_LOGS_LINES = 200;
const MAX_ANR_FILES = 5;
const MAX_ANR_LINES = 20_000;

export interface AnrTraceResult {
  fileName: string;
  processName?: string;
  pid?: string;
  signal?: string;
  rawContent?: string;
  pullStatus: "success" | "timeout" | "too_large" | "not_found" | "permission_denied" | "read_failed" | "cat_failed_pull_fallback";
  pullMethod: "shell_cat" | "adb_pull";
}

async function pullAndParseAnrTraces(
  repoRoot: string,
  deviceId: string,
  fileNames: string[],
): Promise<AnrTraceResult[]> {
  const maxFiles = Math.min(fileNames.length, MAX_ANR_FILES);
  const remotePaths = fileNames.slice(0, maxFiles).map((f) => `/data/anr/${f}`);

  const readResults = await boundedRemoteFileReadBatch(repoRoot, {
    deviceId,
    remotePaths,
    maxFiles: maxFiles,
    maxLines: MAX_ANR_LINES,
    totalBudgetMs: 180_000,
    timeoutMs: 60_000,
  });

  return readResults.map((r) => {
    // Match by remotePath instead of index (results are size-sorted, not input-sorted)
    const remotePath = r.remotePath;
    const fileNameMatch = remotePath.match(/\/data\/anr\/(.+)$/);
    const fileName = fileNameMatch ? fileNameMatch[1] : remotePath;
    const meta = r.status === "success" ? parseAnrTraceMetadata(r.content) : {};
    return {
      fileName,
      processName: meta.processName,
      pid: meta.pid,
      signal: meta.signal,
      rawContent: r.content,
      pullStatus: r.status,
      pullMethod: r.readMethod,
    };
  });
}

function sanitizeArtifactSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "session";
}

async function resolveAndroidAppPid(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  const execution = await executeRunner(["adb", "-s", deviceId, "shell", "pidof", appId], repoRoot, process.env, { timeoutMs: 5000 });
  if (execution.exitCode !== 0) return undefined;
  const candidate = execution.stdout.trim().split(/\s+/)[0];
  return candidate && /^\d+$/.test(candidate) ? candidate : undefined;
}

export function createAndroidDeviceRuntimeHooks(): DeviceRuntimePlatformHooks {
  return {
    platform: "android",
    buildLaunchCommand: ({ runnerProfile, deviceId, appId, launchUrl }) => (
      runnerProfile === "phase1"
        ? ["adb", "-s", deviceId, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", launchUrl ?? "", appId]
        : ["adb", "-s", deviceId, "shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]
    ),
    buildInstallCommand: ({ deviceId, artifactPath }) => ["adb", "-s", deviceId, "install", "-r", artifactPath],
    buildResetPlan: ({ strategy, deviceId, appId, artifactPath }) => {
      if (strategy === "clear_data") {
        return {
          commandLabels: ["clear_data"],
          commands: [["adb", "-s", deviceId, "shell", "pm", "clear", appId]],
          supportLevel: "full" as const,
        };
      }
      if (strategy === "uninstall_reinstall") {
        return {
          commandLabels: ["uninstall", "install"],
          commands: [["adb", "-s", deviceId, "uninstall", appId], ["adb", "-s", deviceId, "install", "-r", artifactPath ?? ""]],
          supportLevel: "full" as const,
        };
      }
      return {
        commandLabels: [],
        commands: [],
        supportLevel: "partial" as const,
        unsupportedReason: "keychain_reset is only available for iOS simulators in this baseline implementation.",
      };
    },
    buildTerminateCommand: (deviceId, appId) => ["adb", "-s", deviceId, "shell", "am", "force-stop", appId],
    buildScreenshotCommand: (deviceId) => ["adb", "-s", deviceId, "exec-out", "screencap", "-p"],
    screenshotUsesStdoutCapture: true,
    screenshotSupportLevel: "full",
    screenshotDryRunSuggestion: "Run take_screenshot without dryRun to capture an actual screenshot.",
    screenshotFailureSuggestion: "Check device state before retrying take_screenshot.",
    buildRecordScreenPlan: ({ sessionId, deviceId, durationMs, bitrateMbps, absoluteOutputPath }) => {
      const durationSeconds = Math.max(1, Math.ceil(durationMs / 1000));
      const remoteOutputPath = `/sdcard/${sanitizeArtifactSegment(sessionId)}-${Date.now()}.mp4`;
      const recordCommand = [
        "adb", "-s", deviceId, "shell", "screenrecord",
        "--time-limit", String(Math.min(180, durationSeconds)),
        ...(bitrateMbps ? ["--bit-rate", String(Math.floor(bitrateMbps * 1_000_000))] : []),
        remoteOutputPath,
      ];
      const pullCommand = ["adb", "-s", deviceId, "pull", remoteOutputPath, absoluteOutputPath];
      const cleanupCommand = ["adb", "-s", deviceId, "shell", "rm", "-f", remoteOutputPath];
      return {
        commandLabels: ["record", "pull", "cleanup"],
        commands: [recordCommand, pullCommand, cleanupCommand],
        supportLevel: "full",
        dryRunSuggestion: "Run record_screen without dryRun to capture an actual Android screen recording artifact.",
        failureSuggestion: "Check Android device state and ensure adb shell screenrecord is available before retrying record_screen.",
      };
    },
    buildGetLogsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId, sinceSeconds, linesRequested, appId, appFilterApplied, minLogLevel }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "logs", sessionId, `android-${runnerProfile}.logcat.txt`);
      const levelFilter = minLogLevel ? `*:${minLogLevel}` : undefined;
      return {
        relativeOutputPath,
        absoluteOutputPath: path.resolve(repoRoot, relativeOutputPath),
        command: ["adb", "-s", deviceId, "logcat", "-d", "-t", String(linesRequested ?? DEFAULT_GET_LOGS_LINES), ...(levelFilter ? [levelFilter] : [])],
        supportLevel: "full",
        linesRequested,
        sinceSeconds,
        appId,
        appFilterApplied: Boolean(appFilterApplied),
        actualLevelFilterApplied: Boolean(levelFilter),
        platformLevelNote: undefined,
      };
    },
    applyGetLogsAppFilter: async ({ repoRoot, capture, deviceId, appId, dryRun }) => {
      if (dryRun) {
        return capture;
      }
      const pid = await resolveAndroidAppPid(repoRoot, deviceId, appId);
      if (!pid) {
        return capture;
      }
      return {
        ...capture,
        command: [
          "adb", "-s", deviceId, "logcat", "--pid", pid, "-d",
          "-t", String(capture.linesRequested ?? DEFAULT_GET_LOGS_LINES),
          ...(capture.actualLevelFilterApplied ? [capture.command[capture.command.length - 1]] : []),
        ],
        appFilterApplied: true,
      };
    },
    buildGetCrashSignalsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId, linesRequested }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "crash-signals", sessionId, `android-${runnerProfile}.crash.txt`);
      return {
        relativeOutputPath,
        absoluteOutputPath: path.resolve(repoRoot, relativeOutputPath),
        commands: [["adb", "-s", deviceId, "logcat", "-d", "-b", "crash", "-t", String(linesRequested)], ["adb", "-s", deviceId, "shell", "ls", "-1t", "/data/anr"]],
        supportLevel: "full",
        linesRequested,
      };
    },
    executeCrashSignalsCapture: async ({ repoRoot, capture, deviceId, appId }) => {
      const pid = appId ? await resolveAndroidAppPid(repoRoot, deviceId, appId) : undefined;
      const [baseCrashCommand, anrCommand] = capture.commands;
      const crashCommand = pid
        ? ["adb", "-s", deviceId, "logcat", "--pid", pid, "-d", "-b", "crash", "-t", String(capture.linesRequested)]
        : baseCrashCommand;
      const crashExecution = await executeRunner(crashCommand, repoRoot, process.env, { timeoutMs: 5000 });
      const anrExecution = await executeRunner(anrCommand, repoRoot, process.env, { timeoutMs: 5000 });
      const entries = anrExecution.exitCode === 0
        ? anrExecution.stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean)
        : [];

      // Pull actual ANR trace content (Phase 11-01)
      const anrTraces = entries.length > 0
        ? await pullAndParseAnrTraces(repoRoot, deviceId, entries)
        : [];

      const contentLines = [
        "# Android crash log buffer",
        crashExecution.stdout.trim(),
        "",
        "# Android ANR entries",
        entries.join(String.fromCharCode(10)),
      ];

      if (anrTraces.length > 0) {
        contentLines.push("", "# Android ANR trace content");
        for (const trace of anrTraces) {
          contentLines.push(`## ${trace.fileName}`, trace.rawContent ?? "<content not available>", "");
        }
      }

      const content = contentLines.join(String.fromCharCode(10)).trim() + String.fromCharCode(10);
      const exitCode = crashExecution.exitCode !== 0 ? crashExecution.exitCode : anrExecution.exitCode;
      if (exitCode === 0) {
        await writeFile(capture.absoluteOutputPath, content, "utf8");
      }
      return {
        exitCode,
        stderr: crashExecution.stderr || anrExecution.stderr,
        commands: [crashCommand, anrCommand],
        entries,
        signalCount: entries.length + countNonEmptyLines(crashExecution.stdout),
        content: exitCode === 0 ? content : undefined,
        platformExtensions: anrTraces.length > 0 ? { anrTraces } : undefined,
      };
    },
    buildCollectDiagnosticsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "diagnostics", sessionId, `android-${runnerProfile}.zip`);
      const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
      const commandOutputPath = absoluteOutputPath.endsWith(".zip") ? absoluteOutputPath.slice(0, -4) : absoluteOutputPath;
      return {
        relativeOutputPath,
        absoluteOutputPath,
        commandOutputPath,
        commands: [["adb", "-s", deviceId, "bugreport", commandOutputPath]],
        supportLevel: "full",
      };
    },
    collectDiagnosticsArtifacts: async ({ repoRoot, capture }) => [path.relative(repoRoot, capture.absoluteOutputPath).split(path.sep).join("/")],
  };
}
