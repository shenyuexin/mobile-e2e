import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CollectDiagnosticsData,
  CollectDiagnosticsInput,
  DeviceInfo,
  DebugSignalSummary,
  DoctorCheck,
  GetCrashSignalsData,
  GetCrashSignalsInput,
  GetLogsData,
  GetLogsInput,
  Platform,
  LogSummary,
  ReasonCode,
  RecordScreenData,
  RecordScreenInput,
  ResetAppStateStrategy,
  RunnerProfile,
  ScreenshotData,
  ScreenshotInput,
  TerminateAppData,
  TerminateAppInput,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { buildCapabilityProfile } from "./capability-model.js";
import { buildDefaultDeviceId, DEFAULT_FLOWS, DEFAULT_HARNESS_CONFIG_PATH, DEFAULT_RUNNER_PROFILE, isRecord, loadHarnessSelection, parseHarnessConfig, readNonEmptyString, readStringArray, resolveRepoPath } from "./harness-config.js";
import {
  type CollectDiagnosticsCapturePlan,
  type GetCrashSignalsCapturePlan,
  type GetLogsCapturePlan,
  resolveDeviceRuntimePlatformHooks,
} from "./device-runtime-platform.js";
import {
  buildExecutionEvidence,
  buildFailureReason,
  countNonEmptyLines,
  executeRunner,
  normalizePositiveInteger,
  toRelativePath,
} from "./runtime-shared.js";
import { classifyDebugSignal } from "./js-debug.js";
import { spawn } from "node:child_process";

export type GetLogsCapture = GetLogsCapturePlan;
export type GetCrashSignalsCapture = GetCrashSignalsCapturePlan;
export type CollectDiagnosticsCapture = CollectDiagnosticsCapturePlan;

export interface InstallArtifactSpec {
  kind: "file" | "directory";
  envVar: string;
  relativePath: string;
}

const DEFAULT_GET_LOGS_LINES = 200;
const DEFAULT_GET_LOGS_SINCE_SECONDS = 60;
const DEFAULT_GET_CRASH_LINES = 120;
const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;
const DEFAULT_RECORD_SCREEN_DURATION_MS = 15_000;
const MAX_ANDROID_SCREENRECORD_DURATION_MS = 180_000;

function normalizeRecordDurationMs(value: number | undefined, platform: Platform): number {
  const normalized = normalizePositiveInteger(value, DEFAULT_RECORD_SCREEN_DURATION_MS);
  if (platform === "android") {
    return Math.min(MAX_ANDROID_SCREENRECORD_DURATION_MS, normalized);
  }
  return normalized;
}

function normalizeRecordBitrateMbps(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Number(value.toFixed(2));
}

function isInterestingDebugLine(line: string): boolean {
  const normalized = line.toLowerCase();
  if (
    line.startsWith("#")
    || normalized.includes("<no crash entries found>")
    || normalized.includes("<no crash snippets collected>")
    || normalized.includes("/library/logs/crashreporter")
    || normalized.endsWith("crashreporter")
  ) {
    return false;
  }
  return normalized.includes("fatal")
    || normalized.includes("exception")
    || normalized.includes("error")
    || normalized.includes("crash")
    || normalized.includes("anr")
    || normalized.includes("timeout")
    || normalized.includes("failed")
    || normalized.includes("unable to");
}

