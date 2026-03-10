import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session } from "@mobile-e2e-mcp/contracts";

export interface PersistedSessionRecord {
  session: Session;
  closed: boolean;
  endedAt?: string;
  artifacts: string[];
  updatedAt: string;
}

export interface PersistEndedSessionResult {
  relativePath?: string;
  closed: boolean;
  endedAt?: string;
  finalized: boolean;
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

function buildSessionRecordAbsolutePath(repoRoot: string, sessionId: string): string {
  return path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId));
}

async function writeSessionRecord(repoRoot: string, sessionId: string, record: PersistedSessionRecord): Promise<string> {
  const relativePath = buildSessionRecordRelativePath(sessionId);
  const absolutePath = buildSessionRecordAbsolutePath(repoRoot, sessionId);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(record, null, 2) + "\n", "utf8");
  return relativePath;
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
    throw error;
  }
}

export async function persistStartedSession(repoRoot: string, session: Session): Promise<string> {
  return writeSessionRecord(repoRoot, session.sessionId, {
    session,
    closed: false,
    artifacts: [],
    updatedAt: new Date().toISOString(),
  });
}

export async function persistEndedSession(repoRoot: string, sessionId: string, artifacts: string[]): Promise<PersistEndedSessionResult> {
  const existing = await loadSessionRecord(repoRoot, sessionId);
  if (!existing) {
    return { closed: false, finalized: false };
  }

  if (existing.closed) {
    return {
      relativePath: buildSessionRecordRelativePath(sessionId),
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

  const relativePath = await writeSessionRecord(repoRoot, sessionId, {
    session: nextSession,
    closed: true,
    endedAt,
    artifacts,
    updatedAt: endedAt,
  });
  return { relativePath, closed: true, endedAt, finalized: true };
}
