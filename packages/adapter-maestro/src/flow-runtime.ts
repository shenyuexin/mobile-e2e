import type { ReasonCode, RunFlowData, RunFlowInput, RunnerProfile, ToolResult } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildArtifactsDir,
  buildDefaultDeviceId,
  type ArtifactDirectory,
  DEFAULT_ANDROID_DEVICE_ID,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_IOS_SIMULATOR_UDID,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import { buildFailureReason, executeRunner, toRelativePath } from "./runtime-shared.js";

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

export async function collectBasicRunResultWithRuntime(params: {
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
  execution?: { exitCode: number | null; stdout: string; stderr: string };
  unsupportedCustomFlow?: boolean;
}): Promise<ToolResult<RunFlowData>> {
  const { totalRuns, passedRuns, failedRuns } = await readRunCounts(params.artifactsDir.absolutePath);
  const artifacts = await listArtifacts(params.artifactsDir.absolutePath, params.repoRoot);

  let status: ToolResult<RunFlowData>["status"] = "success";
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

export async function runFlowWithRuntime(input: RunFlowInput): Promise<ToolResult<RunFlowData>> {
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
        harnessConfigPath: input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        runnerScript: input.runnerScript ?? "",
        flowPath: input.flowPath ?? "",
        requestedFlowPath: input.flowPath,
        configuredFlows: [],
        artifactsDir: path.posix.join("artifacts", "run-flow", input.sessionId),
        totalRuns: input.runCount ?? 1,
        passedRuns: 0,
        failedRuns: 0,
        command: [],
        exitCode: null,
        summaryLine: "",
      },
      nextSuggestions: ["Provide platform explicitly, or call run_flow with an active sessionId so MCP can resolve platform from session context."],
    };
  }
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
    return collectBasicRunResultWithRuntime({
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
    SESSION_ID: input.sessionId,
  };

  if (input.platform === "android" && input.androidReplayOptions) {
    if (input.androidReplayOptions.userId) {
      env.ANDROID_USER_ID = input.androidReplayOptions.userId;
    }
    if (input.androidReplayOptions.expectedAppPhase) {
      env.EXPECTED_APP_PHASE = input.androidReplayOptions.expectedAppPhase;
    }
    if (input.androidReplayOptions.textInputStrategy) {
      if (input.androidReplayOptions.textInputStrategy === "oem_fallback") {
        env.ANDROID_OEM_TEXT_FALLBACK = "1";
      } else if (input.androidReplayOptions.textInputStrategy === "maestro") {
        env.ANDROID_OEM_TEXT_FALLBACK = "0";
      } else {
        env.ANDROID_OEM_TEXT_FALLBACK = "auto";
      }
    }
  }

  if (input.platform === "android") {
    env.DEVICE_ID = input.deviceId ?? selection.deviceId ?? DEFAULT_ANDROID_DEVICE_ID;
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  } else {
    env.SIM_UDID = input.deviceId ?? selection.deviceId ?? DEFAULT_IOS_SIMULATOR_UDID;
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  }

  if (input.platform === "android") {
    const usersExecution = await executeRunner(["adb", "-s", env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID, "shell", "pm", "list", "users"], repoRoot, process.env);
    const usersOutput = usersExecution.stdout.replaceAll(String.fromCharCode(13), "");
    const hasRunningSecondaryUser = /UserInfo\{[1-9]\d*:.*\}\s+running/.test(usersOutput);
    const hasXSpaceUser = /xspace/i.test(usersOutput);
    const forceUserZero = env.M2E_FORCE_ANDROID_USER_0 !== "0";
    const needsUserScopedReplay = usersExecution.exitCode === 0 && (hasRunningSecondaryUser || hasXSpaceUser);
    const manufacturerExecution = await executeRunner(["adb", "-s", env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID, "shell", "getprop", "ro.product.manufacturer"], repoRoot, process.env);
    const manufacturer = manufacturerExecution.stdout.trim().toLowerCase();
    const flowContent = await readFile(path.resolve(repoRoot, effectiveFlowPath), "utf8").catch(() => "");
    const hasTextCommands = /(^|\n)- (inputText|pasteText|setClipboard):?|(^|\n)- inputText:|(^|\n)- pasteText|(^|\n)- setClipboard:/m.test(flowContent);
    const requestedTextStrategy = input.androidReplayOptions?.textInputStrategy ?? "auto";
    const allowsOemTextFallback = requestedTextStrategy === "oem_fallback"
      ? hasTextCommands
      : requestedTextStrategy === "maestro"
        ? false
        : (manufacturer === "vivo" || manufacturer === "oppo") && needsUserScopedReplay && hasTextCommands;
    if (needsUserScopedReplay && forceUserZero) {
      env.ANDROID_USER_ID = env.ANDROID_USER_ID ?? "0";
    }
    if (allowsOemTextFallback) {
      env.ANDROID_OEM_TEXT_FALLBACK = env.ANDROID_OEM_TEXT_FALLBACK ?? "1";
    }

    const helperPackageArgs = env.ANDROID_USER_ID
      ? ["adb", "-s", env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID, "shell", "cmd", "package", "list", "packages", "--user", env.ANDROID_USER_ID]
      : ["adb", "-s", env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID, "shell", "pm", "list", "packages"];
    const packagesExecution = await executeRunner(helperPackageArgs, repoRoot, process.env);
    const packagesOutput = packagesExecution.stdout.replaceAll(String.fromCharCode(13), "");
    const hasDriverApp = /(^|\n)package:dev\.mobile\.maestro(\n|$)/.test(packagesOutput);
    const hasDriverServer = /(^|\n)package:dev\.mobile\.maestro\.test(\n|$)/.test(packagesOutput);
    if (packagesExecution.exitCode === 0 && (!hasDriverApp || !hasDriverServer) && !allowsOemTextFallback) {
      const preflightPath = path.join(artifactsDir.absolutePath, "android-preflight.log");
      await writeFile(preflightPath, `${usersOutput}\n\n${packagesOutput}`, "utf8");
      const missingHelpers = [
        ...(hasDriverApp ? [] : ["dev.mobile.maestro"]),
        ...(hasDriverServer ? [] : ["dev.mobile.maestro.test"]),
      ];
      return {
        status: "failed",
        reasonCode: REASON_CODES.deviceUnavailable,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [toRelativePath(repoRoot, preflightPath)],
        data: {
          dryRun: false,
          harnessConfigPath,
          runnerProfile,
          runnerScript,
          flowPath: effectiveFlowPath,
          requestedFlowPath,
          configuredFlows: selection.configuredFlows,
          artifactsDir: artifactsDir.relativePath,
          totalRuns: runCount,
          passedRuns: 0,
          failedRuns: runCount,
          command,
          exitCode: null,
          summaryLine: `Blocked before replay: Maestro helper app missing (${missingHelpers.join(", ")})${env.ANDROID_USER_ID ? ` for user ${env.ANDROID_USER_ID}` : ""}.`,
        },
        nextSuggestions: [
          `Install missing helper app(s) once on device (${missingHelpers.join(", ")})${env.ANDROID_USER_ID ? ` for user ${env.ANDROID_USER_ID}` : ""} and rerun run_flow.`,
          ...(env.ANDROID_USER_ID
            ? [`Try: adb -s ${env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID} shell am switch-user ${env.ANDROID_USER_ID} before replay.`]
            : []),
          "This guard prevents repeated install authorization prompts during replay.",
        ],
      };
    }
  }

  const execution = await executeRunner(["bash", absoluteRunnerScript, String(runCount)], repoRoot, env);

  await writeFile(path.join(artifactsDir.absolutePath, "command.stdout.log"), execution.stdout, "utf8");
  await writeFile(path.join(artifactsDir.absolutePath, "command.stderr.log"), execution.stderr, "utf8");

  return collectBasicRunResultWithRuntime({
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
