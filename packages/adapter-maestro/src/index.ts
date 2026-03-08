import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REASON_CODES,
  type DeviceInfo,
  type DoctorCheck,
  type DoctorInput,
  type InspectUiInput,
  type InspectUiNode,
  type InspectUiSummary,
  type InstallAppInput,
  type LaunchAppInput,
  type ListDevicesInput,
  type ScreenshotInput,
  type TapInput,
  type TerminateAppInput,
  type TypeTextInput,
  type Platform,
  type ReasonCode,
  type RunFlowInput,
  type RunnerProfile,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { parse } from "yaml";

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
  content?: string;
  summary?: InspectUiSummary;
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

function decodeXmlText(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&#10;", "\n")
    .replaceAll("&#39;", "'");
}

function parseInspectUiSummary(xml: string): InspectUiSummary {
  const nodes: InspectUiNode[] = [];
  const nodeRegex = /<node([^>]*)\/?>(?:<\/node>)?/g;

  for (const match of xml.matchAll(nodeRegex)) {
    const rawAttributes = match[1] ?? "";
    const attributes = Object.fromEntries(
      Array.from(rawAttributes.matchAll(/([\w:-]+)="([^"]*)"/g)).map(([, key, value]) => [key, decodeXmlText(value) ?? ""]),
    );

    const node: InspectUiNode = {
      index: attributes.index ? Number(attributes.index) : undefined,
      text: attributes.text || undefined,
      resourceId: attributes["resource-id"] || undefined,
      className: attributes.class || undefined,
      packageName: attributes.package || undefined,
      contentDesc: attributes["content-desc"] || undefined,
      clickable: attributes.clickable === "true",
      enabled: attributes.enabled !== "false",
      scrollable: attributes.scrollable === "true",
      bounds: attributes.bounds || undefined,
    };
    nodes.push(node);
  }

  const sampleNodes = nodes.filter((node) => node.clickable || node.text || node.contentDesc || node.resourceId).slice(0, 25);
  return {
    totalNodes: nodes.length,
    clickableNodes: nodes.filter((node) => node.clickable).length,
    scrollableNodes: nodes.filter((node) => node.scrollable).length,
    nodesWithText: nodes.filter((node) => Boolean(node.text)).length,
    nodesWithContentDesc: nodes.filter((node) => Boolean(node.contentDesc)).length,
    sampleNodes,
  };
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
    androidDevices = adbResult.exitCode === 0 ? parseAdbDevices(adbResult.stdout, includeUnavailable) : [];
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
    iosDevices = iosResult.exitCode === 0 ? parseIosDevices(iosResult.stdout, includeUnavailable) : [];
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
      nextSuggestions: ["type_text currently supports Android input text only. iOS text entry is not yet wired in this repo."],
    };
  }

  const escaped = input.text.replaceAll(" ", "%s");
  const command = ["adb", "-s", deviceId, "shell", "input", "text", escaped];
  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
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
      nextSuggestions: ["tap currently supports Android coordinate taps only. Use inspect_ui output to derive Android coordinates."],
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
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile, outputPath: relativeOutputPath, command: [], exitCode: null },
      nextSuggestions: ["inspect_ui currently supports Android via uiautomator dump. iOS hierarchy export is not yet wired in this repo."],
    };
  }

  const dumpCommand = ["adb", "-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/view.xml"];
  const readCommand = ["adb", "-s", deviceId, "shell", "cat", "/sdcard/view.xml"];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command: [...dumpCommand, ...readCommand], exitCode: 0 },
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
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command: dumpCommand, exitCode: dumpExecution.exitCode },
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
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary: readExecution.exitCode === 0 ? parseInspectUiSummary(readExecution.stdout) : undefined,
    },
    nextSuggestions: readExecution.exitCode === 0 ? [] : ["Check Android device state before retrying inspect_ui."],
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
