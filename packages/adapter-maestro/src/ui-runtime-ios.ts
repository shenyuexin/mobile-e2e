import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import type { InspectUiNode } from "@mobile-e2e-mcp/contracts";
import { buildIosNativeLocatorCandidate, extractIosEditableNodeValue, isIosEditableNode, parseIosInspectNodes } from "./ui-model.js";
import type { UiResolvedPointVerificationParams, UiResolvedPointVerificationResult, UiRuntimePlatformHooks, UiRuntimeProbeAction, UiTypedPostconditionVerificationParams } from "./ui-runtime-platform.js";
import { getIosBackendRouter } from "./ios-backend-router.js";
import { executeUiActionCommand } from "./ui-runtime.js";
import { buildFailureReason } from "./runtime-shared.js";

/**
 * Find the deepest node whose bounds contain the given point.
 * Returns the most specific (smallest area) node at that location.
 */
function findNodeAtPoint(nodes: InspectUiNode[], point: { x: number; y: number }): InspectUiNode | undefined {
  const matchingNodes = nodes.filter((node) => {
    if (!node.bounds) return false;
    const bounds = parseBounds(node.bounds);
    if (!bounds) return false;
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  });

  // Return the smallest node (most specific) that contains the point
  return matchingNodes.sort((a, b) => {
    const areaA = boundsArea(a.bounds!);
    const areaB = boundsArea(b.bounds!);
    return areaA - areaB;
  })[0];
}

function parseBounds(boundsStr: string): { left: number; top: number; right: number; bottom: number } | undefined {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return undefined;
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
}

