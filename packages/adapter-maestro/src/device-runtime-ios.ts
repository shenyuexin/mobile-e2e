import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isIosPhysicalDeviceId } from "./device-runtime.js";
import type { CrashSignalExecutionResult, DeviceRuntimePlatformHooks } from "./device-runtime-platform.js";
import { probeIdbAvailability } from "./ui-runtime.js";
import { executeRunner, shellEscape, type CommandExecution } from "./runtime-shared.js";

const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;

function buildIosLogPredicateForApp(appId: string): string {
  const escaped = appId.replaceAll("'", "\\'");
  return `eventMessage CONTAINS[c] '${escaped}' OR processImagePath CONTAINS[c] '${escaped}' OR senderImagePath CONTAINS[c] '${escaped}'`;
}

/**
 * Map Android log levels to iOS messageType predicates.
 * iOS has no exact V/D/I/W/E/F equivalent — this is a lossy mapping.
 * Returns { levelPredicate, actualApplied, levelNote }.
 */
export function buildIosLogLevelPredicate(minLogLevel: "V" | "D" | "I" | "W" | "E" | "F" | undefined): {
  levelPredicate: string | undefined;
  actualApplied: boolean;
  levelNote: string | undefined;
} {
  if (!minLogLevel) return { levelPredicate: undefined, actualApplied: false, levelNote: undefined };
  switch (minLogLevel) {
    case "F":
      return { levelPredicate: `messageType == 'fault'`, actualApplied: true, levelNote: undefined };
    case "E":
      return { levelPredicate: `messageType == 'error'`, actualApplied: true, levelNote: undefined };
    case "W":
      return { levelPredicate: `messageType == 'error' OR messageType == 'default'`, actualApplied: true, levelNote: undefined };
    case "I":
    case "D":
    case "V":
      return { levelPredicate: undefined, actualApplied: false, levelNote: `iOS does not support ${minLogLevel}-only filtering; returning all levels.` };
    default:
      return { levelPredicate: undefined, actualApplied: false, levelNote: undefined };
  }
}

async function listRelativeFileEntries(rootPath: string, prefix = ""): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const output: Array<{ relativePath: string; absolutePath: string }> = [];
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      output.push(...(await listRelativeFileEntries(entryPath, relativePath)));
    } else {
      output.push({ relativePath, absolutePath: entryPath });
    }
  }
  return output;
}

async function listArtifacts(rootPath: string, repoRoot: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listArtifacts(entryPath, repoRoot)));
    } else {
      files.push(path.relative(repoRoot, entryPath).split(path.sep).join("/"));
    }
  }
  return files;
}

async function runIdbPreflight(repoRoot: string): Promise<void> {
  await probeIdbAvailability(repoRoot).catch(() => undefined);
}

export function extractIosPhysicalAppName(devicectlAppsOutput: string, appId: string): string | undefined {
  const lines = devicectlAppsOutput.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("Apps installed:") || line.startsWith("Name") || line.startsWith("---")) {
      continue;
    }
    if (!line.includes(appId)) {
      continue;
    }
    const name = line.split(/\t+| {2,}/)[0]?.trim();
    return name || undefined;
  }
  return undefined;
}

