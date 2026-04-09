import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeviceInfo } from "@mobile-e2e-mcp/contracts";
import { isIosPhysicalDeviceId, listAvailableDevices } from "./device-runtime.js";
import { buildDefaultDeviceId } from "./harness-config.js";
import type {
	ParsedRawEvent,
	RecordingCaptureStartParams,
	RecordingCaptureStartResult,
	RecordingContextSnapshotParams,
	RecordingContextSnapshotResult,
	RecordingPlatformHooks,
} from "./recording-runtime-platform.js";
import { executeRunner, shellEscape } from "./runtime-shared.js";
import { getIosBackendRouter } from "./ios-backend-router.js";

export interface SimctlDeviceEntry {
	udid: string;
	state: string;
	isAvailable: boolean;
}

export function isIosPhysicalRecordingDeviceId(deviceId: string): boolean {
	return isIosPhysicalDeviceId(deviceId);
}

export function choosePreferredIosPhysicalDeviceId(
	devices: Array<{ id: string; available: boolean }>,
	requestedDeviceId?: string,
): string | undefined {
	if (requestedDeviceId) {
		const requested = devices.find(
			(device) => device.id === requestedDeviceId && device.available,
		);
		return requested?.id;
	}
	return devices.find((device) => device.available)?.id;
}

export function choosePreferredIosRecordingRuntimeDeviceId(
	devices: DeviceInfo[],
	requestedDeviceId?: string,
): string | undefined {
	const availableDevices = devices.filter((device) => device.available);
	if (requestedDeviceId) {
		return availableDevices.find((device) => device.id === requestedDeviceId)?.id;
	}
	const preferredPhysical = availableDevices.find((device) =>
		isIosPhysicalRecordingDeviceId(device.id),
	);
	if (preferredPhysical) {
		return preferredPhysical.id;
	}
	const preferredBootedSimulator = availableDevices.find(
		(device) =>
			!isIosPhysicalRecordingDeviceId(device.id) &&
			device.state.toLowerCase() === "booted",
	);
	if (preferredBootedSimulator) {
		return preferredBootedSimulator.id;
	}
	return availableDevices[0]?.id;
}

function spawnDetachedShell(
	command: string,
	repoRoot: string,
	env: NodeJS.ProcessEnv,
): number | undefined {
	const child = spawn("bash", ["-lc", command], {
		cwd: repoRoot,
		env,
		detached: true,
		stdio: "ignore",
	});
	child.unref();
	return Number.isFinite(child.pid) ? child.pid : undefined;
}

export function parseSimctlDeviceEntries(output: string): SimctlDeviceEntry[] {
	try {
		const parsed = JSON.parse(output) as {
			devices?: Record<
				string,
				Array<{ udid?: string; state?: string; isAvailable?: boolean }>
			>;
		};
		const runtimeEntries = Object.values(parsed.devices ?? {});
		const flattened = runtimeEntries.flatMap((items) => items ?? []);
		return flattened
			.map((entry) => ({
				udid: entry.udid ?? "",
				state: entry.state ?? "Shutdown",
				isAvailable: entry.isAvailable !== false,
			}))
			.filter((entry) => entry.udid.length > 0);
	} catch {
		return [];
	}
}

export function choosePreferredIosDeviceId(
	entries: SimctlDeviceEntry[],
	requestedDeviceId?: string,
): string | undefined {
	if (requestedDeviceId) {
		const requested = entries.find(
			(entry) => entry.udid === requestedDeviceId && entry.isAvailable,
		);
		return requested?.udid;
	}
	const available = entries.filter((entry) => entry.isAvailable);
	const booted = available.find(
		(entry) => entry.state.toLowerCase() === "booted",
	);
	return booted?.udid ?? available[0]?.udid;
}

export async function resolveIosRecordingDeviceId(
	repoRoot: string,
	inputDeviceId?: string,
	dryRun?: boolean,
): Promise<string | undefined> {
	if (dryRun) {
		return inputDeviceId ?? buildDefaultDeviceId("ios");
	}
	const discovered = await listAvailableDevices(repoRoot, true).catch(
		() => undefined,
	);
	if (!discovered || discovered.ios.length === 0) {
		return undefined;
	}
	return choosePreferredIosRecordingRuntimeDeviceId(
		discovered.ios,
		inputDeviceId,
	);
}

