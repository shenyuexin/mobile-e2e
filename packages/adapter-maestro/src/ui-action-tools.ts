import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
  ScrollAndTapElementData,
  ScrollAndTapElementInput,
  ReasonCode,
  TapData,
  TapElementData,
  TapElementInput,
  TapInput,
  ToolResult,
  TypeIntoElementData,
  TypeIntoElementInput,
  TypeTextData,
  TypeTextInput,
  UiOrchestrationStepResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  hasQueryUiSelector,
  reasonCodeForResolutionStatus,
} from "./ui-model.js";
import {
  buildAndroidUiDumpCommands,
  captureAndroidUiRuntimeSnapshot,
  captureIosUiRuntimeSnapshot,
  executeUiActionCommand,
  runUiScrollResolveLoop,
} from "./ui-runtime.js";
import { verifyResolvedIosPointWithHooks } from "./ui-runtime-ios.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import {
  buildFailureReason,
  executeRunner,
  toRelativePath,
} from "./runtime-shared.js";
import { isIosPhysicalDeviceId } from "./device-runtime.js";
import {
  buildIosPhysicalActionExecutionPlan,
  buildIosPhysicalMaestroCommand,
  buildIosPhysicalTapFlowYaml,
  buildIosPhysicalTypeTextFlowYaml,
  type IosPhysicalActionBackend,
  isIosSimulatorOnlyIdbActionError,
} from "./ui-runtime-ios.js";
import {
  buildMissingPlatformSuggestion,
  buildPlatformUiDumpOutputPath,
  buildUiQuery,
  buildUnknownUiDumpOutputPath,
} from "./ui-tool-shared.js";
import {
  buildResolutionNextSuggestions,
  DEFAULT_SCROLL_DURATION_MS,
  DEFAULT_SCROLL_MAX_SWIPES,
  normalizeScrollDirection,
} from "./ui-tool-utils.js";
import { resolveUiTargetWithMaestroTool } from "./ui-inspection-tools.js";
// Extracted modules (Phase 19: keep facade under 1500 lines)
import {
  executeIosPhysicalAction,
  buildIosPhysicalActionFlowPaths,
  classifyIosPhysicalStartupFailure,
  buildIosPhysicalFailureSuggestions,
  persistIosPhysicalExecutionEvidence,
  buildOwnedRunnerActionEnv,
  buildIosPhysicalExecutionEvidencePaths,
} from "./ui-action-tools-ios-physical.js";
import { scrollAndResolveUiTargetWithMaestroTool } from "./ui-action-scroll.js";

async function tapResolvedTarget(
  input: ScrollAndTapElementInput,
  resolveResult: ToolResult<ScrollAndResolveUiTargetData>,
  overrides?: {
    verifyResolvedIosPoint?: typeof verifyResolvedIosPointWithHooks;
  },
): Promise<ToolResult<TapElementData>> {
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const platform = input.platform ?? "android";
  const resolution = resolveResult.data.resolution;
  if (!resolution.resolvedPoint || !resolution.resolvedBounds || !resolution.matchedNode) {
    return {
      status: "partial",
      reasonCode: reasonCodeForResolutionStatus(resolution.status),
      sessionId: input.sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query: resolveResult.data.query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: [],
        exitCode: null,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(
        resolution.status,
        "scroll_and_tap_element",
        resolution,
      ),
    };
  }
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);

  if (runtimeHooks.verifyResolvedPoint && !input.dryRun) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const selection = await loadHarnessSelection(
        repoRoot,
        platform,
        runnerProfile,
        input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
      );
    const deviceId =
      input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
    const verify = overrides?.verifyResolvedIosPoint ?? runtimeHooks.verifyResolvedPoint;
    const verification = await verify({
      repoRoot,
      deviceId,
      resolvedNode: resolution.matchedNode,
      resolvedQuery: resolveResult.data.query,
      resolvedPoint: resolution.resolvedPoint,
      runtimeHooks,
    });
    if (!verification.verified && verification.reasonCode) {
      return {
        status: "partial",
        reasonCode: verification.reasonCode,
        sessionId: input.sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: resolveResult.artifacts,
        data: {
          dryRun: false,
          runnerProfile,
          query: resolveResult.data.query,
          matchCount: resolution.matchCount,
          resolution,
          matchedNode: resolution.matchedNode,
          resolvedBounds: resolution.resolvedBounds,
          resolvedX: resolution.resolvedPoint.x,
          resolvedY: resolution.resolvedPoint.y,
          command: verification.command,
          exitCode: verification.exitCode,
          supportLevel: resolveResult.data.supportLevel,
        },
        nextSuggestions: [
          "The resolved iOS selector could not be confirmed at the target point. Refresh the hierarchy or scroll the element into a cleaner viewport before retrying.",
        ],
      };
    }
  }

  const tapResult = await tapWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });

  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: tapResult.durationMs,
    attempts: tapResult.attempts,
    artifacts: tapResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query: resolveResult.data.query,
      matchCount: resolution.matchCount,
      resolution,
      matchedNode: resolution.matchedNode,
      resolvedBounds: resolution.resolvedBounds,
      resolvedX: resolution.resolvedPoint.x,
      resolvedY: resolution.resolvedPoint.y,
      command: tapResult.data.command,
      exitCode: tapResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}

