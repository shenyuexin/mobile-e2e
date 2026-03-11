import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ActionIntent, ActionOutcomeSummary, EvidenceDeltaSummary, ExecutionEvidence, FailureSignature, ReasonCode, Session, SessionTimelineEvent, StateSummary, ToolStatus } from "@mobile-e2e-mcp/contracts";
import { buildSessionAuditRecord, loadArtifactGovernanceConfig, loadSessionAuditSchemaConfig, type SessionAuditRecord } from "./governance.js";

export interface PersistedSessionRecord {
  session: Session;
  closed: boolean;
  endedAt?: string;
  artifacts: string[];
  updatedAt: string;
}

export interface PersistEndedSessionResult {
  relativePath?: string;
  auditPath?: string;
  closed: boolean;
  endedAt?: string;
  finalized: boolean;
}

export interface PersistSessionStateResult {
  relativePath?: string;
  auditPath?: string;
  updated: boolean;
}

export interface PersistedActionRecord {
  actionId: string;
  sessionId: string;
  intent?: ActionIntent;
  outcome: ActionOutcomeSummary;
  evidenceDelta: EvidenceDeltaSummary;
  evidence: ExecutionEvidence[];
  lowLevelStatus: ToolStatus;
  lowLevelReasonCode: ReasonCode;
  updatedAt: string;
}

export interface PersistActionRecordResult {
  relativePath?: string;
  updated: boolean;
}

export interface PersistStartedSessionResult {
  relativePath: string;
  auditPath?: string;
}

export interface TimelineQueryResult {
  actionEvent?: SessionTimelineEvent;
  surroundingEvents: SessionTimelineEvent[];
}

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

