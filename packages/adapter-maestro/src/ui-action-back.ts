import type {
  BackExecutionPath,
  BackTarget,
  GetScreenSummaryData,
  InspectUiNode,
  NavigateBackData,
  NavigateBackInput,
  RunnerProfile,
  TapElementData,
  ToolResult,
  WaitForUiStableData,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import { parseUiBounds } from "./ui-model.js";
import {
  captureIosUiRuntimeSnapshot,
  executeUiActionCommand,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { buildFailureReason } from "./runtime-shared.js";

export interface NavigateBackTestHooks {
  getScreenSummary?: (input: {
    sessionId: string;
    platform: "android" | "ios";
    runnerProfile: RunnerProfile;
    deviceId?: string;
  }) => Promise<ToolResult<GetScreenSummaryData>>;
  waitForUiStable?: (input: {
    sessionId: string;
    platform: "android" | "ios";
    runnerProfile: RunnerProfile;
    deviceId?: string;
    timeoutMs?: number;
  }) => Promise<ToolResult<WaitForUiStableData>>;
  executeBackCommand?: () => Promise<{ exitCode: number; stderr: string; stdout: string }>;
  executeSwipeCommand?: () => Promise<{ exitCode: number; stderr: string; stdout: string }>;
  iosEdgeSwipeProbe?: () => Promise<{
    viewportWidth: number;
    viewportHeight: number;
    navBarCenterY?: number;
  }>;
  tapBackButton?: () => Promise<ToolResult<TapElementData>>;
}

let navigateBackTestHooks: NavigateBackTestHooks | undefined;

export function setNavigateBackTestHooksForTesting(
  hooks: NavigateBackTestHooks | undefined,
): void {
  navigateBackTestHooks = hooks;
}

export function resetNavigateBackTestHooksForTesting(): void {
  navigateBackTestHooks = undefined;
}

interface BackActionOutcome {
  exitCode: number | null;
  stderr: string;
}

function normalizeBackOutcome(
  result:
    | Awaited<ReturnType<typeof executeUiActionCommand>>
    | Awaited<ReturnType<NonNullable<NavigateBackTestHooks["executeBackCommand"]>>>,
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

async function navigateBackGetScreenSummary(input: {
  sessionId: string;
  platform: "android" | "ios";
  runnerProfile: RunnerProfile;
  deviceId?: string;
}) {
  const { getScreenSummaryWithMaestro } = await import("./session-state.js");
  return getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    deviceId: input.deviceId,
  });
}

async function navigateBackWaitForUiStable(input: {
  sessionId: string;
  platform: "android" | "ios";
  runnerProfile: RunnerProfile;
  deviceId?: string;
  timeoutMs?: number;
}) {
  const { waitForUiStableWithMaestro } = await import("./ui-stability.js");
  return waitForUiStableWithMaestro({
    sessionId: input.sessionId,
    platform: input.platform,
    runnerProfile: input.runnerProfile,
    deviceId: input.deviceId,
    timeoutMs: input.timeoutMs,
  });
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
    : await (await import("./ui-action-tools.js")).tapElementWithMaestroTool({
      sessionId: ctx.sessionId,
      platform: "ios",
      deviceId: ctx.deviceId,
      runnerProfile: ctx.runnerProfile,
      dryRun: ctx.dryRun ?? false,
      ...ctx.selector,
    });

  const executedStrategy: BackExecutionPath = "ios_selector_tap";

  let postBackVerified = false;
  let postBackStableAfterMs: number | undefined;
  let postBackPageIdentity: import("@mobile-e2e-mcp/contracts").PageIdentity | undefined;
  let postBackTreeHash: string | undefined;

  if (waitForStable && tapResult.status === "success" && !ctx.dryRun) {
    const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
    const waitForStableFn = navigateBackTestHooks?.waitForUiStable ?? navigateBackWaitForUiStable;

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

    let postBackVerified = false;
    let postBackStableAfterMs: number | undefined;
    let postBackPageIdentity: import("@mobile-e2e-mcp/contracts").PageIdentity | undefined;
    let postBackTreeHash: string | undefined;

    if (waitForStable && isSuccess) {
      const getScreenSummary = navigateBackTestHooks?.getScreenSummary ?? navigateBackGetScreenSummary;
      const waitForStableFn = navigateBackTestHooks?.waitForUiStable ?? navigateBackWaitForUiStable;

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
        pageTreeHashUnchanged,
        preBackTreeHash,
        postBackTreeHash,
      },
      nextSuggestions: isSuccess
        ? ["Verify the expected screen transition using get_session_state or inspect_ui."]
        : [buildFailureReason(outcome.stderr, outcome.exitCode)],
    };
  }

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
