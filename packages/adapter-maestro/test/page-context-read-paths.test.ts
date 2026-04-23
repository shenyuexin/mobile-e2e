import assert from "node:assert/strict";
import test from "node:test";
import {
	type InspectUiData,
	REASON_CODES,
	type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { getScreenSummaryWithMaestro } from "../src/session-state.ts";

function buildInspectResult(sessionId: string): ToolResult<InspectUiData> {
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
			outputPath: `artifacts/inspect/${sessionId}.json`,
			command: ["fixture", "inspect_ui"],
			exitCode: 0,
			supportLevel: "full",
			summary: {
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
						packageName: "com.example.app",
					},
				],
			},
		},
		nextSuggestions: [],
	};
}

function buildLogResult(sessionId: string) {
	return {
		status: "success" as const,
		reasonCode: REASON_CODES.ok,
		sessionId,
		durationMs: 1,
		attempts: 1,
		artifacts: [],
		data: { summary: { hasLogs: false, excerpt: [] } },
		nextSuggestions: [],
	};
}

function buildCrashResult(sessionId: string) {
	return {
		status: "success" as const,
		reasonCode: REASON_CODES.ok,
		sessionId,
		durationMs: 1,
		attempts: 1,
		artifacts: [],
		data: { summary: { hasCrashSignals: false, excerpts: [] } },
		nextSuggestions: [],
	};
}

test("getScreenSummaryWithMaestro reuses page-context service output", async () => {
	const result = await getScreenSummaryWithMaestro(
		{
			sessionId: "screen-summary-page-context",
			platform: "android",
			appId: "com.example.app",
			dryRun: true,
		},
		{
			inspectUiWithMaestroTool: async (input) =>
				buildInspectResult(input.sessionId),
			getLogsWithMaestro: async (input) => buildLogResult(input.sessionId),
			getCrashSignalsWithMaestro: async (input) =>
				buildCrashResult(input.sessionId),
		},
	);

	assert.equal(result.status, "success");
	assert.equal(result.data.pageContext?.type, "permission_surface");
	assert.equal(result.data.pageContext?.platform, "android");
});
