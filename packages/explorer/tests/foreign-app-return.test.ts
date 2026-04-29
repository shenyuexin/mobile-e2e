import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { returnToTargetAppFromForeignPage } from "../src/foreign-app-return.js";
import type { Frame } from "../src/types.js";

function makeFrame(title: string, appId = "com.android.settings"): Frame {
  return {
    state: {
      screenId: `${title}-screen`,
      screenTitle: title,
    },
    depth: 1,
    path: [title],
    elementIndex: 0,
    elements: [],
    appId,
  };
}

describe("returnToTargetAppFromForeignPage", () => {
  it("uses Android system back and skips relaunch when target app is restored", async () => {
    let currentAppId = "com.android.bluetooth";
    let backCalls = 0;
    let launchCalls = 0;

    const result = await returnToTargetAppFromForeignPage({
      platform: "android-device",
      appId: "com.android.settings",
      targetAppId: "com.android.settings",
      getCurrentAppId: () => currentAppId,
      setCurrentAppId: (appId) => {
        currentAppId = appId;
      },
      navigateBack: async () => {
        backCalls += 1;
      },
      launchApp: async () => {
        launchCalls += 1;
      },
      waitForUiStable: async () => {},
      captureAndReconcileVisiblePage: async () => {
        currentAppId = "com.android.settings";
        return makeFrame("Bluetooth");
      },
      requireTargetAppMatch: true,
      log: () => {},
    });

    assert.equal(backCalls, 1);
    assert.equal(launchCalls, 0);
    assert.equal(result.resumedBySystemBack, true);
    assert.equal(result.usedLaunchFallback, false);
    assert.equal(result.resumedFrame?.state.screenTitle, "Bluetooth");
    assert.equal(result.currentAppId, "com.android.settings");
  });

  it("falls back to relaunch when Android system back does not restore target app", async () => {
    let currentAppId = "com.android.bluetooth";
    let backCalls = 0;
    let launchCalls = 0;
    let captureCalls = 0;

    const result = await returnToTargetAppFromForeignPage({
      platform: "android-device",
      appId: "com.android.settings",
      targetAppId: "com.android.settings",
      getCurrentAppId: () => currentAppId,
      setCurrentAppId: (appId) => {
        currentAppId = appId;
      },
      navigateBack: async () => {
        backCalls += 1;
      },
      launchApp: async () => {
        launchCalls += 1;
      },
      waitForUiStable: async () => {},
      captureAndReconcileVisiblePage: async () => {
        captureCalls += 1;
        if (captureCalls === 1) {
          currentAppId = "com.android.bluetooth";
          return makeFrame("No transfer history", "com.android.bluetooth");
        }

        currentAppId = "com.android.settings";
        return makeFrame("Settings");
      },
      requireTargetAppMatch: true,
      log: () => {},
    });

    assert.equal(backCalls, 1);
    assert.equal(launchCalls, 1);
    assert.equal(result.resumedBySystemBack, false);
    assert.equal(result.usedLaunchFallback, true);
    assert.equal(result.resumedFrame?.state.screenTitle, "Settings");
    assert.equal(result.currentAppId, "com.android.settings");
  });
});