// iOS physical action helpers extracted to ui-action-tools-ios-physical.ts (Phase 19)
// Re-exported for testability:
export {
  classifyIosPhysicalStartupFailure,
  buildIosPhysicalFailureSuggestions,
  buildIosPhysicalExecutionEvidencePaths,
  buildOwnedRunnerActionEnv,
  persistIosPhysicalExecutionEvidence,
  executeIosPhysicalAction,
  buildIosPhysicalActionFlowPaths,
} from "./ui-action-tools-ios-physical.js";

export const uiActionToolInternals = {
  tapResolvedTarget,
  classifyIosPhysicalStartupFailure,
  buildIosPhysicalFailureSuggestions,
  verifyResolvedIosPoint: verifyResolvedIosPointWithHooks,
};

export async function tapWithMaestroTool(
  input: TapInput,
): Promise<ToolResult<TapData>> {
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
        x: input.x,
        y: input.y,
        command: [],
        exitCode: null,
      },
      nextSuggestions: [buildMissingPlatformSuggestion(ACTION_TYPES.tap)],
    };
  }
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(input.platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(
    repoRoot,
    input.platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);

  const command = runtimeHooks.buildTapCommand(deviceId, input.x, input.y);
  const isIosPhysicalTarget = input.platform === "ios" && isIosPhysicalDeviceId(deviceId);
  const iosPhysicalFlowPaths = isIosPhysicalTarget
    ? buildIosPhysicalActionFlowPaths(repoRoot, input.sessionId, ACTION_TYPES.tap)
    : undefined;
  const iosPhysicalCommand = isIosPhysicalTarget && iosPhysicalFlowPaths
    ? buildIosPhysicalActionExecutionPlan(deviceId, iosPhysicalFlowPaths.relativePath).command
    : undefined;
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
        x: input.x,
        y: input.y,
        command: iosPhysicalCommand ?? command,
        exitCode: 0,
      },
      nextSuggestions: [
        isIosPhysicalTarget
          ? "Run tap without dryRun to execute an iOS physical-device Maestro point flow (artifacts/ios-physical-actions/<sessionId>/tap.maestro.yml)."
          : runtimeHooks.tapDryRunSuggestion,
      ],
    };
  }

  if (isIosPhysicalTarget) {
    const execution = await executeIosPhysicalAction({
      repoRoot,
      deviceId,
      sessionId: input.sessionId,
      actionType: ACTION_TYPES.tap,
      flowContent: buildIosPhysicalTapFlowYaml(input.x, input.y),
      targetAppId: selection.appId,
    });
    return {
      status: execution.exitCode === 0 ? "success" : "failed",
      reasonCode: execution.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: execution.artifacts,
      data: {
        dryRun: false,
        runnerProfile,
        x: input.x,
        y: input.y,
        command: execution.fallbackUsed
          ? ["fallback:maestro_cli", ...execution.command]
          : execution.command,
        exitCode: execution.exitCode,
      },
      nextSuggestions: execution.nextSuggestions,
    };
  }

  const actionResult = await executeUiActionCommand({
    repoRoot,
    command,
    requiresProbe: runtimeHooks.requiresProbe,
    probeRuntimeAvailability: runtimeHooks.probeRuntimeAvailability,
  });
  if (!actionResult.execution) {
      return {
        status: "partial",
        reasonCode: runtimeHooks.probeFailureReasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          x: input.x,
          y: input.y,
          command,
          exitCode: actionResult.probeExecution?.exitCode ?? null,
        },
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion(ACTION_TYPES.tap)],
      };
  }

  const execution = actionResult.execution;
  const simulatorOnlyIdbError =
    input.platform === "ios"
    && isIosPhysicalDeviceId(deviceId)
    && isIosSimulatorOnlyIdbActionError(execution.stderr);
  const tapReasonCode = simulatorOnlyIdbError
    ? REASON_CODES.unsupportedOperation
    : buildFailureReason(execution.stderr, execution.exitCode);
  const tapSuggestions = execution.exitCode === 0
    ? []
    : simulatorOnlyIdbError
      ? [
        "Direct iOS tap failed. For simulators, verify axe is installed (brew install cameroncooke/axe/axe). For physical devices, verify WDA is running (iproxy 8100 8100 --udid <udid>).",
      ]
      : [runtimeHooks.tapFailureSuggestion];
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      execution.exitCode === 0
        ? REASON_CODES.ok
        : tapReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      x: input.x,
      y: input.y,
      command,
      exitCode: execution.exitCode,
    },
    nextSuggestions: tapSuggestions,
  };
}

