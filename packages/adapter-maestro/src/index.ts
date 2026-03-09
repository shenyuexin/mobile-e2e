import {
  type CollectDebugEvidenceData,
  type CollectDebugEvidenceInput,
  type DescribeCapabilitiesData,
  type DescribeCapabilitiesInput,
  type CollectDiagnosticsData,
  type CollectDiagnosticsInput,
  type DebugSignalSummary,
  type GetCrashSignalsData,
  type GetCrashSignalsInput,
  type GetLogsData,
  type GetLogsInput,
  type ResolveUiTargetData,
  type ResolveUiTargetInput,
  type DeviceInfo,
  type DoctorCheck,
  type DoctorInput,
  type InspectUiInput,
  type InspectUiNode,
  type InspectUiSummary,
  type InstallAppInput,
  type LaunchAppInput,
  type ListDevicesInput,
  type LogSummary,
  type Platform,
  type QueryUiData,
  type QueryUiInput,
  type QueryUiMatch,
  type ReasonCode,
  type RunFlowInput,
  type RunnerProfile,
  type ScreenshotInput,
  type ScrollAndResolveUiTargetData,
  type ScrollAndResolveUiTargetInput,
  type TapElementData,
  type TapElementInput,
  type TapInput,
  type TerminateAppInput,
  type ToolResult,
  type TypeTextInput,
  type TypeIntoElementData,
  type TypeIntoElementInput,
  type UiScrollDirection,
  type WaitForUiData,
  type WaitForUiInput,
  type WaitForUiMode,
  REASON_CODES,
} from "@mobile-e2e-mcp/contracts";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { buildCapabilityProfile } from "./capability-model.js";
import {
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  buildUiTargetResolution,
  buildInspectUiSummary,
  hasQueryUiSelector,
  isWaitConditionMet,
  normalizeQueryUiSelector,
  parseAndroidUiHierarchyNodes,
  parseInspectUiSummary,
  parseIosInspectSummary,
  queryUiNodes,
  reasonCodeForResolutionStatus,
  shouldAbortWaitForUiAfterReadFailure,
} from "./ui-model.js";

export { buildCapabilityProfile } from "./capability-model.js";

interface ArtifactDirectory {
  absolutePath: string;
  relativePath: string;
}

interface HarnessSelection {
  runnerProfile: RunnerProfile;
  runnerScript: string;
  deviceId?: string;
  appId: string;
  sampleName: string;
  launchUrl?: string;
  artifactRoot?: string;
  runCountDefault: number;
  configuredFlows: string[];
}

interface CommandExecution {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface InspectUiData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
  supportLevel: "full" | "partial";
  platformSupportNote?: string;
  content?: string;
  summary?: InspectUiSummary;
}

interface GetLogsCapture {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  command: string[];
  supportLevel: "full" | "partial";
  linesRequested?: number;
  sinceSeconds: number;
}

interface GetCrashSignalsCapture {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  commands: string[][];
  supportLevel: "full" | "partial";
  linesRequested: number;
}

interface CollectDiagnosticsCapture {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  commandOutputPath?: string;
  commands: string[][];
  supportLevel: "full" | "partial";
}
const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const DEFAULT_WAIT_INTERVAL_MS = 500;
const DEFAULT_GET_LOGS_LINES = 200;
const DEFAULT_GET_LOGS_SINCE_SECONDS = 60;
const DEFAULT_GET_CRASH_LINES = 120;
const DEFAULT_SCROLL_MAX_SWIPES = 3;
const DEFAULT_SCROLL_DURATION_MS = 250;
const DEFAULT_WAIT_UNTIL: WaitForUiMode = "visible";
const DEFAULT_SCROLL_DIRECTION: UiScrollDirection = "up";
const DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES = 2;

interface AndroidUiSnapshot {
  command: string[];
  readCommand: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  readExecution: CommandExecution;
  nodes: InspectUiNode[];
  summary?: InspectUiSummary;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}
interface AndroidUiSnapshotFailure {
  reasonCode: ReasonCode;
  exitCode: number | null;
  outputPath: string;
  command: string[];
  message: string;
}

interface TypeTextData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  text: string;
  command: string[];
  exitCode: number | null;
}

interface TapData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  x: number;
  y: number;
  command: string[];
  exitCode: number | null;
}

interface ScreenshotData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  command: string[];
  exitCode: number | null;
}

interface TerminateAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  appId: string;
  command: string[];
  exitCode: number | null;
}

interface InstallArtifactSpec {
  kind: "file" | "directory";
  envVar: string;
  relativePath: string;
}

interface LaunchAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  appId: string;
  launchUrl?: string;
  launchCommand: string[];
  exitCode: number | null;
}

interface InstallAppData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  artifactPath?: string;
  installCommand: string[];
  exitCode: number | null;
}

interface BasicRunData {
  dryRun: boolean;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  artifactsDir: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  command: string[];
  exitCode: number | null;
  summaryLine?: string;
}

function getInstallArtifactSpec(runnerProfile: RunnerProfile): InstallArtifactSpec | undefined {
  if (runnerProfile === "native_android") {
    return {
      kind: "file",
      envVar: "NATIVE_ANDROID_APK_PATH",
      relativePath: "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk",
    };
  }
  if (runnerProfile === "native_ios") {
    return {
      kind: "directory",
      envVar: "NATIVE_IOS_APP_PATH",
      relativePath: "examples/demo-ios-app/build/Build/Products/Debug-iphonesimulator/MobiTruKotlin.app",
    };
  }
  if (runnerProfile === "flutter_android") {
    return {
      kind: "file",
      envVar: "FLUTTER_APK_PATH",
      relativePath: "examples/demo-flutter-app/build/app/outputs/flutter-apk/app-debug.apk",
    };
  }
  return undefined;
}

function resolveInstallArtifactPath(repoRoot: string, runnerProfile: RunnerProfile, explicitArtifactPath?: string): string | undefined {
  if (explicitArtifactPath) {
    return path.isAbsolute(explicitArtifactPath) ? explicitArtifactPath : path.resolve(repoRoot, explicitArtifactPath);
  }
  const spec = getInstallArtifactSpec(runnerProfile);
  if (!spec) {
    return undefined;
  }
  const fromEnv = process.env[spec.envVar];
  return fromEnv ? fromEnv : path.resolve(repoRoot, spec.relativePath);
}

export interface SessionDefaults {
  appId: string;
  sampleName: string;
  artifactsRoot: string;
}

const DEFAULT_HARNESS_CONFIG_PATH = "configs/harness/sample-harness.yaml";
const DEFAULT_IDB_CLI_PATH = "/Users/linan/Library/Python/3.9/bin/idb";
const DEFAULT_IDB_COMPANION_PATH = "/Users/linan/.local/share/idb-companion.universal/bin/idb_companion";

function resolveIdbCliPath(): string | undefined {
  const envPath = process.env.IDB_CLI_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  return existsSync(DEFAULT_IDB_CLI_PATH) ? DEFAULT_IDB_CLI_PATH : undefined;
}

function resolveIdbCompanionPath(): string | undefined {
  const envPath = process.env.IDB_COMPANION_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  return existsSync(DEFAULT_IDB_COMPANION_PATH) ? DEFAULT_IDB_COMPANION_PATH : undefined;
}

function buildIdbCommand(baseArgs: string[]): string[] {
  const idbCliPath = resolveIdbCliPath() ?? "idb";
  const companionPath = resolveIdbCompanionPath();
  return companionPath ? [idbCliPath, "--companion-path", companionPath, ...baseArgs] : [idbCliPath, ...baseArgs];
}

const DEFAULT_RUNNER_PROFILE: RunnerProfile = "phase1";
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

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function buildAndroidUiDumpCommands(deviceId: string): { dumpCommand: string[]; readCommand: string[] } {
  return {
    dumpCommand: ["adb", "-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/view.xml"],
    readCommand: ["adb", "-s", deviceId, "shell", "cat", "/sdcard/view.xml"],
  };
}

function isAndroidUiSnapshotFailure(value: AndroidUiSnapshot | AndroidUiSnapshotFailure): value is AndroidUiSnapshotFailure {
  return "message" in value;
}

function buildResolutionNextSuggestions(status: "resolved" | "no_match" | "ambiguous" | "missing_bounds" | "unsupported" | "not_executed", toolName: string): string[] {
  if (status === "resolved") {
    return [];
  }
  if (status === "no_match") {
    return [`No UI nodes matched the provided selector for ${toolName}. Broaden the selector or inspect nearby nodes.`];
  }
  if (status === "ambiguous") {
    return [`Multiple UI nodes matched the selector for ${toolName}. Narrow the selector before performing an element action.`];
  }
  if (status === "missing_bounds") {
    return [`A matching UI node was found for ${toolName}, but its bounds were not parseable.`];
  }
  if (status === "not_executed") {
    return [`${toolName} did not execute live UI resolution in this run. Re-run without dryRun or fix the upstream capture failure.`];
  }
  return [`${toolName} is not fully supported for this platform in the current repository state.`];
}

function normalizeWaitForUiMode(value: WaitForUiMode | undefined): WaitForUiMode {
  return value ?? DEFAULT_WAIT_UNTIL;
}

function normalizeScrollDirection(value: UiScrollDirection | undefined): UiScrollDirection {
  return value ?? DEFAULT_SCROLL_DIRECTION;
}

function reasonCodeForWaitTimeout(_waitUntil: WaitForUiMode): ReasonCode {
  return REASON_CODES.timeout;
}

function escapeAndroidInputText(text: string): string {
  return text.replaceAll(" ", "%s");
}

