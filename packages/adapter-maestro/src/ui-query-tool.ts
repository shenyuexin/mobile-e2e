import type {
	QueryUiData,
	QueryUiInput,
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
	buildExecutionEvidence,
	buildFailureReason,
	toRelativePath,
} from "./runtime-shared.js";
import { hasQueryUiSelector } from "./ui-model.js";
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
	buildUiQuery,
	buildIosSnapshotOptions,
} from "./ui-tool-shared.js";

export async function queryUiWithMaestroTool(
	input: QueryUiInput,
): Promise<ToolResult<QueryUiData>> {
	const startTime = Date.now();
	if (!input.platform) {
		const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
		const query = buildUiQuery(input);
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
				query,
				command: [],
				exitCode: null,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: "partial",
			},
			nextSuggestions: [buildMissingPlatformSuggestion("query_ui")],
		};
	}
	const repoRoot = resolveRepoPath();
	const platform = input.platform;
	const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
	const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
	const selection = await loadHarnessSelection(
		repoRoot,
		platform,
		runnerProfile,
		input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
	);
	const deviceId =
		input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
	const query = buildUiQuery(input);
	const defaultOutputPath = buildPlatformUiDumpOutputPath({
		sessionId: input.sessionId,
		runnerProfile,
		platform,
		outputPath: input.outputPath,
	});

	if (!hasQueryUiSelector(query)) {
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
				outputPath: defaultOutputPath,
				query,
				command: [],
				exitCode: null,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: platform === "android" ? "full" : "partial",
			},
			nextSuggestions: [
				"Provide at least one query selector: resourceId, contentDesc, text, className, or clickable.",
			],
		};
	}

	if (platform === "ios") {
		const idbCommand =
			runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

		if (input.dryRun) {
			return {
				status: "partial",
				reasonCode: REASON_CODES.unsupportedOperation,
				sessionId: input.sessionId,
				durationMs: Date.now() - startTime,
				attempts: 1,
				artifacts: [],
				data: {
					dryRun: true,
					runnerProfile,
					outputPath: defaultOutputPath,
					query,
					command: idbCommand,
					exitCode: 0,
					result: { query, totalMatches: 0, matches: [] },
					supportLevel: "full",
				},
				nextSuggestions: [
					"Run query_ui without dryRun to capture an iOS hierarchy artifact and evaluate structured selector matches.",
				],
			};
		}

		const snapshot = await captureIosUiSnapshot(
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
			}, query),
		);
		if (isIosUiSnapshotFailure(snapshot)) {
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
					query,
					command: snapshot.command,
					exitCode: snapshot.exitCode,
					result: { query, totalMatches: 0, matches: [] },
					supportLevel: "full",
				},
				nextSuggestions: [snapshot.message],
			};
		}

		const result = { query, ...snapshot.queryResult };
		return {
			status: "success",
			reasonCode: REASON_CODES.ok,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: snapshot.relativeOutputPath,
				query,
				command: snapshot.command,
				exitCode: snapshot.execution.exitCode,
				result,
				supportLevel: "full",
				evidence: [
					buildExecutionEvidence(
						"ui_dump",
						snapshot.relativeOutputPath,
						"full",
						"Captured iOS hierarchy artifact for selector matching.",
					),
				],
				content: snapshot.execution.stdout,
				summary: snapshot.summary,
			},
			nextSuggestions:
				result.totalMatches === 0
					? [
							"No iOS nodes matched the provided selectors. Broaden the query or inspect the captured hierarchy artifact.",
						]
					: query.limit !== undefined &&
							result.totalMatches > result.matches.length
						? [
								"More iOS nodes matched than were returned. Increase query limit or narrow the selector.",
							]
						: [],
		};
	}

	const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
	const command = [...dumpCommand, ...readCommand];

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
				outputPath: defaultOutputPath,
				query,
				command,
				exitCode: 0,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: "full",
				evidence: [
					buildExecutionEvidence(
						"ui_dump",
						defaultOutputPath,
						"full",
						"Planned Android query_ui hierarchy artifact path.",
					),
				],
			},
			nextSuggestions: [
				"Run query_ui without dryRun to capture an Android hierarchy dump and return matched nodes.",
			],
		};
	}

	const snapshot = await captureAndroidUiSnapshot(
		repoRoot,
		deviceId,
		input.sessionId,
		runnerProfile,
		input.outputPath,
		{
			sessionId: input.sessionId,
			platform: input.platform,
			runnerProfile,
			harnessConfigPath: input.harnessConfigPath,
			deviceId,
			outputPath: input.outputPath,
			dryRun: false,
			...query,
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
				query,
				command,
				exitCode: snapshot.exitCode,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: "full",
			},
			nextSuggestions: [snapshot.message],
		};
	}

	const queryResult = { query, ...snapshot.queryResult };

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
			query,
			command,
			exitCode: snapshot.readExecution.exitCode,
			result: queryResult,
			supportLevel: "full",
			evidence:
				snapshot.readExecution.exitCode === 0
					? [
							buildExecutionEvidence(
								"ui_dump",
								snapshot.relativeOutputPath,
								"full",
								"Captured Android query_ui hierarchy artifact.",
							),
						]
					: undefined,
			content:
				snapshot.readExecution.exitCode === 0
					? snapshot.readExecution.stdout
					: undefined,
			summary: snapshot.summary,
		},
		nextSuggestions:
			snapshot.readExecution.exitCode !== 0
				? ["Check Android device state before retrying query_ui."]
				: queryResult.totalMatches === 0
					? [
							"No Android nodes matched the provided selectors. Broaden the query or run inspect_ui to review nearby nodes.",
						]
					: query.limit !== undefined &&
							queryResult.totalMatches > queryResult.matches.length
						? [
								"More Android nodes matched than were returned. Increase query limit or narrow the selector.",
							]
						: [],
	};
}