export function extractIosPhysicalProcessId(devicectlProcessesOutput: string, appName: string): string | undefined {
  const escapedAppName = appName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(\\d+)\\s+.*?/${escapedAppName}\\.app/${escapedAppName}\\s*$`, "i");
  const lines = devicectlProcessesOutput.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
  for (const rawLine of lines) {
    const match = rawLine.trim().match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

export function extractIosSimulatorProcessId(launchctlOutput: string, appId: string): string | undefined {
  const lines = launchctlOutput.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
  const match = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.includes(appId));
  if (!match) {
    return undefined;
  }
  const pid = match.split(String.fromCharCode(9))[0]?.trim();
  return pid && /^\d+$/.test(pid) ? pid : undefined;
}

async function queryIosSimulatorProcessId(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  let execution: CommandExecution;
  try {
    execution = await executeRunner([
      "xcrun",
      "simctl",
      "spawn",
      deviceId,
      "launchctl",
      "list",
    ], repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
  } catch {
    return undefined;
  }
  if (execution.exitCode !== 0) {
    return undefined;
  }
  return extractIosSimulatorProcessId(execution.stdout, appId);
}

async function queryIosPhysicalAppName(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  let execution: CommandExecution;
  try {
    execution = await executeRunner([
      "xcrun",
      "devicectl",
      "device",
      "info",
      "apps",
      "--device",
      deviceId,
    ], repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
  } catch {
    return undefined;
  }
  if (execution.exitCode !== 0) {
    return undefined;
  }
  return extractIosPhysicalAppName(execution.stdout, appId);
}

async function queryIosPhysicalProcessId(repoRoot: string, deviceId: string, appName: string): Promise<string | undefined> {
  let execution: CommandExecution;
  try {
    execution = await executeRunner([
      "xcrun",
      "devicectl",
      "device",
      "info",
      "processes",
      "--device",
      deviceId,
    ], repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
  } catch {
    return undefined;
  }
  if (execution.exitCode !== 0) {
    return undefined;
  }
  return extractIosPhysicalProcessId(execution.stdout, appName);
}

export async function resolveIosSimulatorAttachTarget(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  const existingPid = await queryIosSimulatorProcessId(repoRoot, deviceId, appId);
  if (existingPid) {
    return existingPid;
  }
  try {
    await executeRunner([
      "xcrun",
      "simctl",
      "launch",
      deviceId,
      appId,
    ], repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
  } catch {
    return undefined;
  }
  return queryIosSimulatorProcessId(repoRoot, deviceId, appId);
}

export async function resolveIosPhysicalAttachTarget(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  const appName = await queryIosPhysicalAppName(repoRoot, deviceId, appId);
  if (!appName) {
    return undefined;
  }
  return queryIosPhysicalProcessId(repoRoot, deviceId, appName);
}

export async function resolveIosAttachTarget(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  return isIosPhysicalDeviceId(deviceId)
    ? resolveIosPhysicalAttachTarget(repoRoot, deviceId, appId)
    : resolveIosSimulatorAttachTarget(repoRoot, deviceId, appId);
}

export interface IosPhysicalCrashResult {
  success: boolean;
  tier: "devicectl" | "idevicecrashreport";
  entries: Array<{
    reportId?: string;
    processName?: string;
    exceptionType?: string;
    exceptionCodes?: string;
    crashedThreadFrames: string[];
    rawContent?: string;
  }>;
  supportLevel: "full" | "partial" | "none";
  missingToolingAdvice?: string;
  failureReason?: "tool_not_available" | "device_disconnected" | "command_error" | "no_crashes";
  stderr?: string;
  /** Errors caught from failed tiers before the successful one (Phase 12-03). */
  fallbackErrors?: Array<{ tier: string; error: string }>;
}

interface IosPhysicalCrashParams {
  repoRoot: string;
  deviceId: string;
  appId?: string;
}

async function collectIosPhysicalCrashSignals(params: IosPhysicalCrashParams): Promise<CrashSignalExecutionResult> {
  const result = await collectIosPhysicalCrashLogs(params);

  const contentLines = ["# iOS physical-device crash signals", `Tier used: ${result.tier}`, ""];
  if (result.entries.length > 0) {
    for (const entry of result.entries) {
      contentLines.push(`## ${entry.processName ?? "unknown"}`);
      if (entry.exceptionType) contentLines.push(`Exception: ${entry.exceptionType}`);
      if (entry.exceptionCodes) contentLines.push(`Codes: ${entry.exceptionCodes}`);
      if (entry.crashedThreadFrames.length > 0) {
        contentLines.push("Crashed thread frames:", ...entry.crashedThreadFrames, "");
      }
      if (entry.rawContent) contentLines.push(entry.rawContent, "");
    }
  } else {
    contentLines.push("<no crash entries found>");
  }
  if (result.missingToolingAdvice) contentLines.push("", `# Note: ${result.missingToolingAdvice}`);

  const content = contentLines.join("\n").trim() + "\n";

  return {
    exitCode: result.success ? 0 : 1,
    stderr: result.stderr ?? "",
    commands: [],
    entries: result.entries.map((e) => e.processName ?? "unknown"),
    signalCount: result.entries.length,
    content: result.success ? content : undefined,
    platformExtensions: { iosPhysicalCrashes: result },
  };
}