export async function typeTextWithMaestroTool(
  input: TypeTextInput,
): Promise<ToolResult<TypeTextData>> {
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
        text: input.text,
        command: [],
        exitCode: null,
      },
      nextSuggestions: [buildMissingPlatformSuggestion("type_text")],
    };
  }
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(input.platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(
    repoRoot,
    input.platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);

  const command = runtimeHooks.buildTypeTextCommand(deviceId, input.text);
  const isIosPhysicalTarget = input.platform === "ios" && isIosPhysicalDeviceId(deviceId);
  const iosPhysicalFlowPaths = isIosPhysicalTarget
    ? buildIosPhysicalActionFlowPaths(repoRoot, input.sessionId, "type_text")
    : undefined;
  const iosPhysicalCommand = isIosPhysicalTarget && iosPhysicalFlowPaths
    ? buildIosPhysicalActionExecutionPlan(deviceId, iosPhysicalFlowPaths.relativePath).command
    : undefined;
  if (input.dryRun) {
    return {
      status: runtimeHooks.platform === "ios" ? "success" : "partial",
      reasonCode:
        runtimeHooks.platform === "ios"
          ? REASON_CODES.ok
          : REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        text: input.text,
        command: iosPhysicalCommand ?? command,
        exitCode: 0,
      },
      nextSuggestions: [
        isIosPhysicalTarget
          ? "Run type_text without dryRun to execute an iOS physical-device Maestro input flow (artifacts/ios-physical-actions/<sessionId>/type_text.maestro.yml)."
          : runtimeHooks.typeTextDryRunSuggestion,
      ],
    };
  }

  if (isIosPhysicalTarget) {
    const execution = await executeIosPhysicalAction({
      repoRoot,
      deviceId,
      sessionId: input.sessionId,
      actionType: "type_text",
      flowContent: buildIosPhysicalTypeTextFlowYaml(input.text),
      targetAppId: selection.appId,
    });
    return {
      status: execution.exitCode === 0 ? "success" : "failed",
      reasonCode: execution.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: execution.artifacts,
      data: {
        dryRun: false,
        runnerProfile,
        text: input.text,
        command: execution.fallbackUsed
          ? ["fallback:maestro_cli", ...execution.command]
          : execution.command,
        exitCode: execution.exitCode,
      },
      nextSuggestions: execution.nextSuggestions,
    };
  }

  const actionResult = await executeUiActionCommand({
    repoRoot,
    command,
    requiresProbe: runtimeHooks.requiresProbe,
    probeRuntimeAvailability: runtimeHooks.probeRuntimeAvailability,
  });
  if (!actionResult.execution) {
      return {
        status: "partial",
        reasonCode: runtimeHooks.probeFailureReasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          text: input.text,
          command,
          exitCode: actionResult.probeExecution?.exitCode ?? null,
        },
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion("type_text")],
      };
  }

  const execution = actionResult.execution;
  const simulatorOnlyIdbError =
    input.platform === "ios"
    && isIosPhysicalDeviceId(deviceId)
    && isIosSimulatorOnlyIdbActionError(execution.stderr);
  const typeReasonCode = simulatorOnlyIdbError
    ? REASON_CODES.unsupportedOperation
    : buildFailureReason(execution.stderr, execution.exitCode);
  const typeSuggestions = execution.exitCode === 0
    ? []
    : simulatorOnlyIdbError
      ? [
        "Direct iOS type_text failed. For simulators, verify axe is installed (brew install cameroncooke/axe/axe). For physical devices, verify WDA is running (iproxy 8100 8100 --udid <udid>).",
      ]
      : [runtimeHooks.typeTextFailureSuggestion];
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      execution.exitCode === 0
        ? REASON_CODES.ok
        : typeReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      text: input.text,
      command,
      exitCode: execution.exitCode,
    },
    nextSuggestions: typeSuggestions,
  };
}

