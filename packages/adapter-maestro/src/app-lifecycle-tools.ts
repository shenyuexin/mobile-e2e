import type { InstallAppData, InstallAppInput, LaunchAppData, LaunchAppInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { existsSync } from "node:fs";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  buildInstallCommandWithRuntime,
  buildLaunchCommandWithRuntime,
  getInstallArtifactSpec,
  resolveInstallArtifactPath,
} from "./device-runtime.js";
import { buildFailureReason, executeRunner } from "./runtime-shared.js";

export async function launchAppWithRuntime(input: LaunchAppInput): Promise<ToolResult<LaunchAppData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE, appId: input.appId ?? "", launchUrl: input.launchUrl, launchCommand: [], exitCode: null },
      nextSuggestions: ["Provide platform explicitly, or call launch_app with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const appId = input.appId ?? selection.appId;
  const launchUrl = input.launchUrl ?? selection.launchUrl;

  const launchCommand = buildLaunchCommandWithRuntime(platform, {
    runnerProfile,
    deviceId,
    appId,
    launchUrl,
  });

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

export async function installAppWithRuntime(input: InstallAppInput): Promise<ToolResult<InstallAppData>> {
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
        artifactPath: input.artifactPath,
        installCommand: [],
        exitCode: null,
      },
      nextSuggestions: ["Provide platform explicitly, or call install_app with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
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
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const installCommand = buildInstallCommandWithRuntime(platform, {
    deviceId: input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform),
    artifactPath: artifactPath ?? "",
  });

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