function buildLogSummary(content: string, query?: string): LogSummary {
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

export function getInstallArtifactSpec(runnerProfile: RunnerProfile): InstallArtifactSpec | undefined {
  if (runnerProfile === "native_android") return { kind: "file", envVar: "NATIVE_ANDROID_APK_PATH", relativePath: "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk" };
  if (runnerProfile === "native_ios") return { kind: "directory", envVar: "NATIVE_IOS_APP_PATH", relativePath: "examples/demo-ios-app/build/Build/Products/Debug-iphonesimulator/MobiTruKotlin.app" };
  if (runnerProfile === "flutter_android") return { kind: "file", envVar: "FLUTTER_APK_PATH", relativePath: "examples/demo-flutter-app/build/app/outputs/flutter-apk/app-debug.apk" };
  return undefined;
}

export function resolveInstallArtifactPath(repoRoot: string, runnerProfile: RunnerProfile, explicitArtifactPath?: string): string | undefined {
  if (explicitArtifactPath) {
    return path.isAbsolute(explicitArtifactPath) ? explicitArtifactPath : path.resolve(repoRoot, explicitArtifactPath);
  }
  const spec = getInstallArtifactSpec(runnerProfile);
  if (!spec) return undefined;
  const fromEnv = process.env[spec.envVar];
  return fromEnv ? fromEnv : path.resolve(repoRoot, spec.relativePath);
}

export function buildLaunchCommandWithRuntime(platform: Platform, params: {
  runnerProfile: RunnerProfile;
  deviceId: string;
  appId: string;
  launchUrl?: string;
}): string[] {
  return resolveDeviceRuntimePlatformHooks(platform).buildLaunchCommand(params);
}

export function buildInstallCommandWithRuntime(platform: Platform, params: {
  deviceId: string;
  artifactPath: string;
}): string[] {
  return resolveDeviceRuntimePlatformHooks(platform).buildInstallCommand(params);
}

export function buildResetPlanWithRuntime(platform: Platform, params: {
  strategy: ResetAppStateStrategy;
  deviceId: string;
  appId: string;
  artifactPath?: string;
}): {
  commandLabels: string[];
  commands: string[][];
  supportLevel: "full" | "partial";
  unsupportedReason?: string;
} {
  return resolveDeviceRuntimePlatformHooks(platform).buildResetPlan(params);
}

function parseAdbDevices(stdout: string, includeUnavailable: boolean): DeviceInfo[] {
  return stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("List of devices attached")).map((line) => {
    const [id, state = "unknown"] = line.split(/\s+/);
    return { id, platform: "android" as const, state, available: state === "device" };
  }).filter((device) => includeUnavailable || device.available);
}

function parseIosDevices(stdout: string, includeUnavailable: boolean): DeviceInfo[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) return [];
  const devicesSection = parsed.devices;
  if (!isRecord(devicesSection)) return [];
  const devicesByName = new Map<string, DeviceInfo>();
  for (const runtimeDevices of Object.values(devicesSection)) {
    if (!Array.isArray(runtimeDevices)) continue;
    for (const device of runtimeDevices) {
      if (!isRecord(device)) continue;
      const id = readNonEmptyString(device, "udid");
      const name = readNonEmptyString(device, "name");
      const state = readNonEmptyString(device, "state") ?? "unknown";
      const isAvailable = device.isAvailable === true;
      if (!id || !name) continue;
      const normalizedDevice: DeviceInfo = { id, name, platform: "ios", state, available: isAvailable && state.toLowerCase() !== "unavailable" };
      const existing = devicesByName.get(name);
      const existingScore = existing ? Number(existing.available) * 10 + Number(existing.state === "Booted") : -1;
      const nextScore = Number(normalizedDevice.available) * 10 + Number(normalizedDevice.state === "Booted");
      if (!existing || nextScore > existingScore) devicesByName.set(name, normalizedDevice);
    }
  }
  return Array.from(devicesByName.values()).filter((device) => includeUnavailable || device.available);
}

export function parseIosXctraceDevices(stdout: string, includeUnavailable: boolean): DeviceInfo[] {
  const devices: DeviceInfo[] = [];
  let currentSection: "devices" | "devices_offline" | "simulators" | undefined;
  const lines = stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line === "== Devices ==") {
      currentSection = "devices";
      continue;
    }
    if (line === "== Devices Offline ==") {
      currentSection = "devices_offline";
      continue;
    }
    if (line === "== Simulators ==") {
      currentSection = "simulators";
      continue;
    }
    if (currentSection !== "devices" && currentSection !== "devices_offline") {
      continue;
    }
    const match = line.match(/^(.*?)\s*\(([^()]*)\)\s*\(([A-F0-9-]{10,})\)$/i);
    if (!match) {
      continue;
    }
    const [, rawName, , id] = match;
    const name = rawName.trim();
    const available = currentSection === "devices";
    const device: DeviceInfo = {
      id,
      name,
      platform: "ios",
      state: available ? "Connected" : "Offline",
      available,
    };
    if (includeUnavailable || device.available) {
      devices.push(device);
    }
  }
  return devices;
}

