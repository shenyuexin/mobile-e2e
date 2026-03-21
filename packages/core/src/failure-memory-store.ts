import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ActionOutcomeSummary, FailureSignature } from "@mobile-e2e-mcp/contracts";

export interface PersistedFailureIndexEntry {
	actionId: string;
	sessionId: string;
	signature: FailureSignature;
	remediation?: string[];
	updatedAt: string;
}

export interface PersistedBaselineIndexEntry {
	actionId: string;
	sessionId: string;
	actionType: ActionOutcomeSummary["actionType"];
	screenId?: string;
	updatedAt: string;
}

function buildAiFirstIndexAbsolutePath(repoRoot: string, fileName: string): string {
	return path.resolve(repoRoot, "artifacts", "ai-first", fileName);
}

async function readJsonFile<T>(absolutePath: string, fallback: T): Promise<T> {
	try {
		const content = await readFile(absolutePath, "utf8");
		return JSON.parse(content) as T;
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return fallback;
		}
		if (error instanceof SyntaxError) {
			return fallback;
		}
		throw error;
	}
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

export async function recordFailureSignature(
	repoRoot: string,
	entry: PersistedFailureIndexEntry,
): Promise<void> {
	const absolutePath = buildAiFirstIndexAbsolutePath(
		repoRoot,
		"failure-index.json",
	);
	const existing = await readJsonFile<PersistedFailureIndexEntry[]>(
		absolutePath,
		[],
	);
	const next = [
		entry,
		...existing.filter((item) => item.actionId !== entry.actionId),
	].slice(0, 200);
	await writeJsonFile(absolutePath, next);
}

export async function loadFailureIndex(
	repoRoot: string,
): Promise<PersistedFailureIndexEntry[]> {
	return readJsonFile<PersistedFailureIndexEntry[]>(
		buildAiFirstIndexAbsolutePath(repoRoot, "failure-index.json"),
		[],
	);
}

export async function recordBaselineEntry(
	repoRoot: string,
	entry: PersistedBaselineIndexEntry,
): Promise<void> {
	const absolutePath = buildAiFirstIndexAbsolutePath(
		repoRoot,
		"baseline-index.json",
	);
	const existing = await readJsonFile<PersistedBaselineIndexEntry[]>(
		absolutePath,
		[],
	);
	const next = [
		entry,
		...existing.filter((item) => item.actionId !== entry.actionId),
	].slice(0, 200);
	await writeJsonFile(absolutePath, next);
}

export async function loadBaselineIndex(
	repoRoot: string,
): Promise<PersistedBaselineIndexEntry[]> {
	return readJsonFile<PersistedBaselineIndexEntry[]>(
		buildAiFirstIndexAbsolutePath(repoRoot, "baseline-index.json"),
		[],
	);
}
