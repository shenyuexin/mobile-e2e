import type { ExplorerPlatform, UiHierarchy } from "./types.js";
import { createExplorerPlatformAndroidHooks } from "./explorer-platform-android.js";
import { createExplorerPlatformIosHooks } from "./explorer-platform-ios.js";

export interface ExplorerNavigateBackSelector {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
}

export interface ExplorerNavigateBackInput {
  parentPageTitle?: string;
  iosStrategy?: "selector_tap" | "edge_swipe";
  selector?: ExplorerNavigateBackSelector;
}

export interface ExplorerPlatformHooks {
  platform: "ios" | "android";
  parseInspectUi: (data: Record<string, unknown>, options: { fallbackToDataRoot: boolean }) => UiHierarchy | null;
  extractScreenTitle: (uiTree: UiHierarchy) => string | undefined;
  extractAppId: (uiTree: UiHierarchy) => string | undefined;
  buildNavigateBackSelector: (args?: ExplorerNavigateBackInput) => ExplorerNavigateBackSelector | undefined;
}

const EXPLORER_PLATFORM_HOOKS: Record<"ios" | "android", ExplorerPlatformHooks> = {
  ios: createExplorerPlatformIosHooks(),
  android: createExplorerPlatformAndroidHooks(),
};

export function resolveExplorerPlatformHooks(platform: ExplorerPlatform | "ios" | "android"): ExplorerPlatformHooks {
  if (platform === "ios" || platform === "ios-simulator" || platform === "ios-device") {
    return EXPLORER_PLATFORM_HOOKS.ios;
  }
  return EXPLORER_PLATFORM_HOOKS.android;
}
