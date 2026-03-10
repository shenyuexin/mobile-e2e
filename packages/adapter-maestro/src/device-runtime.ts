import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CollectDiagnosticsInput, DeviceInfo, DoctorCheck, GetCrashSignalsInput, GetLogsInput, Platform, ReasonCode, RunnerProfile } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { buildCapabilityProfile } from "./capability-model.js";
import { DEFAULT_FLOWS, DEFAULT_HARNESS_CONFIG_PATH, isRecord, parseHarnessConfig, readNonEmptyString, readStringArray } from "./harness-config.js";
import { executeRunner, normalizePositiveInteger, shellEscape } from "./runtime-shared.js";

export interface GetLogsCapture {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  command: string[];
  supportLevel: "full" | "partial";
  linesRequested?: number;
  sinceSeconds: number;
  appId?: string;
  appFilterApplied: boolean;
}

export interface GetCrashSignalsCapture {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  commands: string[][];
  supportLevel: "full" | "partial";
  linesRequested: number;
}

export interface CollectDiagnosticsCapture {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  commandOutputPath?: string;
  commands: string[][];
  supportLevel: "full" | "partial";
}

export interface InstallArtifactSpec {
  kind: "file" | "directory";
  envVar: string;
  relativePath: string;
}

const DEFAULT_GET_LOGS_LINES = 200;
const DEFAULT_GET_LOGS_SINCE_SECONDS = 60;
const DEFAULT_GET_CRASH_LINES = 120;
const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;

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
    iosDevices = iosResult.exitCode === 0 ? parseIosDevices(iosResult.stdout, includeUnavailable).map((device) => ({ ...device, capabilities: buildCapabilityProfile("ios", null) })) : [];
    if (iosResult.exitCode !== 0) { status = "partial"; if (reasonCode === REASON_CODES.ok) reasonCode = REASON_CODES.deviceUnavailable; nextSuggestions.push("xcrun simctl returned an error while listing iOS simulators."); }
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
  const sinceSeconds = normalizePositiveInteger(input.sinceSeconds, DEFAULT_GET_LOGS_SINCE_SECONDS);
  const linesRequested = input.platform === "android" ? normalizePositiveInteger(input.lines, DEFAULT_GET_LOGS_LINES) : undefined;
  const extension = input.platform === "android" ? "logcat.txt" : "simulator.log";
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "logs", input.sessionId, `${input.platform}-${runnerProfile}.${extension}`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  if (input.platform === "android") return { relativeOutputPath, absoluteOutputPath, command: ["adb", "-s", deviceId, "logcat", "-d", "-t", String(linesRequested ?? DEFAULT_GET_LOGS_LINES)], supportLevel: "full", linesRequested, sinceSeconds, appId, appFilterApplied };
  return { relativeOutputPath, absoluteOutputPath, command: ["xcrun", "simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--last", `${String(sinceSeconds)}s`], supportLevel: "full", linesRequested, sinceSeconds, appId, appFilterApplied };
}

export function buildGetCrashSignalsCapture(repoRoot: string, input: GetCrashSignalsInput, runnerProfile: RunnerProfile, deviceId: string): GetCrashSignalsCapture {
  const linesRequested = normalizePositiveInteger(input.lines, DEFAULT_GET_CRASH_LINES);
  const extension = input.platform === "android" ? "crash.txt" : "crash-manifest.txt";
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "crash-signals", input.sessionId, `${input.platform}-${runnerProfile}.${extension}`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  if (input.platform === "android") return { relativeOutputPath, absoluteOutputPath, commands: [["adb", "-s", deviceId, "logcat", "-d", "-b", "crash", "-t", String(linesRequested)], ["adb", "-s", deviceId, "shell", "ls", "-1", "/data/anr"]], supportLevel: "full", linesRequested };
  return { relativeOutputPath, absoluteOutputPath, commands: [["xcrun", "simctl", "getenv", deviceId, "HOME"]], supportLevel: "full", linesRequested };
}

export function buildCollectDiagnosticsCapture(repoRoot: string, input: CollectDiagnosticsInput, runnerProfile: RunnerProfile, deviceId: string): CollectDiagnosticsCapture {
  if (input.platform === "android") {
    const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "diagnostics", input.sessionId, `${input.platform}-${runnerProfile}.zip`);
    const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
    const commandOutputPath = absoluteOutputPath.endsWith(".zip") ? absoluteOutputPath.slice(0, -4) : absoluteOutputPath;
    return { relativeOutputPath, absoluteOutputPath, commandOutputPath, commands: [["adb", "-s", deviceId, "bugreport", commandOutputPath]], supportLevel: "full" };
  }
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "diagnostics", input.sessionId, `${input.platform}-${runnerProfile}`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  return { relativeOutputPath, absoluteOutputPath, commands: [["sh", "-lc", `printf '\n' | xcrun simctl diagnose -b --no-archive --output=${shellEscape(absoluteOutputPath)} --udid=${shellEscape(deviceId)}`]], supportLevel: "full" };
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
      const runnerScript = readNonEmptyString(config, "runner_script");
      const interruptionPolicy = readNonEmptyString(config, "interruption_policy");
      const launchUrl = readNonEmptyString(config, "launch_url");
      const deviceId = readNonEmptyString(config, "device_udid") ?? (platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816");
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
