import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_SAMPLING_RULES,
	DEFAULT_SKIP_ELEMENTS,
	DEFAULT_SKIP_PAGES,
} from "../../src/config.js";
import {
	DEFAULT_EXPLORER_RULES,
	projectDefaultSamplingRules,
	projectDefaultSkipElements,
	projectDefaultSkipPages,
} from "../../src/rules/default-rules.js";

describe("default explorer rules", () => {
	it("declares stable unique IDs with required metadata", () => {
		const ids = DEFAULT_EXPLORER_RULES.map((rule) => rule.id);
		assert.equal(new Set(ids).size, ids.length);

		for (const rule of DEFAULT_EXPLORER_RULES) {
			assert.match(rule.id, /^default\./);
			assert.ok(rule.category, `${rule.id} missing category`);
			assert.ok(rule.action, `${rule.id} missing action`);
			assert.ok(rule.reason, `${rule.id} missing reason`);
			assert.equal(rule.source, "default");
		}
	});

	it("includes the initial rule catalog required by the Phase 28 plan", () => {
		const ids = new Set(DEFAULT_EXPLORER_RULES.map((rule) => rule.id));
		for (const id of [
			"default.ios.fonts.system-fonts.smoke-sampling",
			"default.android.bluetooth.other-devices.page-skip",
			"default.android.network.sims-mobile-network.page-skip",
			"default.element.help.low-value-skip",
			"default.element.faq.low-value-skip",
			"default.owner-package.bbk-account.external-app-gate",
			"default.low-value.help-faq-about-legal.android",
			"default.auth.protected-surface.android",
			"default.dialog.system-alert",
			"default.dialog.dismissible-nickname",
			"default.risk.destructive-actions",
			"default.risk.side-effect-actions",
			"default.navigation.controls",
			"default.stateful-form.account-payment-address",
		]) {
			assert.ok(ids.has(id), `missing ${id}`);
		}
	});

	it("projects compatibility sampling rules from the catalog", () => {
		assert.deepEqual(projectDefaultSamplingRules(), DEFAULT_SAMPLING_RULES);
		assert.deepEqual(projectDefaultSamplingRules()[0], {
			match: { pathPrefix: ["General", "Fonts", "System Fonts"] },
			mode: "smoke",
			strategy: "representative-child",
			maxChildrenToValidate: 1,
			stopAfterFirstSuccessfulNavigation: true,
			excludeActions: ["Download"],
		});
	});

	it("projects compatibility skip pages and elements from the catalog", () => {
		assert.deepEqual(projectDefaultSkipPages(), DEFAULT_SKIP_PAGES);
		assert.deepEqual(projectDefaultSkipElements(), DEFAULT_SKIP_ELEMENTS);
	});
});