export async function captureIosContextSnapshot(
	params: RecordingContextSnapshotParams,
): Promise<RecordingContextSnapshotResult> {
	const warnings: string[] = [];
	const bucketId = params.bucketId ?? "end";
	const snapshotRelativePath = path.posix.join(
		"artifacts",
		"record-snapshots",
		params.recordSessionId,
		`${params.recordSessionId}-${bucketId}.json`,
	);
	const snapshotAbsolutePath = path.resolve(
		params.repoRoot,
		snapshotRelativePath,
	);

	if (params.dryRun) {
		return {
			uiSnapshotRef: snapshotRelativePath,
			foregroundApp: "com.example.app",
			warnings,
		};
	}

	const router = getIosBackendRouter();
	const backend = router.selectBackend(params.deviceId);
	const probeResult = await backend.probeAvailability(params.repoRoot);
	if (!probeResult.available) {
		warnings.push(`Failed to capture iOS UI snapshot: ${backend.backendName} is unavailable (${probeResult.error ?? ""})`);
		return { warnings };
	}

	await mkdir(path.dirname(snapshotAbsolutePath), { recursive: true });
	const command = backend.buildHierarchyCaptureCommand(params.deviceId);
	const snapshotResult = await executeRunner(
		command,
		params.repoRoot,
		process.env,
	);
	if (snapshotResult.exitCode !== 0) {
		warnings.push("Failed to capture iOS UI snapshot. Verify axe/WDA backend availability.");
		return { warnings };
	}

	await writeFile(snapshotAbsolutePath, snapshotResult.stdout, "utf8");
	return {
		uiSnapshotRef: snapshotRelativePath,
		warnings,
	};
}

function extractIosLogTimestampMs(line: string): number | undefined {
	const isoLike = line.match(
		/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
	);
	if (!isoLike) {
		return undefined;
	}
	const normalized = isoLike[1].replace(" ", "T");
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function extractCoordinatePairs(line: string): Array<{ x: number; y: number }> {
	const coordinateRegex =
		/(?:\(|\[|\{)?\s*(\d{1,5})\s*[,x]\s*(\d{1,5})\s*(?:\)|\]|\})?/g;
	const pairs: Array<{ x: number; y: number }> = [];
	for (const match of line.matchAll(coordinateRegex)) {
		const x = Number.parseInt(match[1], 10);
		const y = Number.parseInt(match[2], 10);
		if (Number.isFinite(x) && Number.isFinite(y)) {
			pairs.push({ x, y });
		}
	}
	return pairs;
}

export function parseIosRawInputEvents(rawContent: string): ParsedRawEvent[] {
	const lines = rawContent
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0);
	const events: ParsedRawEvent[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const lower = line.toLowerCase();
		const eventMonotonicMs = extractIosLogTimestampMs(line) ?? index * 50;

		if (lower.includes(ACTION_TYPES.swipe) || lower.includes("drag")) {
			const pairs = extractCoordinatePairs(line);
			if (pairs.length >= 2) {
				const start = pairs[0];
				const end = pairs[pairs.length - 1];
				events.push({
					type: ACTION_TYPES.swipe,
					eventMonotonicMs,
					x: start.x,
					y: start.y,
					endX: end.x,
					endY: end.y,
					gesture: {
						kind: ACTION_TYPES.swipe,
						start,
						end,
						durationMs: 240,
					},
					rawLine: line,
				});
			}
			continue;
		}

		if (lower.includes(ACTION_TYPES.tap) || lower.includes("touch")) {
			const pair = extractCoordinatePairs(line)[0];
			events.push({
				type: ACTION_TYPES.tap,
				eventMonotonicMs,
				x: pair?.x,
				y: pair?.y,
				gesture: pair
					? {
							kind: ACTION_TYPES.tap,
							start: pair,
							end: pair,
							durationMs: 60,
						}
					: undefined,
				rawLine: line,
			});
			continue;
		}

		if (
			lower.includes("keyboard") ||
			lower.includes("insert") ||
			lower.includes("typing") ||
			lower.includes("text")
		) {
			const quoted =
				line.match(/["']([^"'\n]+)["']/)?.[1] ??
				line.match(/(?:text|value|insert)[=:]\s*([^,;]+)/i)?.[1]?.trim();
			if (!quoted || quoted.length === 0) {
				continue;
			}
			events.push({
				type: "type",
				eventMonotonicMs,
				textDelta: quoted,
				rawLine: line,
			});
		}
	}

	return events;
}

