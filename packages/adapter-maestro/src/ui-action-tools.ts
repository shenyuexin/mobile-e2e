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
  NavigateBackData,
  NavigateBackInput,
  BackTarget,
  BackExecutionPath,
  RunnerProfile,
  InspectUiNode,
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
  parseUiBounds,
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

// ─── Navigate Back Test Hooks ─────────────────────────────────────────────
// Allow tests to inject mock implementations for getScreenSummary,
// waitForUiStable, and the back action executor so we can verify
// pre/post state capture ordering and evidence field provenance.

import type { GetScreenSummaryData, WaitForUiStableData } from "@mobile-e2e-mcp/contracts";

export interface NavigateBackTestHooks {
  getScreenSummary?: (input: { sessionId: string; platform: "android" | "ios"; runnerProfile: RunnerProfile; deviceId?: string }) => Promise<ToolResult<GetScreenSummaryData>>;
  waitForUiStable?: (input: { sessionId: string; platform: "android" | "ios"; runnerProfile: RunnerProfile; deviceId?: string; timeoutMs?: number }) => Promise<ToolResult<WaitForUiStableData>>;
  executeBackCommand?: () => Promise<{ exitCode: number; stderr: string; stdout: string }>;
  /** iOS edge-swipe: mock the swipe command execution result. */
  executeSwipeCommand?: () => Promise<{ exitCode: number; stderr: string; stdout: string }>;
  /** iOS edge-swipe: mock viewport/nav bar probe used to build swipe coordinates. */
  iosEdgeSwipeProbe?: () => Promise<{ viewportWidth: number; viewportHeight: number; navBarCenterY?: number }>;
  /** iOS: mock the back button tap result. When not set, uses real tapElementWithMaestroTool. */
  tapBackButton?: () => Promise<ToolResult<import("@mobile-e2e-mcp/contracts").TapElementData>>;
}

let navigateBackTestHooks: NavigateBackTestHooks | undefined;

export function setNavigateBackTestHooksForTesting(hooks: NavigateBackTestHooks | undefined): void {
  navigateBackTestHooks = hooks;
}

export function resetNavigateBackTestHooksForTesting(): void {
  navigateBackTestHooks = undefined;
}

/** Normalized outcome of a back action, regardless of source
 *  (real executeUiActionCommand or test hook executeBackCommand). */
interface BackActionOutcome {
  exitCode: number | null;
  stderr: string;
}

/** Extract exit code and stderr from either the real execution result
 *  or the simplified test hook result, without using `as any` probing. */
function normalizeBackOutcome(
  result: Awaited<ReturnType<typeof executeUiActionCommand>> | Awaited<ReturnType<NonNullable<NavigateBackTestHooks["executeBackCommand"]>>>,
): BackActionOutcome {
  const r = result as Record<string, unknown>;
  const exec = r.execution as Record<string, unknown> | undefined;
  if (exec && typeof exec === "object") {
    return {
      exitCode: typeof exec.exitCode === "number" ? exec.exitCode : null,
      stderr: typeof exec.stderr === "string" ? exec.stderr : "",
    };
  }
  return {
    exitCode: typeof r.exitCode === "number" ? r.exitCode : null,
    stderr: typeof r.stderr === "string" ? r.stderr : "",
  };
}

/** Fallback: call the real getScreenSummaryWithMaestro when no test hook is set. */
async function navigateBackGetScreenSummary(input: { sessionId: string; platform: "android" | "ios"; runnerProfile: RunnerProfile; deviceId?: string }) {
  const { getScreenSummaryWithMaestro } = await import("./session-state.js");
  return getScreenSummaryWithMaestro({ sessionId: input.sessionId, platform: input.platform, runnerProfile: input.runnerProfile, deviceId: input.deviceId });
}