async function collectIosPhysicalCrashLogs(params: IosPhysicalCrashParams): Promise<IosPhysicalCrashResult> {
  const { repoRoot, deviceId, appId } = params;
  const fallbackErrors: Array<{ tier: string; error: string }> = [];

  // Tier 1: devicectl (Xcode 14+, no extra deps)
  try {
    const devicectlResult = await tryDevicectlCrashLogs(repoRoot, deviceId, appId);
    if (devicectlResult.success || devicectlResult.failureReason !== "tool_not_available") {
      if (fallbackErrors.length > 0) return { ...devicectlResult, fallbackErrors };
      return devicectlResult;
    }
  } catch (error: unknown) {
    fallbackErrors.push({ tier: "devicectl", error: String(error) });
  }

  // Tier 2: idevicecrashreport (libimobiledevice)
  try {
    const ideviceResult = await tryIdevicecrashreport(repoRoot, deviceId, appId);
    if (ideviceResult.success || ideviceResult.failureReason !== "tool_not_available") {
      if (fallbackErrors.length > 0) return { ...ideviceResult, fallbackErrors };
      return ideviceResult;
    }
  } catch (error: unknown) {
    fallbackErrors.push({ tier: "idevicecrashreport", error: String(error) });
  }

  // Tier 3 removed (Phase 12-03): idevicesyslog was a streaming log tool, not a crash query tool.
  // Returning clear guidance when both tiers fail.
  return {
    success: false,
    tier: "idevicecrashreport",
    entries: [],
    supportLevel: "none",
    failureReason: "tool_not_available",
    missingToolingAdvice: "Install Xcode 14+ for devicectl crash reports, or `brew install libimobiledevice` for idevicecrashreport.",
    fallbackErrors: fallbackErrors.length > 0 ? fallbackErrors : undefined,
  };
}

async function tryDevicectlCrashLogs(repoRoot: string, deviceId: string, appId?: string): Promise<IosPhysicalCrashResult> {
  const execution = await executeRunner(
    ["xcrun", "devicectl", "device", "info", "crashes", "--device", deviceId],
    repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS },
  );

  if (execution.exitCode === null) {
    return { success: false, tier: "devicectl", entries: [], supportLevel: "none", failureReason: "tool_not_available", stderr: execution.stderr };
  }
  if (execution.exitCode !== 0) {
    if (execution.stderr.toLowerCase().includes("not found") || execution.stderr.toLowerCase().includes("enoent")) {
      return { success: false, tier: "devicectl", entries: [], supportLevel: "none", failureReason: "tool_not_available", stderr: execution.stderr };
    }
    return { success: false, tier: "devicectl", entries: [], supportLevel: "none", failureReason: "command_error", stderr: execution.stderr };
  }

  // Parse JSON output (devicectl returns structured JSON)
  let crashes: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(execution.stdout);
    crashes = Array.isArray(parsed.result?.crashes) ? parsed.result.crashes : (Array.isArray(parsed.crashes) ? parsed.crashes : []);
  } catch {
    return { success: false, tier: "devicectl", entries: [], supportLevel: "none", failureReason: "command_error", stderr: "Failed to parse devicectl JSON" };
  }

  // Filter by appId
  const filtered = appId
    ? crashes.filter((c) => {
        const procName = String(c.processName ?? "").toLowerCase();
        const bundleId = String(c.bundleIdentifier ?? "").toLowerCase();
        return procName.includes(appId.toLowerCase()) || bundleId.includes(appId.toLowerCase());
      })
    : crashes;

  const entries = filtered.slice(0, 3).map((c) => ({
    reportId: String(c.reportId ?? ""),
    processName: String(c.processName ?? ""),
    exceptionType: String(c.exceptionType ?? ""),
    exceptionCodes: String(c.exceptionCodes ?? ""),
    crashedThreadFrames: Array.isArray(c.crashedThreadFrames) ? c.crashedThreadFrames.slice(0, 10).map(String) : [],
    rawContent: String(c.rawContent ?? "").slice(0, 10000),
  }));

  return {
    success: true,
    tier: "devicectl",
    entries,
    supportLevel: entries.length > 0 ? "full" : "partial",
    failureReason: entries.length === 0 ? "no_crashes" : undefined,
  };
}

