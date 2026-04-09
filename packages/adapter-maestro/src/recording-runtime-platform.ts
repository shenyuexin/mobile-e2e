import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import type { Platform } from "@mobile-e2e-mcp/contracts";
import { createAndroidRecordingHooks } from "./recording-runtime-android.js";
import { createIosRecordingHooks } from "./recording-runtime-ios.js";

export interface ParsedRawEvent {
	type: "tap" | "type" | "swipe" | "back" | "home" | "app_switch";
	eventMonotonicMs: number;
	x?: number;
	y?: number;
	endX?: number;
	endY?: number;
	gesture?: {
		kind: "tap" | "swipe";
		start?: { x: number; y: number };
		end?: { x: number; y: number };
		durationMs?: number;
	};
	textDelta?: string;
	rawLine: string;
}

export interface RecordingCaptureStartParams {
	repoRoot: string;
	recordSessionId: string;
	deviceId: string;
	rawEventsAbsolutePath: string;
	dryRun?: boolean;
}

export interface RecordingCaptureStartResult {
	pid?: number;
	snapshotPid?: number;
	failureSuggestion?: string;
}

export interface RecordingContextSnapshotParams {
	repoRoot: string;
	recordSessionId: string;
	deviceId: string;
	bucketId?: string;
	dryRun?: boolean;
}

export interface RecordingContextSnapshotResult {
	uiSnapshotRef?: string;
	foregroundApp?: string;
	warnings: string[];
}

export interface RecordingPlatformHooks {
	platform: Platform;
	captureChannels: string[];
	resolveDeviceId: (
		repoRoot: string,
		inputDeviceId?: string,
		dryRun?: boolean,
	) => Promise<string | undefined>;
	readCaptureStartMonotonicMs: (
		repoRoot: string,
		deviceId: string,
		dryRun?: boolean,
	) => Promise<number | undefined>;
	startCaptureProcesses: (
		params: RecordingCaptureStartParams,
	) => Promise<RecordingCaptureStartResult>;
	captureContextSnapshot: (
		params: RecordingContextSnapshotParams,
	) => Promise<RecordingContextSnapshotResult>;
	parseRawEvents: (rawContent: string) => ParsedRawEvent[];
	unavailableDeviceSuggestion: string;
	startSuccessSuggestions: string[];
	runningStatusSuggestions: string[];
	endSessionNoFlowSuggestion: string;
	cancelSuggestion: string;
}

const RECORDING_PLATFORM_HOOKS: Record<Platform, RecordingPlatformHooks> = {
	android: createAndroidRecordingHooks(),
	ios: createIosRecordingHooks(),
};

export function resolveRecordingPlatformHooks(
	platform: Platform,
): RecordingPlatformHooks {
	return RECORDING_PLATFORM_HOOKS[platform];
}