export function parseIosDevicectlDevices(stdout: string, includeUnavailable: boolean): DeviceInfo[] {
  const devices: DeviceInfo[] = [];
  const lines = stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("Name") || line.startsWith("---") || line.startsWith("Failed to load")) {
      continue;
    }
    const match = line.match(/^(.*?)\s{2,}\S+\s{2,}([A-F0-9-]{10,})\s{2,}(available \(paired\)|available|unavailable)\s{2,}.*$/i);
    if (!match) {
      continue;
    }
    const [, rawName, id, rawState] = match;
    const available = rawState.toLowerCase().startsWith("available");
    const device: DeviceInfo = {
      id,
      name: rawName.trim(),
      platform: "ios",
      state: available ? "Connected" : "Offline",
      available,
    };
    if (includeUnavailable || device.available) {
      devices.push(device);
    }
  }
  return devices;
}

export function mergeIosPhysicalDevices(
  xctraceDevices: DeviceInfo[],
  devicectlDevices: DeviceInfo[],
  includeUnavailable: boolean,
): DeviceInfo[] {
  const mergedByName = new Map<string, DeviceInfo>();
  for (const device of xctraceDevices) {
    if (device.name) {
      mergedByName.set(device.name, device);
    }
  }
  for (const device of devicectlDevices) {
    const existing = device.name ? mergedByName.get(device.name) : undefined;
    if (existing) {
      mergedByName.set(device.name!, {
        ...existing,
        state: device.available ? device.state : existing.state,
        available: device.available || existing.available,
      });
      continue;
    }
    if (device.name) {
      mergedByName.set(device.name, device);
    }
  }
  return [...mergedByName.values()].filter((device) => includeUnavailable || device.available);
}

function mergeIosDiscoveredDevices(simulatorDevices: DeviceInfo[], physicalDevices: DeviceInfo[]): DeviceInfo[] {
  const merged = new Map<string, DeviceInfo>();
  for (const device of [...physicalDevices, ...simulatorDevices]) {
    const key = `${device.platform}:${device.id}`;
    merged.set(key, device);
  }
  return [...merged.values()];
}

export async function listAvailableDevices(repoRoot: string, includeUnavailable = false): Promise<{ android: DeviceInfo[]; ios: DeviceInfo[]; status: "success" | "partial"; reasonCode: ReasonCode; nextSuggestions: string[] }> {
  let androidDevices: DeviceInfo[] = [];
  let iosDevices: DeviceInfo[] = [];
  let status: "success" | "partial" = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  const nextSuggestions: string[] = [];
  try {
    const adbResult = await executeRunner(["adb", "devices"], repoRoot, process.env);
    androidDevices = adbResult.exitCode === 0 ? parseAdbDevices(adbResult.stdout, includeUnavailable).map((device) => ({ ...device, capabilities: buildCapabilityProfile("android", null) })) : [];
    if (adbResult.exitCode !== 0) {
      status = "partial"; reasonCode = REASON_CODES.deviceUnavailable; nextSuggestions.push("adb is unavailable or returned an error while listing Android devices.");
    }
  } catch {
    status = "partial"; reasonCode = REASON_CODES.deviceUnavailable; nextSuggestions.push("adb is unavailable in the current environment.");
  }
  try {
    const iosResult = await executeRunner(["xcrun", "simctl", "list", "devices", "available", "--json"], repoRoot, process.env);
    const simulatorDevices = iosResult.exitCode === 0 ? parseIosDevices(iosResult.stdout, includeUnavailable) : [];
    if (iosResult.exitCode !== 0) { status = "partial"; if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable; nextSuggestions.push("xcrun simctl returned an error while listing iOS simulators."); }
    let physicalDevices: DeviceInfo[] = [];
    try {
      const xctraceResult = await executeRunner(["xcrun", "xctrace", "list", "devices"], repoRoot, process.env);
      const xctraceDevices = xctraceResult.exitCode === 0 ? parseIosXctraceDevices(xctraceResult.stdout, true) : [];
      if (xctraceResult.exitCode !== 0) {
        status = "partial";
        if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable;
        nextSuggestions.push("xcrun xctrace returned an error while listing physical iOS devices.");
      }
      let devicectlDevices: DeviceInfo[] = [];
      try {
        const devicectlResult = await executeRunner(["xcrun", "devicectl", "list", "devices"], repoRoot, process.env);
        devicectlDevices = devicectlResult.exitCode === 0 ? parseIosDevicectlDevices(devicectlResult.stdout, true) : [];
        if (devicectlResult.exitCode !== 0) {
          status = "partial";
          if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable;
          nextSuggestions.push("xcrun devicectl returned an error while listing physical iOS devices.");
        }
      } catch {
        status = "partial";
        if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable;
        nextSuggestions.push("xcrun devicectl is unavailable in the current environment.");
      }
      physicalDevices = mergeIosPhysicalDevices(xctraceDevices, devicectlDevices, includeUnavailable);
    } catch {
      status = "partial";
      if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable;
      nextSuggestions.push("xcrun xctrace is unavailable in the current environment.");
    }
    iosDevices = mergeIosDiscoveredDevices(simulatorDevices, physicalDevices).map((device) => ({
      ...device,
      capabilities: buildCapabilityProfile("ios", null),
    }));
  } catch {
    status = "partial"; if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable; nextSuggestions.push("xcrun simctl is unavailable in the current environment.");
  }
  if (androidDevices.length === 0 && iosDevices.length === 0 && status === "success") {
    status = "partial"; reasonCode = REASON_CODES.deviceUnavailable; nextSuggestions.push("No available Android devices or iOS simulators were detected.");
  }
  return { android: androidDevices, ios: iosDevices, status, reasonCode, nextSuggestions };
}

