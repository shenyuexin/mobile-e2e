import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
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

export interface AdbDeviceEntry {
	id: string;
	state: string;
}

const SWIPE_DISTANCE_THRESHOLD_PX = 24;
const SWIPE_DURATION_THRESHOLD_MS = 1200;
const SWIPE_MIN_MOVE_SAMPLES = 2;
const SWIPE_STRONG_DISTANCE_THRESHOLD_PX = 220;

function mapAndroidKeyTokenToText(
	token: string,
	shiftPressed: boolean,
): string | undefined {
	if (shiftPressed && token === "2") return "@";
	if (shiftPressed && token === "MINUS") return "_";
	if (/^[A-Z]$/.test(token)) return token.toLowerCase();
	if (/^[0-9]$/.test(token)) return token;
	if (token === "SPACE") return " ";
	if (token === "DOT") return ".";
	if (token === "AT") return "@";
	if (token === "MINUS") return "-";
	if (token === "UNDERSCORE") return "_";
	if (token === "TAB") return "\t";
	if (token === "ENTER") return "\n";
	return undefined;
}

export async function captureAndroidContextSnapshot(
	params: RecordingContextSnapshotParams,
): Promise<RecordingContextSnapshotResult> {
	const warnings: string[] = [];
	const bucketId = params.bucketId ?? "end";
	const snapshotRelativePath = path.posix.join(
		"artifacts",
		"record-snapshots",
		params.recordSessionId,
		`${params.recordSessionId}-${bucketId}.xml`,
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

	await mkdir(path.dirname(snapshotAbsolutePath), { recursive: true });
	const remoteDumpPath = `/sdcard/${params.recordSessionId}-${bucketId}.xml`;

	const dumpResult = await executeRunner(
		[
			"adb",
			"-s",
			params.deviceId,
			"shell",
			"uiautomator",
			"dump",
			remoteDumpPath,
		],
		params.repoRoot,
		process.env,
	);
	if (dumpResult.exitCode !== 0) {
		warnings.push("Failed to capture UI snapshot via uiautomator dump.");
	}

	const pullResult = await executeRunner(
		[
			"adb",
			"-s",
			params.deviceId,
			"pull",
			remoteDumpPath,
			snapshotAbsolutePath,
		],
		params.repoRoot,
		process.env,
	);
	if (pullResult.exitCode !== 0) {
		warnings.push("Failed to pull UI snapshot XML artifact.");
	}

	const appContextResult = await executeRunner(
		["adb", "-s", params.deviceId, "shell", "dumpsys", "window", "windows"],
		params.repoRoot,
		process.env,
	);
	let foregroundApp: string | undefined;
	if (appContextResult.exitCode === 0) {
		const match = appContextResult.stdout.match(
			/mCurrentFocus=Window\{[^\s]+\s([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+\}/,
		);
		foregroundApp = match?.[1];
	} else {
		warnings.push(
			"Failed to collect foreground app context from dumpsys window.",
		);
	}

	return {
		uiSnapshotRef: pullResult.exitCode === 0 ? snapshotRelativePath : undefined,
		foregroundApp,
		warnings,
	};
}

function parseHexMaybe(value: string): number | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number.parseInt(trimmed, 16);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function extractEventMonotonicMs(line: string): number {
	const match = line.match(/^\[\s*(\d+)\.(\d+)\]/);
	if (!match) return 0;
	const seconds = Number.parseInt(match[1], 10);
	const microseconds = Number.parseInt(match[2], 10);
	if (!Number.isFinite(seconds) || !Number.isFinite(microseconds)) return 0;
	return seconds * 1000 + Math.round(microseconds / 1000);
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return Math.sqrt(dx * dx + dy * dy);
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

export function parseAdbDeviceEntries(output: string): AdbDeviceEntry[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(
			(line) => line.length > 0 && !line.startsWith("List of devices attached"),
		)
		.map((line) => line.split(/\s+/))
		.filter((parts) => parts.length >= 2)
		.map((parts) => ({ id: parts[0], state: parts[1] }));
}

export function choosePreferredAndroidDeviceId(
	entries: AdbDeviceEntry[],
): string | undefined {
	const online = entries.filter((entry) => entry.state === "device");
	const physical = online.find((entry) => !entry.id.startsWith("emulator-"));
	return physical?.id ?? online[0]?.id;
}

export async function resolveAndroidRecordingDeviceId(
	repoRoot: string,
	inputDeviceId?: string,
	dryRun?: boolean,
): Promise<string | undefined> {
	if (inputDeviceId && inputDeviceId.length > 0) return inputDeviceId;
	if (dryRun) return buildDefaultDeviceId("android");
	const listed = await executeRunner(["adb", "devices"], repoRoot, process.env);
	if (listed.exitCode !== 0) return undefined;
	return choosePreferredAndroidDeviceId(parseAdbDeviceEntries(listed.stdout));
}

export function parseRawInputEvents(rawContent: string): ParsedRawEvent[] {
	const lines = rawContent
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0);
	let currentX: number | undefined;
	let currentY: number | undefined;
	const events: ParsedRawEvent[] = [];
	let touchStartX: number | undefined;
	let touchStartY: number | undefined;
	let touchStartTime: number | undefined;
	let touchMoveSamples = 0;
	let touchActive = false;
	let shiftPressed = false;

	const finalizeTouch = (eventMonotonicMs: number, rawLine: string): void => {
		if (!touchActive) return;
		const startX = touchStartX ?? currentX;
		const startY = touchStartY ?? currentY;
		const endX = currentX;
		const endY = currentY;
		const durationMs =
			touchStartTime !== undefined && eventMonotonicMs > 0
				? Math.max(0, eventMonotonicMs - touchStartTime)
				: undefined;
		if (
			startX !== undefined &&
			startY !== undefined &&
			endX !== undefined &&
			endY !== undefined
		) {
			const movement = distance(startX, startY, endX, endY);
			const qualifiesByDistanceAndTrace =
				movement >= SWIPE_DISTANCE_THRESHOLD_PX &&
				touchMoveSamples >= SWIPE_MIN_MOVE_SAMPLES;
			const qualifiesAsStrongSwipe =
				movement >= SWIPE_STRONG_DISTANCE_THRESHOLD_PX;
			if (
				(qualifiesByDistanceAndTrace || qualifiesAsStrongSwipe) &&
				(durationMs ?? 0) <= SWIPE_DURATION_THRESHOLD_MS
			) {
				events.push({
					type: ACTION_TYPES.swipe,
					eventMonotonicMs,
					x: startX,
					y: startY,
					endX,
					endY,
					gesture: {
						kind: ACTION_TYPES.swipe,
						start: { x: startX, y: startY },
						end: { x: endX, y: endY },
						durationMs,
					},
					rawLine,
				});
			} else {
				events.push({
					type: ACTION_TYPES.tap,
					eventMonotonicMs,
					x: endX,
					y: endY,
					gesture: {
						kind: ACTION_TYPES.tap,
						start: { x: startX, y: startY },
						end: { x: endX, y: endY },
						durationMs,
					},
					rawLine,
				});
			}
		} else {
			events.push({
				type: ACTION_TYPES.tap,
				eventMonotonicMs,
				x: currentX,
				y: currentY,
				rawLine,
			});
		}
		touchActive = false;
		touchStartX = undefined;
		touchStartY = undefined;
		touchStartTime = undefined;
		touchMoveSamples = 0;
	};

	for (const line of lines) {
		const eventMonotonicMs = extractEventMonotonicMs(line);
		const positionX = line.match(
			/(?:ABS_MT_POSITION_X|ABS_X)\s+([0-9a-fA-F]+)/,
		);
		if (positionX) {
			currentX = parseHexMaybe(positionX[1]);
			if (touchActive) {
				if (touchStartX === undefined) touchStartX = currentX;
				touchMoveSamples += 1;
			}
		}
		const positionY = line.match(
			/(?:ABS_MT_POSITION_Y|ABS_Y)\s+([0-9a-fA-F]+)/,
		);
		if (positionY) {
			currentY = parseHexMaybe(positionY[1]);
			if (touchActive) {
				if (touchStartY === undefined) touchStartY = currentY;
				touchMoveSamples += 1;
			}
		}

		const trackingId = line.match(/ABS_MT_TRACKING_ID\s+([0-9a-fA-F]+)/);
		if (trackingId) {
			const token = trackingId[1]?.toLowerCase();
			if (token === "ffffffff") {
				finalizeTouch(eventMonotonicMs, line);
				continue;
			}
			if (!touchActive) {
				touchActive = true;
				touchStartX = undefined;
				touchStartY = undefined;
				touchStartTime = eventMonotonicMs;
				touchMoveSamples = 0;
				currentX = undefined;
				currentY = undefined;
			}
			continue;
		}

		if (/BTN_TOUCH\s+DOWN/.test(line)) {
			touchActive = true;
			touchStartX = undefined;
			touchStartY = undefined;
			touchStartTime = eventMonotonicMs;
			touchMoveSamples = 0;
			currentX = undefined;
			currentY = undefined;
			continue;
		}
		if (/BTN_TOUCH\s+UP/.test(line)) {
			finalizeTouch(eventMonotonicMs, line);
			continue;
		}
		if (/KEY_BACK\s+DOWN/.test(line)) {
			events.push({ type: ACTION_TYPES.back, eventMonotonicMs, rawLine: line });
			continue;
		}
		if (/KEY_HOME\s+DOWN/.test(line)) {
			events.push({ type: ACTION_TYPES.home, eventMonotonicMs, rawLine: line });
			continue;
		}
		if (/KEY_APPSELECT\s+DOWN/.test(line)) {
			events.push({ type: "app_switch", eventMonotonicMs, rawLine: line });
			continue;
		}

		if (/KEY_(?:LEFTSHIFT|RIGHTSHIFT)\s+DOWN/.test(line)) {
			shiftPressed = true;
			continue;
		}
		if (/KEY_(?:LEFTSHIFT|RIGHTSHIFT)\s+UP/.test(line)) {
			shiftPressed = false;
			continue;
		}

		const keyDown = line.match(/KEY_([A-Z0-9_]+)\s+DOWN/);
		if (keyDown) {
			const token = keyDown[1];
			if (token === "BACK" || token === "HOME" || token === "APPSELECT") {
				continue;
			}
			const mapped = mapAndroidKeyTokenToText(token, shiftPressed);
			if (mapped !== undefined) {
				events.push({
					type: "type",
					eventMonotonicMs,
					textDelta: mapped,
					rawLine: line,
				});
			}
		}
	}

	return events;
}

export async function readAndroidMonotonicMs(
	repoRoot: string,
	deviceId: string,
	dryRun?: boolean,
): Promise<number | undefined> {
	if (dryRun) return undefined;
	const uptime = await executeRunner(
		["adb", "-s", deviceId, "shell", "cat", "/proc/uptime"],
		repoRoot,
		process.env,
	);
	if (uptime.exitCode !== 0) return undefined;
	const firstToken = uptime.stdout.trim().split(/\s+/)[0];
	if (!firstToken) return undefined;
	const seconds = Number.parseFloat(firstToken);
	if (!Number.isFinite(seconds)) return undefined;
	return Math.round(seconds * 1000);
}

export async function startAndroidCaptureProcesses(
	params: RecordingCaptureStartParams,
): Promise<RecordingCaptureStartResult> {
	if (params.dryRun) {
		return {};
	}
	const shellCommand = `adb -s ${shellEscape(params.deviceId)} shell getevent -lt > ${shellEscape(params.rawEventsAbsolutePath)} 2>&1`;
	const pid = spawnDetachedShell(shellCommand, params.repoRoot, process.env);
	if (!pid) {
		return {
			failureSuggestion:
				"Failed to start adb getevent capture. Verify adb/device connectivity and retry.",
		};
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
	const snapshotLoop = `while true; do ts=$(date +%s%3N); remote=/sdcard/${params.recordSessionId}-$ts.xml; local_path=${snapshotDirAbsolutePath}/${params.recordSessionId}-$ts.xml; adb -s ${params.deviceId} shell uiautomator dump $remote >/dev/null 2>&1; adb -s ${params.deviceId} pull $remote $local_path >/dev/null 2>&1; adb -s ${params.deviceId} shell rm $remote >/dev/null 2>&1; sleep 0.7; done`;
	const snapshotPid = spawnDetachedShell(
		snapshotLoop,
		params.repoRoot,
		process.env,
	);
	return { pid, snapshotPid };
}

export function createAndroidRecordingHooks(): RecordingPlatformHooks {
	return {
		platform: "android",
		captureChannels: ["input_events", "ui_snapshots", "app_context"],
		resolveDeviceId: resolveAndroidRecordingDeviceId,
		readCaptureStartMonotonicMs: readAndroidMonotonicMs,
		startCaptureProcesses: startAndroidCaptureProcesses,
		captureContextSnapshot: captureAndroidContextSnapshot,
		parseRawEvents: parseRawInputEvents,
		unavailableDeviceSuggestion:
			"No online Android device detected. Connect a physical device or boot an emulator (adb devices must show state 'device'), then retry start_record_session.",
		startSuccessSuggestions: [
			"Perform manual interactions on device/emulator, then call end_record_session with the returned recordSessionId.",
		],
		runningStatusSuggestions: [
			"Continue manual interaction, then call end_record_session to export flow.",
		],
		endSessionNoFlowSuggestion:
			"No flow was exported. Ensure meaningful user interaction happened during recording.",
		cancelSuggestion:
			"Start a new record session when you are ready to capture another flow.",
	};
}