/** Fallback: call the real waitForUiStableWithMaestro when no test hook is set. */
async function navigateBackWaitForUiStable(input: { sessionId: string; platform: "android" | "ios"; runnerProfile: RunnerProfile; deviceId?: string; timeoutMs?: number }) {
  const { waitForUiStableWithMaestro } = await import("./ui-stability.js");
  return waitForUiStableWithMaestro({ sessionId: input.sessionId, platform: input.platform, runnerProfile: input.runnerProfile, deviceId: input.deviceId, timeoutMs: input.timeoutMs });
}

function estimateIosViewportFromNodes(nodes: InspectUiNode[]): {
  viewportWidth: number;
  viewportHeight: number;
  navBarCenterY?: number;
} {
  const parsedBounds = nodes
    .map((node) => parseUiBounds(node.bounds))
    .filter((bounds): bounds is NonNullable<ReturnType<typeof parseUiBounds>> => bounds !== undefined);

  const viewportWidth = Math.max(320, Math.round(parsedBounds.reduce((acc, bounds) => Math.max(acc, bounds.right), 390)));
  const viewportHeight = Math.max(640, Math.round(parsedBounds.reduce((acc, bounds) => Math.max(acc, bounds.bottom), 844)));

  const navBarCandidate = nodes
    .map((node) => ({
      node,
      bounds: parseUiBounds(node.bounds),
    }))
    .filter((entry): entry is { node: InspectUiNode; bounds: NonNullable<ReturnType<typeof parseUiBounds>> } => entry.bounds !== undefined)
    .filter((entry) => {
      const className = entry.node.className?.toLowerCase() ?? "";
      const text = entry.node.text?.toLowerCase() ?? "";
      const contentDesc = entry.node.contentDesc?.toLowerCase() ?? "";
      const isNavBar = className.includes("navigationbar")
        || className.includes("nav bar")
        || className.includes("navigation bar")
        || text.includes("nav bar")
        || contentDesc.includes("nav bar");
      return isNavBar && entry.bounds.top <= viewportHeight * 0.35;
    })
    .sort((left, right) => left.bounds.top - right.bounds.top)[0];

  return {
    viewportWidth,
    viewportHeight,
    navBarCenterY: navBarCandidate
      ? Math.round(navBarCandidate.bounds.top + navBarCandidate.bounds.height / 2)
      : undefined,
  };
}

async function resolveIosEdgeSwipeProbe(input: {
  repoRoot: string;
  deviceId: string;
  sessionId: string;
  runnerProfile: RunnerProfile;
}): Promise<{ viewportWidth: number; viewportHeight: number; navBarCenterY?: number }> {
  if (navigateBackTestHooks?.iosEdgeSwipeProbe) {
    return navigateBackTestHooks.iosEdgeSwipeProbe();
  }

  const snapshot = await captureIosUiRuntimeSnapshot(
    input.repoRoot,
    input.deviceId,
    input.sessionId,
    input.runnerProfile,
    undefined,
    {
      sessionId: input.sessionId,
      platform: "ios",
      runnerProfile: input.runnerProfile,
      deviceId: input.deviceId,
    },
  );

  if ("nodes" in snapshot) {
    return estimateIosViewportFromNodes(snapshot.nodes);
  }

  return {
    viewportWidth: 390,
    viewportHeight: 844,
    navBarCenterY: undefined,
  };
}

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
export { scrollAndResolveUiTargetWithMaestroTool, scrollOnlyWithMaestroTool } from "./ui-action-scroll.js";
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

// ─── Navigate Back ────────────────────────────────────────────────────────