export function buildIosLogPredicateForApp(appId: string): string {
  const escaped = appId.replaceAll("'", "\\'");
  return `eventMessage CONTAINS[c] '${escaped}' OR processImagePath CONTAINS[c] '${escaped}' OR senderImagePath CONTAINS[c] '${escaped}'`;
}

export async function resolveAndroidAppPid(repoRoot: string, deviceId: string, appId: string): Promise<string | undefined> {
  const execution = await executeRunner(["adb", "-s", deviceId, "shell", "pidof", appId], repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
  if (execution.exitCode !== 0) return undefined;
  const candidate = execution.stdout.trim().split(/\s+/)[0];
  return candidate && /^\d+$/.test(candidate) ? candidate : undefined;
}

export function buildGetLogsCapture(repoRoot: string, input: GetLogsInput, runnerProfile: RunnerProfile, deviceId: string, appId?: string, appFilterApplied = false): GetLogsCapture {
  const platform = input.platform ?? "android";
  const sinceSeconds = normalizePositiveInteger(input.sinceSeconds, DEFAULT_GET_LOGS_SINCE_SECONDS);
  const linesRequested = platform === "android" ? normalizePositiveInteger(input.lines, DEFAULT_GET_LOGS_LINES) : undefined;
  const hooks = resolveDeviceRuntimePlatformHooks(platform);
  return hooks.buildGetLogsCapturePlan({
    repoRoot,
    sessionId: input.sessionId,
    outputPath: input.outputPath,
    runnerProfile,
    deviceId,
    sinceSeconds,
    linesRequested,
    appId,
    appFilterApplied,
  });
}

export function buildGetCrashSignalsCapture(repoRoot: string, input: GetCrashSignalsInput, runnerProfile: RunnerProfile, deviceId: string): GetCrashSignalsCapture {
  const platform = input.platform ?? "android";
  const linesRequested = normalizePositiveInteger(input.lines, DEFAULT_GET_CRASH_LINES);
  const hooks = resolveDeviceRuntimePlatformHooks(platform);
  return hooks.buildGetCrashSignalsCapturePlan({
    repoRoot,
    sessionId: input.sessionId,
    outputPath: input.outputPath,
    runnerProfile,
    deviceId,
    linesRequested,
  });
}

export function buildCollectDiagnosticsCapture(repoRoot: string, input: CollectDiagnosticsInput, runnerProfile: RunnerProfile, deviceId: string): CollectDiagnosticsCapture {
  const hooks = resolveDeviceRuntimePlatformHooks(input.platform ?? "android");
  return hooks.buildCollectDiagnosticsCapturePlan({
    repoRoot,
    sessionId: input.sessionId,
    outputPath: input.outputPath,
    runnerProfile,
    deviceId,
  });
}

export function summarizeInfoCheck(name: string, status: DoctorCheck["status"], detail: string): DoctorCheck {
  return { name, status, detail };
}

function summarizeFileCheck(name: string, filePath: string): DoctorCheck {
  const exists = existsSync(filePath);
  return { name, status: exists ? "pass" : "fail", detail: exists ? `${filePath} exists.` : `${filePath} is missing.` };
}

async function checkTcpReachability(label: string, host: string, port: number): Promise<DoctorCheck> {
  const net = await import("node:net");
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeoutMs = 1500;
    const finish = (status: DoctorCheck["status"], detail: string) => { socket.destroy(); resolve(summarizeInfoCheck(label, status, detail)); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("pass", `${host}:${String(port)} is reachable.`));
    socket.once("timeout", () => finish("warn", `${host}:${String(port)} did not respond within ${String(timeoutMs)}ms.`));
    socket.once("error", (error) => finish("warn", error.message));
  });
}

