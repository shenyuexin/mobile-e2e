import assert from "node:assert/strict";
import test from "node:test";
import {
	type GetScreenSummaryData,
	REASON_CODES,
	type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { getPageContextWithMaestro } from "../src/page-context-tools.ts";

function buildScreenSummaryResult(
	overrides: Partial<ToolResult<GetScreenSummaryData>> = {},
): ToolResult<GetScreenSummaryData> {
	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: "session-1",
		durationMs: 5,
		attempts: 1,
		artifacts: [],
		data: {
			dryRun: true,
			runnerProfile: "phase1",
			outputPath: "artifacts/state-summaries/session-1/android-phase1.json",
			command: ["inspect"],
			exitCode: 0,
			supportLevel: "partial",
			summarySource: "ui_only",
			screenSummary: {
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
		},
		nextSuggestions: [],
		...overrides,
	};
}

test("getPageContextWithMaestro derives permission surface and interruption mapping from screen summary", async () => {
	let probeCalls = 0;
	const result = await getPageContextWithMaestro(
		{
			sessionId: "session-1",
			platform: "ios",
			dryRun: true,
		},
		{
			loadSessionRecord: async () => ({
				session: {
					sessionId: "session-1",
					platform: "ios",
					deviceId: "ios-device-1",
					appId: "com.example.app",
					profile: "native_ios",
					policyProfile: "default",
					startedAt: new Date().toISOString(),
					timeline: [],
				},
				closed: false,
			}),
			getScreenSummaryWithMaestro: async () => buildScreenSummaryResult(),
			probeIosRealDevicePreflight: async () => {
				probeCalls += 1;
				return { available: true, version: "session:abcd1234" };
			},
			resolveRepoPath: () => process.cwd(),
		},
	);

	assert.equal(result.status, "success");
	assert.equal(probeCalls, 1);
	assert.equal(result.data.sessionRecordFound, true);
	assert.equal(result.data.pageContext?.type, "permission_surface");
	assert.equal(result.data.pageContext?.appIdentity?.appId, "com.example.app");
	assert.equal(result.data.preflightProbe?.source, "ios_wda_status");
	assert.equal(
		result.data.interruptionMapping?.mappedType,
		"permission_prompt",
	);
	assert.equal(
		result.data.pageContextDecision?.requiresInterruptionHandling,
		true,
	);
});