export function buildSessionAuditRelativePath(sessionId: string): string {
  assertSafeSessionId(sessionId);
  return path.posix.join("artifacts", "audit", `${sessionId}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionRecordShape(value: unknown): value is PersistedSessionRecord {
  if (!isRecord(value) || !isRecord(value.session)) {
    return false;
  }
  return typeof value.session.sessionId === "string"
    && Array.isArray(value.session.timeline)
    && typeof value.closed === "boolean"
    && Array.isArray(value.artifacts)
    && typeof value.updatedAt === "string"
    && (value.endedAt === undefined || typeof value.endedAt === "string");
}

function assertSafeSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
    throw new Error(`Invalid sessionId for persistence: ${sessionId}`);
  }
}

export function buildSessionRecordRelativePath(sessionId: string): string {
  assertSafeSessionId(sessionId);
  return path.posix.join("artifacts", "sessions", `${sessionId}.json`);
}

export function buildActionRecordRelativePath(actionId: string): string {
  assertSafeSessionId(actionId);
  return path.posix.join("artifacts", "actions", `${actionId}.json`);
}

function buildSessionRecordAbsolutePath(repoRoot: string, sessionId: string): string {
  return path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId));
}

function buildActionRecordAbsolutePath(repoRoot: string, actionId: string): string {
  return path.resolve(repoRoot, buildActionRecordRelativePath(actionId));
}

function buildSessionAuditAbsolutePath(repoRoot: string, sessionId: string): string {
  return path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId));
}

function buildActionsRootAbsolutePath(repoRoot: string): string {
  return path.resolve(repoRoot, "artifacts", "actions");
}

function buildAiFirstIndexAbsolutePath(repoRoot: string, fileName: string): string {
  return path.resolve(repoRoot, "artifacts", "ai-first", fileName);
}

async function writeSessionRecord(repoRoot: string, sessionId: string, record: PersistedSessionRecord): Promise<string> {
  const relativePath = buildSessionRecordRelativePath(sessionId);
  const absolutePath = buildSessionRecordAbsolutePath(repoRoot, sessionId);
  await writeJsonFile(absolutePath, record);
  return relativePath;
}

async function writeActionRecord(repoRoot: string, actionId: string, record: PersistedActionRecord): Promise<string> {
  const relativePath = buildActionRecordRelativePath(actionId);
  const absolutePath = buildActionRecordAbsolutePath(repoRoot, actionId);
  await writeJsonFile(absolutePath, record);
  return relativePath;
}

async function writeSessionAuditRecord(repoRoot: string, sessionId: string, record: SessionAuditRecord): Promise<string> {
  const relativePath = buildSessionAuditRelativePath(sessionId);
  const absolutePath = buildSessionAuditAbsolutePath(repoRoot, sessionId);
  await writeJsonFile(absolutePath, record);
  return relativePath;
}

async function syncSessionAuditRecord(repoRoot: string, record: PersistedSessionRecord): Promise<string | undefined> {
  try {
    const [governanceConfig, schemaConfig] = await Promise.all([
      loadArtifactGovernanceConfig(repoRoot),
      loadSessionAuditSchemaConfig(repoRoot),
    ]);
    return await writeSessionAuditRecord(repoRoot, record.session.sessionId, buildSessionAuditRecord(record, governanceConfig, schemaConfig));
  } catch {
    return undefined;
  }
}

export async function loadSessionRecord(repoRoot: string, sessionId: string): Promise<PersistedSessionRecord | undefined> {
  const absolutePath = buildSessionRecordAbsolutePath(repoRoot, sessionId);
  try {
    const content = await readFile(absolutePath, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!isSessionRecordShape(parsed)) {
      throw new Error(`Invalid persisted session record at ${absolutePath}`);
    }
    return parsed;
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

export async function loadActionRecord(repoRoot: string, actionId: string): Promise<PersistedActionRecord | undefined> {
  const absolutePath = buildActionRecordAbsolutePath(repoRoot, actionId);
  try {
    const content = await readFile(absolutePath, "utf8");
    return JSON.parse(content) as PersistedActionRecord;
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

export async function loadLatestActionRecordForSession(repoRoot: string, sessionId: string): Promise<PersistedActionRecord | undefined> {
  const actionsRoot = buildActionsRootAbsolutePath(repoRoot);
  try {
    const entries = await readdir(actionsRoot, { withFileTypes: true });
    const records: PersistedActionRecord[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const actionId = entry.name.replace(/\.json$/, "");
      let record: PersistedActionRecord | undefined;
      try {
        record = await loadActionRecord(repoRoot, actionId);
      } catch {
        continue;
      }
      if (record?.sessionId === sessionId) {
        records.push(record);
      }
    }

    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function listActionRecordsForSession(repoRoot: string, sessionId: string): Promise<PersistedActionRecord[]> {
  const actionsRoot = buildActionsRootAbsolutePath(repoRoot);
  try {
    const entries = await readdir(actionsRoot, { withFileTypes: true });
    const records: PersistedActionRecord[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const actionId = entry.name.replace(/\.json$/, "");
      let record: PersistedActionRecord | undefined;
      try {
        record = await loadActionRecord(repoRoot, actionId);
      } catch {
        continue;
      }
      if (record?.sessionId === sessionId) {
        records.push(record);
      }
    }

    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
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
  const tempPath = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8");
    await rename(tempPath, absolutePath);
  } catch (error: unknown) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function recordFailureSignature(repoRoot: string, entry: PersistedFailureIndexEntry): Promise<void> {
  const absolutePath = buildAiFirstIndexAbsolutePath(repoRoot, "failure-index.json");
  const existing = await readJsonFile<PersistedFailureIndexEntry[]>(absolutePath, []);
  const next = [entry, ...existing.filter((item) => item.actionId !== entry.actionId)].slice(0, 200);
  await writeJsonFile(absolutePath, next);
}

export async function loadFailureIndex(repoRoot: string): Promise<PersistedFailureIndexEntry[]> {
  return readJsonFile<PersistedFailureIndexEntry[]>(buildAiFirstIndexAbsolutePath(repoRoot, "failure-index.json"), []);
}

export async function recordBaselineEntry(repoRoot: string, entry: PersistedBaselineIndexEntry): Promise<void> {
  const absolutePath = buildAiFirstIndexAbsolutePath(repoRoot, "baseline-index.json");
  const existing = await readJsonFile<PersistedBaselineIndexEntry[]>(absolutePath, []);
  const next = [entry, ...existing.filter((item) => item.actionId !== entry.actionId)].slice(0, 200);
  await writeJsonFile(absolutePath, next);
}

export async function loadBaselineIndex(repoRoot: string): Promise<PersistedBaselineIndexEntry[]> {
  return readJsonFile<PersistedBaselineIndexEntry[]>(buildAiFirstIndexAbsolutePath(repoRoot, "baseline-index.json"), []);
}

export async function loadSessionAuditRecord(repoRoot: string, sessionId: string): Promise<SessionAuditRecord | undefined> {
  return readJsonFile<SessionAuditRecord | undefined>(buildSessionAuditAbsolutePath(repoRoot, sessionId), undefined);
}

export async function persistStartedSession(repoRoot: string, session: Session): Promise<PersistStartedSessionResult> {
  const record: PersistedSessionRecord = {
    session,
    closed: false,
    artifacts: [],
    updatedAt: new Date().toISOString(),
  };
  const relativePath = await writeSessionRecord(repoRoot, session.sessionId, record);
  const auditPath = await syncSessionAuditRecord(repoRoot, record);
  return { relativePath, auditPath };
}

export async function persistEndedSession(repoRoot: string, sessionId: string, artifacts: string[]): Promise<PersistEndedSessionResult> {
  const existing = await loadSessionRecord(repoRoot, sessionId);
  if (!existing) {
    return { closed: false, finalized: false };
  }

  if (existing.closed) {
    const auditPath = await syncSessionAuditRecord(repoRoot, existing);
    return {
      relativePath: buildSessionRecordRelativePath(sessionId),
      auditPath,
      closed: true,
      endedAt: existing.endedAt,
      finalized: true,
    };
  }

  const endedAt = new Date().toISOString();
  const nextSession: Session = {
    ...existing.session,
    timeline: [
      ...existing.session.timeline,
      {
        timestamp: endedAt,
        type: "session_ended",
        detail: artifacts.length > 0 ? `Closed session with ${String(artifacts.length)} artifact(s).` : "Closed session without recorded artifacts.",
      },
    ],
  };

  const nextRecord: PersistedSessionRecord = {
    session: nextSession,
    closed: true,
    endedAt,
    artifacts,
    updatedAt: endedAt,
  };
  const relativePath = await writeSessionRecord(repoRoot, sessionId, nextRecord);
  const auditPath = await syncSessionAuditRecord(repoRoot, nextRecord);
  return { relativePath, auditPath, closed: true, endedAt, finalized: true };
}

export async function persistSessionState(
  repoRoot: string,
  sessionId: string,
  stateSummary: StateSummary,
  event: SessionTimelineEvent,
  artifacts: string[] = [],
): Promise<PersistSessionStateResult> {
  const existing = await loadSessionRecord(repoRoot, sessionId);
  if (!existing) {
    return { updated: false };
  }

  const nextArtifacts = Array.from(new Set([...existing.artifacts, ...artifacts]));
  const updatedAt = new Date().toISOString();
  const nextRecord: PersistedSessionRecord = {
    ...existing,
    session: {
      ...existing.session,
      latestStateSummary: stateSummary,
      timeline: [...existing.session.timeline, event],
    },
    artifacts: nextArtifacts,
    updatedAt,
  };
  const relativePath = await writeSessionRecord(repoRoot, sessionId, nextRecord);
  const auditPath = await syncSessionAuditRecord(repoRoot, nextRecord);

  return {
    relativePath,
    auditPath,
    updated: true,
  };
}

export async function persistActionRecord(
  repoRoot: string,
  record: PersistedActionRecord,
): Promise<PersistActionRecordResult> {
  const relativePath = await writeActionRecord(repoRoot, record.actionId, {
    ...record,
    updatedAt: new Date().toISOString(),
  });

  const sessionRecord = await loadSessionRecord(repoRoot, record.sessionId);
  if (sessionRecord) {
    const nextRecord: PersistedSessionRecord = {
      ...sessionRecord,
      artifacts: Array.from(new Set([...sessionRecord.artifacts, relativePath])),
      updatedAt: new Date().toISOString(),
    };
    await writeSessionRecord(repoRoot, record.sessionId, nextRecord);
    await syncSessionAuditRecord(repoRoot, nextRecord);
  }

  return {
    relativePath,
    updated: true,
  };
}

export async function queryTimelineAroundAction(
  repoRoot: string,
  sessionId: string,
  actionId: string,
  radius = 3,
): Promise<TimelineQueryResult> {
  const existing = await loadSessionRecord(repoRoot, sessionId);
  if (!existing) {
    return { surroundingEvents: [] };
  }

  const index = existing.session.timeline.findIndex((event) => event.actionId === actionId || event.eventId === actionId);
  if (index < 0) {
    return { surroundingEvents: [] };
  }

  return {
    actionEvent: existing.session.timeline[index],
    surroundingEvents: existing.session.timeline.slice(Math.max(0, index - radius), index + radius + 1),
  };
}
