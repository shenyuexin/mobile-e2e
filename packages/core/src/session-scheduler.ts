import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Platform } from "@mobile-e2e-mcp/contracts";
import { markBusy, markIdle, refreshHeartbeat } from "./execution-coordinator.js";
import { appendSessionTimelineEvent } from "./session-record-store.js";

function assertSafeSegment(input: string, label: string): void {
  if (!/^[A-Za-z0-9._:-]+$/.test(input)) {
    throw new Error(`Invalid ${label} for session scheduler lock: ${input}`);
  }
}

function buildSessionLockDirectory(repoRoot: string, sessionId: string): string {
  assertSafeSegment(sessionId, "sessionId");
  return path.resolve(repoRoot, "artifacts", "scheduler", ".locks", `${sessionId}.lock`);
}

async function acquireSessionLock(repoRoot: string, sessionId: string): Promise<{ release: () => Promise<void>; waitedMs: number }> {
  const lockPath = buildSessionLockDirectory(repoRoot, sessionId);
  await mkdir(path.dirname(lockPath), { recursive: true });
  const started = Date.now();
  for (let attempts = 0; attempts < 300; attempts += 1) {
    try {
      await mkdir(lockPath, { recursive: false });
      const release = async (): Promise<void> => {
        await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
      };
      return {
        release,
        waitedMs: Date.now() - started,
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out acquiring session scheduler lock for ${sessionId}`);
}

export interface RunExclusiveInput {
  repoRoot: string;
  sessionId: string;
  platform: Platform;
  deviceId: string;
  toolName: string;
}

export interface RunExclusiveResult<T> {
  value: T;
  queueWaitMs: number;
}

export async function runExclusive<T>(input: RunExclusiveInput, task: () => Promise<T>): Promise<RunExclusiveResult<T>> {
  const queuedAt = new Date().toISOString();
  await appendSessionTimelineEvent(input.repoRoot, input.sessionId, {
    timestamp: queuedAt,
    type: "queue_wait_started",
    detail: `Queued tool ${input.toolName} for exclusive session execution.`,
  });

  const lock = await acquireSessionLock(input.repoRoot, input.sessionId);
  const startedAt = new Date().toISOString();
  await appendSessionTimelineEvent(input.repoRoot, input.sessionId, {
    timestamp: startedAt,
    type: "queue_wait_ended",
    detail: `Dequeued tool ${input.toolName} after waiting ${String(lock.waitedMs)}ms.`,
  });

  await markBusy(input.repoRoot, {
    sessionId: input.sessionId,
    platform: input.platform,
    deviceId: input.deviceId,
  });

  try {
    await refreshHeartbeat(input.repoRoot, {
      sessionId: input.sessionId,
      platform: input.platform,
      deviceId: input.deviceId,
    });
    const value = await task();
    return {
      value,
      queueWaitMs: lock.waitedMs,
    };
  } finally {
    await markIdle(input.repoRoot, {
      sessionId: input.sessionId,
      platform: input.platform,
      deviceId: input.deviceId,
    });
    await lock.release();
  }
}
