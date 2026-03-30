import type {
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
  ScrollAndTapElementData,
  ScrollAndTapElementInput,
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
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import {
  buildFailureReason,
  toRelativePath,
} from "./runtime-shared.js";
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

async function tapResolvedTarget(
  input: ScrollAndTapElementInput,
  resolveResult: ToolResult<ScrollAndResolveUiTargetData>,
): Promise<ToolResult<TapElementData>> {
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
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

  const tapResult = await tapWithMaestroTool({
    sessionId: input.sessionId,
    platform: input.platform,
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

export const uiActionToolInternals = {
  tapResolvedTarget,
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
      nextSuggestions: [buildMissingPlatformSuggestion("tap")],
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
        command,
        exitCode: 0,
      },
      nextSuggestions: [runtimeHooks.tapDryRunSuggestion],
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
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion("tap")],
      };
  }

  const execution = actionResult.execution;
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      execution.exitCode === 0
        ? REASON_CODES.ok
        : buildFailureReason(execution.stderr, execution.exitCode),
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
    nextSuggestions:
      execution.exitCode === 0 ? [] : [runtimeHooks.tapFailureSuggestion],
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
        command,
        exitCode: 0,
      },
      nextSuggestions: [runtimeHooks.typeTextDryRunSuggestion],
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
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      execution.exitCode === 0
        ? REASON_CODES.ok
        : buildFailureReason(execution.stderr, execution.exitCode),
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
    nextSuggestions:
      execution.exitCode === 0 ? [] : [runtimeHooks.typeTextFailureSuggestion],
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
      nextSuggestions: [buildMissingPlatformSuggestion("tap_element")],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
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
        "tap_element",
        resolution,
      ),
    };
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
      nextSuggestions: [buildMissingPlatformSuggestion("type_into_element")],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
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
        "type_into_element",
        resolution,
      ),
    };
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