async function captureAndroidUiSnapshot(
  repoRoot: string,
  deviceId: string,
  sessionId: string,
  runnerProfile: RunnerProfile,
  outputPath: string | undefined,
  query: QueryUiInput,
): Promise<AndroidUiSnapshot | AndroidUiSnapshotFailure> {
  const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "ui-dumps", sessionId, `android-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      exitCode: dumpExecution.exitCode,
      outputPath: relativeOutputPath,
      command,
      message: "Check Android device state and ensure uiautomator dump is permitted before retrying UI resolution.",
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }
  const nodes = readExecution.exitCode === 0 ? parseAndroidUiHierarchyNodes(readExecution.stdout) : [];
  const summary = readExecution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = readExecution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return {
    command,
    readCommand,
    relativeOutputPath,
    absoluteOutputPath,
    readExecution,
    nodes,
    summary,
    queryResult,
  };
}

function buildIosUiDescribeCommand(deviceId: string): string[] {
  return buildIdbCommand(["ui", "describe-all", "--udid", deviceId, "--json", "--nested"]);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function countNonEmptyLines(content: string): number {
  return content
    .replaceAll(String.fromCharCode(13), "")
    .split(String.fromCharCode(10))
    .filter((line) => line.length > 0)
    .length;
}

function classifyDebugSignal(line: string): DebugSignalSummary["category"] {
  const normalized = line.toLowerCase();
  if (normalized.includes("anr")) return "anr";
  if (normalized.includes("fatal") || normalized.includes("crash") || normalized.includes("androidruntime")) return "crash";
  if (normalized.includes("exception") || normalized.includes("traceback")) return "exception";
  if (normalized.includes("timeout")) return "timeout";
  if (normalized.includes("warn") || normalized.includes("warning")) return "warning";
  if (normalized.includes("error") || normalized.includes("err ")) return "error";
  return "other";
}

function isInterestingDebugLine(line: string): boolean {
  const normalized = line.toLowerCase();
  return normalized.includes("fatal")
    || normalized.includes("exception")
    || normalized.includes("error")
    || normalized.includes("crash")
    || normalized.includes("anr")
    || normalized.includes("timeout")
    || normalized.includes("failed")
    || normalized.includes("unable to");
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
  logSummary?: LogSummary;
  crashSummary?: LogSummary;
  includeDiagnostics: boolean;
  diagnosticsArtifacts: number;
}): string[] {
  const narrative: string[] = [];

  if (params.crashSummary && params.crashSummary.topSignals.length > 0) {
    const topCrash = params.crashSummary.topSignals[0];
    narrative.push(`Crash evidence is present: ${topCrash.category} appears ${String(topCrash.count)} time(s).`);
  } else {
    narrative.push("No high-confidence crash signals were detected in the captured crash evidence.");
  }

  if (params.logSummary) {
    narrative.push(`Log capture scanned ${String(params.logSummary.totalLines)} lines and flagged ${String(params.logSummary.sampleLines.length)} interesting lines for AI review.`);
  }

  if (params.includeDiagnostics) {
    narrative.push(`Diagnostics bundle capture is included with ${String(params.diagnosticsArtifacts)} artifact path(s). Use it only if logs and crash summaries are insufficient.`);
  }

  return narrative;
}

function buildGetLogsCapture(
  repoRoot: string,
  input: GetLogsInput,
  runnerProfile: RunnerProfile,
  deviceId: string,
): GetLogsCapture {
  const sinceSeconds = normalizePositiveInteger(input.sinceSeconds, DEFAULT_GET_LOGS_SINCE_SECONDS);
  const linesRequested = input.platform === "android" ? normalizePositiveInteger(input.lines, DEFAULT_GET_LOGS_LINES) : undefined;
  const extension = input.platform === "android" ? "logcat.txt" : "simulator.log";
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "logs", input.sessionId, `${input.platform}-${runnerProfile}.${extension}`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  if (input.platform === "android") {
    return {
      relativeOutputPath,
      absoluteOutputPath,
      command: ["adb", "-s", deviceId, "logcat", "-d", "-t", String(linesRequested ?? DEFAULT_GET_LOGS_LINES)],
      supportLevel: "full",
      linesRequested,
      sinceSeconds,
    };
  }

  return {
    relativeOutputPath,
    absoluteOutputPath,
    command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(sinceSeconds)}s`],
    supportLevel: "full",
    linesRequested,
    sinceSeconds,
  };
}

function buildGetCrashSignalsCapture(
  repoRoot: string,
  input: GetCrashSignalsInput,
  runnerProfile: RunnerProfile,
  deviceId: string,
): GetCrashSignalsCapture {
  const linesRequested = normalizePositiveInteger(input.lines, DEFAULT_GET_CRASH_LINES);
  const extension = input.platform === "android" ? "crash.txt" : "crash-manifest.txt";
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "crash-signals", input.sessionId, `${input.platform}-${runnerProfile}.${extension}`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  if (input.platform === "android") {
    return {
      relativeOutputPath,
      absoluteOutputPath,
      commands: [
        ["adb", "-s", deviceId, "logcat", "-d", "-b", "crash", "-t", String(linesRequested)],
        ["adb", "-s", deviceId, "shell", "ls", "-1", "/data/anr"],
      ],
      supportLevel: "full",
      linesRequested,
    };
  }

  return {
    relativeOutputPath,
    absoluteOutputPath,
    commands: [["xcrun", "simctl", "getenv", deviceId, "HOME"]],
    supportLevel: "full",
    linesRequested,
  };
}

function buildCollectDiagnosticsCapture(
  repoRoot: string,
  input: CollectDiagnosticsInput,
  runnerProfile: RunnerProfile,
  deviceId: string,
): CollectDiagnosticsCapture {
  if (input.platform === "android") {
    const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "diagnostics", input.sessionId, `${input.platform}-${runnerProfile}.zip`);
    const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
    const commandOutputPath = absoluteOutputPath.endsWith(".zip") ? absoluteOutputPath.slice(0, -4) : absoluteOutputPath;
    return {
      relativeOutputPath,
      absoluteOutputPath,
      commandOutputPath,
      commands: [["adb", "-s", deviceId, "bugreport", commandOutputPath]],
      supportLevel: "full",
    };
  }

  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "diagnostics", input.sessionId, `${input.platform}-${runnerProfile}`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  return {
    relativeOutputPath,
    absoluteOutputPath,
    commands: [["sh", "-lc", `printf '\n' | xcrun simctl diagnose -b --no-archive --output=${shellEscape(absoluteOutputPath)} --udid=${shellEscape(deviceId)}`]],
    supportLevel: "full",
  };
}

async function listRelativeFiles(rootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const output: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await listRelativeFiles(entryPath);
        for (const item of nested) {
          output.push(path.posix.join(entry.name, item));
        }
      } else {
        output.push(entry.name);
      }
    }

    return output.sort();
  } catch {
    return [];
  }
}

function toRelativePath(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function ensureRunnerProfilePlatform(platform: Platform, runnerProfile: RunnerProfile): void {
  if (runnerProfile === "native_ios" && platform !== "ios") {
    throw new Error(`Runner profile ${runnerProfile} requires platform ios.`);
  }

  if ((runnerProfile === "native_android" || runnerProfile === "flutter_android") && platform !== "android") {
    throw new Error(`Runner profile ${runnerProfile} requires platform android.`);
  }
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

async function parseHarnessConfig(repoRoot: string, harnessConfigPath: string): Promise<Record<string, unknown>> {
  const absoluteConfigPath = path.resolve(repoRoot, harnessConfigPath);
  const rawConfig = await readFile(absoluteConfigPath, "utf8");
  const parsedConfig: unknown = parse(rawConfig);

  if (!isRecord(parsedConfig)) {
    throw new Error(`Invalid harness config structure: ${harnessConfigPath}`);
  }

  return parsedConfig;
}

function loadPlatformDefaults(parsedConfig: Record<string, unknown>, platform: Platform, harnessConfigPath: string): Record<string, unknown> {
  const platforms = parsedConfig.platforms;
  if (!isRecord(platforms)) {
    throw new Error(`Missing platforms section in harness config: ${harnessConfigPath}`);
  }

  const platformConfig = platforms[platform];
  if (!isRecord(platformConfig)) {
    throw new Error(`Missing platform config for ${platform} in ${harnessConfigPath}`);
  }

  return platformConfig;
}

async function loadHarnessSelection(
  repoRoot: string,
  platform: Platform,
  runnerProfile: RunnerProfile,
  harnessConfigPath: string,
): Promise<HarnessSelection> {
  ensureRunnerProfilePlatform(platform, runnerProfile);
  const parsedConfig = await parseHarnessConfig(repoRoot, harnessConfigPath);
  const platformDefaults = loadPlatformDefaults(parsedConfig, platform, harnessConfigPath);

  if (runnerProfile === "phase1") {
    const runnerScript = readNonEmptyString(platformDefaults, "runner_script");
    const deviceId = readNonEmptyString(platformDefaults, "device_udid");
    const appId = readNonEmptyString(platformDefaults, "app_id");
    const launchUrl = readNonEmptyString(platformDefaults, "launch_url");
    const runCountDefault = readPositiveNumber(platformDefaults, "run_count_default") ?? 1;
    const sample = parsedConfig.sample;
    const sampleName = isRecord(sample) ? readNonEmptyString(sample, "name") ?? "rn-login-demo" : "rn-login-demo";

    if (!runnerScript || !deviceId || !appId) {
      throw new Error(`Incomplete phase1 config for ${platform} in ${harnessConfigPath}`);
    }

    return {
      runnerProfile,
      runnerScript,
      deviceId,
      appId,
      sampleName,
      launchUrl,
      runCountDefault,
      configuredFlows: [DEFAULT_FLOWS[platform]],
    };
  }

  const phase3Validations = parsedConfig.phase3_validations;
  if (!isRecord(phase3Validations)) {
    throw new Error(`Missing phase3_validations section in harness config: ${harnessConfigPath}`);
  }

  const profileConfig = phase3Validations[runnerProfile];
  if (!isRecord(profileConfig)) {
    throw new Error(`Missing runner profile ${runnerProfile} in ${harnessConfigPath}`);
  }

  const runnerScript = readNonEmptyString(profileConfig, "runner_script");
  const appId = readNonEmptyString(profileConfig, "app_id");
  const sampleName = readNonEmptyString(profileConfig, "sample_name") ?? runnerProfile;
  const artifactRoot = readNonEmptyString(profileConfig, "artifact_root");
  const runCountDefault = readPositiveNumber(profileConfig, "run_count_default") ?? 1;
  const configuredFlows = readStringArray(profileConfig, "flows");
  const deviceId = readNonEmptyString(platformDefaults, "device_udid");

  if (!runnerScript || !appId || configuredFlows.length === 0) {
    throw new Error(`Incomplete runner profile ${runnerProfile} in ${harnessConfigPath}`);
  }

  return {
    runnerProfile,
    runnerScript,
    deviceId,
    appId,
    sampleName,
    artifactRoot,
    runCountDefault,
    configuredFlows,
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

export function buildArtifactsDir(
  repoRoot: string,
  sessionId: string,
  platform: Platform,
  runnerProfile: RunnerProfile,
  artifactRoot?: string,
): ArtifactDirectory {
  if (artifactRoot && path.isAbsolute(artifactRoot)) {
    throw new Error("artifactRoot must be relative to the repository root.");
  }

  const relativePath = artifactRoot
    ? path.posix.join(artifactRoot, sessionId)
    : path.posix.join("artifacts", "mcp-server", sessionId, platform, runnerProfile);
  return {
    absolutePath: path.resolve(repoRoot, relativePath),
    relativePath,
  };
}

export async function resolveSessionDefaults(input: {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile | null;
  harnessConfigPath?: string;
  artifactRoot?: string;
}): Promise<SessionDefaults> {
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const harnessConfigPath = input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, harnessConfigPath);
  const artifactsDir = buildArtifactsDir(repoRoot, input.sessionId, input.platform, runnerProfile, input.artifactRoot ?? selection.artifactRoot);

  return {
    appId: selection.appId,
    sampleName: selection.sampleName,
    artifactsRoot: artifactsDir.relativePath,
  };
}

export async function describeCapabilitiesWithMaestro(
  input: DescribeCapabilitiesInput,
): Promise<ToolResult<DescribeCapabilitiesData>> {
  const startTime = Date.now();
  const sessionId = input.sessionId ?? `capabilities-${Date.now()}`;
  const runnerProfile = input.runnerProfile ?? null;
  const capabilities = buildCapabilityProfile(input.platform, runnerProfile);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      platform: input.platform,
      runnerProfile,
      capabilities,
    },
    nextSuggestions: ["Use the returned capability profile to pick tools before invoking platform-specific UI actions."],
  };
}

function buildFailureReason(stderr: string, exitCode: number | null): ReasonCode {
  const combined = stderr.toLowerCase();
  if (combined.includes("install_failed_version_downgrade") || combined.includes("failed to install")) {
    return REASON_CODES.configurationError;
  }
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

function readSummaryLine(stdout?: string): string | undefined {
  if (!stdout) {
    return undefined;
  }

  const carriageReturn = String.fromCharCode(13);
  const lineFeed = String.fromCharCode(10);
  const normalized = stdout.replaceAll(carriageReturn, "");
  const lines = normalized.split(lineFeed).filter(Boolean);
  return lines.at(-1);
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
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
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
    nextSuggestions.push("The selected runner profile bundles predefined flows. Omit flowPath or pass a custom runnerScript if you need exact single-flow control.");
  } else if (params.dryRun) {
    nextSuggestions.push("Run the same command without --dry-run to execute the underlying sample runner.");
  } else if (params.execution && params.execution.exitCode !== 0) {
    status = "failed";
    reasonCode = buildFailureReason(params.execution.stderr, params.execution.exitCode);
    nextSuggestions.push("Check command.stderr.log and command.stdout.log under the artifacts directory for the runner failure details.");
    if (reasonCode === REASON_CODES.configurationError) {
      nextSuggestions.push("The current app install failed. Remove the installed app or provide a newer build artifact before retrying.");
    }
  } else if (totalRuns === 0) {
    status = "partial";
    reasonCode = REASON_CODES.adapterError;
    nextSuggestions.push("The runner completed without producing run-* results. Verify the selected script still writes artifacts in the expected layout.");
  } else if (failedRuns > 0) {
    status = "failed";
    reasonCode = REASON_CODES.flowFailed;
    nextSuggestions.push("Inspect per-run result.txt and maestro.out artifacts to determine why the sample flow failed.");
  }

  if (params.configuredFlows.length > 1) {
    nextSuggestions.push("This runner profile executes a bundled validation set defined in configs/harness/sample-harness.yaml.");
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
      runnerProfile: params.runnerProfile,
      runnerScript: params.runnerScript,
      flowPath: params.flowPath,
      requestedFlowPath: params.requestedFlowPath,
      configuredFlows: params.configuredFlows,
      artifactsDir: params.artifactsDir.relativePath,
      totalRuns,
      passedRuns,
      failedRuns,
      command: params.command,
      exitCode: params.execution?.exitCode ?? 0,
      summaryLine: readSummaryLine(params.execution?.stdout),
    },
    nextSuggestions,
  };
}

