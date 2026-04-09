import { CLI_COMMANDS } from "./constants/cli-commands.js";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import type { UiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { buildAndroidUiDumpCommands } from "./ui-runtime.js";

export function createAndroidUiRuntimeHooks(): UiRuntimePlatformHooks {
  return {
    platform: "android",
    requiresProbe: false,
    probeFailureReasonCode: REASON_CODES.configurationError,
    buildTapCommand: (deviceId, x, y) => [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", "tap", String(x), String(y)],
    buildTypeTextCommand: (deviceId, text) => [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", "text", text.replaceAll(" ", "%s")],
    buildSwipeCommand: (deviceId, swipe) => [
      "adb",
      "-s",
      deviceId,
      "shell",
      "input",
      "swipe",
      String(swipe.start.x),
      String(swipe.start.y),
      String(swipe.end.x),
      String(swipe.end.y),
      String(swipe.durationMs),
    ],
    buildHierarchyCapturePreviewCommand: (deviceId) => {
      const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
      return [...dumpCommand, ...readCommand];
    },
    probeUnavailableSuggestion: () => "Android UI runtime is unavailable. Check adb availability and selected device state.",
    tapDryRunSuggestion: "Run tap without dryRun to perform the actual Android coordinate tap.",
    tapFailureSuggestion: "Check Android device state and coordinates before retrying tap.",
    typeTextDryRunSuggestion: "Run type_text without dryRun to perform Android text entry.",
    typeTextFailureSuggestion: "Check Android device state and focused input field before retrying type_text.",
  };
}
