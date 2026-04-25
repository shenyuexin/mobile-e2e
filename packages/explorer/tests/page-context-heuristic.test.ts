import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PageSnapshot } from "../src/types.js";
import {
	decideHeuristicPageAction,
	hasClickableLabel,
	isSystemDialog,
	isDismissibleNicknameDialog,
	isLowValueDeepContentPage,
} from "../src/page-context-heuristic.js";

function makeSnapshot(overrides: Partial<PageSnapshot>): PageSnapshot {
	return {
		screenId: "test-screen",
		screenTitle: "Test",
		uiTree: { clickable: false, enabled: true, scrollable: false },
		clickableElements: [],
		screenshotPath: "",
		capturedAt: new Date().toISOString(),
		arrivedFrom: null,
		viaElement: null,
		depth: 0,
		loadTimeMs: 100,
		stabilityScore: 1.0,
		...overrides,
	};
}

describe("hasClickableLabel", () => {
	it("finds exact match", () => {
		assert.ok(hasClickableLabel([{ label: "Cancel" }], "Cancel"));
	});

	it("is case-insensitive", () => {
		assert.ok(hasClickableLabel([{ label: "Cancel" }], "cancel"));
	});

	it("returns false when not found", () => {
		assert.ok(!hasClickableLabel([{ label: "OK" }], "Cancel"));
	});
});

describe("isSystemDialog", () => {
	it("detects alert role", () => {
		const snapshot = {
			uiTree: {
				accessibilityRole: "alert",
				clickable: false,
				enabled: true,
				scrollable: false,
			},
		};
		assert.ok(isSystemDialog(snapshot));
	});

	it("detects SystemAlert role", () => {
		const snapshot = {
			uiTree: {
				accessibilityRole: "SystemAlert",
				clickable: false,
				enabled: true,
				scrollable: false,
			},
		};
		assert.ok(isSystemDialog(snapshot));
	});

	it("detects dialog via keywords", () => {
		const snapshot = {
			uiTree: {
				text: "Would Like to Send You Notifications",
				children: [
					{ text: "Allow", clickable: false, enabled: true, scrollable: false },
					{ text: "Don't Allow", clickable: false, enabled: true, scrollable: false },
					{ text: "Cancel", clickable: false, enabled: true, scrollable: false },
				],
				clickable: false,
				enabled: true,
				scrollable: false,
			},
		};
		assert.ok(isSystemDialog(snapshot));
	});

	it("returns false for normal page", () => {
		const snapshot = {
			uiTree: {
				text: "Settings",
				children: [
					{ text: "General", clickable: false, enabled: true, scrollable: false },
				],
				clickable: false,
				enabled: true,
				scrollable: false,
			},
		};
		assert.ok(!isSystemDialog(snapshot));
	});
});

describe("isDismissibleNicknameDialog", () => {
	it("detects bbk account nickname dialog", () => {
		const snapshot = makeSnapshot({
			appId: "com.bbk.account",
			screenTitle: "Account Nickname",
			clickableElements: [
				{ label: "Cancel", selector: {}, elementType: "Button" },
				{ label: "OK", selector: {}, elementType: "Button" },
			],
		});
		assert.ok(isDismissibleNicknameDialog(snapshot));
	});

	it("returns false for wrong app", () => {
		const snapshot = makeSnapshot({
			appId: "com.example",
			screenTitle: "Account Nickname",
			clickableElements: [
				{ label: "Cancel", selector: {}, elementType: "Button" },
				{ label: "OK", selector: {}, elementType: "Button" },
			],
		});
		assert.ok(!isDismissibleNicknameDialog(snapshot));
	});

	it("returns false when missing Cancel", () => {
		const snapshot = makeSnapshot({
			appId: "com.bbk.account",
			screenTitle: "Account Nickname",
			clickableElements: [{ label: "OK", selector: {}, elementType: "Button" }],
		});
		assert.ok(!isDismissibleNicknameDialog(snapshot));
	});
});

