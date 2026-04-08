/**
 * Scroll-and-resolve UI target tool.
 *
 * Extracted from ui-action-tools.ts to keep the main facade under control.
 * Handles the scroll+resolve loop for both Android and iOS platforms.
 */

import type {
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
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
        "iOS swipe failed while searching for the target. Check simulator state and axe/WDA availability before retrying scroll_and_resolve_ui_target.",
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