async function checkAdbReverseMappings(label: string, deviceId: string, mappings: string[], repoRoot: string): Promise<DoctorCheck> {
  if (mappings.length === 0) return summarizeInfoCheck(label, "pass", "No adb reverse mappings configured.");
  try {
    const result = await executeRunner(["adb", "-s", deviceId, "reverse", "--list"], repoRoot, process.env);
    if (result.exitCode !== 0) return summarizeInfoCheck(label, "warn", "adb reverse mappings could not be inspected.");
    const lines = result.stdout.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).filter(Boolean);
    const missing = mappings.filter((mapping) => { const parts = mapping.split(/\s+/).filter(Boolean); return !lines.some((line) => parts.every((part) => line.includes(part))); });
    return missing.length === 0 ? summarizeInfoCheck(label, "pass", `Configured adb reverse mappings are active for ${deviceId}.`) : summarizeInfoCheck(label, "warn", `Missing adb reverse mapping(s) for ${deviceId}: ${missing.join(", ")}`);
  } catch {
    return summarizeInfoCheck(label, "warn", "adb reverse mappings could not be inspected.");
  }
}

export async function collectHarnessChecks(repoRoot: string): Promise<DoctorCheck[]> {
  const harnessConfigPath = path.resolve(repoRoot, DEFAULT_HARNESS_CONFIG_PATH);
  const checks: DoctorCheck[] = [summarizeFileCheck("sample harness config", harnessConfigPath)];
  if (!existsSync(harnessConfigPath)) return checks;
  const parsedConfig = await parseHarnessConfig(repoRoot, DEFAULT_HARNESS_CONFIG_PATH);
  const sample = parsedConfig.sample;
  if (isRecord(sample)) {
    const goldenFlow = readNonEmptyString(sample, "golden_flow");
    if (goldenFlow) checks.push(summarizeInfoCheck("sample golden flow", "pass", `Configured golden flow: ${goldenFlow}`));
  }
  const platforms = parsedConfig.platforms;
  if (isRecord(platforms)) {
    for (const [platform, config] of Object.entries(platforms)) {
      if (!isRecord(config)) continue;
      if (platform !== "android" && platform !== "ios") continue;
      const runnerScript = readNonEmptyString(config, "runner_script");
      const interruptionPolicy = readNonEmptyString(config, "interruption_policy");
      const launchUrl = readNonEmptyString(config, "launch_url");
      const deviceId = readNonEmptyString(config, "device_udid") ?? buildDefaultDeviceId(platform);
      const adbReverseMappings = readStringArray(config, "adb_reverse");
      if (runnerScript) checks.push(summarizeFileCheck(`${platform} phase1 runner`, path.resolve(repoRoot, runnerScript)));
      if (interruptionPolicy) checks.push(summarizeFileCheck(`${platform} interruption policy`, path.resolve(repoRoot, interruptionPolicy)));
      const phase1Flow = path.resolve(repoRoot, DEFAULT_FLOWS[platform as Platform]);
      checks.push(summarizeFileCheck(`${platform} phase1 flow`, phase1Flow));
      if (launchUrl) {
        try { const url = new URL(launchUrl); if (url.hostname && url.port) checks.push(await checkTcpReachability(`${platform} launch URL`, url.hostname, Number(url.port))); }
        catch { checks.push(summarizeInfoCheck(`${platform} launch URL`, "warn", `${launchUrl} could not be parsed for reachability checks.`)); }
      }
      if (platform === "android") checks.push(await checkAdbReverseMappings("android adb reverse", deviceId, adbReverseMappings, repoRoot));
    }
  }
  const phase3Validations = parsedConfig.phase3_validations;
  if (isRecord(phase3Validations)) {
    for (const [profile, config] of Object.entries(phase3Validations)) {
      if (!isRecord(config)) continue;
      const runnerScript = readNonEmptyString(config, "runner_script");
      const flows = readStringArray(config, "flows");
      if (runnerScript) checks.push(summarizeFileCheck(`${profile} runner`, path.resolve(repoRoot, runnerScript)));
      for (const flow of flows) checks.push(summarizeFileCheck(`${profile} flow`, path.resolve(repoRoot, flow)));
    }
  }
  return checks;
}