async function tryIdevicecrashreport(repoRoot: string, deviceId: string, appId?: string): Promise<IosPhysicalCrashResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "m2e-ios-crash-"));
  try {
    const pullResult = await executeRunner(
      ["idevicecrashreport", "-k", tempDir, "--udid", deviceId],
      repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS },
    );

    if (pullResult.exitCode === null || (pullResult.exitCode !== 0 && pullResult.stderr.toLowerCase().includes("not found"))) {
      return { success: false, tier: "idevicecrashreport", entries: [], supportLevel: "none", failureReason: "tool_not_available", missingToolingAdvice: "Install libimobiledevice: brew install libimobiledevice", stderr: pullResult.stderr };
    }
    if (pullResult.exitCode !== 0) {
      return { success: false, tier: "idevicecrashreport", entries: [], supportLevel: "none", failureReason: "command_error", stderr: pullResult.stderr };
    }

    // Read .crash files
    const crashFiles = await readdir(tempDir).catch(() => []);
    const filteredFiles = crashFiles.filter((f) => f.endsWith(".crash"));

    const entries: IosPhysicalCrashResult["entries"] = [];
    for (const file of filteredFiles.slice(0, 3)) {
      const content = await readFile(path.join(tempDir, file), "utf8").catch(() => "");
      if (!content.trim()) continue;
      if (appId && !content.toLowerCase().includes(appId.toLowerCase())) continue;

      const lines = content.replaceAll("\r", "").split("\n");
      const processMatch = lines.find((l) => l.startsWith("Process:"));
      const exceptionMatch = lines.find((l) => l.startsWith("Exception Type:"));
      const codesMatch = lines.find((l) => l.startsWith("Exception Codes:"));

      const crashedFrames = lines
        .filter((l) => /^\s*\d+\s+\S+/.test(l))
        .slice(0, 10);

      entries.push({
        processName: processMatch?.split(":")[1]?.trim().split(/\s+\[/)[0],
        exceptionType: exceptionMatch?.split(":")[1]?.trim(),
        exceptionCodes: codesMatch?.split(":")[1]?.trim(),
        crashedThreadFrames: crashedFrames,
        rawContent: lines.slice(0, 200).join("\n"),
      });
    }

    return {
      success: entries.length > 0,
      tier: "idevicecrashreport",
      entries,
      supportLevel: entries.length > 0 ? "full" : "partial",
      failureReason: entries.length === 0 ? "no_crashes" : undefined,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function createIosDeviceRuntimeHooks(): DeviceRuntimePlatformHooks {
  return {
    platform: "ios",
    buildLaunchCommand: ({ runnerProfile, deviceId, appId, launchUrl }) => (
      isIosPhysicalDeviceId(deviceId)
        ? [
          "xcrun",
          "devicectl",
          "device",
          "process",
          "launch",
          "--device",
          deviceId,
          ...(runnerProfile === "phase1" && launchUrl ? ["--payload-url", launchUrl] : []),
          ...(runnerProfile === "phase1" ? [] : ["--terminate-existing"]),
          appId,
        ]
        : runnerProfile === "phase1"
          ? ["xcrun", "simctl", "openurl", deviceId, launchUrl ?? ""]
          : ["xcrun", "simctl", "launch", deviceId, appId]
    ),
    buildInstallCommand: ({ deviceId, artifactPath }) => (
      isIosPhysicalDeviceId(deviceId)
        ? [
          "xcrun",
          "devicectl",
          "device",
          "install",
          "app",
          "--device",
          deviceId,
          artifactPath,
        ]
        : ["xcrun", "simctl", "install", deviceId, artifactPath]
    ),
    buildResetPlan: ({ strategy, deviceId, appId, artifactPath }) => {
      if (isIosPhysicalDeviceId(deviceId)) {
        return {
          commandLabels: ["unsupported_physical_reset"],
          commands: [],
          supportLevel: "partial" as const,
          unsupportedReason:
            "iOS physical-device reset_app_state is not yet deterministic for clear_data/uninstall_reinstall/keychain_reset in this adapter path. Use app relaunch or reinstall workflow with signed tooling until a devicectl-backed reset contract is verified.",
        };
      }
      if (strategy === "clear_data") {
        return {
          commandLabels: ["clear_data"],
          commands: [["xcrun", "simctl", "uninstall", deviceId, appId]],
          supportLevel: "full" as const,
        };
      }
      if (strategy === "uninstall_reinstall") {
        return {
          commandLabels: ["uninstall", "install"],
          commands: [["xcrun", "simctl", "uninstall", deviceId, appId], ["xcrun", "simctl", "install", deviceId, artifactPath ?? ""]],
          supportLevel: "full" as const,
        };
      }
      return {
        commandLabels: ["keychain_reset"],
        commands: [["xcrun", "simctl", "keychain", deviceId, "reset"]],
        supportLevel: "partial" as const,
      };
    },
    buildTerminateCommand: (deviceId, appId) => ["xcrun", "simctl", "terminate", deviceId, appId],
    buildScreenshotCommand: (deviceId, absoluteOutputPath) => ["xcrun", "simctl", "io", deviceId, "screenshot", absoluteOutputPath],
    screenshotUsesStdoutCapture: false,
    screenshotSupportLevel: "full",
    screenshotDryRunSuggestion: "Run take_screenshot without dryRun to capture an actual screenshot.",
    screenshotFailureSuggestion: "Check simulator boot state before retrying take_screenshot.",
    buildRecordScreenPlan: ({ deviceId, durationMs, absoluteOutputPath }) => {
      const durationSeconds = Math.max(1, Math.ceil(durationMs / 1000));
      const iosScript = [
        `xcrun simctl io ${shellEscape(deviceId)} recordVideo --codec=h264 --force ${shellEscape(absoluteOutputPath)} >/dev/null 2>&1 &`,
        "pid=$!",
        `sleep ${String(durationSeconds)}`,
        "kill -INT \"$pid\" >/dev/null 2>&1 || true",
        "wait \"$pid\" >/dev/null 2>&1 || true",
      ].join("\n");
      return {
        commandLabels: ["record"],
        commands: [["sh", "-lc", iosScript]],
        supportLevel: "partial",
        dryRunSuggestion: "Run record_screen without dryRun to capture an iOS simulator recording via simctl.",
        failureSuggestion: "Check simulator boot state and xcrun simctl io recordVideo availability before retrying record_screen.",
      };
    },
    buildGetLogsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId, sinceSeconds, appId, appFilterApplied, minLogLevel }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "logs", sessionId, `ios-${runnerProfile}.simulator.log`);
      // iOS log level mapping (lossy — iOS has no exact V/D/I/W/E/F equivalent)
      const { levelPredicate, actualApplied, levelNote } = buildIosLogLevelPredicate(minLogLevel);
      return {
        relativeOutputPath,
        absoluteOutputPath: path.resolve(repoRoot, relativeOutputPath),
        command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(sinceSeconds)}s`, ...(levelPredicate ? ["--predicate", levelPredicate] : [])],
        supportLevel: "full",
        sinceSeconds,
        linesRequested: undefined,
        appId,
        appFilterApplied: Boolean(appFilterApplied),
        actualLevelFilterApplied: actualApplied,
        platformLevelNote: levelNote,
      };
    },
    applyGetLogsAppFilter: async ({ capture, deviceId, appId }) => {
      const appPredicate = buildIosLogPredicateForApp(appId);
      // Combine app predicate with existing level predicate if any.
      // The level predicate is added by buildGetLogsCapturePlan as --predicate <levelPredicate>
      // when minLogLevel is set. We need to merge both predicates with AND.
      const predicateIdx = capture.command.indexOf("--predicate");
      const levelPredicatePart = predicateIdx >= 0 && predicateIdx + 1 < capture.command.length
        ? capture.command[predicateIdx + 1]
        : "";
      const combinedPredicate = levelPredicatePart
        ? `(${levelPredicatePart}) AND (${appPredicate})`
        : appPredicate;
      return {
        ...capture,
        command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(capture.sinceSeconds)}s`, "--predicate", combinedPredicate],
        appFilterApplied: true,
      };
    },
    buildGetCrashSignalsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId, linesRequested }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "crash-signals", sessionId, `ios-${runnerProfile}.crash-manifest.txt`);
      return {
        relativeOutputPath,
        absoluteOutputPath: path.resolve(repoRoot, relativeOutputPath),
        commands: [["xcrun", "simctl", "getenv", deviceId, "HOME"]],
        supportLevel: "full",
        linesRequested,
      };
    },
    executeCrashSignalsCapture: async ({ repoRoot, capture, deviceId, appId }) => {
      // Physical device path (Phase 11-02)
      if (isIosPhysicalDeviceId(deviceId)) {
        return collectIosPhysicalCrashSignals({ repoRoot, deviceId, appId });
      }

      // Simulator path (existing)
      await runIdbPreflight(repoRoot);
      const homeExecution = await executeRunner(capture.commands[0], repoRoot, process.env);
      if (homeExecution.exitCode !== 0) {
        return {
          exitCode: homeExecution.exitCode,
          stderr: homeExecution.stderr,
          commands: capture.commands,
          entries: [],
          signalCount: 0,
        };
      }

      const simulatorHome = homeExecution.stdout.trim();
      const crashRoot = path.join(simulatorHome, "Library", "Logs", "CrashReporter");
      const crashEntries = await listRelativeFileEntries(crashRoot);
      const filteredCrashEntries = appId
        ? crashEntries.filter((entry) => entry.relativePath.toLowerCase().includes(appId.toLowerCase()) || entry.absolutePath.toLowerCase().includes(appId.toLowerCase()))
        : crashEntries;
      const selectedCrashEntries = filteredCrashEntries.slice(0, 3);
      const entries = selectedCrashEntries.map((entry) => entry.relativePath);
      const crashSnippets: string[] = [];

      for (const entry of selectedCrashEntries) {
        const snippet = await readFile(entry.absolutePath, "utf8").catch(() => "");
        if (snippet.trim().length > 0) {
          crashSnippets.push(`## ${entry.relativePath}`);
          crashSnippets.push(...snippet.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).slice(0, 80));
          crashSnippets.push("");
        }
      }

      const content = [
        "# iOS simulator crash reporter root",
        crashRoot,
        "",
        "# Crash reporter entries",
        entries.length > 0 ? entries.join(String.fromCharCode(10)) : "<no crash entries found>",
        "",
        "# Crash reporter snippets",
        crashSnippets.length > 0 ? crashSnippets.join(String.fromCharCode(10)) : "<no crash snippets collected>",
      ].join(String.fromCharCode(10)) + String.fromCharCode(10);
      await writeFile(capture.absoluteOutputPath, content, "utf8");

      return {
        exitCode: homeExecution.exitCode,
        stderr: homeExecution.stderr,
        commands: capture.commands,
        entries,
        signalCount: filteredCrashEntries.length,
        content,
      };
    },
    buildCollectDiagnosticsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "diagnostics", sessionId, `ios-${runnerProfile}`);
      const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
      return {
        relativeOutputPath,
        absoluteOutputPath,
        commands: [["sh", "-lc", `printf '\n' | xcrun simctl diagnose -b --no-archive --output=${shellEscape(absoluteOutputPath)} --udid=${shellEscape(deviceId)}`]],
        supportLevel: "full",
      };
    },
    prepareDiagnosticsOutputPath: async (absoluteOutputPath) => {
      await mkdir(absoluteOutputPath, { recursive: true });
    },
    collectDiagnosticsArtifacts: async ({ repoRoot, capture }) => listArtifacts(capture.absoluteOutputPath, repoRoot),
  };
}