export async function runFlowWithMaestro(input: RunFlowInput): Promise<ToolResult<BasicRunData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const harnessConfigPath = input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, harnessConfigPath);
  const requestedFlowPath = input.flowPath;
  const unsupportedCustomFlow = Boolean(
    !input.runnerScript && requestedFlowPath && (selection.configuredFlows.length > 1 || !selection.configuredFlows.includes(requestedFlowPath)),
  );
  const effectiveFlowPath = requestedFlowPath ?? selection.configuredFlows[0];
  const runnerScript = input.runnerScript ?? selection.runnerScript;
  const artifactsDir = buildArtifactsDir(
    repoRoot,
    input.sessionId,
    input.platform,
    runnerProfile,
    input.artifactRoot ?? selection.artifactRoot,
  );
  const absoluteRunnerScript = path.resolve(repoRoot, runnerScript);
  const runCount = input.runCount ?? selection.runCountDefault;
  const command = ["bash", toRelativePath(repoRoot, absoluteRunnerScript), String(runCount)];

  await mkdir(artifactsDir.absolutePath, { recursive: true });

  if (unsupportedCustomFlow || input.dryRun) {
    return collectBasicRunResult({
      repoRoot,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifactsDir,
      harnessConfigPath,
      runnerProfile,
      runnerScript,
      flowPath: effectiveFlowPath,
      requestedFlowPath,
      configuredFlows: selection.configuredFlows,
      command,
      dryRun: Boolean(input.dryRun),
      unsupportedCustomFlow,
    });
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(input.env ?? {}),
    OUT_DIR: artifactsDir.absolutePath,
    APP_ID: input.appId ?? selection.appId,
    FLOW: path.resolve(repoRoot, effectiveFlowPath),
  };

  if (input.platform === "android") {
    env.DEVICE_ID = input.deviceId ?? selection.deviceId ?? "emulator-5554";
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  } else {
    env.SIM_UDID = input.deviceId ?? selection.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  }

  const execution = await executeRunner(["bash", absoluteRunnerScript, String(runCount)], repoRoot, env);

  await writeFile(path.join(artifactsDir.absolutePath, "command.stdout.log"), execution.stdout, "utf8");
  await writeFile(path.join(artifactsDir.absolutePath, "command.stderr.log"), execution.stderr, "utf8");

  return collectBasicRunResult({
    repoRoot,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifactsDir,
    harnessConfigPath,
    runnerProfile,
    runnerScript,
    flowPath: effectiveFlowPath,
    requestedFlowPath,
    configuredFlows: selection.configuredFlows,
    command,
    dryRun: false,
    execution,
  });
}

function parseAdbDevices(stdout: string, includeUnavailable: boolean): DeviceInfo[] {
  return stdout
    .replaceAll(String.fromCharCode(13), "")
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of devices attached"))
    .map((line) => {
      const [id, state = "unknown"] = line.split(/\s+/);
      return {
        id,
        platform: "android" as const,
        state,
        available: state === "device",
      };
    })
    .filter((device) => includeUnavailable || device.available);
}

function parseIosDevices(stdout: string, includeUnavailable: boolean): DeviceInfo[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) {
    return [];
  }

  const devicesSection = parsed.devices;
  if (!isRecord(devicesSection)) {
    return [];
  }

  const devicesByName = new Map<string, DeviceInfo>();
  for (const runtimeDevices of Object.values(devicesSection)) {
    if (!Array.isArray(runtimeDevices)) {
      continue;
    }

    for (const device of runtimeDevices) {
      if (!isRecord(device)) {
        continue;
      }

      const id = readNonEmptyString(device, "udid");
      const name = readNonEmptyString(device, "name");
      const state = readNonEmptyString(device, "state") ?? "unknown";
      const isAvailable = device.isAvailable === true;
      if (!id || !name) {
        continue;
      }

      const normalizedDevice: DeviceInfo = {
        id,
        name,
        platform: "ios",
        state,
        available: isAvailable && state.toLowerCase() !== "unavailable",
      };

      const existing = devicesByName.get(name);
      const existingScore = existing ? Number(existing.available) * 10 + Number(existing.state === "Booted") : -1;
      const nextScore = Number(normalizedDevice.available) * 10 + Number(normalizedDevice.state === "Booted");
      if (!existing || nextScore > existingScore) {
        devicesByName.set(name, normalizedDevice);
      }
    }
  }

  return Array.from(devicesByName.values()).filter((device) => includeUnavailable || device.available);
}

export async function listAvailableDevices(
  input: ListDevicesInput = {},
): Promise<ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>> {
  const repoRoot = resolveRepoPath();
  const startTime = Date.now();
  const includeUnavailable = input.includeUnavailable ?? false;
  const sessionId = `device-scan-${Date.now()}`;
  const nextSuggestions: string[] = [];

  let androidDevices: DeviceInfo[] = [];
  let iosDevices: DeviceInfo[] = [];
  let status: ToolResult<{ android: DeviceInfo[]; ios: DeviceInfo[] }>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;

  try {
    const adbResult = await executeRunner(["adb", "devices"], repoRoot, process.env);
    androidDevices = adbResult.exitCode === 0 ? parseAdbDevices(adbResult.stdout, includeUnavailable).map((device) => ({ ...device, capabilities: buildCapabilityProfile("android", null) })) : [];
    if (adbResult.exitCode !== 0) {
      status = "partial";
      reasonCode = REASON_CODES.deviceUnavailable;
      nextSuggestions.push("adb is unavailable or returned an error while listing Android devices.");
    }
  } catch {
    status = "partial";
    reasonCode = REASON_CODES.deviceUnavailable;
    nextSuggestions.push("adb is unavailable in the current environment.");
  }

  try {
    const iosResult = await executeRunner(["xcrun", "simctl", "list", "devices", "available", "--json"], repoRoot, process.env);
    iosDevices = iosResult.exitCode === 0 ? parseIosDevices(iosResult.stdout, includeUnavailable).map((device) => ({ ...device, capabilities: buildCapabilityProfile("ios", null) })) : [];
    if (iosResult.exitCode !== 0) {
      status = status === "success" ? "partial" : status;
      reasonCode = reasonCode === REASON_CODES.ok ? REASON_CODES.deviceUnavailable : reasonCode;
      nextSuggestions.push("xcrun simctl returned an error while listing iOS simulators.");
    }
  } catch {
    status = status === "success" ? "partial" : status;
    reasonCode = reasonCode === REASON_CODES.ok ? REASON_CODES.deviceUnavailable : reasonCode;
    nextSuggestions.push("xcrun simctl is unavailable in the current environment.");
  }

  if (androidDevices.length === 0 && iosDevices.length === 0 && status === "success") {
    status = "partial";
    reasonCode = REASON_CODES.deviceUnavailable;
    nextSuggestions.push("No available Android devices or iOS simulators were detected.");
  }

  return {
    status,
    reasonCode,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      android: androidDevices,
      ios: iosDevices,
    },
    nextSuggestions,
  };
}

