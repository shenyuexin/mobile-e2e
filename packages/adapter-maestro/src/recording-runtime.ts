import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type CancelRecordSessionData,
	type CancelRecordSessionInput,
	type EndRecordSessionData,
	type EndRecordSessionInput,
	type GetRecordSessionStatusInput,
	type RawRecordedEvent,
	REASON_CODES,
	type RecordSessionStatusData,
	type StartRecordSessionData,
	type StartRecordSessionInput,
	type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import type { PersistedRecordSession } from "@mobile-e2e-mcp/core";
import {
	buildRecordEventsRelativePath,
	buildRecordedStepsRelativePath,
	buildRecordSessionRelativePath,
	listRawRecordedEvents,
	loadRecordedSteps,
	loadRecordSession,
	persistRawRecordedEvents,
	persistRecordedSteps,
	persistRecordSessionState,
	persistStartedRecordSession,
} from "@mobile-e2e-mcp/core";
import { buildDefaultAppId, resolveRepoPath } from "./harness-config.js";
import {
	mapRawEventsToRecordedSteps,
	renderRecordedStepsAsFlow,
} from "./recording-mapper.js";
import {
	choosePreferredAndroidDeviceId,
	parseAdbDeviceEntries,
	parseRawInputEvents,
} from "./recording-runtime-android.js";
import {
	choosePreferredIosDeviceId,
	parseIosRawInputEvents,
	parseSimctlDeviceEntries,
} from "./recording-runtime-ios.js";
import {
	chooseNearestSnapshotRef,
	deriveViewportSizeFromSnapshot,
	deriveViewportSizeFromXml,
	type ExtendedRawRecordedEvent,
	listSnapshotRefsForSession,
	mapMonotonicToIso,
	normalizeEventsToViewport,
	parseSnapshotCapturedAtMs,
	resolveSelectorAtPoint,
	type SnapshotCandidate,
} from "./recording-runtime-snapshot.js";
import { resolveRecordingPlatformHooks } from "./recording-runtime-platform.js";
async function maybeNormalizeEventsUsingSnapshotViewport(
	repoRoot: string,
	recordSessionId: string,
	events: ExtendedRawRecordedEvent[],
	fallbackSnapshotRef?: string,
): Promise<ExtendedRawRecordedEvent[]> {
	const snapshotRefs = await listSnapshotRefsForSession(
		repoRoot,
		recordSessionId,
	);
	const candidateRefs =
		snapshotRefs.length > 0
			? snapshotRefs
			: fallbackSnapshotRef
				? [fallbackSnapshotRef]
				: [];
	for (const ref of candidateRefs) {
		const snapshotXml = await readFile(
			path.resolve(repoRoot, ref),
			"utf8",
		).catch(() => "");
		if (!snapshotXml) {
			continue;
		}
		const viewport = deriveViewportSizeFromSnapshot(snapshotXml);
		if (!viewport) {
			continue;
		}
		return normalizeEventsToViewport(events, viewport);
	}
	return events;
}

async function enrichEventsWithSelectors(
	repoRoot: string,
	events: ExtendedRawRecordedEvent[],
): Promise<ExtendedRawRecordedEvent[]> {
	const snapshotCache = new Map<string, string>();
	const enriched: ExtendedRawRecordedEvent[] = [];
	for (const event of events) {
		if (
			event.resolvedSelector ||
			!event.uiSnapshotRef ||
			event.x === undefined ||
			event.y === undefined
		) {
			enriched.push(event);
			continue;
		}
		const snapshotAbsolutePath = path.resolve(repoRoot, event.uiSnapshotRef);
		let snapshotXml = snapshotCache.get(snapshotAbsolutePath);
		if (snapshotXml === undefined) {
			snapshotXml = await readFile(snapshotAbsolutePath, "utf8").catch(
				() => "",
			);
			snapshotCache.set(snapshotAbsolutePath, snapshotXml);
		}
		const selector =
			snapshotXml.length > 0
				? resolveSelectorAtPoint(snapshotXml, event.x, event.y)
				: undefined;
		enriched.push({
			...event,
			resolvedSelector: selector,
			normalizedPoint:
				event.x !== undefined && event.y !== undefined
					? { x: event.x, y: event.y }
					: event.normalizedPoint,
		});
	}
	return enriched;
}

