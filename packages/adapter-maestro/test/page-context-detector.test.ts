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

test("detectPageContext classifies Android hotspot configuration editor as form_editor", async () => {
  const result = await detectPageContext({
    platform: "android",
    stateSummary: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
      topVisibleTexts: [
        "Hotspot configuration",
        "Network name",
        "Password",
        "Security",
        "Cancel",
        "Done",
      ],
    },
    uiSummary: {
      totalNodes: 12,
      clickableNodes: 4,
      scrollableNodes: 0,
      nodesWithText: 8,
      nodesWithContentDesc: 1,
      sampleNodes: [
        {
          clickable: false,
          enabled: true,
          scrollable: false,
          text: "Hotspot configuration",
          className: "android.widget.TextView",
          packageName: "com.android.settings",
        },
        {
          clickable: true,
          enabled: true,
          scrollable: false,
          text: "vivo X200 Pro",
          className: "android.widget.EditText",
          packageName: "com.android.settings",
        },
        {
          clickable: true,
          enabled: true,
          scrollable: false,
          text: "3fbww65f7my25gt",
          className: "android.widget.EditText",
          packageName: "com.android.settings",
        },
        {
          clickable: true,
          enabled: true,
          scrollable: false,
          text: "WPA2 PSK",
          className: "android.widget.Spinner",
          packageName: "com.android.settings",
        },
      ],
    },
    appId: "com.android.settings",
    appIdentitySource: "session",
    deviceId: "android-device-1",
  });

  assert.equal(result.pageContext.type, "form_editor");
  assert.equal(result.pageContext.ownerPackage, "com.android.settings");
});

test("detectPageContext classifies Android Settings selection list with cancel+done as form_editor", async () => {
	const result = await detectPageContext({
		platform: "android",
		stateSummary: {
			appPhase: "ready",
			readiness: "ready",
			blockingSignals: [],
			topVisibleTexts: ["Add apps", "Cancel", "Done"],
			screenTitle: "Add apps",
		},
		uiSummary: {
			totalNodes: 20,
			clickableNodes: 15,
			scrollableNodes: 1,
			nodesWithText: 18,
			nodesWithContentDesc: 0,
			sampleNodes: [
				{
					clickable: false,
					enabled: true,
					scrollable: false,
					text: "Add apps",
					className: "android.widget.TextView",
					packageName: "com.android.settings",
				},
				{
					clickable: false,
					enabled: true,
					scrollable: true,
					text: "",
					className: "android.widget.ListView",
					packageName: "com.android.settings",
				},
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Albums",
					className: "android.widget.RelativeLayout",
					packageName: "com.android.settings",
				},
			],
		},
		appId: "com.android.settings",
		appIdentitySource: "session",
		deviceId: "android-device-1",
	});

	assert.equal(result.pageContext.type, "form_editor");
	assert.equal(result.pageContext.ownerPackage, "com.android.settings");
});

test("detectPageContext classifies Android app picker even with wrong title and no cancel/done in top texts", async () => {
	const result = await detectPageContext({
		platform: "android",
		stateSummary: {
			appPhase: "ready",
			readiness: "ready",
			blockingSignals: [],
			// Title extraction may pick the first list item (e.g., "Alibaba")
			// instead of the real page title. cancel/done may also be missing
			// from topVisibleTexts if they fall outside the first 12 texts.
			topVisibleTexts: ["Alibaba", "Albums", "Alipay", "Amap"],
			screenTitle: "Alibaba",
		},
		uiSummary: {
			totalNodes: 30,
			clickableNodes: 15,
			scrollableNodes: 1,
			nodesWithText: 20,
			nodesWithContentDesc: 0,
			sampleNodes: [
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Alibaba",
					className: "android.widget.RelativeLayout",
					packageName: "com.android.settings",
				},
				{
					clickable: true,
					enabled: true,
					scrollable: true,
					text: "",
					resourceId: "com.android.settings:id/listView",
					className: "android.widget.ListView",
					packageName: "com.android.settings",
				},
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Add apps",
					className: "android.widget.Button",
					packageName: "com.android.settings",
				},
			],
		},
		appId: "com.android.settings",
		appIdentitySource: "session",
		deviceId: "android-device-1",
	});

	assert.equal(result.pageContext.type, "form_editor");
	assert.equal(result.pageContext.ownerPackage, "com.android.settings");
});

test("detectPageContext classifies Android app picker when ListView container is not in sampleNodes", async () => {
	const result = await detectPageContext({
		platform: "android",
		stateSummary: {
			appPhase: "ready",
			readiness: "ready",
			blockingSignals: [],
			// Title extraction picks the first list item; topVisibleTexts is capped at 12.
			topVisibleTexts: ["Alibaba", "Albums", "Alipay", "Amap", "APKPure", "Authenticator", "BlueLM Copilot", "Browser", "Calculator", "Calendar", "Add apps", "A"],
			screenTitle: "Alibaba",
		},
		uiSummary: {
			totalNodes: 30,
			clickableNodes: 15,
			scrollableNodes: 1,
			nodesWithText: 20,
			nodesWithContentDesc: 0,
			// sampleNodes is capped at 25 and only contains list items + the Add apps button.
			// The ListView container node itself is NOT present here, which is the real-device case.
			sampleNodes: [
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Alibaba",
					className: "android.widget.RelativeLayout",
					packageName: "com.android.settings",
				},
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Albums",
					className: "android.widget.RelativeLayout",
					packageName: "com.android.settings",
				},
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Alipay",
					className: "android.widget.RelativeLayout",
					packageName: "com.android.settings",
				},
				{
					clickable: true,
					enabled: true,
					scrollable: false,
					text: "Add apps",
					className: "android.widget.Button",
					packageName: "com.android.settings",
				},
			],
		},
		appId: "com.android.settings",
		appIdentitySource: "session",
		deviceId: "android-device-1",
	});

	assert.equal(result.pageContext.type, "form_editor");
	assert.equal(result.pageContext.ownerPackage, "com.android.settings");
});

test("detectPageContext classifies Android popup picker list as popup_surface", async () => {
  const result = await detectPageContext({
    platform: "android",
    stateSummary: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
      topVisibleTexts: ["2.4 GHz band", "5 GHz band"],
    },
    uiSummary: {
      totalNodes: 4,
      clickableNodes: 0,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        {
          clickable: false,
          enabled: true,
          scrollable: false,
          text: "2.4 GHz band",
          className: "android.widget.TextView",
          resourceId: "com.android.settings:id/list_popup_item",
          packageName: "com.android.settings",
        },
        {
          clickable: false,
          enabled: true,
          scrollable: false,
          text: "5 GHz band",
          className: "android.widget.TextView",
          resourceId: "com.android.settings:id/list_popup_item",
          packageName: "com.android.settings",
        },
      ],
    },
    appId: "com.android.settings",
    appIdentitySource: "input_override",
    deviceId: "android-device-1",
  });

  assert.equal(result.pageContext.type, "popup_surface");
  assert.equal(result.pageContext.ownerPackage, "com.android.settings");
});