export async function tapElementWithMaestroTool(
  input: TapElementInput,
): Promise<ToolResult<TapElementData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
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
        query,
        command: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion(ACTION_TYPES.tapElement)],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const resolveResult = await resolveUiTargetWithMaestroTool({
    sessionId: input.sessionId,
    platform,
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
  if (
    input.dryRun
    && (resolution.status === "unsupported"
      || resolution.status === "not_executed")
  ) {
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
      nextSuggestions: [
        "tap_element dry-run does not resolve live UI selectors. Run resolve_ui_target or tap_element without --dry-run to resolve against the current hierarchy.",
      ],
    };
  }
  if (
    resolveResult.status !== "success"
    || !resolution.resolvedPoint
    || !resolution.resolvedBounds
    || !resolution.matchedNode
  ) {
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
      nextSuggestions: buildResolutionNextSuggestions(
        resolution.status,
        ACTION_TYPES.tapElement,
        resolution,
      ),
    };
  }

  if (runtimeHooks.verifyResolvedPoint && !input.dryRun) {
    const selection = await loadHarnessSelection(
      repoRoot,
      platform,
      runnerProfile,
      input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
    );
    const deviceId =
      input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
    const verification = await runtimeHooks.verifyResolvedPoint({
      repoRoot,
      deviceId,
      resolvedNode: resolution.matchedNode,
      resolvedQuery: query,
      resolvedPoint: resolution.resolvedPoint,
      runtimeHooks,
    });
    if (!verification.verified && verification.reasonCode) {
      return {
        status: "partial",
        reasonCode: verification.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: resolveResult.attempts + 1,
        artifacts: resolveResult.artifacts,
        data: {
          dryRun: false,
          runnerProfile,
          query,
          matchCount: resolution.matchCount,
          resolution,
          matchedNode: resolution.matchedNode,
          resolvedBounds: resolution.resolvedBounds,
          resolvedX: resolution.resolvedPoint.x,
          resolvedY: resolution.resolvedPoint.y,
          command: verification.command,
          exitCode: verification.exitCode,
          supportLevel: resolveResult.data.supportLevel,
        },
        nextSuggestions: [
          "The resolved iOS selector could not be confirmed at the target point. Refresh the hierarchy or scroll the element into a cleaner viewport before retrying tap_element.",
        ],
      };
    }
  }

  const tapResult = await tapWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });
  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + tapResult.attempts,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query,
      matchCount: resolution.matchCount,
      resolution,
      matchedNode: resolution.matchedNode,
      resolvedBounds: resolution.resolvedBounds,
      resolvedX: resolution.resolvedPoint.x,
      resolvedY: resolution.resolvedPoint.y,
      command: tapResult.data.command,
      exitCode: tapResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}