describe("isLowValueDeepContentPage", () => {
	describe("platform guard", () => {
		it("does not gate on iOS simulator", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help & FAQ",
				appId: "com.apple.settings",
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "ios-simulator"));
		});

		it("does not gate on iOS device", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help & FAQ",
				appId: "com.apple.settings",
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "ios-device"));
		});

		it("gates on Android emulator", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help & FAQ",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("gates on Android device", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help & FAQ",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-device"));
		});

		it("gates when platform is undefined (defaults to Android behavior)", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help & FAQ",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot));
		});
	});

	describe("title pattern matching", () => {
		it("detects 'Help & FAQ' title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help & FAQ",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("detects 'Bluetooth Help' title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Bluetooth Help",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("detects 'Earphones & Speakers' title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Earphones & Speakers",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("detects 'About phone' title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "About phone",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("detects 'Legal information' title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Legal information",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("detects 'Open-source licenses' title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Open-source licenses",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("does not gate a normal Settings page", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Bluetooth",
				appId: "com.android.settings",
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("does not gate 'Wi-Fi' (without help/FAQ suffix)", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Wi-Fi",
				appId: "com.android.settings",
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator"));
		});

		it("gates 'Wi-Fi Help' (with help suffix)", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Wi-Fi Help",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator"));
		});
	});

	describe("resource-ID matching", () => {
		it("detects help resource ID at depth >= 2", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Some Screen",
				appId: "com.android.settings",
				clickableElements: [
					{ label: "Back", selector: { resourceId: "com.android.settings:id/help" }, elementType: "Button" },
				],
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator", 2));
		});

		it("does not gate resource ID match at depth 0", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Some Screen",
				appId: "com.android.settings",
				clickableElements: [
					{ label: "Back", selector: { resourceId: "com.android.settings:id/help" }, elementType: "Button" },
				],
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator", 0));
		});
	});

	describe("deep + few interactive + info title", () => {
		it("gates deep page with few elements and info title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Network Info",
				appId: "com.android.settings",
				clickableElements: [
					{ label: "Back", selector: {}, elementType: "Button" },
				],
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator", 3));
		});

		it("does not gate shallow page with info title", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Network Info",
				appId: "com.android.settings",
				clickableElements: [
					{ label: "Back", selector: {}, elementType: "Button" },
				],
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator", 1));
		});

		it("does not gate deep page with many interactive elements", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Network Info",
				appId: "com.android.settings",
				clickableElements: [
					{ label: "Option 1", selector: {}, elementType: "Button" },
					{ label: "Option 2", selector: {}, elementType: "Button" },
					{ label: "Option 3", selector: {}, elementType: "Button" },
					{ label: "Option 4", selector: {}, elementType: "Button" },
				],
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator", 3));
		});
	});

	describe("Android Settings-specific patterns", () => {
		it("detects 'Help' in com.android.settings at any depth", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Help",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator", 0));
		});

		it("detects 'About phone' in com.android.settings", () => {
			const snapshot = makeSnapshot({
				screenTitle: "About phone",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator", 0));
		});

		it("detects 'Regulatory' in com.android.settings", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Regulatory",
				appId: "com.android.settings",
			});
			assert.ok(isLowValueDeepContentPage(snapshot, "android-emulator", 0));
		});

		it("does not gate 'Bluetooth' in com.android.settings (not help/FAQ)", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Bluetooth",
				appId: "com.android.settings",
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator", 0));
		});

		it("does not gate 'Wi-Fi' in com.android.settings (not help/FAQ)", () => {
			const snapshot = makeSnapshot({
				screenTitle: "Wi-Fi",
				appId: "com.android.settings",
			});
			assert.ok(!isLowValueDeepContentPage(snapshot, "android-emulator", 0));
		});
	});
});

describe("decideHeuristicPageAction", () => {
	it("gates system dialog", () => {
		const snapshot = makeSnapshot({
			uiTree: {
				accessibilityRole: "alert",
				clickable: false,
				enabled: true,
				scrollable: false,
			},
		});
		const decision = decideHeuristicPageAction(snapshot);
		assert.equal(decision.type, "gated");
		assert.equal(decision.ruleFamily, "heuristic_system_dialog");
		assert.equal(decision.interruptionType, "system_alert");
	});

	it("gates dismissible nickname dialog", () => {
		const snapshot = makeSnapshot({
			appId: "com.bbk.account",
			screenTitle: "Account Nickname",
			clickableElements: [
				{ label: "Cancel", selector: {}, elementType: "Button" },
				{ label: "OK", selector: {}, elementType: "Button" },
			],
		});
		const decision = decideHeuristicPageAction(snapshot);
		assert.equal(decision.type, "gated");
		assert.equal(decision.ruleFamily, "heuristic_dismissible_dialog");
	});

	it("gates low-value deep content page on Android", () => {
		const snapshot = makeSnapshot({
			screenTitle: "Bluetooth Help",
			appId: "com.android.settings",
		});
		const decision = decideHeuristicPageAction(snapshot, "android-emulator", 2);
		assert.equal(decision.type, "gated");
		assert.equal(decision.ruleFamily, "heuristic_low_value_content");
		assert.ok(decision.reason.includes("low-value deep content"));
	});

	it("does not gate low-value content on iOS", () => {
		const snapshot = makeSnapshot({
			screenTitle: "Help & FAQ",
			appId: "com.apple.settings",
		});
		const decision = decideHeuristicPageAction(snapshot, "ios-simulator", 2);
		assert.equal(decision.type, "dfs");
	});

	it("allows normal page", () => {
		const snapshot = makeSnapshot({
			uiTree: {
				text: "Settings",
				children: [
					{ text: "General", clickable: false, enabled: true, scrollable: false },
				],
				clickable: false,
				enabled: true,
				scrollable: false,
			},
		});
		const decision = decideHeuristicPageAction(snapshot);
		assert.equal(decision.type, "dfs");
	});
});