export async function scrollAndResolveUiTargetWithMaestroTool(
  input: ScrollAndResolveUiTargetInput,
): Promise<ToolResult<ScrollAndResolveUiTargetData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const maxSwipes =
      typeof input.maxSwipes === "number" && input.maxSwipes >= 0
        ? Math.floor(input.maxSwipes)
        : DEFAULT_SCROLL_MAX_SWIPES;
    const swipeDurationMs =
      typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0
        ? Math.floor(input.swipeDurationMs)
        : DEFAULT_SCROLL_DURATION_MS;
    const swipeDirection = normalizeScrollDirection(input.swipeDirection);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
    });
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
        outputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: [
        buildMissingPlatformSuggestion("scroll_and_resolve_ui_target"),
      ],
    };
  }
  const platform = input.platform;
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = buildUiQuery(input);
  const maxSwipes =
    typeof input.maxSwipes === "number" && input.maxSwipes >= 0
      ? Math.floor(input.maxSwipes)
      : DEFAULT_SCROLL_MAX_SWIPES;
  const swipeDurationMs =
    typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0
      ? Math.floor(input.swipeDurationMs)
      : DEFAULT_SCROLL_DURATION_MS;
  const swipeDirection = normalizeScrollDirection(input.swipeDirection);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
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
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(
          query,
          platform === "android" ? "full" : "partial",
        ),
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: [
        "Provide at least one selector field before calling scroll_and_resolve_ui_target.",
      ],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
    const previewSwipe = buildScrollSwipeCoordinates(
      [],
      swipeDirection,
      swipeDurationMs,
    );
    const previewSwipeCommand = runtimeHooks.buildSwipeCommand(
      deviceId,
      previewSwipe,
    );

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
          commandHistory: [
            runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId),
            previewSwipeCommand,
          ],
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [
          "scroll_and_resolve_ui_target dry-run only previews iOS hierarchy capture and swipe commands. Run it without --dry-run to resolve against the current simulator hierarchy.",
        ],
      };
    }

    const scrollOutcome = await runUiScrollResolveLoop({
      query,
      maxSwipes,
      defaultOutputPath,
      captureSnapshot: () =>
        captureIosUiRuntimeSnapshot(
          repoRoot,
          deviceId,
          input.sessionId,
          runnerProfile,
          input.outputPath,
          {
            sessionId: input.sessionId,
            platform,
            runnerProfile,
            harnessConfigPath: input.harnessConfigPath,
            deviceId,
            outputPath: input.outputPath,
            dryRun: false,
            ...query,
          },
        ),
      buildSwipeCommand: (nodes) =>
        runtimeHooks.buildSwipeCommand(
          deviceId,
          buildScrollSwipeCoordinates(nodes, swipeDirection, swipeDurationMs),
        ),
      executeSwipeCommand: async (command) => {
        const execution = await executeUiActionCommand({
          repoRoot,
          command,
          requiresProbe: false,
        });
        return execution.execution ?? { exitCode: null, stdout: "", stderr: "" };
      },
      scrollFailureMessage:
        "iOS swipe failed while searching for the target. Check simulator state and idb availability before retrying scroll_and_resolve_ui_target.",
    });

    if (scrollOutcome.outcome === "failure") {
      return {
        status: "failed",
        reasonCode: scrollOutcome.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: scrollOutcome.state.attempts,
        artifacts: scrollOutcome.state.absoluteOutputPath
          ? [toRelativePath(repoRoot, scrollOutcome.state.absoluteOutputPath)]
          : [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: scrollOutcome.state.outputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed: scrollOutcome.state.swipesPerformed,
          commandHistory: scrollOutcome.state.commandHistory,
          exitCode: scrollOutcome.state.exitCode,
          result: scrollOutcome.state.result,
          resolution: scrollOutcome.state.resolution,
          supportLevel: "full",
          content: scrollOutcome.state.content,
          summary: scrollOutcome.state.summary,
        },
        nextSuggestions: [scrollOutcome.message],
      };
    }

    if (scrollOutcome.outcome === "resolved" || scrollOutcome.outcome === "stopped") {
      return {
        status:
          scrollOutcome.outcome === "resolved" ? "success" : "partial",
        reasonCode: reasonCodeForResolutionStatus(
          scrollOutcome.state.resolution.status,
        ),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: scrollOutcome.state.attempts,
        artifacts: scrollOutcome.state.absoluteOutputPath
          ? [toRelativePath(repoRoot, scrollOutcome.state.absoluteOutputPath)]
          : [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: scrollOutcome.state.outputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed: scrollOutcome.state.swipesPerformed,
          commandHistory: scrollOutcome.state.commandHistory,
          exitCode: scrollOutcome.state.exitCode,
          result: scrollOutcome.state.result,
          resolution: scrollOutcome.state.resolution,
          supportLevel: "full",
          content: scrollOutcome.state.content,
          summary: scrollOutcome.state.summary,
        },
        nextSuggestions:
          scrollOutcome.outcome === "resolved"
            ? []
            : buildResolutionNextSuggestions(
                scrollOutcome.state.resolution.status,
                "scroll_and_resolve_ui_target",
                scrollOutcome.state.resolution,
              ),
      };
    }

    return {
      status: "partial",
      reasonCode: REASON_CODES.noMatch,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: scrollOutcome.state.attempts,
      artifacts: scrollOutcome.state.absoluteOutputPath
        ? [toRelativePath(repoRoot, scrollOutcome.state.absoluteOutputPath)]
        : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: scrollOutcome.state.outputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: scrollOutcome.state.swipesPerformed,
        commandHistory: scrollOutcome.state.commandHistory,
        exitCode: scrollOutcome.state.exitCode,
        result: scrollOutcome.state.result,
        resolution: scrollOutcome.state.resolution,
        supportLevel: "full",
        content: scrollOutcome.state.content,
        summary: scrollOutcome.state.summary,
      },
      nextSuggestions:
        scrollOutcome.state.resolution.status === "off_screen"
          ? [
              "Reached maxSwipes while the best iOS match stayed off-screen. Keep scrolling, change swipe direction, or refine the selector toward visible content.",
            ]
          : [
              "Reached maxSwipes without finding a matching iOS target. Narrow the selector or increase maxSwipes.",
            ],
    };
  }

  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const previewSwipe = buildScrollSwipeCoordinates(
    [],
    swipeDirection,
    swipeDurationMs,
  );
  const previewSwipeCommand = runtimeHooks.buildSwipeCommand(
    deviceId,
    previewSwipe,
  );

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
      nextSuggestions: [
        "scroll_and_resolve_ui_target dry-run only previews capture and swipe commands. Run it without --dry-run to resolve against the live Android hierarchy.",
      ],
    };
  }

  const scrollOutcome = await runUiScrollResolveLoop({
    query,
    maxSwipes,
    defaultOutputPath,
    captureSnapshot: () =>
      captureAndroidUiRuntimeSnapshot(
        repoRoot,
        deviceId,
        input.sessionId,
        runnerProfile,
        input.outputPath,
        {
          sessionId: input.sessionId,
          platform: input.platform,
          runnerProfile,
          harnessConfigPath: input.harnessConfigPath,
          deviceId,
          outputPath: input.outputPath,
          dryRun: false,
          ...query,
        },
      ),
    buildSwipeCommand: (nodes) =>
      runtimeHooks.buildSwipeCommand(
        deviceId,
        buildScrollSwipeCoordinates(nodes, swipeDirection, swipeDurationMs),
      ),
    executeSwipeCommand: async (command) => {
      const execution = await executeUiActionCommand({
        repoRoot,
        command,
        requiresProbe: false,
      });
      return execution.execution ?? { exitCode: null, stdout: "", stderr: "" };
    },
    scrollFailureMessage:
      "Android swipe failed while searching for the target. Check device state and retry scroll_and_resolve_ui_target.",
    buildRetryableSnapshotFailure: (snapshot) =>
      snapshot.exitCode !== 0
        ? {
            reasonCode: buildFailureReason(snapshot.stderr, snapshot.exitCode),
            message:
              "Could not read the Android UI hierarchy while scrolling for target resolution. Check device state and retry.",
          }
        : undefined,
  });

  if (scrollOutcome.outcome === "failure") {
    return {
      status: "failed",
      reasonCode: scrollOutcome.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: scrollOutcome.state.attempts,
      artifacts: scrollOutcome.state.absoluteOutputPath
        ? [toRelativePath(repoRoot, scrollOutcome.state.absoluteOutputPath)]
        : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: scrollOutcome.state.outputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: scrollOutcome.state.swipesPerformed,
        commandHistory: scrollOutcome.state.commandHistory,
        exitCode: scrollOutcome.state.exitCode,
        result: scrollOutcome.state.result,
        resolution: scrollOutcome.state.resolution,
        supportLevel: "full",
        content: scrollOutcome.state.content,
        summary: scrollOutcome.state.summary,
      },
      nextSuggestions: [scrollOutcome.message],
    };
  }

  if (scrollOutcome.outcome === "resolved" || scrollOutcome.outcome === "stopped") {
    return {
      status: scrollOutcome.outcome === "resolved" ? "success" : "partial",
      reasonCode: reasonCodeForResolutionStatus(
        scrollOutcome.state.resolution.status,
      ),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: scrollOutcome.state.attempts,
      artifacts: scrollOutcome.state.absoluteOutputPath
        ? [toRelativePath(repoRoot, scrollOutcome.state.absoluteOutputPath)]
        : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: scrollOutcome.state.outputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: scrollOutcome.state.swipesPerformed,
        commandHistory: scrollOutcome.state.commandHistory,
        exitCode: scrollOutcome.state.exitCode,
        result: scrollOutcome.state.result,
        resolution: scrollOutcome.state.resolution,
        supportLevel: "full",
        content: scrollOutcome.state.content,
        summary: scrollOutcome.state.summary,
      },
      nextSuggestions:
        scrollOutcome.outcome === "resolved"
          ? []
          : buildResolutionNextSuggestions(
              scrollOutcome.state.resolution.status,
              "scroll_and_resolve_ui_target",
              scrollOutcome.state.resolution,
            ),
    };
  }

  return {
    status: "partial",
    reasonCode: REASON_CODES.noMatch,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: scrollOutcome.state.attempts,
    artifacts: scrollOutcome.state.absoluteOutputPath
      ? [toRelativePath(repoRoot, scrollOutcome.state.absoluteOutputPath)]
      : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: scrollOutcome.state.outputPath,
      query,
      maxSwipes,
      swipeDirection,
      swipeDurationMs,
      swipesPerformed: scrollOutcome.state.swipesPerformed,
      commandHistory: scrollOutcome.state.commandHistory,
      exitCode: scrollOutcome.state.exitCode,
      result: scrollOutcome.state.result,
      resolution: scrollOutcome.state.resolution,
      supportLevel: "full",
      content: scrollOutcome.state.content,
      summary: scrollOutcome.state.summary,
    },
    nextSuggestions:
      scrollOutcome.state.resolution.status === "off_screen"
        ? [
            "Reached maxSwipes while the best Android match stayed off-screen. Keep scrolling, change swipe direction, or refine the selector toward visible content.",
          ]
        : [
            "Reached maxSwipes without finding a matching Android target. Narrow the selector or increase maxSwipes.",
          ],
  };
}

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
  const platform = input.platform;
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
    step: "tap",
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
