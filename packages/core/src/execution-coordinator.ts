import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Platform } from "@mobile-e2e-mcp/contracts";
import { buildDeviceLeaseRecordRelativePath, type DeviceLease, listLeases, loadLeaseByDevice, persistLease, removeLease } from "./device-lease-store.js";
import { loadSessionRecord } from "./session-record-store.js";

export interface AcquireLeaseInput {
  sessionId: string;
  platform: Platform;
  deviceId: string;
}

export interface ReleaseLeaseInput {
  sessionId: string;
  platform: Platform;
  deviceId: string;
}

export type AcquireLeaseResult =
  | { acquired: true; lease: DeviceLease; relativePath: string }
  | { acquired: false; reason: "busy" | "unavailable"; lease?: DeviceLease };

export interface ReleaseLeaseResult {
  released: boolean;
  relativePath: string;
  reason?: "not_found" | "owned_by_another";
}

export interface MarkLeaseResult {
  updated: boolean;
  lease?: DeviceLease;
}

export interface RecoverStaleLeasesResult {
  recovered: DeviceLease[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertSafeSegment(input: string, label: string): void {
  if (!/^[A-Za-z0-9._:-]+$/.test(input)) {
    throw new Error(`Invalid ${label} for lease lock: ${input}`);
  }
}

function buildLeaseLockDirectory(repoRoot: string, platform: Platform, deviceId: string): string {
  assertSafeSegment(platform, "platform");
  assertSafeSegment(deviceId, "deviceId");
  return path.resolve(repoRoot, "artifacts", "leases", ".locks", `${platform}-${deviceId}.lock`);
}

async function withDeviceLeaseLock<T>(repoRoot: string, platform: Platform, deviceId: string, task: () => Promise<T>): Promise<T> {
  const lockPath = buildLeaseLockDirectory(repoRoot, platform, deviceId);
  await mkdir(path.dirname(lockPath), { recursive: true });
  let acquired = false;
  for (let attempts = 0; attempts < 50; attempts += 1) {
    try {
      await mkdir(lockPath, { recursive: false });
      acquired = true;
      break;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  if (!acquired) {
    throw new Error(`Timed out acquiring device lease lock for ${platform}/${deviceId}`);
  }

  try {
    return await task();
  } finally {
    await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function acquireLease(repoRoot: string, input: AcquireLeaseInput): Promise<AcquireLeaseResult> {
  return withDeviceLeaseLock(repoRoot, input.platform, input.deviceId, async () => {
    const existing = await loadLeaseByDevice(repoRoot, input.platform, input.deviceId);
    if (existing && existing.sessionId !== input.sessionId) {
      const existingSession = await loadSessionRecord(repoRoot, existing.sessionId);
      if (!existingSession || existingSession.closed) {
        await removeLease(repoRoot, input.platform, input.deviceId);
      } else {
        return {
          acquired: false,
          reason: "busy",
          lease: existing,
        };
      }
    }

    const current = await loadLeaseByDevice(repoRoot, input.platform, input.deviceId);
    if (current && current.sessionId !== input.sessionId) {
      return {
        acquired: false,
        reason: "busy",
        lease: current,
      };
    }

    const timestamp = nowIso();
    const lease: DeviceLease = current
      ? {
        ...current,
        state: "leased",
        heartbeatAt: timestamp,
        ownerPid: process.pid,
      }
      : {
        leaseId: `${input.sessionId}-${Date.now()}`,
        sessionId: input.sessionId,
        platform: input.platform,
        deviceId: input.deviceId,
        state: "leased",
        ownerPid: process.pid,
        acquiredAt: timestamp,
        heartbeatAt: timestamp,
      };

    const relativePath = await persistLease(repoRoot, lease);
    return {
      acquired: true,
      lease,
      relativePath,
    };
  });
}

export async function releaseLease(repoRoot: string, input: ReleaseLeaseInput): Promise<ReleaseLeaseResult> {
  const existing = await loadLeaseByDevice(repoRoot, input.platform, input.deviceId);
  if (!existing) {
    const removed = await removeLease(repoRoot, input.platform, input.deviceId);
    return {
      released: false,
      reason: "not_found",
      relativePath: removed.relativePath,
    };
  }

  if (existing.sessionId !== input.sessionId) {
    return {
      released: false,
      reason: "owned_by_another",
      relativePath: buildDeviceLeaseRecordRelativePath(input.platform, input.deviceId),
    };
  }

  const removed = await removeLease(repoRoot, input.platform, input.deviceId);
  return {
    released: removed.removed,
    reason: removed.removed ? undefined : "not_found",
    relativePath: removed.relativePath,
  };
}

async function updateLeaseState(
  repoRoot: string,
  input: { sessionId: string; platform: Platform; deviceId: string; state: DeviceLease["state"] },
): Promise<MarkLeaseResult> {
  return withDeviceLeaseLock(repoRoot, input.platform, input.deviceId, async () => {
    const existing = await loadLeaseByDevice(repoRoot, input.platform, input.deviceId);
    if (!existing || existing.sessionId !== input.sessionId) {
      return { updated: false };
    }

    const nextLease: DeviceLease = {
      ...existing,
      state: input.state,
      heartbeatAt: nowIso(),
      ownerPid: process.pid,
    };
    await persistLease(repoRoot, nextLease);
    return {
      updated: true,
      lease: nextLease,
    };
  });
}

export async function markBusy(
  repoRoot: string,
  input: { sessionId: string; platform: Platform; deviceId: string },
): Promise<MarkLeaseResult> {
  return updateLeaseState(repoRoot, { ...input, state: "busy" });
}

export async function markIdle(
  repoRoot: string,
  input: { sessionId: string; platform: Platform; deviceId: string },
): Promise<MarkLeaseResult> {
  return updateLeaseState(repoRoot, { ...input, state: "leased" });
}

export async function refreshHeartbeat(
  repoRoot: string,
  input: { sessionId: string; platform: Platform; deviceId: string },
): Promise<MarkLeaseResult> {
  return withDeviceLeaseLock(repoRoot, input.platform, input.deviceId, async () => {
    const existing = await loadLeaseByDevice(repoRoot, input.platform, input.deviceId);
    if (!existing || existing.sessionId !== input.sessionId) {
      return { updated: false };
    }
    const nextLease: DeviceLease = {
      ...existing,
      heartbeatAt: nowIso(),
      ownerPid: process.pid,
    };
    await persistLease(repoRoot, nextLease);
    return {
      updated: true,
      lease: nextLease,
    };
  });
}

export async function recoverStaleLeases(repoRoot: string, staleAfterMs: number): Promise<RecoverStaleLeasesResult> {
  const now = Date.now();
  const recovered: DeviceLease[] = [];
  const leases = await listLeases(repoRoot);
  for (const lease of leases) {
    const heartbeatAt = Date.parse(lease.heartbeatAt);
    if (Number.isNaN(heartbeatAt) || now - heartbeatAt <= staleAfterMs) {
      continue;
    }

    await withDeviceLeaseLock(repoRoot, lease.platform, lease.deviceId, async () => {
      const current = await loadLeaseByDevice(repoRoot, lease.platform, lease.deviceId);
      if (!current) {
        return;
      }
      const currentHeartbeat = Date.parse(current.heartbeatAt);
      if (!Number.isNaN(currentHeartbeat) && now - currentHeartbeat <= staleAfterMs) {
        return;
      }
      await removeLease(repoRoot, lease.platform, lease.deviceId);
      recovered.push(current);
    });
  }

  return {
    recovered,
  };
}
