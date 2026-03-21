import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import type { UiRuntimePlatformHooks, UiRuntimeProbeAction } from "./ui-runtime-platform.js";
import {
  buildIdbCommand,
  buildIosSwipeCommand,
  buildIosUiDescribeCommand,
  probeIdbAvailability,
} from "./ui-runtime.js";

function buildProbeSuggestion(action: UiRuntimeProbeAction): string {
  if (action === "inspect_ui") {
    return "iOS inspect_ui in this repo requires idb. Install idb-companion and fb-idb, then retry inspect_ui.";
  }
  if (action === "tap") {
    return "iOS tap requires idb. Install fb-idb and idb_companion, or set IDB_CLI_PATH/IDB_COMPANION_PATH before retrying.";
  }
  return "iOS type_text requires idb. Install fb-idb and idb_companion, or set IDB_CLI_PATH/IDB_COMPANION_PATH before retrying.";
}

export function createIosUiRuntimeHooks(): UiRuntimePlatformHooks {
  return {
    platform: "ios",
    requiresProbe: true,
    probeFailureReasonCode: REASON_CODES.configurationError,
    buildTapCommand: (deviceId, x, y) => buildIdbCommand(["ui", "tap", String(x), String(y), "--udid", deviceId]),
    buildTypeTextCommand: (deviceId, text) => buildIdbCommand(["ui", "text", text, "--udid", deviceId]),
    buildSwipeCommand: (deviceId, swipe) => buildIosSwipeCommand(deviceId, swipe),
    buildHierarchyCapturePreviewCommand: (deviceId) => buildIosUiDescribeCommand(deviceId),
    probeRuntimeAvailability: async (repoRoot) => probeIdbAvailability(repoRoot),
    probeUnavailableSuggestion: buildProbeSuggestion,
    tapDryRunSuggestion: "Run tap without dryRun to perform the actual iOS simulator coordinate tap through idb.",
    tapFailureSuggestion: "Check the selected simulator coordinates and idb companion availability before retrying tap.",
    typeTextDryRunSuggestion: "Run type_text without dryRun to perform iOS simulator text entry through idb.",
    typeTextFailureSuggestion: "Check the selected simulator, focused element, and idb companion availability before retrying type_text.",
  };
}
