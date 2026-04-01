import type { Platform, ReasonCode } from "@mobile-e2e-mcp/contracts";
import type { CommandExecution } from "./runtime-shared.js";
import { createAndroidUiRuntimeHooks } from "./ui-runtime-android.js";
import { createIosUiRuntimeHooks } from "./ui-runtime-ios.js";

export type UiRuntimeProbeAction = "inspect_ui" | "tap" | "type_text";

export interface UiRuntimePlatformHooks {
  platform: Platform;
  requiresProbe: boolean;
  probeFailureReasonCode: ReasonCode;
  buildTapCommand: (deviceId: string, x: number, y: number) => string[];
  buildDescribePointCommand?: (deviceId: string, x: number, y: number) => string[];
  buildTypeTextCommand: (deviceId: string, text: string) => string[];
  buildSwipeCommand: (deviceId: string, swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number }) => string[];
  buildHierarchyCapturePreviewCommand: (deviceId: string) => string[];
  probeRuntimeAvailability?: (repoRoot: string) => Promise<CommandExecution | undefined>;
  probeUnavailableSuggestion: (action: UiRuntimeProbeAction) => string;
  tapDryRunSuggestion: string;
  tapFailureSuggestion: string;
  typeTextDryRunSuggestion: string;
  typeTextFailureSuggestion: string;
}

const UI_RUNTIME_HOOKS: Record<Platform, UiRuntimePlatformHooks> = {
  android: createAndroidUiRuntimeHooks(),
  ios: createIosUiRuntimeHooks(),
};

export function resolveUiRuntimePlatformHooks(platform: Platform): UiRuntimePlatformHooks {
  return UI_RUNTIME_HOOKS[platform];
}