export async function navigateBackWithMaestroTool(
  input: NavigateBackInput,
): Promise<ToolResult<NavigateBackData>> {
  const startTime = Date.now();
  const platform = input.platform;
  const target: BackTarget = input.target ?? "app";
  const dryRun = Boolean(input.dryRun);

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun,
        target,
        executedStrategy: "unsupported",
        supportLevel: "unsupported",
        fallbackUsed: false,
        capabilityNote: "Platform is required. Specify 'android' or 'ios'.",
      },
      nextSuggestions: ["Specify the platform (android or ios) when calling navigate_back."],
    };
  }

  // iOS system back is not supported
  if (platform === "ios" && target === "system") {
    return {
      status: "failed",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun,
        target,
        executedStrategy: "unsupported",
        supportLevel: "unsupported",
        fallbackUsed: false,
        capabilityNote: "iOS does not have a universal system-level back primitive. Use app-level back or perform the gesture manually.",
      },
      nextSuggestions: [
        "Use target: 'app' for in-app back navigation.",
        "For iOS app back, provide a selector for the back button.",
      ],
    };
  }

  const repoRoot = resolveRepoPath();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
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
        dryRun,
        target,
        executedStrategy: "unsupported",
        supportLevel: "unsupported",
        fallbackUsed: false,
        capabilityNote: "No device ID resolved. Provide deviceId or configure harness config.",
      },
      nextSuggestions: ["Provide a deviceId or update the harness configuration."],
    };
  }

  // ─── Android: deterministic keyevent 4 ─────────────────────────────
  if (platform === "android") {
    const runtimeHooks = resolveUiRuntimePlatformHooks("android");
    const command = runtimeHooks.buildBackPressedCommand(deviceId);
    const executedStrategy: BackExecutionPath = "android_keyevent";

    if (dryRun) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          target,
          executedStrategy,
          supportLevel: "full",
          fallbackUsed: false,
          command: command.join(" "),
          capabilityNote: "Android back uses 'adb shell input keyevent 4'. May navigate page-back or exit the current app depending on app state.",
        },
        nextSuggestions: ["Run navigate_back without dryRun to dispatch KEYEVENT_BACK on the Android device."],
      };
    }

    // Capture pre-back state BEFORE dispatching back so the comparison
    // is genuinely pre vs. post, not post-action-early vs. post-action-stable.
    const waitForStable = input.postBackWaitForStable !== false;
    let preBackTreeHash: string | undefined;
    if (waitForStable) {
      const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
      const preBackState = await getScreenSummary({
        sessionId: input.sessionId,
        platform: "android",
        runnerProfile,
        deviceId,
      });
      preBackTreeHash = preBackState.data.screenSummary?.pageIdentity?.treeHash;
    }

    const executionResult = navigateBackTestHooks?.executeBackCommand
      ? await navigateBackTestHooks.executeBackCommand()
      : await executeUiActionCommand({ repoRoot, command, requiresProbe: false });

    const outcome = normalizeBackOutcome(executionResult);
    const isSuccess = outcome.exitCode === 0;

    // Post-back stabilization (P24-C enhancement for Android)
    let postBackVerified = false;
    let postBackStableAfterMs: number | undefined;
    let postBackPageIdentity: import("@mobile-e2e-mcp/contracts").PageIdentity | undefined;
    let postBackTreeHash: string | undefined;

    if (waitForStable && isSuccess) {
      const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
      const waitForStableFn = navigateBackTestHooks?.waitForUiStable ?? navigateBackWaitForUiStable;

      // Wait for UI to stabilize after back
      const stableResult = await waitForStableFn({
        sessionId: input.sessionId,
        platform: "android",
        runnerProfile,
        deviceId,
        timeoutMs: input.verificationTimeoutMs ?? 5000,
      });

      if (stableResult.status === "success") {
        postBackVerified = true;
        postBackStableAfterMs = stableResult.data.stableAfterMs;

        // Capture post-back state and derive page identity.
        // NOTE: matching tree hashes only indicate the visible hierarchy
        // did not change — back could still have dismissed a keyboard,
        // changed readiness, or exited the app. Do NOT infer stateChanged
        // from this alone; let the caller decide.
        const postBackState = await getScreenSummary({
          sessionId: input.sessionId,
          platform: "android",
          runnerProfile,
          deviceId,
        });
        postBackTreeHash = postBackState.data.screenSummary?.pageIdentity?.treeHash;
        postBackPageIdentity = postBackState.data.screenSummary?.pageIdentity;
      }
    }

    const pageTreeHashUnchanged = preBackTreeHash !== undefined
      && preBackTreeHash === postBackTreeHash;

    return {
      status: isSuccess ? "success" : "failed",
      reasonCode: isSuccess ? REASON_CODES.ok : REASON_CODES.adapterError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        target,
        executedStrategy,
        supportLevel: "full",
        fallbackUsed: false,
        command: command.join(" "),
        exitCode: outcome.exitCode,
        stateChanged: "unknown",
        capabilityNote: "KEYEVENT_BACK dispatched. Verify screen transition separately.",
        postBackVerified,
        postBackStableAfterMs,
        postBackPageIdentity,
        // evidence only; never interpret as stateChanged=false
        pageTreeHashUnchanged,
        preBackTreeHash,
        postBackTreeHash,
      },
      nextSuggestions: isSuccess
        ? ["Verify the expected screen transition using get_session_state or inspect_ui."]
        : [buildFailureReason(outcome.stderr, outcome.exitCode)],
    };
  }

  // ─── iOS app back ────────────────────────────────────────────────────
  // With selector: tap the back button deterministically
  if (input.selector) {
    return navigateBackIosWithSelector({
      sessionId: input.sessionId,
      deviceId,
      runnerProfile,
      startTime,
      selector: input.selector,
      dryRun,
      postBackWaitForStable: input.postBackWaitForStable,
      verificationTimeoutMs: input.verificationTimeoutMs,
    });
  }

  // Without selector: strategy-dependent behavior
  const iosStrategy = input.iosStrategy ?? "selector_tap";

  if (iosStrategy === "edge_swipe") {
    const runtimeHooks = resolveUiRuntimePlatformHooks("ios");
    const executedStrategy: BackExecutionPath = "ios_edge_swipe";
    const waitForStable = input.postBackWaitForStable !== false;

    let preBackTreeHash: string | undefined;
    if (waitForStable && !dryRun) {
      const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
      const preBackState = await getScreenSummary({
        sessionId: input.sessionId,
        platform: "ios",
        runnerProfile,
        deviceId,
      });
      preBackTreeHash = preBackState.data.screenSummary?.pageIdentity?.treeHash;
    }

    const probe = await resolveIosEdgeSwipeProbe({
      repoRoot,
      deviceId,
      sessionId: input.sessionId,
      runnerProfile,
    });

    const startX = Math.min(12, Math.max(5, 8));
    const endX = Math.max(startX + 40, Math.round(probe.viewportWidth * 0.65));
    const swipeY = Math.round(
      Math.max(
        40,
        Math.min(
          probe.viewportHeight - 40,
          probe.navBarCenterY ?? probe.viewportHeight / 2,
        ),
      ),
    );

    let command: string[];
    try {
      command = runtimeHooks.buildSwipeCommand(deviceId, {
        start: { x: startX, y: swipeY },
        end: { x: endX, y: swipeY },
        durationMs: 260,
      });
    } catch (error) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun,
          target,
          executedStrategy,
          supportLevel: "conditional",
          fallbackUsed: false,
          stateChanged: false,
          capabilityNote: "iOS edge swipe back is unavailable with the current backend. Install axe (simulator) or use WDA (physical device) to enable swipe.",
        },
        nextSuggestions: [
          `Failed to build iOS edge swipe command: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }

    if (dryRun) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          target,
          executedStrategy,
          supportLevel: "conditional",
          fallbackUsed: false,
          command: command.join(" "),
          exitCode: 0,
          stateChanged: "unknown",
          capabilityNote: "iOS app back via left-edge swipe gesture (dry run).",
        },
        nextSuggestions: [
          "Run navigate_back without dryRun to execute iOS edge swipe back.",
        ],
      };
    }

    const executionResult = navigateBackTestHooks?.executeSwipeCommand
      ? await navigateBackTestHooks.executeSwipeCommand()
      : await executeUiActionCommand({
        repoRoot,
        command,
        requiresProbe: runtimeHooks.requiresProbe,
        probeRuntimeAvailability: runtimeHooks.probeRuntimeAvailability,
      });

    const outcome = normalizeBackOutcome(executionResult);
    const commandSucceeded = outcome.exitCode === 0;

    let postBackVerified = false;
    let postBackStableAfterMs: number | undefined;
    let postBackPageIdentity: import("@mobile-e2e-mcp/contracts").PageIdentity | undefined;
    let postBackTreeHash: string | undefined;

    if (waitForStable && commandSucceeded) {
      const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
      const waitForStableFn = navigateBackTestHooks?.waitForUiStable ?? navigateBackWaitForUiStable;

      const stableResult = await waitForStableFn({
        sessionId: input.sessionId,
        platform: "ios",
        runnerProfile,
        deviceId,
        timeoutMs: input.verificationTimeoutMs ?? 5000,
      });

      if (stableResult.status === "success") {
        postBackVerified = true;
        postBackStableAfterMs = stableResult.data.stableAfterMs;
        const postBackState = await getScreenSummary({
          sessionId: input.sessionId,
          platform: "ios",
          runnerProfile,
          deviceId,
        });
        postBackTreeHash = postBackState.data.screenSummary?.pageIdentity?.treeHash;
        postBackPageIdentity = postBackState.data.screenSummary?.pageIdentity;
      }
    }

    const pageTreeHashUnchanged = preBackTreeHash !== undefined && preBackTreeHash === postBackTreeHash;
    const stateChanged = preBackTreeHash !== undefined && postBackTreeHash !== undefined
      ? preBackTreeHash !== postBackTreeHash
      : "unknown";
    const noStateChange = stateChanged === false;

    return {
      status: commandSucceeded ? (noStateChange ? "partial" : "success") : "failed",
      reasonCode: commandSucceeded
        ? (noStateChange ? REASON_CODES.retryExhaustedNoStateChange : REASON_CODES.ok)
        : REASON_CODES.adapterError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun,
        target,
        executedStrategy,
        supportLevel: "conditional",
        fallbackUsed: false,
        command: command.join(" "),
        exitCode: outcome.exitCode,
        stateChanged,
        capabilityNote: commandSucceeded
          ? "iOS app back via left-edge swipe gesture."
          : "iOS edge swipe command failed to execute.",
        postBackVerified,
        postBackStableAfterMs,
        postBackPageIdentity,
        pageTreeHashUnchanged,
        preBackTreeHash,
        postBackTreeHash,
      },
      nextSuggestions: commandSucceeded
        ? (noStateChange
          ? ["Edge swipe executed but page did not change. Retry with selector_tap or provide parent back-button selector."]
          : ["Verify the expected iOS screen transition with get_screen_summary or inspect_ui."])
        : [buildFailureReason(outcome.stderr, outcome.exitCode ?? -1)],
    };
  }

  // Default: selector_tap without selector → can't proceed
  return {
    status: "failed",
    reasonCode: REASON_CODES.noMatch,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun,
      target,
      executedStrategy: "unsupported",
      supportLevel: "conditional",
      fallbackUsed: false,
      capabilityNote: "iOS app back via selector_tap requires a selector to identify the back button.",
    },
    nextSuggestions: [
      "Provide a selector for the iOS back button (e.g., contentDesc containing 'Back' or a known resourceId).",
      "Use inspect_ui to discover available back button selectors.",
    ],
  };
}

interface IosBackTapContext {
  sessionId: string;
  deviceId: string;
  runnerProfile: RunnerProfile;
  selector: NonNullable<NavigateBackInput["selector"]>;
  startTime: number;
  dryRun?: boolean;
}

async function navigateBackIosWithSelector(
  ctx: IosBackTapContext & { postBackWaitForStable?: boolean; verificationTimeoutMs?: number },
): Promise<ToolResult<NavigateBackData>> {
  // Capture pre-back state BEFORE tapping the back button so the
  // comparison is genuinely pre vs. post, not post-action-early vs.
  // post-action-stable.
  const waitForStable = ctx.postBackWaitForStable !== false;
  let preBackTreeHash: string | undefined;
  if (waitForStable && !ctx.dryRun) {
    const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
    const preBackState = await getScreenSummary({
      sessionId: ctx.sessionId,
      platform: "ios",
      runnerProfile: ctx.runnerProfile,
      deviceId: ctx.deviceId,
    });
    preBackTreeHash = preBackState.data.screenSummary?.pageIdentity?.treeHash;
  }

  const tapResult = navigateBackTestHooks?.tapBackButton
    ? await navigateBackTestHooks.tapBackButton()
    : await tapElementWithMaestroTool({
    sessionId: ctx.sessionId,
    platform: "ios",
    deviceId: ctx.deviceId,
    runnerProfile: ctx.runnerProfile,
    dryRun: ctx.dryRun ?? false,
    ...ctx.selector,
  });

  const executedStrategy: BackExecutionPath = "ios_selector_tap";

  // Post-back stabilization (P24-C enhancement)
  let postBackVerified = false;
  let postBackStableAfterMs: number | undefined;
  let postBackPageIdentity: import("@mobile-e2e-mcp/contracts").PageIdentity | undefined;
  let postBackTreeHash: string | undefined;

  if (waitForStable && tapResult.status === "success" && !ctx.dryRun) {
    const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
    const waitForStableFn = navigateBackTestHooks?.waitForUiStable ?? navigateBackWaitForUiStable;

    // Wait for UI to stabilize after back
    const stableResult = await waitForStableFn({
      sessionId: ctx.sessionId,
      platform: "ios",
      runnerProfile: ctx.runnerProfile,
      deviceId: ctx.deviceId,
      timeoutMs: ctx.verificationTimeoutMs ?? 5000,
    });

    if (stableResult.status === "success") {
      postBackVerified = true;
      postBackStableAfterMs = stableResult.data.stableAfterMs;

      // Capture post-back state and derive page identity.
      // NOTE: matching tree hashes only indicate the visible hierarchy
      // did not change — back tap could still have dismissed a keyboard,
      // changed readiness, or failed to transition. Do NOT infer stateChanged
      // from this alone; let the caller decide.
      const postBackState = await getScreenSummary({
        sessionId: ctx.sessionId,
        platform: "ios",
        runnerProfile: ctx.runnerProfile,
        deviceId: ctx.deviceId,
      });
      postBackTreeHash = postBackState.data.screenSummary?.pageIdentity?.treeHash;
      postBackPageIdentity = postBackState.data.screenSummary?.pageIdentity;
    }
  }

  const pageTreeHashUnchanged = preBackTreeHash !== undefined
    && preBackTreeHash === postBackTreeHash;

  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: ctx.sessionId,
    durationMs: Date.now() - ctx.startTime,
    attempts: tapResult.attempts,
    artifacts: tapResult.artifacts,
    data: {
      dryRun: ctx.dryRun ?? false,
      target: "app",
      executedStrategy,
      supportLevel: tapResult.data?.supportLevel ?? "conditional",
      fallbackUsed: false,
      command: Array.isArray(tapResult.data?.command)
        ? tapResult.data.command.join(" ")
        : undefined,
      exitCode: typeof tapResult.data?.exitCode === "number"
        ? tapResult.data.exitCode
        : null,
      stateChanged: "unknown",
      capabilityNote: "iOS app back via selector-based back button tap.",
      postBackVerified,
      postBackStableAfterMs,
      postBackPageIdentity,
      pageTreeHashUnchanged,
      preBackTreeHash,
      postBackTreeHash,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}