export async function typeIntoElementWithMaestroTool(
  input: TypeIntoElementInput,
): Promise<ToolResult<TypeIntoElementData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
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
        query,
        value: input.value,
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        commands: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion(ACTION_TYPES.typeIntoElement)],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const resolveResult = await resolveUiTargetWithMaestroTool({
    sessionId: input.sessionId,
    platform,
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
        commands:
          resolveResult.data.command.length > 0
            ? [resolveResult.data.command]
            : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  if (
    input.dryRun
    && (resolution.status === "unsupported"
      || resolution.status === "not_executed")
  ) {
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
        commands:
          resolveResult.data.command.length > 0
            ? [resolveResult.data.command]
            : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: [
        "type_into_element dry-run does not resolve live UI selectors. Run resolve_ui_target or type_into_element without --dry-run to resolve against the current hierarchy.",
      ],
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
      nextSuggestions: buildResolutionNextSuggestions(
        resolution.status,
        ACTION_TYPES.typeIntoElement,
        resolution,
      ),
    };
  }

  if (runtimeHooks.verifyResolvedPoint && !input.dryRun && resolution.matchedNode) {
    const selection = await loadHarnessSelection(
      repoRoot,
      platform,
      runnerProfile,
      input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
    );
    const deviceId =
      input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
    const verification = await runtimeHooks.verifyResolvedPoint({
      repoRoot,
      deviceId,
      resolvedNode: resolution.matchedNode,
      resolvedQuery: query,
      resolvedPoint: resolution.resolvedPoint,
      runtimeHooks,
    });
    if (!verification.verified && verification.reasonCode) {
      return {
        status: "partial",
        reasonCode: verification.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: resolveResult.attempts + 1,
        artifacts: resolveResult.artifacts,
        data: {
          dryRun: false,
          runnerProfile,
          query,
          value: input.value,
          resolution,
          commands: [verification.command],
          exitCode: verification.exitCode,
          supportLevel: resolveResult.data.supportLevel,
        },
        nextSuggestions: [
          "The resolved iOS selector could not be confirmed at the focus point. Refresh the hierarchy or scroll the element into a cleaner viewport before retrying type_into_element.",
        ],
      };
    }
  }

  const focusResult = await tapWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });
  const typeResult = await typeTextWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    text: input.value,
    dryRun: input.dryRun,
  });
  const commands = [focusResult.data.command, typeResult.data.command];

  if (focusResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: REASON_CODES.actionFocusFailed,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: resolveResult.attempts + focusResult.attempts,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands,
        exitCode: focusResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: focusResult.nextSuggestions,
    };
  }

  if (
    typeResult.status === "success"
    && runtimeHooks.verifyTypedPostcondition
    && !input.dryRun
    && resolution.matchedNode
  ) {
    const selection = await loadHarnessSelection(
      repoRoot,
      platform,
      runnerProfile,
      input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
    );
    const deviceId =
      input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
    const verification = await runtimeHooks.verifyTypedPostcondition({
      repoRoot,
      deviceId,
      resolvedNode: resolution.matchedNode,
      resolvedQuery: query,
      resolvedPoint: resolution.resolvedPoint,
      typedValue: input.value,
      runtimeHooks,
    });
    if (!verification.verified && verification.reasonCode) {
      return {
        status: "partial",
        reasonCode: verification.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts:
          resolveResult.attempts + focusResult.attempts + typeResult.attempts + 1,
        artifacts: resolveResult.artifacts,
        data: {
          dryRun: false,
          runnerProfile,
          query,
          value: input.value,
          resolution,
          commands: [...commands, verification.command],
          exitCode: verification.exitCode,
          supportLevel: resolveResult.data.supportLevel,
        },
        nextSuggestions: [
          "The iOS field could not be re-verified after typing. Refresh the hierarchy, confirm focus stayed on the target field, and retry type_into_element.",
        ],
      };
    }
  }

  return {
    status: typeResult.status,
    reasonCode:
      typeResult.status === "success"
        ? REASON_CODES.ok
        : REASON_CODES.actionTypeFailed,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts:
      resolveResult.attempts + focusResult.attempts + typeResult.attempts,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query,
      value: input.value,
      resolution,
      commands,
      exitCode: typeResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: typeResult.nextSuggestions,
  };
}


