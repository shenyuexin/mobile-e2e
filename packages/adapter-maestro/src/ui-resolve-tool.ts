import type {
	ResolveUiTargetData,
	ResolveUiTargetInput,
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
	buildFailureReason,
	toRelativePath,
} from "./runtime-shared.js";
import {
	buildNonExecutedUiTargetResolution,
	buildUiTargetResolution,
	hasQueryUiSelector,
	reasonCodeForResolutionStatus,
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
	buildUiQuery,
	buildIosSnapshotOptions,
} from "./ui-tool-shared.js";
import {
	buildResolutionNextSuggestions,
} from "./ui-tool-utils.js";

export async function resolveUiTargetWithMaestroTool(
	input: ResolveUiTargetInput,
): Promise<ToolResult<ResolveUiTargetData>> {
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
				resolution: buildNonExecutedUiTargetResolution(query, "partial"),
				supportLevel: "partial",
			},
			nextSuggestions: [buildMissingPlatformSuggestion("resolve_ui_target")],
		};
	}
	const repoRoot = resolveRepoPath();
	const platform = input.platform;
	const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
	const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
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
				resolution: buildNonExecutedUiTargetResolution(
					query,
					platform === "android" ? "full" : "partial",
				),
				supportLevel: platform === "android" ? "full" : "partial",
			},
			nextSuggestions: [
				"Provide at least one selector field before calling resolve_ui_target.",
			],
		};
	}

	if (platform === "ios") {
		const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
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
					resolution: buildNonExecutedUiTargetResolution(query, "full"),
					supportLevel: "full",
				},
				nextSuggestions: [
					"resolve_ui_target dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to resolve against the current simulator hierarchy.",
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
					resolution: buildNonExecutedUiTargetResolution(query, "full"),
					supportLevel: "full",
				},
				nextSuggestions: [snapshot.message],
			};
		}

		const result = { query, ...snapshot.queryResult };
		const resolution = buildUiTargetResolution(query, result, "full");
		return {
			status: resolution.status === "resolved" ? "success" : "partial",
			reasonCode:
				resolution.status === "resolved"
					? REASON_CODES.ok
					: reasonCodeForResolutionStatus(resolution.status),
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
				query,
				command: snapshot.command,
				exitCode: snapshot.execution.exitCode,
				result,
				resolution,
				supportLevel: "full",
				content: snapshot.execution.stdout,
				summary: snapshot.summary,
			},
			nextSuggestions:
				resolution.status === "resolved"
					? []
					: buildResolutionNextSuggestions(
							resolution.status,
							"resolve_ui_target",
							resolution,
						),
		};
	}

	const selection = await loadHarnessSelection(
		repoRoot,
		input.platform,
		runnerProfile,
		input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
	);
	const deviceId =
		input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
	const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
	const command = [...dumpCommand, ...readCommand];

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
				command,
				exitCode: 0,
				result: { query, totalMatches: 0, matches: [] },
				resolution: buildNonExecutedUiTargetResolution(query, "full"),
				supportLevel: "full",
			},
			nextSuggestions: [
				"resolve_ui_target dry-run only previews the capture command. Run it without --dry-run to resolve against the live Android hierarchy.",
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
				command: snapshot.command,
				exitCode: snapshot.exitCode,
				result: { query, totalMatches: 0, matches: [] },
				resolution: buildNonExecutedUiTargetResolution(query, "full"),
				supportLevel: "full",
			},
			nextSuggestions: [snapshot.message],
		};
	}

	if (snapshot.readExecution.exitCode !== 0) {
		return {
			status: "failed",
			reasonCode: buildFailureReason(
				snapshot.readExecution.stderr,
				snapshot.readExecution.exitCode,
			),
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: snapshot.relativeOutputPath,
				query,
				command: snapshot.command,
				exitCode: snapshot.readExecution.exitCode,
				result: { query, totalMatches: 0, matches: [] },
				resolution: buildNonExecutedUiTargetResolution(query, "full"),
				supportLevel: "full",
			},
			nextSuggestions: [
				"Could not read the Android UI hierarchy before resolving the target. Check device state and retry.",
			],
		};
	}

	const result = { query, ...snapshot.queryResult };
	const resolution = buildUiTargetResolution(query, result, "full");
	return {
		status: resolution.status === "resolved" ? "success" : "partial",
		reasonCode: reasonCodeForResolutionStatus(resolution.status),
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
			exitCode: snapshot.readExecution.exitCode,
			result,
			resolution,
			supportLevel: "full",
			content: snapshot.readExecution.stdout,
			summary: snapshot.summary,
		},
		nextSuggestions:
			resolution.status === "resolved"
				? []
				: buildResolutionNextSuggestions(
						resolution.status,
						"resolve_ui_target",
						resolution,
					),
	};
}