function summarizeDeviceCheck(name: string, count: number): DoctorCheck {
  if (count > 0) {
    return {
      name,
      status: "pass",
      detail: `${String(count)} available device(s) detected.`,
    };
  }

  return {
    name,
    status: "warn",
    detail: "No available devices detected.",
  };
}

function summarizeInfoCheck(name: string, status: DoctorCheck["status"], detail: string): DoctorCheck {
  return { name, status, detail };
}

async function checkCommandVersion(repoRoot: string, command: string, args: string[], label: string): Promise<DoctorCheck> {
  try {
    const result = await executeRunner([command, ...args], repoRoot, process.env);
    return result.exitCode === 0
      ? summarizeInfoCheck(label, "pass", result.stdout.trim() || `${label} is available.`)
      : summarizeInfoCheck(label, "fail", result.stderr.trim() || `${label} returned exit code ${String(result.exitCode)}.`);
  } catch (error) {
    return summarizeInfoCheck(label, "fail", error instanceof Error ? error.message : String(error));
  }
}

async function checkTcpReachability(label: string, host: string, port: number): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeoutMs = 1500;

    const finish = (status: DoctorCheck["status"], detail: string) => {
      socket.destroy();
      resolve(summarizeInfoCheck(label, status, detail));
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("pass", `${host}:${String(port)} is reachable.`));
    socket.once("timeout", () => finish("warn", `${host}:${String(port)} did not respond within ${String(timeoutMs)}ms.`));
    socket.once("error", (error) => finish("warn", error.message));
  });
}

async function checkAdbReverseMappings(label: string, deviceId: string, mappings: string[], repoRoot: string): Promise<DoctorCheck> {
  if (mappings.length === 0) {
    return summarizeInfoCheck(label, "pass", "No adb reverse mappings configured.");
  }

  try {
    const result = await executeRunner(["adb", "-s", deviceId, "reverse", "--list"], repoRoot, process.env);
    if (result.exitCode !== 0) {
      return summarizeInfoCheck(label, "warn", "adb reverse mappings could not be inspected.");
    }

    const lines = result.stdout
      .replaceAll(String.fromCharCode(13), "")
      .split(String.fromCharCode(10))
      .filter(Boolean);

    const missing = mappings.filter((mapping) => {
      const parts = mapping.split(/\s+/).filter(Boolean);
      return !lines.some((line) => parts.every((part) => line.includes(part)));
    });

    return missing.length === 0
      ? summarizeInfoCheck(label, "pass", `Configured adb reverse mappings are active for ${deviceId}.`)
      : summarizeInfoCheck(label, "warn", `Missing adb reverse mapping(s) for ${deviceId}: ${missing.join(", ")}`);
  } catch {
    return summarizeInfoCheck(label, "warn", "adb reverse mappings could not be inspected.");
  }
}

function summarizeFileCheck(name: string, filePath: string): DoctorCheck {
  const exists = existsSync(filePath);
  return {
    name,
    status: exists ? "pass" : "fail",
    detail: exists ? `${filePath} exists.` : `${filePath} is missing.`,
  };
}

async function collectHarnessChecks(repoRoot: string): Promise<DoctorCheck[]> {
  const harnessConfigPath = path.resolve(repoRoot, DEFAULT_HARNESS_CONFIG_PATH);
  const checks: DoctorCheck[] = [summarizeFileCheck("sample harness config", harnessConfigPath)];
  if (!existsSync(harnessConfigPath)) {
    return checks;
  }

  const parsedConfig = await parseHarnessConfig(repoRoot, DEFAULT_HARNESS_CONFIG_PATH);
  const sample = parsedConfig.sample;
  if (isRecord(sample)) {
    const goldenFlow = readNonEmptyString(sample, "golden_flow");
    if (goldenFlow) {
      checks.push(summarizeInfoCheck("sample golden flow", "pass", `Configured golden flow: ${goldenFlow}`));
    }
  }

  const platforms = parsedConfig.platforms;
  if (isRecord(platforms)) {
    for (const [platform, config] of Object.entries(platforms)) {
      if (!isRecord(config)) {
        continue;
      }
      const runnerScript = readNonEmptyString(config, "runner_script");
      const interruptionPolicy = readNonEmptyString(config, "interruption_policy");
      const launchUrl = readNonEmptyString(config, "launch_url");
      const deviceId = readNonEmptyString(config, "device_udid") ?? (platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
      const adbReverseMappings = readStringArray(config, "adb_reverse");
      if (runnerScript) {
        checks.push(summarizeFileCheck(`${platform} phase1 runner`, path.resolve(repoRoot, runnerScript)));
      }
      if (interruptionPolicy) {
        checks.push(summarizeFileCheck(`${platform} interruption policy`, path.resolve(repoRoot, interruptionPolicy)));
      }
      const phase1Flow = path.resolve(repoRoot, DEFAULT_FLOWS[platform as Platform]);
      checks.push(summarizeFileCheck(`${platform} phase1 flow`, phase1Flow));
      if (launchUrl) {
        try {
          const url = new URL(launchUrl);
          if (url.hostname && url.port) {
            checks.push(await checkTcpReachability(`${platform} launch URL`, url.hostname, Number(url.port)));
          }
        } catch {
          checks.push(summarizeInfoCheck(`${platform} launch URL`, "warn", `${launchUrl} could not be parsed for reachability checks.`));
        }
      }
      if (platform === "android") {
        checks.push(await checkAdbReverseMappings("android adb reverse", deviceId, adbReverseMappings, repoRoot));
      }
    }
  }

  const phase3Validations = parsedConfig.phase3_validations;
  if (isRecord(phase3Validations)) {
    for (const [profile, config] of Object.entries(phase3Validations)) {
      if (!isRecord(config)) {
        continue;
      }
      const runnerScript = readNonEmptyString(config, "runner_script");
      const flows = readStringArray(config, "flows");
      if (runnerScript) {
        checks.push(summarizeFileCheck(`${profile} runner`, path.resolve(repoRoot, runnerScript)));
      }
      for (const flow of flows) {
        checks.push(summarizeFileCheck(`${profile} flow`, path.resolve(repoRoot, flow)));
      }
    }
  }

  return checks;
}

function summarizeOptionalArtifactCheck(name: string, artifactPath: string, kind: "file" | "directory"): DoctorCheck {
  const exists = kind === "directory" ? existsSync(artifactPath) : existsSync(artifactPath);
  return {
    name,
    status: exists ? "pass" : "warn",
    detail: exists
      ? `${artifactPath} is available for installation.`
      : `${artifactPath} is not present. The runner can still proceed if the app is already installed or an override env is provided.`,
  };
}

function collectArtifactChecks(repoRoot: string): DoctorCheck[] {
  return (["native_android", "native_ios", "flutter_android"] as RunnerProfile[]).map((profile) => {
    const spec = getInstallArtifactSpec(profile);
    const artifactPath = resolveInstallArtifactPath(repoRoot, profile);
    return summarizeOptionalArtifactCheck(
      `${profile} artifact`,
      artifactPath ?? `No artifact path configured for ${profile}`,
      spec?.kind ?? "file",
    );
  });
}

async function collectRuntimeStateChecks(repoRoot: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const androidState = await executeRunner(["adb", "-s", process.env.DEVICE_ID ?? "emulator-5554", "get-state"], repoRoot, process.env);
    checks.push(
      summarizeInfoCheck(
        "android target state",
        androidState.exitCode === 0 && androidState.stdout.trim() === "device" ? "pass" : "warn",
        androidState.exitCode === 0 ? `Android target state: ${androidState.stdout.trim() || "unknown"}` : "Android target state could not be confirmed.",
      ),
    );
  } catch {
    checks.push(summarizeInfoCheck("android target state", "warn", "Android target state could not be confirmed."));
  }

  try {
    const iosBoot = await executeRunner(["xcrun", "simctl", "bootstatus", process.env.SIM_UDID ?? "ADA078B9-3C6B-4875-8B85-A7789F368816", "-b"], repoRoot, process.env);
    checks.push(
      summarizeInfoCheck(
        "ios target boot status",
        iosBoot.exitCode === 0 ? "pass" : "warn",
        iosBoot.exitCode === 0 ? "Selected iOS simulator is booted." : "Selected iOS simulator is not booted.",
      ),
    );
  } catch {
    checks.push(summarizeInfoCheck("ios target boot status", "warn", "Selected iOS simulator is not booted."));
  }

  return checks;
}

