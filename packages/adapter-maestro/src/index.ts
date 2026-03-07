import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse } from "yaml";
import { REASON_CODES, type Platform, type ReasonCode, type RunFlowInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

interface ArtifactDirectory {
  absolutePath: string;
  relativePath: string;
}

interface PlatformHarnessConfig {
  runnerScript: string;
  deviceId: string;
  appId: string;
  launchUrl?: string;
  runCountDefault: number;
}

interface CommandExecution {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface BasicRunData {
  dryRun: boolean;
  harnessConfigPath: string;
  runnerScript: string;
  flowPath: string;
  artifactsDir: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  command: string[];
  exitCode: number | null;
  summaryLine?: string;
}

const DEFAULT_HARNESS_CONFIG_PATH = "configs/harness/sample-harness.yaml";
const DEFAULT_FLOWS: Record<Platform, string> = {
  android: "flows/samples/react-native/android-login-smoke.yaml",
  ios: "flows/samples/react-native/ios-login-smoke.yaml",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function toRelativePath(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

async function listArtifacts(rootPath: string, repoRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listArtifacts(entryPath, repoRoot)));
      } else {
        files.push(toRelativePath(repoRoot, entryPath));
      }
    }

    return files.sort();
  } catch {
    return [];
  }
}

async function loadPlatformHarnessConfig(repoRoot: string, platform: Platform, harnessConfigPath: string): Promise<PlatformHarnessConfig> {
  const absoluteConfigPath = path.resolve(repoRoot, harnessConfigPath);
  const rawConfig = await readFile(absoluteConfigPath, "utf8");
  const parsedConfig: unknown = parse(rawConfig);

  if (!isRecord(parsedConfig)) {
    throw new Error(`Invalid harness config structure: ${harnessConfigPath}`);
  }

  const platforms = parsedConfig["platforms"];
  if (!isRecord(platforms)) {
    throw new Error(`Missing platforms section in harness config: ${harnessConfigPath}`);
  }

  const platformConfigUnknown = platforms[platform];
  if (!isRecord(platformConfigUnknown)) {
    throw new Error(`Missing platform config for ${platform} in ${harnessConfigPath}`);
  }

  const runnerScript = readNonEmptyString(platformConfigUnknown, "runner_script");
  const deviceId = readNonEmptyString(platformConfigUnknown, "device_udid");
  const appId = readNonEmptyString(platformConfigUnknown, "app_id");
  const launchUrl = readNonEmptyString(platformConfigUnknown, "launch_url");
  const runCountDefault = readPositiveNumber(platformConfigUnknown, "run_count_default") ?? 1;

  if (!runnerScript || !deviceId || !appId) {
    throw new Error(`Incomplete platform config for ${platform} in ${harnessConfigPath}`);
  }

  return {
    runnerScript,
    deviceId,
    appId,
    launchUrl,
    runCountDefault,
  };
}

export function resolveRepoPath(startPath?: string): string {
  let currentPath = startPath ?? path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const hasRepoMarkers = [
      path.join(currentPath, "scripts", "dev"),
      path.join(currentPath, "flows"),
      path.join(currentPath, "configs"),
    ].every((candidate) => existsSync(candidate));

    if (hasRepoMarkers) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error("Unable to resolve repository root from adapter-maestro.");
    }
    currentPath = parentPath;
  }
}

export function buildArtifactsDir(repoRoot: string, sessionId: string, platform: Platform, artifactRoot?: string): ArtifactDirectory {
  if (artifactRoot && path.isAbsolute(artifactRoot)) {
    throw new Error("artifactRoot must be relative to the repository root.");
  }

  const relativePath = artifactRoot ?? path.posix.join("artifacts", "mcp-server", sessionId, platform);
  return {
    absolutePath: path.resolve(repoRoot, relativePath),
    relativePath,
  };
}

function buildFailureReason(stderr: string, exitCode: number | null): ReasonCode {
  const combined = stderr.toLowerCase();
  if (combined.includes("maestro") && combined.includes("not found")) {
    return REASON_CODES.adapterError;
  }
  if (combined.includes("adb") || combined.includes("simctl") || combined.includes("device")) {
    return REASON_CODES.deviceUnavailable;
  }
  if (exitCode === 0) {
    return REASON_CODES.flowFailed;
  }
  return REASON_CODES.adapterError;
}

async function executeRunner(command: string[], repoRoot: string, env: NodeJS.ProcessEnv): Promise<CommandExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function readRunCounts(artifactsDir: string): Promise<{ totalRuns: number; passedRuns: number; failedRuns: number }> {
  try {
    const entries = await readdir(artifactsDir, { withFileTypes: true });
    let totalRuns = 0;
    let passedRuns = 0;
    let failedRuns = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("run-")) {
        continue;
      }

      totalRuns += 1;
      const resultPath = path.join(artifactsDir, entry.name, "result.txt");
      try {
        const result = (await readFile(resultPath, "utf8")).trim();
        if (result === "PASS") {
          passedRuns += 1;
        } else {
          failedRuns += 1;
        }
      } catch {
        failedRuns += 1;
      }
    }

    return { totalRuns, passedRuns, failedRuns };
  } catch {
    return { totalRuns: 0, passedRuns: 0, failedRuns: 0 };
  }
}

