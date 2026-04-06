import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	Platform,
	RawRecordedEvent,
	RecordedStep,
	RecordSessionStatus,
} from "@mobile-e2e-mcp/contracts";

export interface PersistedRecordSession {
	recordSessionId: string;
	sessionId: string;
	platform: Platform;
	deviceId: string;
	appId?: string;
	recordingProfile: string;
	status: RecordSessionStatus;
	startedAt: string;
	endedAt?: string;
	captureChannels: string[];
	rawEventsPath: string;
	flowPath?: string;
	pid?: number;
	snapshotPid?: number;
	captureStartMonotonicMs?: number;
	snapshotDir?: string;
	warnings: string[];
	updatedAt: string;
}

export interface PersistRecordSessionResult {
	relativePath: string;
}

export interface AppendRawRecordedEventResult {
	relativePath: string;
	appended: number;
}

export interface PersistRecordedStepsResult {
	relativePath: string;
	count: number;
}

function assertSafeId(input: string): void {
	if (!/^[A-Za-z0-9._-]+$/.test(input)) {
		throw new Error(`Invalid recordSessionId for persistence: ${input}`);
	}
}

export function buildRecordSessionRelativePath(recordSessionId: string): string {
	assertSafeId(recordSessionId);
	return path.posix.join("artifacts", "record-sessions", `${recordSessionId}.json`);
}

export function buildRecordEventsRelativePath(recordSessionId: string): string {
	assertSafeId(recordSessionId);
	return path.posix.join("artifacts", "record-events", `${recordSessionId}.jsonl`);
}

export function buildRecordedStepsRelativePath(recordSessionId: string): string {
	assertSafeId(recordSessionId);
	return path.posix.join("artifacts", "recorded-steps", `${recordSessionId}.json`);
}

function buildRecordSessionAbsolutePath(repoRoot: string, recordSessionId: string): string {
	return path.resolve(repoRoot, buildRecordSessionRelativePath(recordSessionId));
}

function buildRecordEventsAbsolutePath(repoRoot: string, recordSessionId: string): string {
	return path.resolve(repoRoot, buildRecordEventsRelativePath(recordSessionId));
}

function buildRecordedStepsAbsolutePath(repoRoot: string, recordSessionId: string): string {
	return path.resolve(repoRoot, buildRecordedStepsRelativePath(recordSessionId));
}