export async function startRecordSessionWithMaestro(
	input: StartRecordSessionInput,
): Promise<ToolResult<StartRecordSessionData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSessionId = `rec-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const startedAt = new Date().toISOString();
	const platform = input.platform ?? "android";
	const hooks = resolveRecordingPlatformHooks(platform);
	const resolvedDeviceId = await hooks.resolveDeviceId(
		repoRoot,
		input.deviceId,
		input.dryRun,
	);

	if (!resolvedDeviceId) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.deviceUnavailable,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId,
				sessionId: input.sessionId,
				platform,
				deviceId: "unknown",
				appId: input.appId ?? buildDefaultAppId(platform),
				recordingProfile: input.recordingProfile ?? "default",
				status: "cancelled",
				startedAt,
				captureChannels: hooks.captureChannels,
				rawEventsPath: buildRecordEventsRelativePath(recordSessionId),
			},
			nextSuggestions: [hooks.unavailableDeviceSuggestion],
		};
	}

	const deviceId = resolvedDeviceId;
	const appId = input.appId ?? buildDefaultAppId(platform);
	const rawEventsRelativePath = buildRecordEventsRelativePath(recordSessionId);
	const rawEventsAbsolutePath = path.resolve(repoRoot, rawEventsRelativePath);
	await mkdir(path.dirname(rawEventsAbsolutePath), { recursive: true });
	const captureChannels = hooks.captureChannels;
	const captureStartMonotonicMs = await hooks.readCaptureStartMonotonicMs(
		repoRoot,
		deviceId,
		input.dryRun,
	);
	const captureStart = await hooks.startCaptureProcesses({
		repoRoot,
		recordSessionId,
		deviceId,
		rawEventsAbsolutePath,
		dryRun: input.dryRun,
	});
	if (captureStart.failureSuggestion) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId,
				sessionId: input.sessionId,
				platform,
				deviceId,
				appId,
				recordingProfile: input.recordingProfile ?? "default",
				status: "cancelled",
				startedAt,
				captureChannels,
				rawEventsPath: rawEventsRelativePath,
			},
			nextSuggestions: [captureStart.failureSuggestion],
		};
	}
	const { pid, snapshotPid } = captureStart;

	const persisted = await persistStartedRecordSession(repoRoot, {
		recordSessionId,
		sessionId: input.sessionId,
		platform,
		deviceId,
		appId,
		recordingProfile: input.recordingProfile ?? "default",
		startedAt,
		captureChannels,
		rawEventsPath: rawEventsRelativePath,
		pid,
		...(captureStartMonotonicMs !== undefined
			? { captureStartMonotonicMs }
			: {}),
		...(snapshotPid ? { snapshotPid } : {}),
	});

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: input.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [persisted.relativePath, rawEventsRelativePath],
		data: {
			recordSessionId,
			sessionId: input.sessionId,
			platform,
			deviceId,
			appId,
			recordingProfile: input.recordingProfile ?? "default",
			status: "running",
			startedAt,
			captureChannels,
			rawEventsPath: rawEventsRelativePath,
			pid,
		},
		nextSuggestions: hooks.startSuccessSuggestions,
	};
}

export async function getRecordSessionStatusWithMaestro(
	input: GetRecordSessionStatusInput,
): Promise<ToolResult<RecordSessionStatusData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSession = await loadRecordSession(
		repoRoot,
		input.recordSessionId,
	);
	if (!recordSession) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.recordSessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId: input.recordSessionId,
				sessionId: "unknown",
				platform: "android",
				deviceId: "unknown",
				status: "cancelled",
				startedAt: new Date(0).toISOString(),
				rawEventCount: 0,
				recordedStepCount: 0,
				rawEventsPath: buildRecordEventsRelativePath(input.recordSessionId),
				warnings: ["Record session does not exist."],
			},
			nextSuggestions: ["Start a new record session before querying status."],
		};
	}

	const [events, steps] = await Promise.all([
		listRawRecordedEvents(repoRoot, input.recordSessionId),
		loadRecordedSteps(repoRoot, input.recordSessionId),
	]);
	const hooks = resolveRecordingPlatformHooks(recordSession.platform);

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: recordSession.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [
			buildRecordSessionRelativePath(input.recordSessionId),
			recordSession.rawEventsPath,
		],
		data: {
			recordSessionId: recordSession.recordSessionId,
			sessionId: recordSession.sessionId,
			platform: recordSession.platform,
			deviceId: recordSession.deviceId,
			appId: recordSession.appId,
			status: recordSession.status,
			startedAt: recordSession.startedAt,
			endedAt: recordSession.endedAt,
			rawEventCount: events.length,
			recordedStepCount: steps.length,
			rawEventsPath: recordSession.rawEventsPath,
			flowPath: recordSession.flowPath,
			warnings: recordSession.warnings,
		},
		nextSuggestions:
			recordSession.status === "running"
				? hooks.runningStatusSuggestions
				: recordSession.platform === "ios" && recordSession.warnings.length > 0
					? ["Review iOS recording warnings in status output before replay."]
					: [],
	};
}

export async function endRecordSessionWithMaestro(
	input: EndRecordSessionInput,
): Promise<ToolResult<EndRecordSessionData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSession = await loadRecordSession(
		repoRoot,
		input.recordSessionId,
	);
	if (!recordSession) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.recordSessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId: input.recordSessionId,
				status: "cancelled",
				endedAt: new Date().toISOString(),
				report: {
					stepCount: 0,
					warnings: ["Record session does not exist."],
					confidenceSummary: { high: 0, medium: 0, low: 0 },
					reviewRequired: true,
				},
			},
			nextSuggestions: [
				"Start a new record session and retry end_record_session.",
			],
		};
	}

	const hooks = resolveRecordingPlatformHooks(recordSession.platform);

	if (
		recordSession.pid &&
		recordSession.status === "running" &&
		!input.dryRun
	) {
		try {
			process.kill(recordSession.pid, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	const snapshotProcessId = (
		recordSession as PersistedRecordSession & { snapshotPid?: number }
	).snapshotPid;
	if (snapshotProcessId && !input.dryRun) {
		try {
			process.kill(snapshotProcessId, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	let capturedEvents = (await listRawRecordedEvents(
		repoRoot,
		input.recordSessionId,
	)) as ExtendedRawRecordedEvent[];
	const contextSnapshot = await hooks.captureContextSnapshot({
		repoRoot,
		recordSessionId: input.recordSessionId,
		deviceId: recordSession.deviceId,
		bucketId: "end",
		dryRun: input.dryRun,
	});

	if (capturedEvents.length === 0) {
		const absolutePath = path.resolve(repoRoot, recordSession.rawEventsPath);
		const rawContent = await readFile(absolutePath, "utf8").catch(() => "");
		const parsed = hooks.parseRawEvents(rawContent);
		if (
			input.dryRun &&
			recordSession.platform === "ios" &&
			parsed.length === 0
		) {
			parsed.push(
				{
					type: "tap",
					eventMonotonicMs: 100,
					x: 160,
					y: 280,
					gesture: {
						kind: "tap",
						start: { x: 160, y: 280 },
						end: { x: 160, y: 280 },
						durationMs: 60,
					},
					rawLine: "dry-run-ios-synthetic-tap",
				},
				{
					type: "type",
					eventMonotonicMs: 220,
					textDelta: "demo@example.com",
					rawLine: "dry-run-ios-synthetic-type",
				},
			);
		}
		const snapshotRefs = await listSnapshotRefsForSession(
			repoRoot,
			input.recordSessionId,
		);
		const fallbackSnapshotRefs = contextSnapshot.uiSnapshotRef
			? [contextSnapshot.uiSnapshotRef]
			: [];
		const resolvedSnapshotRefs =
			snapshotRefs.length > 0 ? snapshotRefs : fallbackSnapshotRefs;
		const snapshotCandidates: SnapshotCandidate[] = resolvedSnapshotRefs
			.map((ref) => {
				const capturedAtMs = parseSnapshotCapturedAtMs(ref);
				return capturedAtMs !== undefined ? { ref, capturedAtMs } : undefined;
			})
			.filter(
				(candidate): candidate is SnapshotCandidate => candidate !== undefined,
			)
			.sort((left, right) => left.capturedAtMs - right.capturedAtMs);
		const anchorMonotonicMs =
			(
				recordSession as PersistedRecordSession & {
					captureStartMonotonicMs?: number;
				}
			).captureStartMonotonicMs ??
			parsed.find((event) => event.eventMonotonicMs > 0)?.eventMonotonicMs;
		const normalized: ExtendedRawRecordedEvent[] = parsed.map(
			(event, index) => {
				const mappedTimestamp = mapMonotonicToIso(
					recordSession.startedAt,
					event.eventMonotonicMs,
					anchorMonotonicMs,
				);
				const snapshotRef =
					chooseNearestSnapshotRef(mappedTimestamp, snapshotCandidates) ??
					resolvedSnapshotRefs[
						Math.min(index, Math.max(0, resolvedSnapshotRefs.length - 1))
					];
				return {
					eventId: `${input.recordSessionId}-${index + 1}`,
					recordSessionId: input.recordSessionId,
					timestamp: mappedTimestamp,
					eventMonotonicMs: event.eventMonotonicMs,
					eventType: event.type,
					x: event.x,
					y: event.y,
					gesture: event.gesture,
					normalizedPoint:
						event.x !== undefined && event.y !== undefined
							? { x: event.x, y: event.y }
							: undefined,
					textDelta: event.textDelta,
					rawLine: event.rawLine,
					foregroundApp: contextSnapshot.foregroundApp ?? recordSession.appId,
					uiSnapshotRef: snapshotRef,
				};
			},
		);
		const viewportNormalized = await maybeNormalizeEventsUsingSnapshotViewport(
			repoRoot,
			input.recordSessionId,
			normalized,
			contextSnapshot.uiSnapshotRef,
		);
		const enrichedNormalized = await enrichEventsWithSelectors(
			repoRoot,
			viewportNormalized,
		);
		if (enrichedNormalized.length > 0) {
			await persistRawRecordedEvents(
				repoRoot,
				input.recordSessionId,
				enrichedNormalized as RawRecordedEvent[],
			);
			capturedEvents = enrichedNormalized;
		}
	} else {
		const viewportNormalized = await maybeNormalizeEventsUsingSnapshotViewport(
			repoRoot,
			input.recordSessionId,
			capturedEvents,
			contextSnapshot.uiSnapshotRef,
		);
		capturedEvents = await enrichEventsWithSelectors(
			repoRoot,
			viewportNormalized,
		);
	}

	const mapped = mapRawEventsToRecordedSteps(
		input.recordSessionId,
		capturedEvents,
		{
			defaultAppId: recordSession.appId,
			includeAutoWaitStep: true,
		},
	);
	await persistRecordedSteps(repoRoot, input.recordSessionId, mapped.steps);

	let flowPath: string | undefined;
	let replayDryRun: EndRecordSessionData["report"]["replayDryRun"];
	const warnings = [...mapped.warnings, ...contextSnapshot.warnings];
	if (input.autoExport !== false) {
		const targetFlowPath =
			input.outputPath ??
			path.posix.join(
				"flows",
				"samples",
				"generated",
				`${input.recordSessionId}-${Date.now()}.yaml`,
			);
		const absoluteFlowPath = path.resolve(repoRoot, targetFlowPath);
		await mkdir(path.dirname(absoluteFlowPath), { recursive: true });
		const rendered = renderRecordedStepsAsFlow({
			appId: recordSession.appId ?? "com.example.app",
			includeLaunchStep: input.includeLaunchStep !== false,
			steps: mapped.steps,
		});
		warnings.push(...rendered.warnings);
		await writeFile(absoluteFlowPath, rendered.yaml, "utf8");
		flowPath = targetFlowPath;

		if (input.runReplayDryRun) {
			const { runFlowWithMaestro } = await import("./index.js");
			const replayResult = await runFlowWithMaestro({
				sessionId: recordSession.sessionId,
				platform: recordSession.platform,
				flowPath,
				dryRun: true,
				deviceId: recordSession.deviceId,
				appId: recordSession.appId,
			});
			replayDryRun = {
				status: replayResult.status,
				reasonCode: replayResult.reasonCode,
			};
		}
	}

	const confidenceSummary = mapped.steps.reduce(
		(acc, step) => {
			acc[step.confidence] += 1;
			return acc;
		},
		{ high: 0, medium: 0, low: 0 },
	);
	const endedAt = new Date().toISOString();
	await persistRecordSessionState(repoRoot, input.recordSessionId, {
		status: "ended",
		endedAt,
		flowPath,
		warnings,
		pid: undefined,
		snapshotPid: undefined,
	});

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: recordSession.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [
			buildRecordSessionRelativePath(input.recordSessionId),
			recordSession.rawEventsPath,
			buildRecordedStepsRelativePath(input.recordSessionId),
			...(flowPath ? [flowPath] : []),
		],
		data: {
			recordSessionId: input.recordSessionId,
			status: "ended",
			endedAt,
			report: {
				flowPath,
				stepCount: mapped.steps.length,
				warnings,
				confidenceSummary,
				reviewRequired: confidenceSummary.low > 0 || warnings.length > 0,
				replayDryRun,
			},
		},
		nextSuggestions: flowPath
			? recordSession.platform === "ios"
				? [
						`Replay with run_flow and flowPath='${flowPath}'.`,
						"If replay fails, inspect iOS selector confidence and idb snapshot warnings in report.warnings.",
					]
				: [`Replay with run_flow and flowPath='${flowPath}'.`]
			: [hooks.endSessionNoFlowSuggestion],
	};
}

export async function cancelRecordSessionWithMaestro(
	input: CancelRecordSessionInput,
): Promise<ToolResult<CancelRecordSessionData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSession = await loadRecordSession(
		repoRoot,
		input.recordSessionId,
	);
	if (!recordSession) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.recordSessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId: input.recordSessionId,
				cancelled: false,
				status: "cancelled",
			},
			nextSuggestions: ["Record session not found."],
		};
	}
	const hooks = resolveRecordingPlatformHooks(recordSession.platform);

	if (recordSession.pid && recordSession.status === "running") {
		try {
			process.kill(recordSession.pid, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	const snapshotProcessId = (
		recordSession as PersistedRecordSession & { snapshotPid?: number }
	).snapshotPid;
	if (snapshotProcessId && recordSession.status === "running") {
		try {
			process.kill(snapshotProcessId, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	const endedAt = new Date().toISOString();
	await persistRecordSessionState(repoRoot, input.recordSessionId, {
		status: "cancelled",
		endedAt,
		warnings: [...recordSession.warnings, "Recording was cancelled by user."],
		pid: undefined,
		snapshotPid: undefined,
	});

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: recordSession.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [
			buildRecordSessionRelativePath(input.recordSessionId),
			recordSession.rawEventsPath,
		],
		data: {
			recordSessionId: input.recordSessionId,
			cancelled: true,
			status: "cancelled",
			endedAt,
		},
		nextSuggestions: [hooks.cancelSuggestion],
	};
}

export const recordingRuntimeInternals = {
	parseAdbDeviceEntries,
	choosePreferredAndroidDeviceId,
	parseRawInputEvents,
	parseIosRawInputEvents,
	parseSimctlDeviceEntries,
	choosePreferredIosDeviceId,
	deriveViewportSizeFromXml,
	deriveViewportSizeFromSnapshot,
	normalizeEventsToViewport,
	parseSnapshotCapturedAtMs,
	chooseNearestSnapshotRef,
	mapMonotonicToIso,
	resolveSelectorAtPoint,
};
