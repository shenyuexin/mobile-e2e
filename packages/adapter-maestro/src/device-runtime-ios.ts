import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isIosPhysicalDeviceId } from "./device-runtime.js";
import type { DeviceRuntimePlatformHooks } from "./device-runtime-platform.js";
import { probeIdbAvailability } from "./ui-runtime.js";
import { executeRunner, shellEscape, type CommandExecution } from "./runtime-shared.js";

const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;

function buildIosLogPredicateForApp(appId: string): string {
  const escaped = appId.replaceAll("'", "\\'");
  return `eventMessage CONTAINS[c] '${escaped}' OR processImagePath CONTAINS[c] '${escaped}' OR senderImagePath CONTAINS[c] '${escaped}'`;
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
    buildGetLogsCapturePlan: ({ repoRoot, sessionId, outputPath, runnerProfile, deviceId, sinceSeconds, appId, appFilterApplied }) => {
      const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "logs", sessionId, `ios-${runnerProfile}.simulator.log`);
      return {
        relativeOutputPath,
        absoluteOutputPath: path.resolve(repoRoot, relativeOutputPath),
        command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(sinceSeconds)}s`],
        supportLevel: "full",
        sinceSeconds,
        linesRequested: undefined,
        appId,
        appFilterApplied: Boolean(appFilterApplied),
      };
    },
    applyGetLogsAppFilter: async ({ capture, deviceId, appId }) => {
      const predicate = buildIosLogPredicateForApp(appId);
      return {
        ...capture,
        command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(capture.sinceSeconds)}s`, "--predicate", predicate],
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
    executeCrashSignalsCapture: async ({ repoRoot, capture, appId }) => {
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