export async function terminateAppWithRuntime(input: TerminateAppInput): Promise<ToolResult<TerminateAppData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE, appId: input.appId ?? "", command: [], exitCode: null },
      nextSuggestions: ["Provide platform explicitly, or call terminate_app with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const appId = input.appId ?? selection.appId;
  const command = resolveDeviceRuntimePlatformHooks(platform).buildTerminateCommand(deviceId, appId);

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

export async function takeScreenshotWithRuntime(input: ScreenshotInput): Promise<ToolResult<ScreenshotData>> {
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
        outputPath: input.outputPath ?? path.posix.join("artifacts", "screenshots", input.sessionId, "unknown.png"),
        command: [],
        exitCode: null,
      },
      nextSuggestions: ["Provide platform explicitly, or call take_screenshot with an active sessionId so MCP can resolve platform from session context."],
    };
  }

  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const hooks = resolveDeviceRuntimePlatformHooks(input.platform);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "screenshots", input.sessionId, `${input.platform}-${runnerProfile}.png`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const command = hooks.buildScreenshotCommand(deviceId, absoluteOutputPath);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command, exitCode: 0, evidence: [buildExecutionEvidence("screenshot", relativeOutputPath, hooks.screenshotSupportLevel, "Planned screenshot artifact path.")] },
      nextSuggestions: [hooks.screenshotDryRunSuggestion],
    };
  }

  if (hooks.screenshotUsesStdoutCapture) {
    const execution = await new Promise<{ exitCode: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      const stdoutChunks: Buffer[] = [];
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", async (exitCode) => {
        await writeFile(absoluteOutputPath, Buffer.concat(stdoutChunks));
        resolve({ exitCode, stderr });
      });
    });
    return {
      status: execution.exitCode === 0 ? "success" : "failed",
      reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [toRelativePath(repoRoot, absoluteOutputPath)],
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command, exitCode: execution.exitCode, evidence: [buildExecutionEvidence("screenshot", relativeOutputPath, hooks.screenshotSupportLevel, "Captured Android screenshot artifact.")] },
      nextSuggestions: execution.exitCode === 0 ? [] : [hooks.screenshotFailureSuggestion],
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
    data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command, exitCode: execution.exitCode, evidence: execution.exitCode === 0 ? [buildExecutionEvidence("screenshot", relativeOutputPath, hooks.screenshotSupportLevel, "Captured iOS screenshot artifact.")] : undefined },
    nextSuggestions: execution.exitCode === 0 ? [] : [hooks.screenshotFailureSuggestion],
  };
}

