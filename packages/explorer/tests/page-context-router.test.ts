import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PageContext } from "@mobile-e2e-mcp/contracts";
import type { ExplorerConfig } from "../src/types.js";
import {
	decidePageContextAction,
	formatPageContextDecisionLog,
} from "../src/page-context-router.js";

const baseConfig: ExplorerConfig = {
	mode: "smoke",
	auth: { type: "skip-auth" },
	failureStrategy: "skip",
	maxDepth: 8,
	maxPages: 50,
	timeoutMs: 300000,
	compareWith: null,
	platform: "ios-simulator",
	destructiveActionPolicy: "skip",
	appId: "com.example.test",
	reportDir: "./test-reports",
};

function makePageContext(overrides: Partial<PageContext>): PageContext {
	return {
		type: "normal_page",
		platform: "ios",
		detectionSource: "deterministic",
		runtimeFlavor: "ios_simulator",
		confidence: 0.95,
		title: "Test",
		...overrides,
	};
}

describe("decidePageContextAction", () => {
	describe("degradation paths", () => {
		it("defers to heuristic when pageContext is undefined", () => {
			const result = decidePageContextAction(undefined, baseConfig);
			assert.equal(result.type, "defer-to-heuristic");
			assert.ok(result.reason.includes("No pageContext"));
		});

		it("defers to heuristic when detectionSource is not deterministic", () => {
			const ctx = makePageContext({
				detectionSource: "heuristic",
				confidence: 0.95,
			});
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "defer-to-heuristic");
			assert.ok(result.reason.includes("detectionSource=heuristic"));
		});

		it("defers to heuristic when confidence is below threshold", () => {
			const ctx = makePageContext({ confidence: 0.5 });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "defer-to-heuristic");
			assert.ok(result.reason.includes("confidence=0.5"));
		});

		it("allows custom threshold via routerConfig", () => {
			const ctx = makePageContext({ confidence: 0.5 });
			const result = decidePageContextAction(ctx, baseConfig, {
				deterministicConfidenceThreshold: 0.3,
			});
			assert.equal(result.type, "dfs");
		});
	});

	describe("normal_page", () => {
		it("routes to dfs for normal_page", () => {
			const ctx = makePageContext({ type: "normal_page" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "dfs");
			assert.equal(result.ruleFamily, undefined);
		});
	});

	describe("keyboard_surface", () => {
		it("routes to dfs for keyboard_surface", () => {
			const ctx = makePageContext({ type: "keyboard_surface" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "dfs");
			assert.equal(result.ruleFamily, "keyboard_surface");
		});
	});

	describe("interruption surfaces", () => {
		it("gates permission_surface", () => {
			const ctx = makePageContext({ type: "permission_surface" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "gated");
			assert.equal(result.isInterruption, true);
			assert.equal(result.interruptionType, "permission_prompt");
			assert.equal(result.ruleFamily, "permission_surface");
			assert.equal(result.recoveryMethod, "backtrack-cancel-first");
		});

		it("gates system_alert_surface", () => {
			const ctx = makePageContext({ type: "system_alert_surface" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "gated");
			assert.equal(result.interruptionType, "system_alert");
			assert.equal(result.ruleFamily, "system_alert_surface");
		});

		it("gates system_overlay", () => {
			const ctx = makePageContext({ type: "system_overlay" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "gated");
			assert.equal(result.interruptionType, "overlay");
			assert.equal(result.ruleFamily, "system_overlay");
		});

		it("gates action_sheet_surface by default", () => {
			const ctx = makePageContext({ type: "action_sheet_surface" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "gated");
			assert.equal(result.ruleFamily, "action_sheet_surface");
		});

		it("defers action_sheet_surface when configured", () => {
			const ctx = makePageContext({ type: "action_sheet_surface" });
			const result = decidePageContextAction(ctx, baseConfig, {
				actionSheetDefaultGated: false,
			});
			assert.equal(result.type, "defer-to-heuristic");
		});

		it("gates app_dialog by default", () => {
			const ctx = makePageContext({ type: "app_dialog" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "gated");
			assert.equal(result.ruleFamily, "app_dialog");
		});

		it("defers app_dialog when configured", () => {
			const ctx = makePageContext({ type: "app_dialog" });
			const result = decidePageContextAction(ctx, baseConfig, {
				appDialogDefaultGated: false,
			});
			assert.equal(result.type, "defer-to-heuristic");
		});

		it("gates app_modal by default", () => {
			const ctx = makePageContext({ type: "app_modal" });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "gated");
			assert.equal(result.ruleFamily, "app_modal");
		});

		it("defers app_modal when configured", () => {
			const ctx = makePageContext({ type: "app_modal" });
			const result = decidePageContextAction(ctx, baseConfig, {
				appModalDefaultGated: false,
			});
			assert.equal(result.type, "defer-to-heuristic");
		});
	});

	describe("unknown type", () => {
		it("defers to heuristic for unknown pageContext type", () => {
			const ctx = makePageContext({ type: "unknown" as PageContext["type"] });
			const result = decidePageContextAction(ctx, baseConfig);
			assert.equal(result.type, "defer-to-heuristic");
			assert.ok(result.reason.includes("type=unknown"));
		});
	});
});

describe("formatPageContextDecisionLog", () => {
	it("formats basic decision", () => {
		const msg = formatPageContextDecisionLog({
			type: "dfs",
			reason: "normal page",
		});
		assert.ok(msg.includes("decision=dfs"));
		assert.ok(msg.includes("reason=normal page"));
	});

	it("includes optional fields when present", () => {
		const msg = formatPageContextDecisionLog({
			type: "gated",
			reason: "blocked",
			interruptionType: "permission_prompt",
			recoveryMethod: "backtrack",
			ruleFamily: "permission_surface",
		});
		assert.ok(msg.includes("interruptionType=permission_prompt"));
		assert.ok(msg.includes("recoveryMethod=backtrack"));
		assert.ok(msg.includes("ruleFamily=permission_surface"));
	});
});