// scrollAndResolveUiTargetWithMaestroTool extracted to ui-action-scroll.ts (Phase 19)
// Re-exported for backward compatibility:
export { scrollAndResolveUiTargetWithMaestroTool } from "./ui-action-scroll.js";
export async function scrollAndTapElementWithMaestroTool(
  input: ScrollAndTapElementInput,
): Promise<ToolResult<ScrollAndTapElementData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
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
        query,
        maxSwipes:
          typeof input.maxSwipes === "number" && input.maxSwipes >= 0
            ? Math.floor(input.maxSwipes)
            : DEFAULT_SCROLL_MAX_SWIPES,
        swipeDirection: normalizeScrollDirection(input.swipeDirection),
        swipeDurationMs:
          typeof input.swipeDurationMs === "number"
            && input.swipeDurationMs > 0
            ? Math.floor(input.swipeDurationMs)
            : DEFAULT_SCROLL_DURATION_MS,
        stepResults: [],
        resolveResult: {
          dryRun: Boolean(input.dryRun),
          runnerProfile,
          outputPath: buildUnknownUiDumpOutputPath({
            sessionId: input.sessionId,
            runnerProfile,
            outputPath: input.outputPath,
          }),
          query,
          maxSwipes:
            typeof input.maxSwipes === "number" && input.maxSwipes >= 0
              ? Math.floor(input.maxSwipes)
              : DEFAULT_SCROLL_MAX_SWIPES,
          swipeDirection: normalizeScrollDirection(input.swipeDirection),
          swipeDurationMs:
            typeof input.swipeDurationMs === "number"
              && input.swipeDurationMs > 0
              ? Math.floor(input.swipeDurationMs)
              : DEFAULT_SCROLL_DURATION_MS,
          swipesPerformed: 0,
          commandHistory: [],
          exitCode: null,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "partial"),
          supportLevel: "partial",
        },
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("scroll_and_tap_element")],
    };
  }
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const stepResults: UiOrchestrationStepResult[] = [];
  const resolveResult = await scrollAndResolveUiTargetWithMaestroTool(input);

  stepResults.push({
    step: "scroll_resolve",
    status: resolveResult.status,
    reasonCode: resolveResult.reasonCode,
    note: resolveResult.nextSuggestions[0],
  });
  if (resolveResult.status !== "success") {
    return {
      status: resolveResult.status,
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: resolveResult.attempts,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query: resolveResult.data.query,
        maxSwipes: resolveResult.data.maxSwipes,
        swipeDirection: resolveResult.data.swipeDirection,
        swipeDurationMs: resolveResult.data.swipeDurationMs,
        stepResults,
        resolveResult: resolveResult.data,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  const tapResult = await tapResolvedTarget(input, resolveResult);
  stepResults.push({
    step: ACTION_TYPES.tap,
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    note: tapResult.nextSuggestions[0],
  });
  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + tapResult.attempts,
    artifacts: [...resolveResult.artifacts, ...tapResult.artifacts],
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query: resolveResult.data.query,
      maxSwipes: resolveResult.data.maxSwipes,
      swipeDirection: resolveResult.data.swipeDirection,
      swipeDurationMs: resolveResult.data.swipeDurationMs,
      stepResults,
      resolveResult: resolveResult.data,
      tapResult: tapResult.data,
      supportLevel: tapResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}
