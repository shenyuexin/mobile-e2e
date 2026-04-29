import type { ExplorerPlatform, Frame } from "./types.js";

export interface ReturnToTargetAppDeps {
  appId: string;
  targetAppId: string;
  platform: ExplorerPlatform;
  getCurrentAppId: () => string;
  setCurrentAppId: (appId: string) => void;
  navigateBack: () => Promise<void>;
  launchApp: (args: { appId: string }) => Promise<void>;
  waitForUiStable: (args: { timeoutMs: number }) => Promise<void>;
  captureAndReconcileVisiblePage: () => Promise<Frame | undefined>;
  log?: (message: string) => void;
  navigateBackToParentOnLaunchFailure?: () => Promise<void>;
  requireTargetAppMatch?: boolean;
}

export interface ReturnToTargetAppResult {
  currentAppId: string;
  resumedBySystemBack: boolean;
  resumedFrame: Frame | undefined;
  usedLaunchFallback: boolean;
}

function isAndroidExplorerPlatform(platform: ExplorerPlatform): boolean {
  return platform === "android-device" || platform === "android-emulator";
}

export async function returnToTargetAppFromForeignPage(
  deps: ReturnToTargetAppDeps,
): Promise<ReturnToTargetAppResult> {
  const log = deps.log ?? (() => {});
  let resumedFrame: Frame | undefined;
  let resumedBySystemBack = false;

  if (isAndroidExplorerPlatform(deps.platform)) {
    log(`[APP-SWITCH] Attempting Android system back before relaunch...`);
    await deps.navigateBack();
    resumedFrame = await deps.captureAndReconcileVisiblePage();

    const targetAppMatched = !deps.requireTargetAppMatch || deps.getCurrentAppId() === deps.targetAppId;
    if (resumedFrame && targetAppMatched) {
      log(
        `[APP-SWITCH] Returned via system back at page "${resumedFrame.state.screenTitle ?? resumedFrame.state.screenId ?? "(unknown)"}" ` +
        `(app=${deps.getCurrentAppId()})`,
      );
      resumedBySystemBack = true;
      return {
        currentAppId: deps.getCurrentAppId(),
        resumedBySystemBack,
        resumedFrame,
        usedLaunchFallback: false,
      };
    }
  }

  log(`[APP-SWITCH] Returning to target app ${deps.appId} via launchApp...`);
  try {
    await deps.launchApp({ appId: deps.appId });
  } catch (error) {
    if (!deps.navigateBackToParentOnLaunchFailure) {
      throw error;
    }

    log(`[APP-SWITCH] launchApp failed, falling back to navigateBack: ${error}`);
    await deps.navigateBackToParentOnLaunchFailure();
    return {
      currentAppId: deps.getCurrentAppId(),
      resumedBySystemBack: false,
      resumedFrame: undefined,
      usedLaunchFallback: true,
    };
  }
  await deps.waitForUiStable({ timeoutMs: 3000 });
  deps.setCurrentAppId(deps.targetAppId);
  resumedFrame = await deps.captureAndReconcileVisiblePage();
  log(`[APP-SWITCH] Current page after return: ${resumedFrame?.state.screenTitle || "(unknown)"}`);

  return {
    currentAppId: deps.getCurrentAppId(),
    resumedBySystemBack,
    resumedFrame,
    usedLaunchFallback: true,
  };
}
