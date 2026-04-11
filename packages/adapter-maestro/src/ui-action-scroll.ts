/**
 * Scroll-and-resolve UI target tool.
 *
 * Extracted from ui-action-tools.ts to keep the main facade under control.
 * Handles the scroll+resolve loop for both Android and iOS platforms.
 */

import type {
  InspectUiNode,
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
  ScrollOnlyData,
  ScrollOnlyInput,
  ScrollOnlyGestureMode,
  ToolResult,
  RunnerProfile,
  UiScrollDirection,
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
  buildScrollOnlySwipeCoordinates,
  hasQueryUiSelector,
  reasonCodeForResolutionStatus,
} from "./ui-model.js";
import {
  buildAndroidUiDumpCommands,
  captureAndroidUiRuntimeSnapshot,
  captureIosUiSnapshot,
  executeUiActionCommand,
  isIosUiSnapshotFailure,
  runUiScrollResolveLoop,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { buildFailureReason, toRelativePath } from "./runtime-shared.js";
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
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [
        "Provide at least one selector field before calling scroll_and_resolve_ui_target.",
      ],
    };
  }

  // scroll_and_resolve_ui_target is Android-only. iOS uses scroll_only → wait_for_ui → resolve_ui_target.
  if (platform === "ios") {
    return {
      status: "failed",
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
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: [
        "scroll_and_resolve_ui_target is Android-only. On iOS, use scroll_only → wait_for_ui → resolve_ui_target instead.",
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

/**
 * Normalized internal gesture model for scroll_only processing.
 */
type NormalizedScrollGesture = {
  direction: "up" | "down" | "left" | "right";
  mode: "default" | "precision";
  startRatio?: number;
  endRatio?: number;
};

/**
 * Normalize scroll_only input into a single internal gesture model.
 * `gesture` is required — no legacy swipeDirection fallback.
 * Returns either a normalized gesture or a validation error string.
 */
function normalizeScrollOnlyGesture(input: ScrollOnlyInput): NormalizedScrollGesture | string {
  const { gesture } = input;

  if (!gesture) {
    return "gesture is required. Provide { direction: 'up' | 'down' | 'left' | 'right', startRatio?, endRatio? }.";
  }
  if (!gesture.direction) {
    return "gesture.direction is required.";
  }
  const validDirs: Array<"up" | "down" | "left" | "right"> = ["up", "down", "left", "right"];
  if (!validDirs.includes(gesture.direction)) {
    return `gesture.direction must be one of: up, down, left, right. Got: "${gesture.direction}".`;
  }

  // Validate ratios
  const hasStart = gesture.startRatio !== undefined;
  const hasEnd = gesture.endRatio !== undefined;
  if (hasStart !== hasEnd) {
    return "Both startRatio and endRatio must be provided together, or neither.";
  }

  if (hasStart && hasEnd) {
    const s = gesture.startRatio!;
    const e = gesture.endRatio!;
    if (s < 0 || s > 1) {
      return `startRatio must be between 0 and 1. Got: ${s}.`;
    }
    if (e < 0 || e > 1) {
      return `endRatio must be between 0 and 1. Got: ${e}.`;
    }
    if (s === e) {
      return `startRatio and endRatio must not be equal. Both are ${s}.`;
    }
    return {
      direction: gesture.direction,
      mode: "precision" as const,
      startRatio: s,
      endRatio: e,
    };
  }

  return {
    direction: gesture.direction,
    mode: "default" as const,
  };
}

/**
 * Scroll-only tool — performs N swipes without target resolution.
 * Designed to be used as: scroll_only → wait_for_ui → resolve_ui_target
 *
 * Requires structured gesture input: { direction: 'up'|'down'|'left'|'right', startRatio?, endRatio? }.
 * No legacy swipeDirection fallback.
 */
export async function scrollOnlyWithMaestroTool(
  input: ScrollOnlyInput,
): Promise<ToolResult<ScrollOnlyData>> {
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;

  // Normalize the gesture
  const normalized = normalizeScrollOnlyGesture(input);
  if (typeof normalized === "string") {
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
        swipeDurationMs: typeof input.swipeDurationMs === "number" ? input.swipeDurationMs : DEFAULT_SCROLL_DURATION_MS,
        countRequested: input.count ?? 1,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
        gestureApplied: {
          direction: input.gesture?.direction ?? "up",
          startRatio: undefined,
          endRatio: undefined,
          mode: "default",
        },
      },
      nextSuggestions: [`Invalid scroll gesture configuration: ${normalized}`],
    };
  }

  // Missing platform guard
  if (!input.platform) {
    const swipeDurationMs =
      typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0
        ? Math.floor(input.swipeDurationMs)
        : DEFAULT_SCROLL_DURATION_MS;
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
        swipeDurationMs,
        countRequested: input.count ?? 1,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
        gestureApplied: {
          direction: normalized.direction,
          startRatio: normalized.startRatio,
          endRatio: normalized.endRatio,
          mode: normalized.mode,
        },
      },
      nextSuggestions: [buildMissingPlatformSuggestion("scroll_only")],
    };
  }

  const platform = input.platform;
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const count = typeof input.count === "number" && input.count >= 1 ? Math.floor(input.count) : 1;
  const swipeDurationMs =
    typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0
      ? Math.floor(input.swipeDurationMs)
      : DEFAULT_SCROLL_DURATION_MS;
  const settleDelayMs =
    typeof input.settleDelayMs === "number" && input.settleDelayMs >= 0
      ? Math.floor(input.settleDelayMs)
      : 2000;

  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId = input.deviceId ?? selection.deviceId;
  if (!deviceId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.deviceUnavailable,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        swipeDurationMs,
        countRequested: count,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
        gestureApplied: {
          direction: normalized.direction,
          startRatio: normalized.startRatio,
          endRatio: normalized.endRatio,
          mode: normalized.mode,
        },
      },
      nextSuggestions: ["Provide a deviceId or update the harness configuration."],
    };
  }

  // Dry-run path: return gesture preview
  if (input.dryRun) {
    const previewSwipe = buildScrollOnlySwipeCoordinates(
      [],
      normalized.direction,
      swipeDurationMs,
      normalized.startRatio,
      normalized.endRatio,
    );
    const previewCommand = runtimeHooks.buildSwipeCommand(deviceId, previewSwipe);

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
        swipeDurationMs,
        countRequested: count,
        swipesPerformed: 0,
        commandHistory: [previewCommand],
        exitCode: 0,
        supportLevel: "full",
        gestureApplied: {
          direction: normalized.direction,
          startRatio: normalized.startRatio,
          endRatio: normalized.endRatio,
          mode: normalized.mode,
        },
      },
      nextSuggestions: [
        normalized.mode === "precision"
          ? `Dry-run preview: ${normalized.direction} swipe with startRatio=${normalized.startRatio}, endRatio=${normalized.endRatio}. Run without dryRun to execute.`
          : `Dry-run preview: default ${normalized.direction} swipe. Run without dryRun to execute.`,
      ],
    };
  }

  // Execution loop
  const commandHistory: string[][] = [];
  let swipesPerformed = 0;
  let lastExitCode: number | null = null;

  // Capture current UI hierarchy to get correct viewport bounds for scroll coordinates.
  // Without this, buildScrollOnlySwipeCoordinates falls back to 1080x1920 defaults
  // which are out of bounds for iOS simulators (430x932).
  let viewportNodes: InspectUiNode[] = [];
  if (platform === "ios") {
    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      undefined,
      { sessionId: input.sessionId, platform, runnerProfile, deviceId, text: "" },
    );
    if (!isIosUiSnapshotFailure(snapshot)) {
      viewportNodes = snapshot.nodes;
    }
  }

  for (let i = 0; i < count; i++) {
    const swipe = buildScrollOnlySwipeCoordinates(
      viewportNodes,
      normalized.direction,
      swipeDurationMs,
      normalized.startRatio,
      normalized.endRatio,
    );
    const swipeCommand = runtimeHooks.buildSwipeCommand(deviceId, swipe);

    const execution = await executeUiActionCommand({
      repoRoot,
      command: swipeCommand,
      requiresProbe: false,
    });

    if (execution.execution?.exitCode !== 0) {
      lastExitCode = execution.execution?.exitCode ?? null;
      break;
    }

    commandHistory.push([...swipeCommand]);
    lastExitCode = execution.execution?.exitCode ?? 0;
    swipesPerformed += 1;

    // Wait for scroll animation to settle + View hierarchy to update
    // Android RecyclerView fling can take 1-2 seconds after touch release
    await new Promise((r) => setTimeout(r, settleDelayMs));
  }

  return {
    status: lastExitCode === 0 ? "success" : "failed",
    reasonCode: lastExitCode === 0 ? REASON_CODES.ok : REASON_CODES.actionScrollFailed,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      swipeDurationMs,
      countRequested: count,
      swipesPerformed,
      commandHistory,
      exitCode: lastExitCode,
      supportLevel: "full",
      gestureApplied: {
        direction: normalized.direction,
        startRatio: normalized.startRatio,
        endRatio: normalized.endRatio,
        mode: normalized.mode,
      },
    },
    nextSuggestions:
      lastExitCode === 0
        ? [`Performed ${swipesPerformed} swipe(s) (${normalized.direction}, ${normalized.mode}). Use wait_for_ui then resolve_ui_target to find your target.`]
        : ["Swipe failed. Check device state and retry."],
  };
}