async function collectInstallStateChecks(repoRoot: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const androidPackage = await executeRunner(["adb", "-s", process.env.DEVICE_ID ?? "emulator-5554", "shell", "pm", "path", "com.epam.mobitru"], repoRoot, process.env);
    checks.push({
      name: "native_android install state",
      status: androidPackage.exitCode === 0 && androidPackage.stdout.includes("package:") ? "pass" : "warn",
      detail:
        androidPackage.exitCode === 0 && androidPackage.stdout.includes("package:")
          ? "com.epam.mobitru is installed on the selected Android device."
          : "com.epam.mobitru is not confirmed as installed on the selected Android device.",
    });
  } catch {
    checks.push({
      name: "native_android install state",
      status: "warn",
      detail: "Android install state could not be verified.",
    });
  }

  try {
    const flutterPackage = await executeRunner(["adb", "-s", process.env.DEVICE_ID ?? "emulator-5554", "shell", "pm", "path", "com.epam.mobitru"], repoRoot, process.env);
    checks.push({
      name: "flutter_android install state",
      status: flutterPackage.exitCode === 0 && flutterPackage.stdout.includes("package:") ? "pass" : "warn",
      detail:
        flutterPackage.exitCode === 0 && flutterPackage.stdout.includes("package:")
          ? "Flutter Android app id is installed on the selected Android device."
          : "Flutter Android app id is not confirmed as installed on the selected Android device.",
    });
  } catch {
    checks.push({
      name: "flutter_android install state",
      status: "warn",
      detail: "Flutter Android install state could not be verified.",
    });
  }

  try {
    const iosPackage = await executeRunner(
      ["xcrun", "simctl", "get_app_container", process.env.SIM_UDID ?? "ADA078B9-3C6B-4875-8B85-A7789F368816", "com.epam.mobitru.demoapp"],
      repoRoot,
      process.env,
    );
    checks.push({
      name: "native_ios install state",
      status: iosPackage.exitCode === 0 ? "pass" : "warn",
      detail:
        iosPackage.exitCode === 0
          ? "com.epam.mobitru.demoapp is installed on the selected iOS simulator."
          : "com.epam.mobitru.demoapp is not confirmed as installed on the selected iOS simulator.",
    });
  } catch {
    checks.push({
      name: "native_ios install state",
      status: "warn",
      detail: "iOS install state could not be verified.",
    });
  }

  try {
    const artifactRoot = path.resolve(repoRoot, "artifacts");
    if (existsSync(artifactRoot)) {
      const artifactFiles = await listArtifacts(artifactRoot, repoRoot);
      const errorLogs = artifactFiles.filter((filePath) => filePath.endsWith("command.stderr.log"));
      let detectedConflict = false;

      for (const relativePath of errorLogs) {
        const absolutePath = path.resolve(repoRoot, relativePath);
        const content = (await readFile(absolutePath, "utf8")).toLowerCase();
        if (content.includes("install_failed_version_downgrade")) {
          checks.push({
            name: "android install conflict signal",
            status: "warn",
            detail: `Detected INSTALL_FAILED_VERSION_DOWNGRADE in ${relativePath}. Installed app may be newer than the artifact being deployed.`,
          });
          detectedConflict = true;
          break;
        }
        if (
          content.includes("install_failed_update_incompatible") ||
          content.includes("signatures do not match") ||
          content.includes("signature") && content.includes("incompatible") ||
          content.includes("certificate") && content.includes("mismatch")
        ) {
          checks.push({
            name: "android install conflict signal",
            status: "warn",
            detail: `Detected a signature or certificate install conflict in ${relativePath}. You may need to manually uninstall the existing app before installing a differently signed build.`,
          });
          detectedConflict = true;
          break;
        }
      }

      if (!detectedConflict) {
        checks.push({
          name: "android install conflict signal",
          status: "pass",
          detail: "No recent Android install conflict signal was detected in recorded stderr logs.",
        });
      }
    }
  } catch {
    checks.push({
      name: "android install conflict signal",
      status: "warn",
      detail: "Recent Android install conflict logs could not be inspected.",
    });
  }

  return checks;
}

export async function typeTextWithMaestro(input: TypeTextInput): Promise<ToolResult<TypeTextData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");

  if (input.platform === "ios") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile, text: input.text, command: [], exitCode: null },
      nextSuggestions: ["type_text currently executes Android input text only. iOS text entry is not yet wired through this repo."],
    };
  }

  const escaped = input.text.replaceAll(" ", "%s");
  const command = ["adb", "-s", deviceId, "shell", "input", "text", escaped];
  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, text: input.text, command, exitCode: 0 },
      nextSuggestions: ["Run type_text without dryRun to perform Android text entry."],
    };
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, text: input.text, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check Android device state and focused input field before retrying type_text."],
  };
}

export async function resolveUiTargetWithMaestro(input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });

  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, input.platform === "android" ? "full" : "partial"),
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling resolve_ui_target."],
    };
  }

  if (input.platform === "ios") {
    const idbCommand = buildIosUiDescribeCommand(input.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816");
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command: idbCommand,
        exitCode: input.dryRun ? 0 : null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: ["resolve_ui_target currently provides actionable target resolution for Android only. Use inspect_ui artifacts for iOS manual inspection."],
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["resolve_ui_target dry-run only previews the capture command. Run it without --dry-run to resolve against the live Android hierarchy."],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
  if (isAndroidUiSnapshotFailure(snapshot)) {
    return {
      status: "failed",
      reasonCode: snapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.outputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [snapshot.message],
    };
  }

  if (snapshot.readExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(snapshot.readExecution.stderr, snapshot.readExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.readExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["Could not read the Android UI hierarchy before resolving the target. Check device state and retry."],
    };
  }

  const result = { query, ...snapshot.queryResult };
  const resolution = buildUiTargetResolution(query, result, "full");
  return {
    status: resolution.status === "resolved" ? "success" : "partial",
    reasonCode: reasonCodeForResolutionStatus(resolution.status),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: snapshot.relativeOutputPath,
      query,
      command: snapshot.command,
      exitCode: snapshot.readExecution.exitCode,
      result,
      resolution,
      supportLevel: "full",
      content: snapshot.readExecution.stdout,
      summary: snapshot.summary,
    },
    nextSuggestions: resolution.status === "resolved"
      ? []
      : buildResolutionNextSuggestions(resolution.status, "resolve_ui_target"),
  };
}

export async function tapElementWithMaestro(input: TapElementInput): Promise<ToolResult<TapElementData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const resolveResult = await resolveUiTargetWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  const query = resolveResult.data.query;

  if (resolveResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        matchCount: resolveResult.data.resolution.matchCount,
        resolution: resolveResult.data.resolution,
        matchedNode: resolveResult.data.resolution.matchedNode,
        resolvedBounds: resolveResult.data.resolution.resolvedBounds,
        resolvedX: resolveResult.data.resolution.resolvedPoint?.x,
        resolvedY: resolveResult.data.resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  const resolution = resolveResult.data.resolution;
  if (input.dryRun && (resolution.status === "unsupported" || resolution.status === "not_executed")) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: ["tap_element dry-run does not resolve live UI selectors. Run resolve_ui_target or tap_element without --dry-run to resolve against the current hierarchy."],
    };
  }
  if (resolveResult.status !== "success" || !resolution.resolvedPoint || !resolution.resolvedBounds || !resolution.matchedNode) {
    return {
      status: "partial",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(resolution.status, "tap_element"),
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const tapCommand = ["adb", "-s", deviceId, "shell", "input", "tap", String(resolution.resolvedPoint.x), String(resolution.resolvedPoint.y)];
  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: { dryRun: true, runnerProfile, query, matchCount: resolution.matchCount, resolution, matchedNode: resolution.matchedNode, resolvedBounds: resolution.resolvedBounds, resolvedX: resolution.resolvedPoint.x, resolvedY: resolution.resolvedPoint.y, command: tapCommand, exitCode: 0, supportLevel: "full" },
      nextSuggestions: ["Run tap_element without dryRun to perform the resolved Android tap."],
    };
  }

  const execution = await executeRunner(tapCommand, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : REASON_CODES.actionTapFailed,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: resolveResult.artifacts,
    data: { dryRun: false, runnerProfile, query, matchCount: resolution.matchCount, resolution, matchedNode: resolution.matchedNode, resolvedBounds: resolution.resolvedBounds, resolvedX: resolution.resolvedPoint.x, resolvedY: resolution.resolvedPoint.y, command: tapCommand, exitCode: execution.exitCode, supportLevel: "full" },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check Android device state before retrying tap_element."],
  };
}

export async function typeIntoElementWithMaestro(input: TypeIntoElementInput): Promise<ToolResult<TypeIntoElementData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const resolveResult = await resolveUiTargetWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  const query = resolveResult.data.query;
  const resolution = resolveResult.data.resolution;

  if (resolveResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: resolveResult.data.command.length > 0 ? [resolveResult.data.command] : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  if (input.dryRun && (resolution.status === "unsupported" || resolution.status === "not_executed")) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: resolveResult.data.command.length > 0 ? [resolveResult.data.command] : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: ["type_into_element dry-run does not resolve live UI selectors. Run resolve_ui_target or type_into_element without --dry-run to resolve against the current hierarchy."],
    };
  }

  if (resolveResult.status !== "success" || !resolution.resolvedPoint) {
    return {
      status: "partial",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(resolution.status, "type_into_element"),
    };
  }

  if (input.platform === "ios") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: ["type_into_element currently provides actionable element input for Android only. Use inspect_ui artifacts for iOS manual inspection."],
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const focusCommand = ["adb", "-s", deviceId, "shell", "input", "tap", String(resolution.resolvedPoint.x), String(resolution.resolvedPoint.y)];
  const typeCommand = ["adb", "-s", deviceId, "shell", "input", "text", escapeAndroidInputText(input.value)];
  const commands = [focusCommand, typeCommand];

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands,
        exitCode: 0,
        supportLevel: "full",
      },
      nextSuggestions: ["Run type_into_element without dryRun to focus the resolved Android element and enter text."],
    };
  }

  const focusExecution = await executeRunner(focusCommand, repoRoot, process.env);
  if (focusExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.actionFocusFailed,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: false,
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands,
        exitCode: focusExecution.exitCode,
        supportLevel: "full",
      },
      nextSuggestions: ["Could not focus the resolved Android element before typing. Check device state and retry."],
    };
  }

  const typeExecution = await executeRunner(typeCommand, repoRoot, process.env);
  return {
    status: typeExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: typeExecution.exitCode === 0 ? REASON_CODES.ok : REASON_CODES.actionTypeFailed,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: false,
      runnerProfile,
      query,
      value: input.value,
      resolution,
      commands,
      exitCode: typeExecution.exitCode,
      supportLevel: "full",
    },
    nextSuggestions: typeExecution.exitCode === 0 ? [] : ["Check Android focus state before retrying type_into_element."],
  };
}