function boundsArea(boundsStr: string): number {
  const bounds = parseBounds(boundsStr);
  if (!bounds) return Infinity;
  return (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
}

function escapeYamlDoubleQuoted(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\n", "\\n");
}

export function buildIosPhysicalTapFlowYaml(x: number, y: number): string {
  return [
    'appId: "*"',
    "---",
    "- tapOn:",
    `    point: "${String(x)},${String(y)}"`,
    "",
  ].join("\n");
}

export function buildIosPhysicalTypeTextFlowYaml(text: string): string {
  return [
    'appId: "*"',
    "---",
    `- inputText: "${escapeYamlDoubleQuoted(text)}"`,
    "",
  ].join("\n");
}

export function buildIosPhysicalMaestroCommand(deviceId: string, flowPath: string): string[] {
  return [
    "maestro",
    "test",
    "--platform",
    "ios",
    "--udid",
    deviceId,
    flowPath,
  ];
}

export type IosPhysicalActionBackend = "maestro_cli" | "local_manual_runner";

export interface IosPhysicalActionExecutionPlan {
  backend: IosPhysicalActionBackend;
  command: string[];
  envPatch: Record<string, string>;
}

export function resolveIosPhysicalActionBackend(env: NodeJS.ProcessEnv = process.env): IosPhysicalActionBackend {
  const configured = env.IOS_PHYSICAL_ACTION_BACKEND?.trim().toLowerCase();
  if (configured === "local_manual_runner") {
    return "local_manual_runner";
  }
  return "maestro_cli";
}

export function buildIosPhysicalActionExecutionPlan(
  deviceId: string,
  flowPath: string,
  env: NodeJS.ProcessEnv = process.env,
): IosPhysicalActionExecutionPlan {
  const backend = resolveIosPhysicalActionBackend(env);
  if (backend === "local_manual_runner") {
    return {
      backend,
      command: ["bash", "scripts/dev/run-ios-owned-physical-runner.sh", "execute-flow"],
      envPatch: {
        IOS_OWNED_RUNNER_UDID: deviceId,
        IOS_OWNED_RUNNER_FLOW_PATH: flowPath,
      },
    };
  }
  return {
    backend,
    command: buildIosPhysicalMaestroCommand(deviceId, flowPath),
    envPatch: {},
  };
}

function buildProbeSuggestion(action: UiRuntimeProbeAction): string {
  if (action === "inspect_ui") {
    return "iOS inspect_ui uses xcrun simctl (simulators) or devicectl+Maestro (physical devices). Run 'mobile-e2e-mcp doctor' to verify backend availability.";
  }
  if (action === ACTION_TYPES.tap) {
    return "iOS tap uses xcrun simctl io tap (simulators) or Maestro flow YAML (physical devices). Set IOS_EXECUTION_BACKEND to force a specific backend.";
  }
  return "iOS type_text uses xcrun simctl keyboard type (simulators) or Maestro flow YAML (physical devices). Set IOS_EXECUTION_BACKEND to force a specific backend.";
}

export function isIosSimulatorOnlyIdbActionError(stderr: string): boolean {
  return stderr.toLowerCase().includes("fbsimulatorlifecyclecommands protocol");
}

export async function verifyResolvedIosPointWithHooks(
  params: UiResolvedPointVerificationParams & {
    executeDescribePointCommand?: typeof executeUiActionCommand;
  },
): Promise<UiResolvedPointVerificationResult> {
  const expected = buildIosNativeLocatorCandidate(params.resolvedNode, params.resolvedQuery);
  const command = params.runtimeHooks.buildDescribePointCommand?.(
    params.deviceId,
    params.resolvedPoint.x,
    params.resolvedPoint.y,
  ) ?? [];
  if (!expected || command.length === 0) {
    return { verified: false, command, exitCode: null };
  }

  const executeDescribePoint = params.executeDescribePointCommand ?? executeUiActionCommand;
  const actionResult = await executeDescribePoint({
    repoRoot: params.repoRoot,
    command,
    requiresProbe: params.runtimeHooks.requiresProbe,
    probeRuntimeAvailability: params.runtimeHooks.probeRuntimeAvailability,
  });
  if (!actionResult.execution) {
    return {
      verified: false,
      command,
      exitCode: actionResult.probeExecution?.exitCode ?? null,
      reasonCode: params.runtimeHooks.probeFailureReasonCode,
    };
  }
  if (actionResult.execution.exitCode !== 0) {
    return {
      verified: false,
      command,
      exitCode: actionResult.execution.exitCode,
      reasonCode: buildFailureReason(actionResult.execution.stderr, actionResult.execution.exitCode),
    };
  }

  const pointNode = parseIosInspectNodes(actionResult.execution.stdout)[0];
  const actual = buildIosNativeLocatorCandidate(pointNode, params.resolvedQuery);
  
  // Bug fix: The first node is always the Application root, not the node at the resolved point.
  // We need to find the node whose bounds contain the resolved point.
  const allNodes = parseIosInspectNodes(actionResult.execution.stdout);
  const nodeAtPoint = findNodeAtPoint(allNodes, params.resolvedPoint);
  const actualCandidate = nodeAtPoint
    ? buildIosNativeLocatorCandidate(nodeAtPoint, params.resolvedQuery)
    : actual;
  
  const verified = actualCandidate?.kind === expected.kind
    && actualCandidate.value === expected.value
    && actualCandidate.text === expected.text
    && actualCandidate.contentDesc === expected.contentDesc
    && actualCandidate.className === expected.className;

  // If the tap succeeded (exitCode 0) but the node doesn't match, the screen likely
  // changed due to navigation. Report it as not verified so the caller can decide
  // based on full state comparison rather than silently masking the mismatch.
  if (!verified && actionResult.execution.exitCode === 0) {
    return {
      verified: false,
      command,
      exitCode: actionResult.execution.exitCode,
      reasonCode: REASON_CODES.noMatch,
    };
  }

  return {
    verified,
    command,
    exitCode: actionResult.execution.exitCode,
    reasonCode: verified ? REASON_CODES.ok : REASON_CODES.noMatch,
  };
}

export async function verifyTypedIosPostconditionWithHooks(
  params: UiTypedPostconditionVerificationParams & {
    executeDescribePointCommand?: typeof executeUiActionCommand;
  },
): Promise<UiResolvedPointVerificationResult> {
  const baseVerification = await verifyResolvedIosPointWithHooks(params);
  if (!baseVerification.verified) {
    return baseVerification;
  }

  const executeDescribePoint = params.executeDescribePointCommand ?? executeUiActionCommand;
  const actionResult = await executeDescribePoint({
    repoRoot: params.repoRoot,
    command: baseVerification.command,
    requiresProbe: params.runtimeHooks.requiresProbe,
    probeRuntimeAvailability: params.runtimeHooks.probeRuntimeAvailability,
  });
  if (!actionResult.execution) {
    return {
      verified: false,
      command: baseVerification.command,
      exitCode: actionResult.probeExecution?.exitCode ?? null,
      reasonCode: params.runtimeHooks.probeFailureReasonCode,
    };
  }
  if (actionResult.execution.exitCode !== 0) {
    return {
      verified: false,
      command: baseVerification.command,
      exitCode: actionResult.execution.exitCode,
      reasonCode: buildFailureReason(actionResult.execution.stderr, actionResult.execution.exitCode),
    };
  }

  const pointNode = parseIosInspectNodes(actionResult.execution.stdout)[0];
  const actual = buildIosNativeLocatorCandidate(pointNode, params.resolvedQuery);
  const expected = buildIosNativeLocatorCandidate(params.resolvedNode, params.resolvedQuery);
  if (!actual || !expected || actual.kind !== expected.kind || actual.value !== expected.value || actual.text !== expected.text || actual.contentDesc !== expected.contentDesc || actual.className !== expected.className) {
    return {
      verified: false,
      command: baseVerification.command,
      exitCode: actionResult.execution.exitCode,
      reasonCode: REASON_CODES.noMatch,
    };
  }
  if (isIosEditableNode(params.resolvedNode) && params.resolvedNode.className?.toLowerCase() !== "securetextfield") {
    const observedValue = extractIosEditableNodeValue(pointNode);
    if (observedValue !== params.typedValue) {
      return {
        verified: false,
        command: baseVerification.command,
        exitCode: actionResult.execution.exitCode,
        reasonCode: REASON_CODES.actionTypeFailed,
      };
    }
  }

  return {
    verified: true,
    command: baseVerification.command,
    exitCode: actionResult.execution.exitCode,
    reasonCode: REASON_CODES.ok,
  };
}

export function createIosUiRuntimeHooks(): UiRuntimePlatformHooks {
  const router = getIosBackendRouter();

  return {
    platform: "ios",
    requiresProbe: true,
    probeFailureReasonCode: REASON_CODES.configurationError,
    buildTapCommand: (deviceId, x, y) => {
      const backend = router.selectBackend(deviceId);
      return backend.buildTapCommand(deviceId, x, y);
    },
    buildDescribePointCommand: (deviceId, x, y) => {
      const backend = router.selectBackend(deviceId);
      return backend.buildHierarchyCaptureCommand(deviceId);
    },
    verifyResolvedPoint: verifyResolvedIosPointWithHooks,
    verifyTypedPostcondition: verifyTypedIosPostconditionWithHooks,
    buildTypeTextCommand: (deviceId, text) => {
      const backend = router.selectBackend(deviceId);
      return backend.buildTypeTextCommand(deviceId, text);
    },
    buildSwipeCommand: (deviceId, swipe) => {
      const backend = router.selectBackend(deviceId);
      return backend.buildSwipeCommand(deviceId, swipe);
    },
    buildBackPressedCommand: () => {
      throw new Error("iOS does not support deterministic system-level back navigation. Use navigate_back with target: 'app' and a selector for app-level back.");
    },
    buildHierarchyCapturePreviewCommand: (deviceId) => {
      const backend = router.selectBackend(deviceId);
      return backend.buildHierarchyCaptureCommand(deviceId);
    },
    probeRuntimeAvailability: async (repoRoot) => {
      const summary = await router.probeAllBackends(repoRoot);
      if (summary.simctl.available) return { exitCode: 0, stdout: `simctl ${summary.simctl.version ?? ""}`, stderr: "" };
      if (summary.devicectl.available) return { exitCode: 0, stdout: `devicectl ${summary.devicectl.version ?? ""}`, stderr: "" };
      return undefined;
    },
    probeUnavailableSuggestion: buildProbeSuggestion,
    tapDryRunSuggestion: "Run tap without dryRun to perform iOS coordinate tap through the auto-selected backend (simctl for simulators, devicectl+Maestro for physical devices).",
    tapFailureSuggestion: "If iOS tap fails, check simulator boot state or physical device connectivity. Verify backend selection with 'mobile-e2e-mcp doctor'.",
    typeTextDryRunSuggestion: "Run type_text without dryRun to perform iOS text entry through the auto-selected backend.",
    typeTextFailureSuggestion: "If iOS type_text fails, verify backend availability and device state. Run 'mobile-e2e-mcp doctor' for diagnostics.",
  };
}