export async function recordScreenWithRuntime(input: RecordScreenInput): Promise<ToolResult<RecordScreenData>> {
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
        outputPath: input.outputPath ?? path.posix.join("artifacts", "screen-recordings", input.sessionId, "unknown.mp4"),
        durationMs: normalizeRecordDurationMs(input.durationMs, "android"),
        bitrateMbps: normalizeRecordBitrateMbps(input.bitrateMbps),
        commandLabels: [],
        commands: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call record_screen with an active sessionId so MCP can resolve platform from session context."],
    };
  }

  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const hooks = resolveDeviceRuntimePlatformHooks(input.platform);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);
  const durationMs = normalizeRecordDurationMs(input.durationMs, input.platform);
  const bitrateMbps = normalizeRecordBitrateMbps(input.bitrateMbps);
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "screen-recordings", input.sessionId, `${input.platform}-${runnerProfile}.mp4`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  const plan = hooks.buildRecordScreenPlan({
    sessionId: input.sessionId,
    deviceId,
    durationMs,
    bitrateMbps,
    absoluteOutputPath,
  });

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
        durationMs,
        bitrateMbps,
        commandLabels: plan.commandLabels,
        commands: plan.commands,
        exitCode: 0,
        supportLevel: plan.supportLevel,
        evidence: [buildExecutionEvidence("screen_recording", relativeOutputPath, plan.supportLevel, `Planned ${input.platform === "android" ? "Android" : "iOS simulator"} screen recording artifact path.`)],
      },
      nextSuggestions: [plan.dryRunSuggestion],
    };
  }

  const [recordCommand, pullCommand, cleanupCommand] = plan.commands;
  const recordExecution = await executeRunner(recordCommand, repoRoot, process.env);
  if (recordExecution.exitCode !== 0) {
    if (cleanupCommand) {
      await executeRunner(cleanupCommand, repoRoot, process.env).catch(() => undefined);
    }
    return {
      status: "failed",
      reasonCode: buildFailureReason(recordExecution.stderr, recordExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        durationMs,
        bitrateMbps,
        commandLabels: plan.commandLabels,
        commands: plan.commands,
        exitCode: recordExecution.exitCode,
        supportLevel: plan.supportLevel,
      },
      nextSuggestions: [plan.failureSuggestion],
    };
  }

  const finalizeExecution = pullCommand ? await executeRunner(pullCommand, repoRoot, process.env) : recordExecution;
  if (cleanupCommand) {
    await executeRunner(cleanupCommand, repoRoot, process.env).catch(() => undefined);
  }

  return {
    status: finalizeExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: finalizeExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(finalizeExecution.stderr, finalizeExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: finalizeExecution.exitCode === 0 ? [relativeOutputPath] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      durationMs,
      bitrateMbps,
      commandLabels: plan.commandLabels,
      commands: plan.commands,
      exitCode: finalizeExecution.exitCode,
      supportLevel: plan.supportLevel,
      evidence: finalizeExecution.exitCode === 0 ? [buildExecutionEvidence("screen_recording", relativeOutputPath, plan.supportLevel, `Captured ${input.platform === "android" ? "Android" : "iOS simulator"} screen recording artifact.`)] : undefined,
    },
    nextSuggestions: finalizeExecution.exitCode === 0 ? [] : [input.platform === "android"
      ? "Android recording completed but artifact pull failed. Check adb device connectivity and storage path."
      : plan.failureSuggestion],
  };
}

export async function getLogsWithRuntime(input: GetLogsInput): Promise<ToolResult<GetLogsData>> {
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
        outputPath: input.outputPath ?? path.posix.join("artifacts", "logs", input.sessionId, "unknown.log"),
        command: [],
        exitCode: null,
        supportLevel: "partial",
        lineCount: 0,
        linesRequested: input.lines,
        sinceSeconds: input.sinceSeconds ?? 0,
        appId: input.appId,
        appFilterApplied: false,
        query: input.query,
      },
      nextSuggestions: ["Provide platform explicitly, or call get_logs with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const hooks = resolveDeviceRuntimePlatformHooks(input.platform);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);
  const appId = input.appId ?? selection.appId;
  let capture = buildGetLogsCapture(repoRoot, input, runnerProfile, deviceId, appId, false);

  if (appId && hooks.applyGetLogsAppFilter) {
    capture = await hooks.applyGetLogsAppFilter({ repoRoot, capture, deviceId, appId, dryRun: input.dryRun });
  }

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
        appId,
        appFilterApplied: capture.appFilterApplied,
        evidence: [buildExecutionEvidence("log", capture.relativeOutputPath, capture.supportLevel, "Planned log capture artifact path.")],
        query: input.query,
        summary: buildLogSummary("", input.query),
      },
      nextSuggestions: ["Run get_logs without dryRun to capture live device or simulator logs."],
    };
  }

  const execution = await executeRunner(capture.command, repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS });
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
      appId,
      appFilterApplied: capture.appFilterApplied,
      evidence: execution.exitCode === 0 ? [buildExecutionEvidence("log", capture.relativeOutputPath, capture.supportLevel, "Captured log artifact.")] : undefined,
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

