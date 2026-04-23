import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PageSnapshot } from "../src/types.js";
import {
	decideHeuristicPageAction,
	hasClickableLabel,
	isSystemDialog,
	isDismissibleNicknameDialog,
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