export async function collectBasicRunResult(params: {
  repoRoot: string;
  sessionId: string;
  durationMs: number;
  attempts: number;
  artifactsDir: ArtifactDirectory;
  harnessConfigPath: string;
  runnerScript: string;
  flowPath: string;
  command: string[];
  dryRun: boolean;
  execution?: CommandExecution;
  unsupportedCustomFlow?: boolean;
}): Promise<ToolResult<BasicRunData>> {
  const { totalRuns, passedRuns, failedRuns } = await readRunCounts(params.artifactsDir.absolutePath);
  const artifacts = await listArtifacts(params.artifactsDir.absolutePath, params.repoRoot);

  let status: ToolResult<BasicRunData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  const nextSuggestions: string[] = [];

  if (params.unsupportedCustomFlow) {
    status = "partial";
    reasonCode = REASON_CODES.unsupportedOperation;
    nextSuggestions.push("The current adapter wraps the existing RN sample runner. Use the default sample flow or pass a runnerScript explicitly.");
  } else if (params.dryRun) {
    nextSuggestions.push("Run the same command without --dry-run to execute the underlying sample runner.");
  } else if (params.execution && params.execution.exitCode !== 0) {
    status = "failed";
    reasonCode = buildFailureReason(params.execution.stderr, params.execution.exitCode);
    nextSuggestions.push("Check command.stderr.log and command.stdout.log under the artifacts directory for the runner failure details.");
  } else if (totalRuns === 0) {
    status = "partial";
    reasonCode = REASON_CODES.adapterError;
    nextSuggestions.push("The runner completed without producing run-* results. Verify the selected script still writes artifacts in the expected layout.");
  } else if (failedRuns > 0) {
    status = "failed";
    reasonCode = REASON_CODES.flowFailed;
    nextSuggestions.push("Inspect per-run result.txt and maestro.out artifacts to determine why the sample flow failed.");
  }

  return {
    status,
    reasonCode,
    sessionId: params.sessionId,
    durationMs: params.durationMs,
    attempts: params.attempts,
    artifacts,
    data: {
      dryRun: params.dryRun,
      harnessConfigPath: params.harnessConfigPath,
      runnerScript: params.runnerScript,
      flowPath: params.flowPath,
      artifactsDir: params.artifactsDir.relativePath,
      totalRuns,
      passedRuns,
      failedRuns,
      command: params.command,
      exitCode: params.execution?.exitCode ?? 0,
      summaryLine: params.execution?.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1),
    },
    nextSuggestions,
  };
}

export async function runFlowWithMaestro(input: RunFlowInput): Promise<ToolResult<BasicRunData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const harnessConfigPath = input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH;
  const platformConfig = await loadPlatformHarnessConfig(repoRoot, input.platform, harnessConfigPath);
  const flowPath = input.flowPath ?? DEFAULT_FLOWS[input.platform];
  const defaultFlowPath = DEFAULT_FLOWS[input.platform];
  const unsupportedCustomFlow = !input.runnerScript && flowPath !== defaultFlowPath;
  const runnerScript = input.runnerScript ?? platformConfig.runnerScript;
  const artifactsDir = buildArtifactsDir(repoRoot, input.sessionId, input.platform, input.artifactRoot);
  const absoluteRunnerScript = path.resolve(repoRoot, runnerScript);
  const absoluteFlowPath = path.resolve(repoRoot, flowPath);
  const runCount = input.runCount ?? platformConfig.runCountDefault;

  await mkdir(artifactsDir.absolutePath, { recursive: true });

  const command = ["bash", toRelativePath(repoRoot, absoluteRunnerScript), String(runCount)];

  if (unsupportedCustomFlow || input.dryRun) {
    return collectBasicRunResult({
      repoRoot,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifactsDir,
      harnessConfigPath,
      runnerScript,
      flowPath,
      command,
      dryRun: Boolean(input.dryRun),
      unsupportedCustomFlow,
    });
  }

  const execution = await executeRunner(
    ["bash", absoluteRunnerScript, String(runCount)],
    repoRoot,
    {
      ...process.env,
      ...(input.env ?? {}),
      OUT_DIR: artifactsDir.absolutePath,
      FLOW: absoluteFlowPath,
      ...(input.platform === "android"
        ? {
            DEVICE_ID: input.deviceId ?? platformConfig.deviceId,
            EXPO_URL: input.launchUrl ?? platformConfig.launchUrl,
          }
        : {
            SIM_UDID: input.deviceId ?? platformConfig.deviceId,
            EXPO_URL: input.launchUrl ?? platformConfig.launchUrl,
          }),
    },
  );

  await writeFile(path.join(artifactsDir.absolutePath, "command.stdout.log"), execution.stdout, "utf8");
  await writeFile(path.join(artifactsDir.absolutePath, "command.stderr.log"), execution.stderr, "utf8");

  return collectBasicRunResult({
    repoRoot,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifactsDir,
    harnessConfigPath,
    runnerScript,
    flowPath,
    command,
    dryRun: false,
    execution,
  });
}