async function writeJsonFile(absolutePath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(absolutePath), { recursive: true });
	const tempPath = path.join(
		path.dirname(absolutePath),
		`.${path.basename(absolutePath)}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(tempPath, absolutePath);
	} catch (error: unknown) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

async function writeRecordSession(
	repoRoot: string,
	recordSessionId: string,
	record: PersistedRecordSession,
): Promise<string> {
	const relativePath = buildRecordSessionRelativePath(recordSessionId);
	const absolutePath = buildRecordSessionAbsolutePath(repoRoot, recordSessionId);
	await writeJsonFile(absolutePath, record);
	return relativePath;
}

async function writeRecordedSteps(
	repoRoot: string,
	recordSessionId: string,
	steps: RecordedStep[],
): Promise<string> {
	const relativePath = buildRecordedStepsRelativePath(recordSessionId);
	const absolutePath = buildRecordedStepsAbsolutePath(repoRoot, recordSessionId);
	await writeJsonFile(absolutePath, steps);
	return relativePath;
}

async function appendRawRecordedEvents(
	repoRoot: string,
	recordSessionId: string,
	events: RawRecordedEvent[],
): Promise<string> {
	const relativePath = buildRecordEventsRelativePath(recordSessionId);
	const absolutePath = buildRecordEventsAbsolutePath(repoRoot, recordSessionId);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	if (events.length === 0) {
		await writeFile(absolutePath, "", { encoding: "utf8", flag: "a" });
		return relativePath;
	}
	const payload = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
	await writeFile(absolutePath, payload, { encoding: "utf8", flag: "a" });
	return relativePath;
}

export async function loadRecordSession(
	repoRoot: string,
	recordSessionId: string,
): Promise<PersistedRecordSession | undefined> {
	const absolutePath = buildRecordSessionAbsolutePath(repoRoot, recordSessionId);
	try {
		const content = await readFile(absolutePath, "utf8");
		return JSON.parse(content) as PersistedRecordSession;
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

export async function listRawRecordedEvents(
	repoRoot: string,
	recordSessionId: string,
): Promise<RawRecordedEvent[]> {
	const absolutePath = buildRecordEventsAbsolutePath(repoRoot, recordSessionId);
	try {
		const content = await readFile(absolutePath, "utf8");
		const lines = content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		const events: RawRecordedEvent[] = [];
		let malformedLineCount = 0;
		for (const line of lines) {
			try {
				const parsed = JSON.parse(line) as unknown;
				if (
					typeof parsed === "object" &&
					parsed !== null &&
					typeof (parsed as { timestamp?: unknown }).timestamp === "string"
				) {
					events.push(parsed as RawRecordedEvent);
				}
			} catch {
				malformedLineCount += 1;
			}
		}
		if (malformedLineCount > 0) {
			// eslint-disable-next-line no-console
			console.warn(`[recording-store] listRawRecordedEvents: ${malformedLineCount} malformed line(s) skipped in session ${recordSessionId}`);
		}
		return events.sort((left, right) =>
			left.timestamp.localeCompare(right.timestamp),
		);
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export async function loadRecordedSteps(
	repoRoot: string,
	recordSessionId: string,
): Promise<RecordedStep[]> {
	const absolutePath = buildRecordedStepsAbsolutePath(repoRoot, recordSessionId);
	try {
		const content = await readFile(absolutePath, "utf8");
		const parsed = JSON.parse(content) as RecordedStep[];
		return Array.isArray(parsed) ? parsed : [];
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		if (error instanceof SyntaxError) {
			return [];
		}
		throw error;
	}
}

export async function persistStartedRecordSession(
	repoRoot: string,
	record: Omit<PersistedRecordSession, "updatedAt" | "status" | "warnings"> & {
		status?: RecordSessionStatus;
		warnings?: string[];
	},
): Promise<PersistRecordSessionResult> {
	const nextRecord: PersistedRecordSession = {
		...record,
		status: record.status ?? "running",
		warnings: record.warnings ?? [],
		updatedAt: new Date().toISOString(),
	};
	const relativePath = await writeRecordSession(
		repoRoot,
		record.recordSessionId,
		nextRecord,
	);
	return { relativePath };
}

export async function persistRecordSessionState(
	repoRoot: string,
	recordSessionId: string,
	patch: Partial<Omit<PersistedRecordSession, "recordSessionId" | "updatedAt">>,
): Promise<PersistRecordSessionResult | undefined> {
	const existing = await loadRecordSession(repoRoot, recordSessionId);
	if (!existing) {
		return undefined;
	}
	const nextRecord: PersistedRecordSession = {
		...existing,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	const relativePath = await writeRecordSession(
		repoRoot,
		recordSessionId,
		nextRecord,
	);
	return { relativePath };
}

export async function persistRawRecordedEvents(
	repoRoot: string,
	recordSessionId: string,
	events: RawRecordedEvent[],
): Promise<AppendRawRecordedEventResult> {
	const relativePath = await appendRawRecordedEvents(
		repoRoot,
		recordSessionId,
		events,
	);
	return {
		relativePath,
		appended: events.length,
	};
}

export async function persistRecordedSteps(
	repoRoot: string,
	recordSessionId: string,
	steps: RecordedStep[],
): Promise<PersistRecordedStepsResult> {
	const relativePath = await writeRecordedSteps(repoRoot, recordSessionId, steps);
	return {
		relativePath,
		count: steps.length,
	};
}
