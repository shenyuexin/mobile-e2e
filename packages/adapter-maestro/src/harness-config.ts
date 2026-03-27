import type { Platform, RunnerProfile } from "@mobile-e2e-mcp/contracts";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export interface ArtifactDirectory {
  absolutePath: string;
  relativePath: string;
}

export interface HarnessSelection {
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

export interface SessionDefaults {
  deviceId?: string;
  appId: string;
  sampleName: string;
  artifactsRoot: string;
}

export const DEFAULT_HARNESS_CONFIG_PATH = "configs/harness/sample-harness.yaml";
export const DEFAULT_RUNNER_PROFILE: RunnerProfile = "phase1";
export const DEFAULT_ANDROID_DEVICE_ID = "emulator-5554";
export const DEFAULT_IOS_SIMULATOR_UDID = "ADA078B9-3C6B-4875-8B85-A7789F368816";
export const DEFAULT_ANDROID_APP_ID = "host.exp.exponent";
export const DEFAULT_IOS_APP_ID = "host.exp.Exponent";

export const DEFAULT_FLOWS: Record<Platform, string> = {
  android: "flows/samples/react-native/android-login-smoke.yaml",
  ios: "flows/samples/react-native/ios-login-smoke.yaml",
};

function buildMissingHarnessConfigError(harnessConfigPath: string): Error {
  return new Error(
    `Missing harness config: ${harnessConfigPath}. The canonical harness config is required for the repository baseline at ${DEFAULT_HARNESS_CONFIG_PATH}.`,
  );
}

export function buildDefaultDeviceId(platform: Platform): string {
  return platform === "android" ? DEFAULT_ANDROID_DEVICE_ID : DEFAULT_IOS_SIMULATOR_UDID;
}

export function buildDefaultAppId(platform: Platform): string {
  return platform === "android" ? DEFAULT_ANDROID_APP_ID : DEFAULT_IOS_APP_ID;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readPositiveNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function ensureRunnerProfilePlatform(platform: Platform, runnerProfile: RunnerProfile): void {
  if (runnerProfile === "native_ios" && platform !== "ios") {
    throw new Error(`Runner profile ${runnerProfile} requires platform ios.`);
  }

  if ((runnerProfile === "native_android" || runnerProfile === "flutter_android") && platform !== "android") {
    throw new Error(`Runner profile ${runnerProfile} requires platform android.`);
  }
}

export async function parseHarnessConfig(repoRoot: string, harnessConfigPath: string): Promise<Record<string, unknown>> {
  const absoluteConfigPath = path.resolve(repoRoot, harnessConfigPath);
  let rawConfig: string;

  try {
    rawConfig = await readFile(absoluteConfigPath, "utf8");
  } catch (error: unknown) {
    const isMissingConfig = error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
    if (isMissingConfig) {
      throw buildMissingHarnessConfigError(harnessConfigPath);
    }
    throw error;
  }

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

export async function loadHarnessSelection(
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
    deviceId: selection.deviceId,
    appId: selection.appId,
    sampleName: selection.sampleName,
    artifactsRoot: artifactsDir.relativePath,
  };
}