export async function startIosCaptureProcesses(
	params: RecordingCaptureStartParams,
): Promise<RecordingCaptureStartResult> {
	if (params.dryRun) {
		return {};
	}
	const isPhysicalDevice = isIosPhysicalRecordingDeviceId(params.deviceId);
	const router = getIosBackendRouter();
	const backend = router.selectBackend(params.deviceId);
	const probeResult = await backend.probeAvailability(params.repoRoot);
	if (!probeResult.available) {
		return {
			failureSuggestion: `iOS recording requires ${backend.backendName}. ${probeResult.error ?? "Verify backend availability with 'mobile-e2e-mcp doctor'."}`,
		};
	}

	let pid: number | undefined;
	if (!isPhysicalDevice) {
		const iosLogStreamPredicate =
			"eventMessage CONTAINS[c] 'touch' OR eventMessage CONTAINS[c] 'tap' OR eventMessage CONTAINS[c] 'keyboard' OR eventMessage CONTAINS[c] 'swipe'";
		const shellCommand = `xcrun simctl spawn ${shellEscape(params.deviceId)} log stream --style compact --level info --predicate ${shellEscape(iosLogStreamPredicate)} > ${shellEscape(params.rawEventsAbsolutePath)} 2>&1`;
		pid = spawnDetachedShell(shellCommand, params.repoRoot, process.env);
		if (!pid) {
			return {
				failureSuggestion:
					"Failed to start iOS simulator event capture. Ensure xcrun simctl works and simulator is booted, then retry.",
			};
		}
	} else {
		const shellCommand = `xcrun devicectl device info logs --device ${shellEscape(params.deviceId)} > ${shellEscape(params.rawEventsAbsolutePath)} 2>&1`;
		pid = spawnDetachedShell(shellCommand, params.repoRoot, process.env);
		if (!pid) {
			return {
				failureSuggestion:
					"Failed to start iOS physical-device event capture. Verify WDA/iproxy setup and retry start_record_session.",
			};
		}
	}

	const snapshotDirRelativePath = path.posix.join(
		"artifacts",
		"record-snapshots",
		params.recordSessionId,
	);
	const snapshotDirAbsolutePath = path.resolve(
		params.repoRoot,
		snapshotDirRelativePath,
	);
	await mkdir(snapshotDirAbsolutePath, { recursive: true });
	const describeArgs = backend.buildHierarchyCaptureCommand(params.deviceId);
	const describeCommand = describeArgs
		.map((segment) => shellEscape(segment))
		.join(" ");
	const snapshotLoop = `while true; do ts=$(date +%s%3N); local_path=${shellEscape(path.join(snapshotDirAbsolutePath, `${params.recordSessionId}-$ts.json`))}; ${describeCommand} > $local_path 2>/dev/null; sleep 0.7; done`;
	const snapshotPid = spawnDetachedShell(
		snapshotLoop,
		params.repoRoot,
		process.env,
	);
	return { pid, snapshotPid };
}

export function createIosRecordingHooks(): RecordingPlatformHooks {
	return {
		platform: "ios",
		captureChannels: ["ios_events", "ui_snapshots", "app_context"],
		resolveDeviceId: resolveIosRecordingDeviceId,
		readCaptureStartMonotonicMs: async () => undefined,
		startCaptureProcesses: startIosCaptureProcesses,
		captureContextSnapshot: captureIosContextSnapshot,
		parseRawEvents: parseIosRawInputEvents,
		unavailableDeviceSuggestion:
			"No available iOS target detected. Provide a booted simulator UDID or a connected physical-device UDID, then retry start_record_session.",
		startSuccessSuggestions: [
			"Perform manual interactions on the selected iOS target, then call end_record_session with the returned recordSessionId.",
			"For simulator sessions, verify event capture with `xcrun simctl spawn <udid> log stream --style compact`; physical-device sessions currently rely on snapshot/context evidence and may produce sparse raw events.",
		],
		runningStatusSuggestions: [
			"Continue interacting on the selected iOS target, then call end_record_session to export flow.",
			"If rawEventCount remains 0, confirm axe/WDA/simctl/devicectl dependencies via doctor and review snapshot artifacts.",
		],
		endSessionNoFlowSuggestion:
			"No flow was exported. Verify iOS event capture (simulator log stream or physical-device app-context evidence) and axe/WDA snapshot availability, then retry recording.",
		cancelSuggestion:
			"iOS recording cancelled. Start a new session after confirming target readiness and axe/WDA availability.",
	};
}