export async function waitForUiWithMaestro(input: WaitForUiInput): Promise<ToolResult<WaitForUiData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
  const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? Math.floor(input.timeoutMs) : DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs = typeof input.intervalMs === "number" && input.intervalMs > 0 ? Math.floor(input.intervalMs) : DEFAULT_WAIT_INTERVAL_MS;
  const waitUntil = normalizeWaitForUiMode(input.waitUntil);
  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling wait_for_ui."],
    };
  }

  if (input.platform === "ios") {
    const idbCommand = buildIosUiDescribeCommand(input.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816");
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: idbCommand,
        exitCode: input.dryRun ? 0 : null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
      },
      nextSuggestions: ["wait_for_ui currently performs active polling for Android only. Use inspect_ui artifacts for iOS manual inspection."],
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["wait_for_ui dry-run only previews the capture command. Run it without --dry-run to poll the live Android hierarchy."],
    };
  }

  let polls = 0;
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;
  let consecutiveCaptureFailures = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    polls += 1;
    lastSnapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      consecutiveCaptureFailures += 1;
      if (shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: consecutiveCaptureFailures, maxConsecutiveFailures: DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES })) {
        return {
          status: "failed",
          reasonCode: lastSnapshot.reasonCode,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.outputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [`Android UI hierarchy capture failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`],
        };
      }
    } else if (lastSnapshot.readExecution.exitCode !== 0) {
      consecutiveCaptureFailures += 1;
      if (shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: consecutiveCaptureFailures, maxConsecutiveFailures: DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES })) {
        return {
          status: "failed",
          reasonCode: buildFailureReason(lastSnapshot.readExecution.stderr, lastSnapshot.readExecution.exitCode),
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.readExecution.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [`Android UI hierarchy reads failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`],
        };
      }
    } else {
      consecutiveCaptureFailures = 0;
    }
    if (!isAndroidUiSnapshotFailure(lastSnapshot) && lastSnapshot.readExecution.exitCode === 0 && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, ...lastSnapshot.queryResult },
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: [],
      };
    }
    if (Date.now() < deadline) {
      await delay(intervalMs);
    }
  }

  if (lastSnapshot && isAndroidUiSnapshotFailure(lastSnapshot)) {
    return {
      status: "failed",
      reasonCode: lastSnapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: lastSnapshot.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: lastSnapshot.command,
        exitCode: lastSnapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: [lastSnapshot.message],
    };
  }

  const timeoutSnapshot = !lastSnapshot || isAndroidUiSnapshotFailure(lastSnapshot)
    ? undefined
    : lastSnapshot;
  const result = timeoutSnapshot ? { query, ...timeoutSnapshot.queryResult } : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
  return {
    status: "partial",
    reasonCode: reasonCodeForWaitTimeout(waitUntil),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: polls,
    artifacts: timeoutSnapshot ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
      query,
      timeoutMs,
      intervalMs,
      waitUntil,
      polls,
      command: timeoutSnapshot?.command ?? command,
      exitCode: timeoutSnapshot?.readExecution.exitCode ?? null,
      result,
      supportLevel: "full",
      content: timeoutSnapshot?.readExecution.stdout,
      summary: timeoutSnapshot?.summary,
    },
    nextSuggestions: [`Timed out waiting for Android UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`],
  };
}

export async function scrollAndResolveUiTargetWithMaestro(input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
  const maxSwipes = typeof input.maxSwipes === "number" && input.maxSwipes >= 0 ? Math.floor(input.maxSwipes) : DEFAULT_SCROLL_MAX_SWIPES;
  const swipeDurationMs = typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0 ? Math.floor(input.swipeDurationMs) : DEFAULT_SCROLL_DURATION_MS;
  const swipeDirection = normalizeScrollDirection(input.swipeDirection);
  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, input.platform === "android" ? "full" : "partial"),
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling scroll_and_resolve_ui_target."],
    };
  }

  if (input.platform === "ios") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: input.dryRun ? 0 : null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: ["scroll_and_resolve_ui_target currently provides actionable scrolling for Android only. Use inspect_ui artifacts for iOS manual inspection."],
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? "emulator-5554";
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const previewSwipe = buildScrollSwipeCoordinates([], swipeDirection, swipeDurationMs);
  const previewSwipeCommand = ["adb", "-s", deviceId, "shell", "input", "swipe", String(previewSwipe.start.x), String(previewSwipe.start.y), String(previewSwipe.end.x), String(previewSwipe.end.y), String(previewSwipe.durationMs)];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [[...dumpCommand, ...readCommand], previewSwipeCommand],
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["scroll_and_resolve_ui_target dry-run only previews capture and swipe commands. Run it without --dry-run to resolve against the live Android hierarchy."],
    };
  }

  let swipesPerformed = 0;
  const commandHistory: string[][] = [];
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;

  while (swipesPerformed <= maxSwipes) {
    lastSnapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      return {
        status: "failed",
        reasonCode: lastSnapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.outputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory: [...commandHistory, lastSnapshot.command],
          exitCode: lastSnapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [lastSnapshot.message],
      };
    }

    commandHistory.push(lastSnapshot.command);
    if (lastSnapshot.readExecution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(lastSnapshot.readExecution.stderr, lastSnapshot.readExecution.exitCode),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["Could not read the Android UI hierarchy while scrolling for target resolution. Check device state and retry."],
      };
    }

    const result = { query, ...lastSnapshot.queryResult };
    const resolution = buildUiTargetResolution(query, result, "full");
    if (resolution.status !== "no_match") {
      return {
        status: resolution.status === "resolved" ? "success" : "partial",
        reasonCode: reasonCodeForResolutionStatus(resolution.status),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: resolution.status === "resolved" ? [] : buildResolutionNextSuggestions(resolution.status, "scroll_and_resolve_ui_target"),
      };
    }

    if (swipesPerformed === maxSwipes) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.noMatch,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: ["Reached maxSwipes without finding a matching Android target. Narrow the selector or increase maxSwipes."],
      };
    }

    const swipe = buildScrollSwipeCoordinates(lastSnapshot.nodes, swipeDirection, swipeDurationMs);
    const swipeCommand = ["adb", "-s", deviceId, "shell", "input", "swipe", String(swipe.start.x), String(swipe.start.y), String(swipe.end.x), String(swipe.end.y), String(swipe.durationMs)];
    commandHistory.push(swipeCommand);
    const swipeExecution = await executeRunner(swipeCommand, repoRoot, process.env);
    if (swipeExecution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.actionScrollFailed,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: swipeExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: ["Android swipe failed while searching for the target. Check device state and retry scroll_and_resolve_ui_target."],
      };
    }

    swipesPerformed += 1;
  }

  return {
    status: "partial",
    reasonCode: REASON_CODES.noMatch,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: swipesPerformed + 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: defaultOutputPath,
      query,
      maxSwipes,
      swipeDirection,
      swipeDurationMs,
      swipesPerformed,
      commandHistory,
      exitCode: null,
      result: { query, totalMatches: 0, matches: [] },
      resolution: buildUiTargetResolution(query, { query, totalMatches: 0, matches: [] }, "full"),
      supportLevel: "full",
    },
    nextSuggestions: ["Reached the end of scroll_and_resolve_ui_target without a resolvable Android match."],
  };
}

export async function tapWithMaestro(input: TapInput): Promise<ToolResult<TapData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");

  if (input.platform === "ios") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile, x: input.x, y: input.y, command: [], exitCode: null },
      nextSuggestions: ["tap currently executes Android coordinate taps only. iOS coordinate tap is not yet wired through this repo."],
    };
  }

  const command = ["adb", "-s", deviceId, "shell", "input", "tap", String(input.x), String(input.y)];
  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, x: input.x, y: input.y, command, exitCode: 0 },
      nextSuggestions: ["Run tap without dryRun to perform the actual Android coordinate tap."],
    };
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, x: input.x, y: input.y, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check Android device state and coordinates before retrying tap."],
  };
}

