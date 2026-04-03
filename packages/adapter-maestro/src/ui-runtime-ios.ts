import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { buildIosNativeLocatorCandidate, extractIosEditableNodeValue, isIosEditableNode, parseIosInspectNodes } from "./ui-model.js";
import type { UiResolvedPointVerificationParams, UiResolvedPointVerificationResult, UiRuntimePlatformHooks, UiRuntimeProbeAction, UiTypedPostconditionVerificationParams } from "./ui-runtime-platform.js";
import {
  buildIdbCommand,
  buildIosUiDescribePointCommand,
  buildIosSwipeCommand,
  buildIosUiDescribeCommand,
  executeUiActionCommand,
  probeIdbAvailability,
} from "./ui-runtime.js";
import { buildFailureReason } from "./runtime-shared.js";

function buildProbeSuggestion(action: UiRuntimeProbeAction): string {
  if (action === "inspect_ui") {
    return "iOS inspect_ui in this repo requires idb. Install idb-companion and fb-idb, then retry inspect_ui.";
  }
  if (action === "tap") {
    return "iOS tap requires idb. Install fb-idb and idb_companion, or set IDB_CLI_PATH/IDB_COMPANION_PATH before retrying.";
  }
  return "iOS type_text requires idb. Install fb-idb and idb_companion, or set IDB_CLI_PATH/IDB_COMPANION_PATH before retrying.";
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
  const verified = actual?.kind === expected.kind
    && actual.value === expected.value
    && actual.text === expected.text
    && actual.contentDesc === expected.contentDesc
    && actual.className === expected.className;
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
  return {
    platform: "ios",
    requiresProbe: true,
    probeFailureReasonCode: REASON_CODES.configurationError,
    buildTapCommand: (deviceId, x, y) => buildIdbCommand(["ui", "tap", String(x), String(y), "--udid", deviceId]),
    buildDescribePointCommand: (deviceId, x, y) => buildIosUiDescribePointCommand(deviceId, x, y),
    verifyResolvedPoint: verifyResolvedIosPointWithHooks,
    verifyTypedPostcondition: verifyTypedIosPostconditionWithHooks,
    buildTypeTextCommand: (deviceId, text) => buildIdbCommand(["ui", "text", text, "--udid", deviceId]),
    buildSwipeCommand: (deviceId, swipe) => buildIosSwipeCommand(deviceId, swipe),
    buildHierarchyCapturePreviewCommand: (deviceId) => buildIosUiDescribeCommand(deviceId),
    probeRuntimeAvailability: async (repoRoot) => probeIdbAvailability(repoRoot),
    probeUnavailableSuggestion: buildProbeSuggestion,
    tapDryRunSuggestion: "Run tap without dryRun to perform iOS coordinate tap through idb (simulator-first path).",
    tapFailureSuggestion: "If target is a physical iOS device and stderr mentions FBSimulatorLifecycleCommands, this direct idb tap path is simulator-scoped; use run_flow with signed iOS driver path instead.",
    typeTextDryRunSuggestion: "Run type_text without dryRun to perform iOS text entry through idb (simulator-first path).",
    typeTextFailureSuggestion: "If target is a physical iOS device and stderr mentions FBSimulatorLifecycleCommands, this direct idb type_text path is simulator-scoped; use run_flow with signed iOS driver path instead.",
  };
}
