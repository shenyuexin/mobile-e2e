import type { Platform, ResetAppStateStrategy, RunnerProfile } from "@mobile-e2e-mcp/contracts";
import { createAndroidDeviceRuntimeHooks } from "./device-runtime-android.js";
import { createIosDeviceRuntimeHooks } from "./device-runtime-ios.js";

export interface GetLogsCapturePlan {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  command: string[];
  supportLevel: "full" | "partial";
  linesRequested?: number;
  sinceSeconds: number;
  appId?: string;
  appFilterApplied: boolean;
}

export interface GetCrashSignalsCapturePlan {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  commands: string[][];
  supportLevel: "full" | "partial";
  linesRequested: number;
}

export interface CollectDiagnosticsCapturePlan {
  relativeOutputPath: string;
  absoluteOutputPath: string;
  commandOutputPath?: string;
  commands: string[][];
  supportLevel: "full" | "partial";
}

export interface RecordScreenPlan {
  commandLabels: string[];
  commands: string[][];
  supportLevel: "full" | "partial";
  dryRunSuggestion: string;
  failureSuggestion: string;
}

export interface CrashSignalExecutionResult {
  exitCode: number | null;
  stderr: string;
  commands: string[][];
  entries: string[];
  signalCount: number;
  content?: string;
  /** Platform-specific extension data. Consumers should check platform before reading. */
  platformExtensions?: Record<string, unknown>;
}

export interface DeviceRuntimePlatformHooks {
  platform: Platform;
  buildLaunchCommand: (params: {
    runnerProfile: RunnerProfile;
    deviceId: string;
    appId: string;
    launchUrl?: string;
  }) => string[];
  buildInstallCommand: (params: {
    deviceId: string;
    artifactPath: string;
  }) => string[];
  buildResetPlan: (params: {
    strategy: ResetAppStateStrategy;
    deviceId: string;
    appId: string;
    artifactPath?: string;
  }) => {
    commandLabels: string[];
    commands: string[][];
    supportLevel: "full" | "partial";
    unsupportedReason?: string;
  };
  buildTerminateCommand: (deviceId: string, appId: string) => string[];
  buildScreenshotCommand: (deviceId: string, absoluteOutputPath: string) => string[];
  screenshotUsesStdoutCapture: boolean;
  screenshotSupportLevel: "full" | "partial";
  screenshotDryRunSuggestion: string;
  screenshotFailureSuggestion: string;
  buildRecordScreenPlan: (params: {
    sessionId: string;
    deviceId: string;
    durationMs: number;
    bitrateMbps?: number;
    absoluteOutputPath: string;
  }) => RecordScreenPlan;
  buildGetLogsCapturePlan: (params: {
    repoRoot: string;
    sessionId: string;
    outputPath?: string;
    runnerProfile: string;
    deviceId: string;
    sinceSeconds: number;
    linesRequested?: number;
    appId?: string;
    appFilterApplied?: boolean;
  }) => GetLogsCapturePlan;
  applyGetLogsAppFilter?: (params: {
    repoRoot: string;
    capture: GetLogsCapturePlan;
    deviceId: string;
    appId: string;
    dryRun?: boolean;
  }) => Promise<GetLogsCapturePlan>;
  buildGetCrashSignalsCapturePlan: (params: {
    repoRoot: string;
    sessionId: string;
    outputPath?: string;
    runnerProfile: string;
    deviceId: string;
    linesRequested: number;
  }) => GetCrashSignalsCapturePlan;
  executeCrashSignalsCapture: (params: {
    repoRoot: string;
    capture: GetCrashSignalsCapturePlan;
    deviceId: string;
    appId?: string;
  }) => Promise<CrashSignalExecutionResult>;
  buildCollectDiagnosticsCapturePlan: (params: {
    repoRoot: string;
    sessionId: string;
    outputPath?: string;
    runnerProfile: string;
    deviceId: string;
  }) => CollectDiagnosticsCapturePlan;
  prepareDiagnosticsOutputPath?: (absoluteOutputPath: string) => Promise<void>;
  collectDiagnosticsArtifacts: (params: {
    repoRoot: string;
    capture: CollectDiagnosticsCapturePlan;
  }) => Promise<string[]>;
}

const DEVICE_RUNTIME_HOOKS: Record<Platform, DeviceRuntimePlatformHooks> = {
  android: createAndroidDeviceRuntimeHooks(),
  ios: createIosDeviceRuntimeHooks(),
};

export function resolveDeviceRuntimePlatformHooks(platform: Platform): DeviceRuntimePlatformHooks {
  return DEVICE_RUNTIME_HOOKS[platform];
}
