import type {
	ToolResult,
	WaitForUiData,
	WaitForUiInput,
} from "@mobile-e2e-mcp/contracts";
import { ACTION_TYPES, REASON_CODES } from "@mobile-e2e-mcp/contracts";
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
import { hasQueryUiSelector } from "./ui-model.js";
import {
	buildAndroidUiDumpCommands,
	captureAndroidUiRuntimeSnapshot,
	captureIosUiRuntimeSnapshot,
	runUiWaitPollingLoop,
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
	DEFAULT_WAIT_INTERVAL_MS,
	DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
	DEFAULT_WAIT_TIMEOUT_MS,
	normalizeWaitForUiMode,
	reasonCodeForWaitTimeout,
} from "./ui-tool-utils.js";

export async function waitForUiWithMaestroTool(
	input: WaitForUiInput,
): Promise<ToolResult<WaitForUiData>> {
	const startTime = Date.now();
	if (!input.platform) {
		const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
		const query = buildUiQuery(input);
		const timeoutMs =
			typeof input.timeoutMs === "number" && input.timeoutMs > 0
				? Math.floor(input.timeoutMs)
				: DEFAULT_WAIT_TIMEOUT_MS;
		const intervalMs =
			typeof input.intervalMs === "number" && input.intervalMs > 0
				? Math.floor(input.intervalMs)
				: DEFAULT_WAIT_INTERVAL_MS;
		const waitUntil = normalizeWaitForUiMode(input.waitUntil);
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
				timeoutMs,
				intervalMs,
				waitUntil,
				polls: 0,
				command: [],
				exitCode: null,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: "partial",
			},
			nextSuggestions: [buildMissingPlatformSuggestion(ACTION_TYPES.waitForUi)],
		};
	}
	const repoRoot = resolveRepoPath();
	const platform = input.platform;
	const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
	const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
	const query = buildUiQuery(input);
	const timeoutMs =
		typeof input.timeoutMs === "number" && input.timeoutMs > 0
			? Math.floor(input.timeoutMs)
			: DEFAULT_WAIT_TIMEOUT_MS;
	const intervalMs =
		typeof input.intervalMs === "number" && input.intervalMs > 0
			? Math.floor(input.intervalMs)
			: DEFAULT_WAIT_INTERVAL_MS;
	const waitUntil = normalizeWaitForUiMode(input.waitUntil);
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
				timeoutMs,
				intervalMs,
				waitUntil,
				polls: 0,
				command: [],
				exitCode: null,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: platform === "android" ? "full" : "partial",
			},
			nextSuggestions: [
				"Provide at least one selector field before calling wait_for_ui.",
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
					timeoutMs,
					intervalMs,
					waitUntil,
					polls: 0,
					command: idbCommand,
					exitCode: 0,
					result: { query, totalMatches: 0, matches: [] },
					supportLevel: "full",
				},
				nextSuggestions: [
					"wait_for_ui dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to poll the current simulator hierarchy.",
				],
			};
		}

		const waitOutcome = await runUiWaitPollingLoop({
			query,
			waitUntil,
			timeoutMs,
			intervalMs,
			defaultOutputPath,
			previewCommand: idbCommand,
			captureSnapshot: () =>
				captureIosUiRuntimeSnapshot(
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
				),
		});

		if (waitOutcome.outcome === "failure") {
			return {
				status: "failed",
				reasonCode: waitOutcome.reasonCode,
				sessionId: input.sessionId,
				durationMs: Date.now() - startTime,
				attempts: waitOutcome.polls,
				artifacts: [],
				data: {
					dryRun: false,
					runnerProfile,
					outputPath: waitOutcome.state.outputPath,
					query,
					timeoutMs,
					intervalMs,
					waitUntil,
					polls: waitOutcome.polls,
					command: waitOutcome.state.command,
					exitCode: waitOutcome.state.exitCode,
					result: waitOutcome.state.result,
					supportLevel: "full",
				},
				nextSuggestions: [waitOutcome.message],
			};
		}

		if (waitOutcome.outcome === "matched") {
			return {
				status: "success",
				reasonCode: REASON_CODES.ok,
				sessionId: input.sessionId,
				durationMs: Date.now() - startTime,
				attempts: waitOutcome.polls,
				artifacts: waitOutcome.state.absoluteOutputPath
					? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
					: [],
				data: {
					dryRun: false,
					runnerProfile,
					outputPath: waitOutcome.state.outputPath,
					query,
					timeoutMs,
					intervalMs,
					waitUntil,
					polls: waitOutcome.polls,
					command: waitOutcome.state.command,
					exitCode: waitOutcome.state.exitCode,
					result: waitOutcome.state.result,
					supportLevel: "full",
					content: waitOutcome.state.content,
					summary: waitOutcome.state.summary,
				},
				nextSuggestions: [],
			};
		}

		return {
			status: "partial",
			reasonCode: reasonCodeForWaitTimeout(waitUntil),
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: waitOutcome.polls,
			artifacts: waitOutcome.state.absoluteOutputPath
				? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
				: [],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: waitOutcome.state.outputPath,
				query,
				timeoutMs,
				intervalMs,
				waitUntil,
				polls: waitOutcome.polls,
				command: waitOutcome.state.command,
				exitCode: waitOutcome.state.exitCode,
				result: waitOutcome.state.result,
				supportLevel: "full",
				content: waitOutcome.state.content,
				summary: waitOutcome.state.summary,
			},
			nextSuggestions: [
				`Timed out waiting for iOS UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`,
			],
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
				timeoutMs,
				intervalMs,
				waitUntil,
				polls: 0,
				command,
				exitCode: 0,
				result: { query, totalMatches: 0, matches: [] },
				supportLevel: "full",
			},
			nextSuggestions: [
				"wait_for_ui dry-run only previews the capture command. Run it without --dry-run to poll the live Android hierarchy.",
			],
		};
	}

	const waitOutcome = await runUiWaitPollingLoop({
		query,
		waitUntil,
		timeoutMs,
		intervalMs,
		defaultOutputPath,
		previewCommand: command,
		captureSnapshot: () =>
			captureAndroidUiRuntimeSnapshot(
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
			),
		buildRetryableSnapshotFailure: (snapshot) =>
			snapshot.exitCode !== 0
				? {
						reasonCode: buildFailureReason(snapshot.stderr, snapshot.exitCode),
						message: `Android UI hierarchy reads failed ${String(DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`,
					}
				: undefined,
		buildCaptureFailureAbortMessage: (consecutiveFailures) =>
			`Android UI hierarchy capture failed ${String(consecutiveFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`,
		maxConsecutiveRetryableFailures:
			DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
	});

	if (waitOutcome.outcome === "failure") {
		return {
			status: "failed",
			reasonCode: waitOutcome.reasonCode,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: waitOutcome.polls,
			artifacts: [],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: waitOutcome.state.outputPath,
				query,
				timeoutMs,
				intervalMs,
				waitUntil,
				polls: waitOutcome.polls,
				command: waitOutcome.state.command,
				exitCode: waitOutcome.state.exitCode,
				result: waitOutcome.state.result,
				supportLevel: "full",
			},
			nextSuggestions: [waitOutcome.message],
		};
	}

	if (waitOutcome.outcome === "matched") {
		return {
			status: "success",
			reasonCode: REASON_CODES.ok,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: waitOutcome.polls,
			artifacts: waitOutcome.state.absoluteOutputPath
				? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
				: [],
			data: {
				dryRun: false,
				runnerProfile,
				outputPath: waitOutcome.state.outputPath,
				query,
				timeoutMs,
				intervalMs,
				waitUntil,
				polls: waitOutcome.polls,
				command: waitOutcome.state.command,
				exitCode: waitOutcome.state.exitCode,
				result: waitOutcome.state.result,
				supportLevel: "full",
				content: waitOutcome.state.content,
				summary: waitOutcome.state.summary,
			},
			nextSuggestions: [],
		};
	}

	return {
		status: "partial",
		reasonCode: reasonCodeForWaitTimeout(waitUntil),
		sessionId: input.sessionId,
		durationMs: Date.now() - startTime,
		attempts: waitOutcome.polls,
		artifacts: waitOutcome.state.absoluteOutputPath
			? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
			: [],
		data: {
			dryRun: false,
			runnerProfile,
			outputPath: waitOutcome.state.outputPath,
			query,
			timeoutMs,
			intervalMs,
			waitUntil,
			polls: waitOutcome.polls,
			command: waitOutcome.state.command,
			exitCode: waitOutcome.state.exitCode,
			result: waitOutcome.state.result,
			supportLevel: "full",
			content: waitOutcome.state.content,
			summary: waitOutcome.state.summary,
		},
		nextSuggestions: [
			`Timed out waiting for Android UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`,
		],
	};
}