export async function inspectUiWithMaestro(input: InspectUiInput): Promise<ToolResult<InspectUiData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  if (input.platform === "ios") {
    const iosRelativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.json`);
    const iosAbsoluteOutputPath = path.resolve(repoRoot, iosRelativeOutputPath);
    const idbCommand = buildIosUiDescribeCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: true, runnerProfile, outputPath: iosRelativeOutputPath, command: idbCommand, exitCode: 0, supportLevel: "partial", platformSupportNote: "iOS inspect_ui captures hierarchy through idb; query and action parity remain partial." },
        nextSuggestions: ["Run inspect_ui without dryRun to capture an actual iOS hierarchy dump through idb."],
      };
    }

    const idbProbe = await executeRunner(buildIdbCommand(["--help"]), repoRoot, process.env).catch(() => undefined);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, outputPath: iosRelativeOutputPath, command: idbCommand, exitCode: idbProbe?.exitCode ?? null, supportLevel: "partial", platformSupportNote: "iOS inspect_ui depends on idb availability in the local environment." },
        nextSuggestions: ["iOS inspect_ui in this repo requires idb. Install idb-companion and fb-idb, then retry inspect_ui."],
      };
    }

    await mkdir(path.dirname(iosAbsoluteOutputPath), { recursive: true });
    const idbExecution = await executeRunner(idbCommand, repoRoot, process.env);
    if (idbExecution.exitCode === 0) {
      await writeFile(iosAbsoluteOutputPath, idbExecution.stdout, "utf8");
    }

    return {
      status: idbExecution.exitCode === 0 ? "success" : "partial",
      reasonCode: idbExecution.exitCode === 0 ? REASON_CODES.ok : REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: idbExecution.exitCode === 0 ? [toRelativePath(repoRoot, iosAbsoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: iosRelativeOutputPath,
        command: idbCommand,
        exitCode: idbExecution.exitCode,
        supportLevel: "partial",
        platformSupportNote: "iOS inspect_ui can capture hierarchy artifacts, but downstream query/action tooling is still partial compared with Android.",
        content: idbExecution.exitCode === 0 ? idbExecution.stdout : undefined,
        summary: idbExecution.exitCode === 0 ? parseIosInspectSummary(idbExecution.stdout) : undefined,
      },
      nextSuggestions: idbExecution.exitCode === 0 ? [] : ["Ensure idb companion is available for the selected simulator and retry inspect_ui."],
    };
  }

  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command: [...dumpCommand, ...readCommand], exitCode: 0, supportLevel: "full" },
      nextSuggestions: ["Run inspect_ui without dryRun to capture an actual Android hierarchy dump."],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command: dumpCommand, exitCode: dumpExecution.exitCode, supportLevel: "full" },
      nextSuggestions: ["Check Android device state and ensure uiautomator dump is permitted before retrying inspect_ui."],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: readExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: readExecution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      command: readCommand,
      exitCode: readExecution.exitCode,
      supportLevel: "full",
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary: readExecution.exitCode === 0 ? parseInspectUiSummary(readExecution.stdout) : undefined,
    },
    nextSuggestions: readExecution.exitCode === 0 ? [] : ["Check Android device state before retrying inspect_ui."],
  };
}

export async function queryUiWithMaestro(input: QueryUiInput): Promise<ToolResult<QueryUiData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.${input.platform === "android" ? "xml" : "json"}`),
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: input.platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one query selector: resourceId, contentDesc, text, className, or clickable."],
    };
  }

  if (input.platform === "ios") {
    const iosRelativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.json`);
    const iosAbsoluteOutputPath = path.resolve(repoRoot, iosRelativeOutputPath);
    const idbCommand = buildIosUiDescribeCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: iosRelativeOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "partial",
        },
        nextSuggestions: ["Run query_ui without dryRun to capture an iOS hierarchy artifact. Structured iOS querying is still partial in this repo."],
      };
    }

    const idbProbe = await executeRunner(buildIdbCommand(["--help"]), repoRoot, process.env).catch(() => undefined);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: iosRelativeOutputPath,
          query,
          command: idbCommand,
          exitCode: idbProbe?.exitCode ?? null,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "partial",
        },
        nextSuggestions: ["iOS query_ui requires idb for hierarchy capture. Install idb-companion and fb-idb, or use inspect_ui as the fallback."],
      };
    }

    await mkdir(path.dirname(iosAbsoluteOutputPath), { recursive: true });
    const idbExecution = await executeRunner(idbCommand, repoRoot, process.env);
    if (idbExecution.exitCode === 0) {
      await writeFile(iosAbsoluteOutputPath, idbExecution.stdout, "utf8");
    }

    return {
      status: "partial",
      reasonCode: idbExecution.exitCode === 0 ? REASON_CODES.unsupportedOperation : REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: idbExecution.exitCode === 0 ? [toRelativePath(repoRoot, iosAbsoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: iosRelativeOutputPath,
        query,
        command: idbCommand,
        exitCode: idbExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
        content: idbExecution.exitCode === 0 ? idbExecution.stdout : undefined,
        summary: idbExecution.exitCode === 0 ? parseIosInspectSummary(idbExecution.stdout) : undefined,
      },
      nextSuggestions: idbExecution.exitCode === 0
        ? ["This repo can capture iOS hierarchy output, but query_ui does not yet provide equivalent structured iOS matching. Use inspect_ui content/artifacts for manual inspection."]
        : ["Ensure idb companion is available for the selected simulator and retry query_ui."],
    };
  }

  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${input.platform}-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: relativeOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["Run query_ui without dryRun to capture an Android hierarchy dump and return matched nodes."],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        query,
        command,
        exitCode: dumpExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["Check Android device state and ensure uiautomator dump is permitted before retrying query_ui."],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  const nodes = readExecution.exitCode === 0 ? parseAndroidUiHierarchyNodes(readExecution.stdout) : [];
  const summary = readExecution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = readExecution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: readExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: readExecution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      query,
      command,
      exitCode: readExecution.exitCode,
      result: { query, ...queryResult },
      supportLevel: "full",
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary,
    },
    nextSuggestions: readExecution.exitCode !== 0
      ? ["Check Android device state before retrying query_ui."]
      : queryResult.totalMatches === 0
        ? ["No Android nodes matched the provided selectors. Broaden the query or run inspect_ui to review nearby nodes."]
        : query.limit !== undefined && queryResult.totalMatches > queryResult.matches.length
          ? ["More Android nodes matched than were returned. Increase query limit or narrow the selector."]
        : [],
  };
}

export async function terminateAppWithMaestro(input: TerminateAppInput): Promise<ToolResult<TerminateAppData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const appId = input.appId ?? selection.appId;
  const command = input.platform === "android"
    ? ["adb", "-s", deviceId, "shell", "am", "force-stop", appId]
    : ["xcrun", "simctl", "terminate", deviceId, appId];

  if (input.dryRun) {
    return { status: "success", reasonCode: REASON_CODES.ok, sessionId: input.sessionId, durationMs: Date.now() - startTime, attempts: 1, artifacts: [], data: { dryRun: true, runnerProfile, appId, command, exitCode: 0 }, nextSuggestions: ["Run terminate_app without dryRun to stop the target app."] };
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, appId, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check device state and appId before retrying terminate_app."],
  };
}

export async function takeScreenshotWithMaestro(input: ScreenshotInput): Promise<ToolResult<ScreenshotData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "screenshots", input.sessionId, `${input.platform}-${runnerProfile}.png`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const command = input.platform === "android"
    ? ["adb", "-s", deviceId, "exec-out", "screencap", "-p"]
    : ["xcrun", "simctl", "io", deviceId, "screenshot", absoluteOutputPath];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command, exitCode: 0 },
      nextSuggestions: ["Run take_screenshot without dryRun to capture an actual screenshot."],
    };
  }

  if (input.platform === "android") {
    const execution = await new Promise<CommandExecution>((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      const stdoutChunks: Buffer[] = [];
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", async (exitCode) => {
        await writeFile(absoluteOutputPath, Buffer.concat(stdoutChunks));
        resolve({ exitCode, stdout: absoluteOutputPath, stderr });
      });
    });
    return {
      status: execution.exitCode === 0 ? "success" : "failed",
      reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [toRelativePath(repoRoot, absoluteOutputPath)],
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command, exitCode: execution.exitCode },
      nextSuggestions: execution.exitCode === 0 ? [] : ["Check device state before retrying take_screenshot."],
    };
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: execution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check simulator boot state before retrying take_screenshot."],
  };
}

export async function getLogsWithMaestro(input: GetLogsInput): Promise<ToolResult<GetLogsData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const capture = buildGetLogsCapture(repoRoot, input, runnerProfile, deviceId);

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        command: capture.command,
        exitCode: 0,
        supportLevel: capture.supportLevel,
        lineCount: 0,
        linesRequested: capture.linesRequested,
        sinceSeconds: capture.sinceSeconds,
        query: input.query,
        summary: buildLogSummary("", input.query),
      },
      nextSuggestions: ["Run get_logs without dryRun to capture live device or simulator logs."],
    };
  }

  const execution = await executeRunner(capture.command, repoRoot, process.env);
  if (execution.exitCode === 0) {
    await writeFile(capture.absoluteOutputPath, execution.stdout, "utf8");
  }

  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: execution.exitCode === 0 ? [toRelativePath(repoRoot, capture.absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: capture.relativeOutputPath,
      command: capture.command,
      exitCode: execution.exitCode,
      supportLevel: capture.supportLevel,
      lineCount: execution.exitCode === 0 ? countNonEmptyLines(execution.stdout) : 0,
      linesRequested: capture.linesRequested,
      sinceSeconds: capture.sinceSeconds,
      query: input.query,
      content: execution.exitCode === 0 ? execution.stdout : undefined,
      summary: execution.exitCode === 0 ? buildLogSummary(execution.stdout, input.query) : undefined,
    },
    nextSuggestions: execution.exitCode === 0
      ? []
      : [input.platform === "android"
        ? "Check adb connectivity and the selected Android device before retrying get_logs."
        : "Check simulator boot state and log access permissions before retrying get_logs."],
  };
}

export async function getCrashSignalsWithMaestro(input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const capture = buildGetCrashSignalsCapture(repoRoot, input, runnerProfile, deviceId);

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: 0,
        supportLevel: capture.supportLevel,
        signalCount: 0,
        linesRequested: capture.linesRequested,
        entries: [],
        summary: buildLogSummary(""),
      },
      nextSuggestions: ["Run get_crash_signals without dryRun to capture live crash and ANR evidence."],
    };
  }

  if (input.platform === "android") {
    const [crashCommand, anrCommand] = capture.commands;
    const crashExecution = await executeRunner(crashCommand, repoRoot, process.env);
    const anrExecution = await executeRunner(anrCommand, repoRoot, process.env);
    const entries = anrExecution.exitCode === 0
      ? anrExecution.stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean)
      : [];
    const contentSections = [
      "# Android crash log buffer",
      crashExecution.stdout.trim(),
      "",
      "# Android ANR entries",
      entries.join(String.fromCharCode(10)),
    ];
    const content = contentSections.join(String.fromCharCode(10)).trim() + String.fromCharCode(10);
    const exitCode = crashExecution.exitCode !== 0 ? crashExecution.exitCode : anrExecution.exitCode;

    if (exitCode === 0) {
      await writeFile(capture.absoluteOutputPath, content, "utf8");
    }

    return {
      status: exitCode === 0 ? "success" : "failed",
      reasonCode: exitCode === 0 ? REASON_CODES.ok : buildFailureReason(crashExecution.stderr || anrExecution.stderr, exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: exitCode === 0 ? [toRelativePath(repoRoot, capture.absoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode,
        supportLevel: capture.supportLevel,
        signalCount: entries.length + countNonEmptyLines(crashExecution.stdout),
        linesRequested: capture.linesRequested,
        entries,
        content: exitCode === 0 ? content : undefined,
        summary: exitCode === 0 ? buildLogSummary(content) : undefined,
      },
      nextSuggestions: exitCode === 0 ? [] : ["Check adb connectivity and the selected Android device before retrying get_crash_signals."],
    };
  }

  const homeExecution = await executeRunner(capture.commands[0], repoRoot, process.env);
  if (homeExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(homeExecution.stderr, homeExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: homeExecution.exitCode,
        supportLevel: capture.supportLevel,
        signalCount: 0,
        linesRequested: capture.linesRequested,
        entries: [],
        summary: buildLogSummary(""),
      },
      nextSuggestions: ["Check simulator boot state before retrying get_crash_signals."],
    };
  }

  const simulatorHome = homeExecution.stdout.trim();
  const crashRoot = path.join(simulatorHome, "Library", "Logs", "CrashReporter");
  const entries = await listRelativeFiles(crashRoot);
  const content = [
    "# iOS simulator crash reporter root",
    crashRoot,
    "",
    "# Crash reporter entries",
    entries.length > 0 ? entries.join(String.fromCharCode(10)) : "<no crash entries found>",
  ].join(String.fromCharCode(10)) + String.fromCharCode(10);
  await writeFile(capture.absoluteOutputPath, content, "utf8");

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [toRelativePath(repoRoot, capture.absoluteOutputPath)],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: capture.relativeOutputPath,
      commands: capture.commands,
      exitCode: homeExecution.exitCode,
      supportLevel: capture.supportLevel,
      signalCount: entries.length,
      linesRequested: capture.linesRequested,
      entries,
      content,
      summary: buildLogSummary(content),
    },
    nextSuggestions: entries.length === 0 ? ["No simulator crash reporter files were found. Re-run after reproducing a crash or ANR-like issue."] : [],
  };
}

export async function collectDiagnosticsWithMaestro(input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const capture = buildCollectDiagnosticsCapture(repoRoot, input, runnerProfile, deviceId);

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });
  if (input.platform === "ios") {
    await mkdir(capture.absoluteOutputPath, { recursive: true });
  }

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: 0,
        supportLevel: capture.supportLevel,
        artifactCount: 0,
        artifacts: [],
      },
      nextSuggestions: ["Run collect_diagnostics without dryRun to capture a real Android bugreport or iOS simulator diagnostics bundle."],
    };
  }

  const execution = await executeRunner(capture.commands[0], repoRoot, process.env);
  if (execution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(execution.stderr, execution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: capture.relativeOutputPath,
        commands: capture.commands,
        exitCode: execution.exitCode,
        supportLevel: capture.supportLevel,
        artifactCount: 0,
        artifacts: [],
      },
      nextSuggestions: [input.platform === "android"
        ? "Check adb connectivity and available device storage before retrying collect_diagnostics."
        : "Check simulator boot state before retrying collect_diagnostics."],
    };
  }

  const collectedArtifacts = input.platform === "android"
    ? [toRelativePath(repoRoot, capture.absoluteOutputPath)]
    : await listArtifacts(capture.absoluteOutputPath, repoRoot);
  const artifacts = [capture.relativeOutputPath];

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts,
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: capture.relativeOutputPath,
      commands: capture.commands,
      exitCode: execution.exitCode,
      supportLevel: capture.supportLevel,
      artifactCount: collectedArtifacts.length,
      artifacts,
    },
    nextSuggestions: [],
  };
}

export async function collectDebugEvidenceWithMaestro(input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.md`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const logOutputPath = path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.logs.txt`);
  const crashOutputPath = path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.crash.txt`);
  const diagnosticsOutputPath = input.platform === "android"
    ? path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.diagnostics.zip`)
    : path.posix.join("artifacts", "debug-evidence", input.sessionId, `${input.platform}-${runnerProfile}.diagnostics`);

  const logsResult = await getLogsWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: logOutputPath,
    lines: input.logLines,
    sinceSeconds: input.sinceSeconds,
    query: input.query,
    dryRun: input.dryRun,
  });
  const crashResult = await getCrashSignalsWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: crashOutputPath,
    lines: input.logLines,
    dryRun: input.dryRun,
  });
  const diagnosticsResult = input.includeDiagnostics
    ? await collectDiagnosticsWithMaestro({
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      outputPath: diagnosticsOutputPath,
      dryRun: input.dryRun,
    })
    : undefined;

  const evidencePaths = [
    ...logsResult.artifacts,
    ...crashResult.artifacts,
    ...(diagnosticsResult?.artifacts ?? []),
  ];
  const interestingSignals = mergeSignalSummaries(logsResult.data.summary, crashResult.data.summary);
  const narrative = buildDebugNarrative({
    logSummary: logsResult.data.summary,
    crashSummary: crashResult.data.summary,
    includeDiagnostics: Boolean(input.includeDiagnostics),
    diagnosticsArtifacts: diagnosticsResult?.data.artifactCount ?? 0,
  });

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (!input.dryRun) {
    const report = [
      "# Debug Evidence Summary",
      `- Platform: ${input.platform}`,
      `- Runner profile: ${runnerProfile}`,
      `- Query: ${input.query ?? "<none>"}`,
      "",
      "## Narrative",
      ...narrative.map((line) => `- ${line}`),
      "",
      "## Top Signals",
      ...(interestingSignals.length > 0 ? interestingSignals.map((signal) => `- [${signal.category}] x${String(signal.count)} ${signal.sample}`) : ["- <no interesting signals detected>"]),
      "",
      "## Evidence Paths",
      ...(evidencePaths.length > 0 ? evidencePaths.map((item) => `- ${item}`) : ["- <no evidence paths recorded>"]),
    ].join(String.fromCharCode(10)) + String.fromCharCode(10);
    await writeFile(absoluteOutputPath, report, "utf8");
  }

  const allSucceeded = logsResult.status === "success" && crashResult.status === "success" && (!diagnosticsResult || diagnosticsResult.status === "success");
  const anySucceeded = logsResult.status === "success" || crashResult.status === "success" || diagnosticsResult?.status === "success";
  const status = allSucceeded ? "success" : anySucceeded ? "partial" : "failed";
  const reasonCode = allSucceeded
    ? REASON_CODES.ok
    : logsResult.reasonCode !== REASON_CODES.ok
      ? logsResult.reasonCode
      : crashResult.reasonCode !== REASON_CODES.ok
        ? crashResult.reasonCode
        : diagnosticsResult?.reasonCode ?? REASON_CODES.adapterError;
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
      logSummary: logsResult.data.summary,
      crashSummary: crashResult.data.summary,
      interestingSignals,
      evidencePaths: [...summaryArtifactPath, ...evidencePaths],
      evidenceCount: summaryArtifactPath.length + evidencePaths.length,
      narrative,
    },
    nextSuggestions: status === "success"
      ? []
      : ["Use the debug evidence summary first; escalate to collect_diagnostics only when the summarized log and crash signals are still inconclusive."],
  };
}

export async function launchAppWithMaestro(input: LaunchAppInput): Promise<ToolResult<LaunchAppData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? (input.platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
  const appId = input.appId ?? selection.appId;
  const launchUrl = input.launchUrl ?? selection.launchUrl;

  const launchCommand =
    runnerProfile === "phase1"
      ? input.platform === "android"
        ? ["adb", "-s", deviceId, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", launchUrl ?? "", appId]
        : ["xcrun", "simctl", "openurl", deviceId, launchUrl ?? ""]
      : input.platform === "android"
        ? ["adb", "-s", deviceId, "shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]
        : ["xcrun", "simctl", "launch", deviceId, appId];

  if (runnerProfile === "phase1" && !launchUrl) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile, appId, launchCommand, exitCode: null },
      nextSuggestions: ["Provide launchUrl or ensure the harness config includes a phase1 launch_url before calling launch_app."],
    };
  }

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, appId, launchUrl, launchCommand, exitCode: 0 },
      nextSuggestions: ["Run launch_app without dryRun to perform the actual launch."],
    };
  }

  const execution = await executeRunner(launchCommand, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, appId, launchUrl, launchCommand, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : ["Check device/simulator state and launchUrl/appId values before retrying launch_app."],
  };
}

export async function installAppWithMaestro(input: InstallAppInput): Promise<ToolResult<InstallAppData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;

  if (runnerProfile === "phase1") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        installCommand: [],
        exitCode: null,
      },
      nextSuggestions: ["phase1 relies on Expo Go already being installed. Use doctor to verify launch URL/device readiness instead of install_app."],
    };
  }

  const artifactPath = resolveInstallArtifactPath(repoRoot, runnerProfile, input.artifactPath);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const installCommand =
    input.platform === "android"
      ? ["adb", "-s", input.deviceId ?? selection.deviceId ?? "emulator-5554", "install", "-r", artifactPath ?? ""]
      : ["xcrun", "simctl", "install", input.deviceId ?? selection.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816", artifactPath ?? ""];

  const spec = getInstallArtifactSpec(runnerProfile);
  const exists = artifactPath ? existsSync(artifactPath) : false;
  const artifactMissing = !artifactPath || !spec || !exists;
  if (artifactMissing) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        artifactPath,
        installCommand,
        exitCode: null,
      },
      nextSuggestions: ["Provide a valid artifactPath or set the runner-specific artifact environment variable before calling install_app."],
    };
  }

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        artifactPath,
        installCommand,
        exitCode: 0,
      },
      nextSuggestions: ["Run install_app without dryRun to perform the actual installation."],
    };
  }

  const execution = await executeRunner(installCommand, repoRoot, process.env);
  const status = execution.exitCode === 0 ? "success" : "failed";
  const reasonCode = execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode);
  const nextSuggestions = execution.exitCode === 0
    ? []
    : [
        "Review the install stderr for downgrade or signature conflicts before retrying.",
        "If the conflict is caused by a differently signed build, manually uninstall the existing app before reinstalling.",
      ];

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      artifactPath,
      installCommand,
      exitCode: execution.exitCode,
    },
    nextSuggestions,
  };
}

export async function runDoctor(
  input: DoctorInput = {},
): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>> {
  const repoRoot = resolveRepoPath();
  const startTime = Date.now();
  const sessionId = `doctor-${Date.now()}`;
  const checks: DoctorCheck[] = [];

  checks.push(await checkCommandVersion(repoRoot, "node", ["--version"], "node"));
  checks.push(await checkCommandVersion(repoRoot, "pnpm", ["--version"], "pnpm"));
  checks.push(await checkCommandVersion(repoRoot, "python3", ["--version"], "python3"));
  checks.push(await checkCommandVersion(repoRoot, "adb", ["version"], "adb"));
  checks.push(await checkCommandVersion(repoRoot, "xcrun", ["simctl", "help"], "xcrun simctl"));
  checks.push(await checkCommandVersion(repoRoot, "maestro", ["--version"], "maestro"));
  const idbCliPath = resolveIdbCliPath();
  checks.push(idbCliPath ? await checkCommandVersion(repoRoot, idbCliPath, ["--help"], "idb") : summarizeInfoCheck("idb", "fail", "No idb CLI binary is configured."));
  checks.push(summarizeInfoCheck("idb companion", resolveIdbCompanionPath() ? "pass" : "fail", resolveIdbCompanionPath() ? `${resolveIdbCompanionPath()} is available.` : "No idb_companion binary is configured."));
  try {
    const idbTargetResult = await executeRunner(buildIdbCommand(["list-targets"]), repoRoot, process.env);
    const targetUdid = process.env.SIM_UDID ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    checks.push(summarizeInfoCheck(
      "idb target visibility",
      idbTargetResult.exitCode === 0 && idbTargetResult.stdout.includes(targetUdid) ? "pass" : "warn",
      idbTargetResult.exitCode === 0 && idbTargetResult.stdout.includes(targetUdid)
        ? `idb can see target ${targetUdid}.`
        : `idb could not confirm target ${targetUdid}.`,
    ));
  } catch {
    checks.push(summarizeInfoCheck("idb target visibility", "warn", "idb target visibility could not be verified."));
  }

  checks.push(...(await collectHarnessChecks(repoRoot)));
  checks.push(...collectArtifactChecks(repoRoot));
  checks.push(...(await collectInstallStateChecks(repoRoot)));
  checks.push(...(await collectRuntimeStateChecks(repoRoot)));

  const deviceResult = await listAvailableDevices({ includeUnavailable: input.includeUnavailable });
  checks.push(summarizeDeviceCheck("android devices", deviceResult.data.android.filter((device) => device.available).length));
  checks.push(summarizeDeviceCheck("ios simulators", deviceResult.data.ios.filter((device) => device.available).length));

  let status: ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  if (checks.some((check) => check.status === "fail")) {
    status = "failed";
    reasonCode = REASON_CODES.configurationError;
  } else if (checks.some((check) => check.status === "warn")) {
    status = "partial";
    reasonCode = REASON_CODES.deviceUnavailable;
  }

  const nextSuggestions = checks
    .filter((check) => check.status !== "pass")
    .map((check) => `Resolve ${check.name}: ${check.detail}`);

  return {
    status,
    reasonCode,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      checks,
      devices: deviceResult.data,
    },
    nextSuggestions,
  };
}
