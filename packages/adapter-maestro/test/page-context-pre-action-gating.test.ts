import assert from "node:assert/strict";
import test from "node:test";
import {
	type GetScreenSummaryData,
	REASON_CODES,
	type ResolveInterruptionData,
	type ResumeInterruptedActionData,
	type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import {
	performActionWithEvidenceWithMaestro,
	resetInterruptionGuardTestHooksForTesting,
	resetOcrFallbackTestHooksForTesting,
	setInterruptionGuardTestHooksForTesting,
	setOcrFallbackTestHooksForTesting,
} from "../src/action-orchestrator.ts";

function buildScreenSummaryResult(
	sessionId: string,
	screenSummary: GetScreenSummaryData["screenSummary"],
	pageContext: GetScreenSummaryData["pageContext"],
): ToolResult<GetScreenSummaryData> {
	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId,
		durationMs: 1,
		attempts: 1,
		artifacts: [],
		data: {
			dryRun: true,
			runnerProfile: "phase1",
			outputPath: `artifacts/state-summaries/${sessionId}/android-phase1.json`,
			command: ["fixture", "get_screen_summary"],
			exitCode: 0,
			supportLevel: "full",
			summarySource: "ui_only",
			screenSummary,
			pageContext,
			evidence: [],
		},
		nextSuggestions: [],
	};
}

const notNeededInterruptionResult = (
	sessionId: string,
): ToolResult<ResolveInterruptionData> => ({
	status: "success",
	reasonCode: REASON_CODES.ok,
	sessionId,
	durationMs: 1,
	attempts: 1,
	artifacts: [],
	data: {
		attempted: false,
		status: "not_needed",
	},
	nextSuggestions: [],
});

const resumedInterruptionResult = (
	sessionId: string,
): ToolResult<ResumeInterruptedActionData> => ({
	status: "success",
	reasonCode: REASON_CODES.ok,
	sessionId,
	durationMs: 1,
	attempts: 1,
	artifacts: [],
	data: {
		attempted: false,
		resumed: true,
	},
	nextSuggestions: [],
});

test.afterEach(() => {
	resetOcrFallbackTestHooksForTesting();
	resetInterruptionGuardTestHooksForTesting();
});

test("performActionWithEvidenceWithMaestro records pre-action page-context gating hints", async () => {
	let getScreenSummaryCalls = 0;

	setOcrFallbackTestHooksForTesting({
		getScreenSummary: async (input) => {
			getScreenSummaryCalls += 1;
			return buildScreenSummaryResult(
				input.sessionId,
				getScreenSummaryCalls === 1
					? {
							appPhase: "blocked",
							readiness: "interrupted",
							blockingSignals: ["permission_prompt"],
							screenTitle: "System Prompt",
							topVisibleTexts: ["Allow"],
						}
					: {
							appPhase: "ready",
							readiness: "ready",
							blockingSignals: [],
							screenTitle: "Catalog",
							topVisibleTexts: ["Catalog"],
						},
				getScreenSummaryCalls === 1
					? {
							type: "permission_surface",
							platform: "android",
							detectionSource: "deterministic",
							confidence: 0.9,
							ownerPackage: "com.android.permissioncontroller",
							visibleSignals: ["Allow", "Deny"],
						}
					: {
							type: "normal_page",
							platform: "android",
							detectionSource: "deterministic",
							confidence: 0.7,
						},
			);
		},
	});

	setInterruptionGuardTestHooksForTesting({
		resolveInterruption: async (input) =>
			notNeededInterruptionResult(input.sessionId),
		resumeInterruptedAction: async (input) =>
			resumedInterruptionResult(input.sessionId),
	});

	const result = await performActionWithEvidenceWithMaestro(
		{
			sessionId: "page-context-pre-action-gating",
			platform: "android",
			dryRun: true,
			action: { actionType: "tap_element", text: "Continue" },
		},
		{
			executeIntentWithMaestro: async ({ sessionId }) => ({
				status: "success",
				reasonCode: REASON_CODES.ok,
				sessionId,
				durationMs: 1,
				attempts: 1,
				artifacts: [],
				data: {},
				nextSuggestions: [],
			}),
		},
	);

	assert.equal(result.status, "success");
	assert.equal(result.data.preActionPageContext?.type, "permission_surface");
	assert.equal(
		result.data.preActionInterruptionHint?.type,
		"permission_prompt",
	);
});
