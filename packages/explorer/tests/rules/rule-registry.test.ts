import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDefaultConfig } from "../../src/config.js";
import { DEFAULT_EXPLORER_RULES } from "../../src/rules/default-rules.js";
import { buildExplorerRuleRegistry } from "../../src/rules/rule-registry.js";

describe("explorer rule registry", () => {
	it("includes built-ins by default", () => {
		const registry = buildExplorerRuleRegistry(buildDefaultConfig());
		assert.ok(registry.rules.length >= DEFAULT_EXPLORER_RULES.length);
		assert.ok(
			registry.rules.some(
				(rule) => rule.id === "default.ios.fonts.system-fonts.smoke-sampling",
			),
		);
	});

	it("removes disabled built-in rules after registry assembly", () => {
		const registry = buildExplorerRuleRegistry(
			buildDefaultConfig({
				rules: {
					version: 1,
					defaults: {
						disabledRuleIds: ["default.ios.fonts.system-fonts.smoke-sampling"],
					},
				},
			}),
		);

		assert.equal(
			registry.rules.some(
				(rule) => rule.id === "default.ios.fonts.system-fonts.smoke-sampling",
			),
			false,
		);
	});

	it("can build only legacy and project rules when built-ins are disabled", () => {
		const registry = buildExplorerRuleRegistry(
			buildDefaultConfig({
				samplingRules: [],
				skipPages: [
					{ match: { screenTitle: "Billing" }, reason: "legacy billing skip" },
				],
				skipElements: [],
				blockedOwnerPackages: [],
				rules: {
					version: 1,
					defaults: { includeBuiltIns: false },
					rules: [
						{
							id: "project.skip.logout",
							category: "element-skip",
							action: "skip-element",
							reason: "Do not sign out during traversal",
							match: { elementLabelPattern: "Sign Out|Log Out" },
						},
					],
				},
			}),
		);

		assert.equal(
			registry.rules.some((rule) => rule.source === "default"),
			false,
		);
		assert.ok(registry.rules.some((rule) => rule.id === "legacy.skip-page.0"));
		assert.ok(registry.rules.some((rule) => rule.id === "project.skip.logout"));
	});

	it("applies overrides to existing rules", () => {
		const registry = buildExplorerRuleRegistry(
			buildDefaultConfig({
				rules: {
					version: 1,
					overrides: [
						{
							id: "default.element.help.low-value-skip",
							reason: "Project-specific help policy",
							priority: 100,
							enabled: false,
						},
					],
				},
			}),
		);
		const rule = registry.rules.find(
			(candidate) => candidate.id === "default.element.help.low-value-skip",
		);

		assert.ok(rule !== undefined);
		assert.equal(rule.reason, "Project-specific help policy");
		assert.equal(rule.priority, 100);
		assert.equal(rule.enabled, false);
	});

	it("lets project rules replace built-ins with the same ID", () => {
		const registry = buildExplorerRuleRegistry(
			buildDefaultConfig({
				rules: {
					version: 1,
					rules: [
						{
							id: "default.element.help.low-value-skip",
							category: "element-skip",
							action: "skip-element",
							reason: "Replacement rule from project config",
							match: { elementLabel: "Help Center" },
						},
					],
				},
			}),
		);
		const rule = registry.rules.find(
			(candidate) => candidate.id === "default.element.help.low-value-skip",
		);

		assert.ok(rule !== undefined);
		assert.equal(rule.reason, "Replacement rule from project config");
		assert.equal(rule.source, "project-config");
		assert.deepEqual(rule.match, { elementLabel: "Help Center" });
	});

	it("ignores duplicate project rule IDs and records diagnostics", () => {
		const registry = buildExplorerRuleRegistry(
			buildDefaultConfig({
				rules: {
					version: 1,
					defaults: { includeBuiltIns: false },
					rules: [
						{
							id: "project.duplicate",
							category: "page-skip",
							action: "skip-page",
							reason: "first",
							match: { screenTitle: "First" },
						},
						{
							id: "project.duplicate",
							category: "page-skip",
							action: "skip-page",
							reason: "second",
							match: { screenTitle: "Second" },
						},
					],
				},
			}),
		);

		assert.equal(
			registry.rules.filter((rule) => rule.id === "project.duplicate").length,
			1,
		);
		assert.ok(
			registry.diagnostics.some((diagnostic) =>
				diagnostic.includes("Duplicate project rule id: project.duplicate"),
			),
		);
	});
});