export async function getCrashSignalsWithRuntime(input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>> {
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
        outputPath: input.outputPath ?? path.posix.join("artifacts", "crash-signals", input.sessionId, "unknown.log"),
        commands: [],
        exitCode: null,
        supportLevel: "partial",
        signalCount: 0,
        linesRequested: input.lines,
        appId: input.appId,
        entries: [],
      },
      nextSuggestions: ["Provide platform explicitly, or call get_crash_signals with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const hooks = resolveDeviceRuntimePlatformHooks(input.platform);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);
  const appId = input.appId ?? selection.appId;
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
        appId,
        entries: [],
        evidence: [buildExecutionEvidence("crash_signal", capture.relativeOutputPath, capture.supportLevel, "Planned crash-signal artifact path.")],
        summary: buildLogSummary(""),
      },
      nextSuggestions: ["Run get_crash_signals without dryRun to capture live crash and ANR evidence."],
    };
  }

  const execution = await hooks.executeCrashSignalsCapture({ repoRoot, capture, deviceId, appId });
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
      commands: execution.commands,
      exitCode: execution.exitCode,
      supportLevel: capture.supportLevel,
      signalCount: execution.signalCount,
      linesRequested: capture.linesRequested,
      appId,
      entries: execution.entries,
      evidence: execution.exitCode === 0 ? [buildExecutionEvidence("crash_signal", capture.relativeOutputPath, capture.supportLevel, "Captured crash-signal artifact.")] : undefined,
      content: execution.content,
      summary: execution.exitCode === 0 ? buildLogSummary(execution.content ?? "") : undefined,
    },
    nextSuggestions: execution.exitCode === 0
      ? (input.platform === "ios" && execution.signalCount === 0
        ? ["No simulator crash reporter files were found for the current scope. Re-run after reproducing a crash or broaden the app filter."]
        : [])
      : [input.platform === "android"
        ? "Check adb connectivity and the selected Android device before retrying get_crash_signals."
        : "Check simulator boot state before retrying get_crash_signals."],
  };
}

export async function collectDiagnosticsWithRuntime(input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>> {
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
        outputPath: input.outputPath ?? path.posix.join("artifacts", "diagnostics", input.sessionId, "unknown"),
        commands: [],
        exitCode: null,
        supportLevel: "partial",
        artifactCount: 0,
        artifacts: [],
      },
      nextSuggestions: ["Provide platform explicitly, or call collect_diagnostics with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const hooks = resolveDeviceRuntimePlatformHooks(input.platform);
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);
  const capture = buildCollectDiagnosticsCapture(repoRoot, input, runnerProfile, deviceId);

  await mkdir(path.dirname(capture.absoluteOutputPath), { recursive: true });
  if (hooks.prepareDiagnosticsOutputPath) {
    await hooks.prepareDiagnosticsOutputPath(capture.absoluteOutputPath);
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
        evidence: [buildExecutionEvidence("diagnostics_bundle", capture.relativeOutputPath, capture.supportLevel, "Planned diagnostics bundle output path.")],
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
        evidence: undefined,
      },
      nextSuggestions: [input.platform === "android"
        ? "Check adb connectivity and available device storage before retrying collect_diagnostics."
        : "Check simulator boot state before retrying collect_diagnostics."],
    };
  }

  const collectedArtifacts = await hooks.collectDiagnosticsArtifacts({ repoRoot, capture });
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
      evidence: artifacts.map((artifactPath) => buildExecutionEvidence("diagnostics_bundle", artifactPath, capture.supportLevel, "Captured diagnostics bundle or diagnostics root artifact.")),
    },
    nextSuggestions: [],
  };
}
