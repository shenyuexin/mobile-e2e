import type {
	GetPageContextData,
	GetPageContextInput,
	ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { loadSessionRecord } from "@mobile-e2e-mcp/core";
import { resolveRepoPath } from "./harness-config.js";
import { classifyInterruptionFromPageContext } from "./interruption-classifier.js";
import { WdaRealDeviceBackend } from "./ios-backend-wda.js";
import {
	createPageContextDetectorService,
	getSharedPageContextDetectorService,
	type PageContextDetectorService,
} from "./page-context-service.js";
import { getScreenSummaryWithMaestro } from "./session-state.js";

interface PageContextDeps {
	getScreenSummaryWithMaestro: typeof getScreenSummaryWithMaestro;
	loadSessionRecord: typeof loadSessionRecord;
	resolveRepoPath: typeof resolveRepoPath;
	pageContextDetectorService?: Pick<PageContextDetectorService, "detect">;
	probeIosRealDevicePreflight?: (deviceId: string) => Promise<{
		available: boolean;
		version?: string;
		error?: string;
	}>;
}

export async function getPageContextWithMaestro(
	input: GetPageContextInput,
	deps: PageContextDeps = {
		getScreenSummaryWithMaestro,
		loadSessionRecord,
		resolveRepoPath,
	},
): Promise<ToolResult<GetPageContextData>> {
	const startTime = Date.now();
	const repoRoot = deps.resolveRepoPath();
	const sessionRecord = await deps.loadSessionRecord(repoRoot, input.sessionId);
	const platform = input.platform ?? sessionRecord?.session.platform;

	if (!platform) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				sessionRecordFound: false,
			},
			nextSuggestions: [
				"Provide platform explicitly or run start_session before calling get_page_context.",
			],
		};
	}

	const appId = input.appId ?? sessionRecord?.session.appId;
	const appIdentitySource = input.appId
		? "input_override"
		: sessionRecord?.session.appId
			? "session"
			: "unknown";
	const runnerProfile =
		input.runnerProfile ?? sessionRecord?.session.profile ?? undefined;
	const screenSummaryResult = await deps.getScreenSummaryWithMaestro({
		sessionId: input.sessionId,
		platform,
		runnerProfile,
		harnessConfigPath: input.harnessConfigPath,
		deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
		appId,
		includeDebugSignals: true,
		dryRun: input.dryRun,
	});

	if (screenSummaryResult.status === "failed") {
		return {
			status: "failed",
			reasonCode: screenSummaryResult.reasonCode,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: screenSummaryResult.attempts,
			artifacts: screenSummaryResult.artifacts,
			data: {
				sessionRecordFound: Boolean(sessionRecord),
				stateSummary: screenSummaryResult.data.screenSummary,
				evidence: screenSummaryResult.data.evidence,
			},
			nextSuggestions: screenSummaryResult.nextSuggestions,
		};
	}

	const detectorService =
		deps.pageContextDetectorService ?? getSharedPageContextDetectorService();
	const detected = await detectorService.detect({
		sessionId: input.sessionId,
		platform,
		stateSummary: screenSummaryResult.data.screenSummary,
		uiSummary: screenSummaryResult.data.uiSummary,
		appId,
		appIdentitySource,
		deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
		probeIosRealDevicePreflight:
			deps.probeIosRealDevicePreflight ??
			(async (deviceId: string) =>
				new WdaRealDeviceBackend().probePreflightReadiness(deviceId)),
	});
	const pageContext = detected.pageContext;
	const interruptionClassification =
		classifyInterruptionFromPageContext(pageContext);
	const interruptionMapping =
		interruptionClassification.type === "unknown"
			? undefined
			: {
					mappedType: interruptionClassification.type,
					mappingSource: "page-context-mapper" as const,
					rationale: interruptionClassification.rationale,
				};

	return {
		status: screenSummaryResult.status,
		reasonCode: screenSummaryResult.reasonCode,
		sessionId: input.sessionId,
		durationMs: Date.now() - startTime,
		attempts: screenSummaryResult.attempts,
		artifacts: screenSummaryResult.artifacts,
		data: {
			sessionRecordFound: Boolean(sessionRecord),
			pageContext,
			pageContextDecision: {
				blocked: interruptionClassification.type !== "unknown",
				requiresInterruptionHandling:
					interruptionClassification.type !== "unknown",
				currentProfile: sessionRecord?.session.policyProfile,
				rationale: interruptionClassification.rationale,
			},
			interruptionMapping,
			preflightProbe: detected.preflightProbe,
			stateSummary: screenSummaryResult.data.screenSummary,
			evidence: screenSummaryResult.data.evidence,
		},
		nextSuggestions: interruptionMapping
			? Array.from(
					new Set([
						...screenSummaryResult.nextSuggestions,
						"Reuse classify_interruption/resolve_interruption with the mapped interruption type before attempting a write action.",
					]),
				).slice(0, 5)
			: screenSummaryResult.nextSuggestions,
	};
}
