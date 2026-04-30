import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	matchesPathPrefix,
	matchesPlatform,
	matchesRegexSafely,
	matchesRuleCriteria,
	normalizeRuleText,
} from "../../src/rules/rule-matcher.js";
import type {
	ExplorerRuleEvaluationInput,
	ExplorerRuleMatchCriteria,
} from "../../src/rules/rule-types.js";

function input(
	overrides: Partial<ExplorerRuleEvaluationInput> = {},
): ExplorerRuleEvaluationInput {
	return {
		path: ["General", "Fonts", "System Fonts"],
		depth: 3,
		mode: "smoke",
		platform: "ios-simulator",
		snapshot: {
			screenId: "fonts-system",
			screenTitle: "System Fonts",
			uiTree: { clickable: false, enabled: true, scrollable: false },
			clickableElements: [],
			screenshotPath: "",
			capturedAt: "2026-04-29T00:00:00.000Z",
			arrivedFrom: null,
			viaElement: null,
			depth: 3,
			loadTimeMs: 0,
			stabilityScore: 1,
			appId: "com.apple.Preferences",
			pageContext: {
				type: "normal_page",
				platform: "ios",
				confidence: 0.92,
				signals: [],
				detectionSource: "heuristic",
			},
		},
		element: {
			label: "Regular",
			selector: { text: "Regular", resourceId: "font-regular" },
			elementType: "StaticText",
		},
		...overrides,
	};
}

describe("rule matcher", () => {
	it("normalizes text for case-insensitive rule matching", () => {
		assert.equal(normalizeRuleText("  System   Fonts  "), "system fonts");
	});

	it("matches exact path prefixes", () => {
		assert.equal(
			matchesPathPrefix(
				["General", "Fonts", "System Fonts"],
				["General", "Fonts"],
			),
			true,
		);
		assert.equal(
			matchesPathPrefix(
				["General", "Fonts"],
				["General", "Fonts", "System Fonts"],
			),
			false,
		);
	});

	it("matches path prefixes with normalized text", () => {
		assert.equal(
			matchesPathPrefix(
				[" General ", "SYSTEM Fonts"],
				["general", "system fonts"],
			),
			true,
		);
	});

	it("preserves legacy fuzzy path-prefix matching", () => {
		assert.equal(
			matchesPathPrefix(
				["com.android.settings.bluetooth", "Other devices"],
				["bluetooth"],
			),
			true,
		);
		assert.equal(
			matchesPathPrefix(
				["SIMs & mobile network", "Preferred network"],
				["SIMs"],
			),
			true,
		);
	});

	it("treats invalid regex patterns as non-matches", () => {
		assert.equal(matchesRegexSafely("Regular", "["), false);
	});

	it("matches single and multiple platform criteria", () => {
		assert.equal(matchesPlatform("ios-simulator", "ios-simulator"), true);
		assert.equal(
			matchesPlatform("android-device", ["ios-simulator", "android-device"]),
			true,
		);
		assert.equal(
			matchesPlatform("android-emulator", ["ios-simulator", "ios-device"]),
			false,
		);
	});

	it("matches page and element criteria together", () => {
		const criteria: ExplorerRuleMatchCriteria = {
			pathPrefix: ["General", "Fonts"],
			screenTitlePattern: "System\\s+Fonts",
			screenId: "fonts-system",
			pageContextType: "normal_page",
			appIdPattern: "apple\\.Preferences$",
			elementLabelPattern: "Regular|Bold",
			resourceIdPattern: "font-",
			platform: ["ios-simulator"],
			minDepth: 2,
			maxDepth: 4,
			detectionSource: "heuristic",
			minConfidence: 0.9,
		};

		assert.equal(matchesRuleCriteria(criteria, input()), true);
	});

	it("preserves legacy elementLabel substring matching", () => {
		assert.equal(
			matchesRuleCriteria(
				{ elementLabel: "Help" },
				input({ element: { label: "Help & feedback", selector: { text: "Help & feedback" }, elementType: "Button" } }),
			),
			true,
		);
	});

	it("returns false when any criterion fails", () => {
		assert.equal(
			matchesRuleCriteria({ screenTitle: "Bluetooth" }, input()),
			false,
		);
		assert.equal(matchesRuleCriteria({ minDepth: 4 }, input()), false);
		assert.equal(matchesRuleCriteria({ maxDepth: 2 }, input()), false);
		assert.equal(matchesRuleCriteria({ minConfidence: 0.99 }, input()), false);
	});
});
