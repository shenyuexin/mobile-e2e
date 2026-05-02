import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDefaultConfig } from "../../src/config.js";
import { evaluateElementRules, evaluatePageRules } from "../../src/rules/rule-evaluator.js";
import { buildExplorerRuleRegistry } from "../../src/rules/rule-registry.js";
import type { ClickableTarget, PageSnapshot, UiHierarchy } from "../../src/types.js";

function makeUiTree(): UiHierarchy {
	return {
		className: "Application",
		clickable: false,
		enabled: true,
		scrollable: false,
		children: [],
	};
}

function makeSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
	return {
		screenId: "screen",
		screenTitle: "Settings",
		uiTree: makeUiTree(),
		clickableElements: [],
		screenshotPath: "/tmp/screen.png",
		capturedAt: new Date().toISOString(),
		arrivedFrom: null,
		viaElement: null,
		depth: 0,
		loadTimeMs: 0,
		stabilityScore: 1,
		...overrides,
	};
}

function makeElement(label: string): ClickableTarget {
	return {
		label,
		selector: { text: label },
		elementType: "Button",
	};
}

describe("rule decision integration regressions", () => {
	it("keeps System Fonts eligible on the Fonts landing page in full mode", () => {
		const config = buildDefaultConfig({ mode: "full", platform: "ios-simulator" });
		const registry = buildExplorerRuleRegistry(config);
		const decision = evaluateElementRules(registry, {
			path: ["com.apple.settings.general", "Fonts"],
			depth: 2,
			mode: config.mode,
			platform: config.platform,
			snapshot: makeSnapshot({ screenTitle: "Fonts" }),
			element: makeElement("System Fonts"),
		});

		assert.equal(decision.matched, false);
	});

	it("classifies System Fonts as navigation control on font detail pages but keeps style variants eligible", () => {
		const config = buildDefaultConfig({ mode: "smoke", platform: "ios-simulator" });
		const registry = buildExplorerRuleRegistry(config);
		for (const screenTitle of ["Academy Engraved LET", "Al Nile"]) {
			const snapshot = makeSnapshot({ screenTitle });
			const navBack = evaluateElementRules(registry, {
				path: ["General", "Fonts", "System Fonts", screenTitle],
				depth: 4,
				mode: config.mode,
				platform: config.platform,
				snapshot,
				element: makeElement("System Fonts"),
			});
			assert.equal(navBack.ruleId, "default.navigation.system-fonts-detail-back");

			for (const styleLabel of ["Plain", "Regular", "Bold"]) {
				const styleDecision = evaluateElementRules(registry, {
					path: ["General", "Fonts", "System Fonts", screenTitle],
					depth: 4,
					mode: config.mode,
					platform: config.platform,
					snapshot,
					element: makeElement(styleLabel),
				});
				assert.equal(styleDecision.matched, false, `${styleLabel} should remain eligible`);
			}
		}
	});

	it("gates account/payment stateful branches only when statefulFormPolicy is skip", () => {
		const skipConfig = buildDefaultConfig({ statefulFormPolicy: "skip" });
		const skipRegistry = buildExplorerRuleRegistry(skipConfig);
		const skipDecision = evaluatePageRules(skipRegistry, {
			path: ["Profile", "Add Account"],
			depth: 2,
			mode: skipConfig.mode,
			platform: skipConfig.platform,
			snapshot: makeSnapshot({ screenTitle: "Create Payment Method" }),
		});
		assert.equal(skipDecision.ruleId, "default.stateful-form.account-payment-address");

		const allowConfig = buildDefaultConfig({ statefulFormPolicy: "allow" });
		const allowRegistry = buildExplorerRuleRegistry(allowConfig);
		const allowDecision = evaluatePageRules(allowRegistry, {
			path: ["Profile", "Add Account"],
			depth: 2,
			mode: allowConfig.mode,
			platform: allowConfig.platform,
			snapshot: makeSnapshot({ screenTitle: "Create Payment Method" }),
		});
		assert.equal(allowDecision.matched, false);
	});

	it("allows project config to disable the default Help low-value element skip", () => {
		const config = buildDefaultConfig({
			rules: {
				version: 1,
				defaults: { disabledRuleIds: ["default.element.help.low-value-skip"] },
			},
		});
		const registry = buildExplorerRuleRegistry(config);
		const decision = evaluateElementRules(registry, {
			path: ["Settings"],
			depth: 1,
			mode: config.mode,
			platform: config.platform,
			snapshot: makeSnapshot({ screenTitle: "Settings" }),
			element: makeElement("Help"),
		});
		assert.equal(decision.matched, false);
	});
});
