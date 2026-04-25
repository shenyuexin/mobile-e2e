import type {
	InspectUiData,
	InspectUiInput,
	InspectUiSummary,
	ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
	buildDefaultDeviceId,
	DEFAULT_HARNESS_CONFIG_PATH,
	DEFAULT_RUNNER_PROFILE,
	loadHarnessSelection,
	resolveRepoPath,
} from "./harness-config.js";
import {
	getSharedPageContextDetectorService,
	type PageContextDetectorService,
} from "./page-context-service.js";
import {
	buildExecutionEvidence,
	buildFailureReason,
	toRelativePath,
} from "./runtime-shared.js";
import {
	parseInspectUiSummary,
	parseIosInspectSummary,
} from "./ui-model.js";
import {
	buildAndroidUiDumpCommands,
	captureAndroidUiSnapshot,
	captureIosUiSnapshot,
	isAndroidUiSnapshotFailure,
	isIosUiSnapshotFailure,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import {
	buildMissingPlatformSuggestion,
	buildPlatformUiDumpOutputPath,
	buildUnknownUiDumpOutputPath,
	buildIosSnapshotOptions,
} from "./ui-tool-shared.js";

export interface InspectUiToolDeps {
	loadHarnessSelection?: typeof loadHarnessSelection;
	captureIosUiSnapshot?: typeof captureIosUiSnapshot;
	captureAndroidUiSnapshot?: typeof captureAndroidUiSnapshot;
	parseIosInspectSummary?: typeof parseIosInspectSummary;
	parseInspectUiSummary?: typeof parseInspectUiSummary;
	pageContextDetectorService?: Pick<PageContextDetectorService, "detect">;
}

function buildInspectUiStateSummary(summary?: InspectUiSummary) {
	const texts = summary?.sampleNodes
		?.flatMap((node) => [node.text, node.contentDesc])
		.filter((value): value is string => Boolean(value))
		.slice(0, 12);
	return {
		appPhase: "unknown" as const,
		readiness: "unknown" as const,
		blockingSignals: [] as string[],
		screenTitle: summary?.sampleNodes?.find((node) => node.text)?.text,
		topVisibleTexts: texts,
	};
}

export async function inspectUiWithMaestroTool(
	input: InspectUiInput,
	deps: InspectUiToolDeps = {},
): Promise<ToolResult<InspectUiData>> {
	const startTime = Date.now();
	if (!input.platform) {
		const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
		const outputPath = buildUnknownUiDumpOutputPath({
			sessionId: input.sessionId,
			runnerProfile,
			outputPath: input.outputPath,
		});
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				dryRun: Boolean(input.dryRun),
				runnerProfile,
				outputPath,
				command: [],
				exitCode: null,
				supportLevel: "partial",
			},
			nextSuggestions: [buildMissingPlatformSuggestion("inspect_ui")],
		};
	}
	const repoRoot = resolveRepoPath();
	const platform = input.platform;
	const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
	const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
	const loadSelection = deps.loadHarnessSelection ?? loadHarnessSelection;
	const pageContextDetectorService =
		deps.pageContextDetectorService ?? getSharedPageContextDetectorService();
	const selection = await loadSelection(
		repoRoot,
		platform,
		runnerProfile,
		input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
	);
	const deviceId =
		input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
	const relativeOutputPath = buildPlatformUiDumpOutputPath({
		sessionId: input.sessionId,
		runnerProfile,
		platform,
		outputPath: input.outputPath,
	});
	if (platform === "ios") {
		const idbCommand =
			runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

		if (input.dryRun) {
			return {
				status: "success",
				reasonCode: REASON_CODES.ok,
				sessionId: input.sessionId,
				durationMs: Date.now() - startTime,
				attempts: 1,
				artifacts: [],
				data: {
					dryRun: true,
					runnerProfile,
					outputPath: relativeOutputPath,
					command: idbCommand,
					exitCode: 0,
					supportLevel: "partial",
					evidence: [
						buildExecutionEvidence(
							"ui_dump",
							relativeOutputPath,
							"partial",
							"Planned iOS UI hierarchy artifact path.",
						),
					],
					platformSupportNote:
						"iOS inspect_ui captures hierarchy through axe (simulators) or WDA (physical devices); query and action parity remain partial.",
				},
				nextSuggestions: [
					"Run inspect_ui without dryRun to capture an actual iOS hierarchy dump through axe or WDA.",
				],
			};
		}

		const captureIosSnapshot =
			deps.captureIosUiSnapshot ?? captureIosUiSnapshot;
		const summarizeIos = deps.parseIosInspectSummary ?? parseIosInspectSummary;
		const snapshot = await captureIosSnapshot(
			repoRoot,
			deviceId,
			input.sessionId,
			runnerProfile,
			input.outputPath,
			buildIosSnapshotOptions({
				sessionId: input.sessionId,
				runnerProfile,
				harnessConfigPath: input.harnessConfigPath,
				deviceId,
				outputPath: input.outputPath,
			}),
		);
		if (isIosUiSnapshotFailure(snapshot)) {
			return {
				status: "partial",
				reasonCode: snapshot.reasonCode,
				sessionId: input.sessionId,
				durationMs: Date.now() - startTime,
				attempts: 1,
				artifacts: [],
				data: {
					dryRun: false,
					runnerProfile,
					outputPath: snapshot.outputPath,
					command: idbCommand,
					exitCode: snapshot.exitCode,
					supportLevel: "partial",
					platformSupportNote:
						"iOS inspect_ui depends on axe (simulators) or WDA (physical devices) availability.",
				},
				nextSuggestions: [snapshot.message],
			};
		}

		const summary =
			snapshot.execution.exitCode === 0
				? summarizeIos(snapshot.execution.stdout)
				: undefined;
		const detectedPageContext = summary
			? await pageContextDetectorService.detect({
					sessionId: input.sessionId,
					platform,
					stateSummary: buildInspectUiStateSummary(summary),
					uiSummary: summary,
					appId: input.appId,
					appIdentitySource: input.appId ? "input_override" : "unknown",
					deviceId,
				})
			: undefined;

		return {
			status: snapshot.execution.exitCode === 0 ? "success" : "partial",
			reasonCode:
				snapshot.execution.exitCode === 0
					? REASON_CODES.ok
					: REASON_CODES.configurationError,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts:
				snapshot.execution.exitCode === 0
					? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
					: [],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: snapshot.relativeOutputPath,
				command: snapshot.command,
				exitCode: snapshot.execution.exitCode,
				supportLevel: "partial",
				evidence:
					snapshot.execution.exitCode === 0
						? [
								buildExecutionEvidence(
									"ui_dump",
									snapshot.relativeOutputPath,
									"partial",
									"Captured iOS UI hierarchy artifact.",
								),
							]
						: undefined,
				platformSupportNote:
					"iOS inspect_ui can capture hierarchy artifacts, but downstream query/action tooling is still partial compared with Android.",
				content:
					snapshot.execution.exitCode === 0
						? snapshot.execution.stdout
						: undefined,
				pageContext: detectedPageContext?.pageContext,
				summary,
			},
			nextSuggestions:
				snapshot.execution.exitCode === 0
					? []
					: [
							"Ensure axe CLI is available for the selected simulator and retry inspect_ui.",
						],
		};
	}

	const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);

	if (input.dryRun) {
		return {
			status: "success",
			reasonCode: REASON_CODES.ok,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				dryRun: true,
				runnerProfile,
				outputPath: relativeOutputPath,
				command: [...dumpCommand, ...readCommand],
				exitCode: 0,
				supportLevel: "full",
				evidence: [
					buildExecutionEvidence(
						"ui_dump",
						relativeOutputPath,
						"full",
						"Planned Android UI hierarchy artifact path.",
					),
				],
			},
			nextSuggestions: [
				"Run inspect_ui without dryRun to capture an actual Android hierarchy dump.",
			],
		};
	}

	const captureAndroidSnapshot =
		deps.captureAndroidUiSnapshot ?? captureAndroidUiSnapshot;
	const summarizeAndroid = deps.parseInspectUiSummary ?? parseInspectUiSummary;
	const snapshot = await captureAndroidSnapshot(
		repoRoot,
		deviceId,
		input.sessionId,
		runnerProfile,
		input.outputPath,
		{
			sessionId: input.sessionId,
			platform,
			runnerProfile,
			harnessConfigPath: input.harnessConfigPath,
			deviceId,
			outputPath: input.outputPath,
			dryRun: false,
		},
	);
	if (isAndroidUiSnapshotFailure(snapshot)) {
		return {
			status: "failed",
			reasonCode: snapshot.reasonCode,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: snapshot.outputPath,
				command: dumpCommand,
				exitCode: snapshot.exitCode,
				supportLevel: "full",
			},
			nextSuggestions: [snapshot.message],
		};
	}

	const summary =
		snapshot.readExecution.exitCode === 0
			? summarizeAndroid(snapshot.readExecution.stdout)
			: undefined;
	const detectedPageContext = summary
		? await pageContextDetectorService.detect({
				sessionId: input.sessionId,
				platform,
				stateSummary: buildInspectUiStateSummary(summary),
				uiSummary: summary,
				appId: input.appId,
				appIdentitySource: input.appId ? "input_override" : "unknown",
				deviceId,
			})
		: undefined;

	return {
		status: snapshot.readExecution.exitCode === 0 ? "success" : "failed",
		reasonCode:
			snapshot.readExecution.exitCode === 0
				? REASON_CODES.ok
				: buildFailureReason(
						snapshot.readExecution.stderr,
						snapshot.readExecution.exitCode,
					),
		sessionId: input.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts:
			snapshot.readExecution.exitCode === 0
				? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
				: [],
		data: {
			dryRun: false,
			runnerProfile,
			outputPath: snapshot.relativeOutputPath,
			command: snapshot.readCommand,
			exitCode: snapshot.readExecution.exitCode,
			supportLevel: "full",
			evidence:
				snapshot.readExecution.exitCode === 0
					? [
							buildExecutionEvidence(
								"ui_dump",
								snapshot.relativeOutputPath,
								"full",
								"Captured Android UI hierarchy artifact.",
							),
						]
					: undefined,
			content:
				snapshot.readExecution.exitCode === 0
					? snapshot.readExecution.stdout
					: undefined,
			pageContext: detectedPageContext?.pageContext,
			summary,
		},
		nextSuggestions:
			snapshot.readExecution.exitCode === 0
				? []
				: ["Check Android device state before retrying inspect_ui."],
	};
}
