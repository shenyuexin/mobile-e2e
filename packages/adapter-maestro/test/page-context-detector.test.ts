import assert from "node:assert/strict";
import test from "node:test";
import { detectPageContext } from "../src/page-context-detector.ts";

test("detectPageContext classifies permission surface from blocking signals and dialog affordances", async () => {
  const result = await detectPageContext({
    platform: "android",
    stateSummary: {
      appPhase: "ready",
      readiness: "interrupted",
      blockingSignals: ["permission_prompt"],
      topVisibleTexts: ["Allow", "Don't Allow"],
    },
    uiSummary: {
      totalNodes: 4,
      clickableNodes: 2,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "Allow", className: "Dialog", packageName: "com.example.app" },
      ],
    },
    appId: "com.example.app",
    appIdentitySource: "session",
    deviceId: "android-emulator-1",
  });

  assert.equal(result.pageContext.type, "permission_surface");
  assert.equal(result.pageContext.platform, "android");
  assert.equal(result.pageContext.runtimeFlavor, "android_default");
});

test("detectPageContext uses lightweight preflight probe for ios real-device context", async () => {
  let probeCalls = 0;
  const result = await detectPageContext({
    platform: "ios",
    stateSummary: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
      topVisibleTexts: ["Settings"],
    },
    uiSummary: {
      totalNodes: 2,
      clickableNodes: 1,
      scrollableNodes: 0,
      nodesWithText: 1,
      nodesWithContentDesc: 0,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "Settings", className: "Alert", packageName: "com.apple.springboard" },
      ],
    },
    appIdentitySource: "session",
    deviceId: "ios-physical-1",
    probeIosRealDevicePreflight: async () => {
      probeCalls += 1;
      return { available: true, version: "session:abcd1234" };
    },
  });

  assert.equal(probeCalls, 1);
  assert.equal(result.pageContext.platform, "ios");
  assert.equal(result.pageContext.runtimeFlavor, "ios_real_device");
  assert.equal(result.pageContext.detectionSource, "deterministic");
  assert.equal(result.preflightProbe?.available, true);
});

test("detectPageContext treats foreign Android owner package as system overlay instead of app dialog", async () => {
  const result = await detectPageContext({
    platform: "android",
    stateSummary: {
      appPhase: "ready",
      readiness: "interrupted",
      blockingSignals: ["dialog_actions"],
      topVisibleTexts: ["Open settings", "Cancel"],
    },
    uiSummary: {
      totalNodes: 4,
      clickableNodes: 2,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        {
          clickable: false,
          enabled: true,
          scrollable: false,
          text: "Open settings",
          className: "Dialog",
          packageName: "com.android.settings",
        },
      ],
    },
    appId: "com.example.app",
    appIdentitySource: "session",
    deviceId: "android-emulator-1",
  });

  assert.equal(result.pageContext.type, "system_overlay");
  assert.equal(result.pageContext.ownerPackage, "com.android.settings");
});

test("detectPageContext treats foreign iOS simulator dialog surface as system alert instead of app dialog", async () => {
  const result = await detectPageContext({
    platform: "ios",
    stateSummary: {
      appPhase: "blocked",
      readiness: "interrupted",
      blockingSignals: ["dialog_actions"],
      topVisibleTexts: ["Allow", "Don’t Allow"],
    },
    uiSummary: {
      totalNodes: 4,
      clickableNodes: 2,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        {
          clickable: false,
          enabled: true,
          scrollable: false,
          text: "Allow",
          className: "Dialog",
          packageName: "com.apple.springboard",
        },
      ],
    },
    appId: "com.example.app",
    appIdentitySource: "session",
    deviceId: "A1B2C3D4-1111-2222-3333-444444444444",
  });

  assert.equal(result.pageContext.runtimeFlavor, "ios_simulator");
  assert.equal(result.pageContext.type, "system_alert_surface");
  assert.equal(result.pageContext.ownerBundle, "com.apple.springboard");
});
