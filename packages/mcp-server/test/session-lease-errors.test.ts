import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildSessionRecordRelativePath } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionAndLease(sessionId: string, platform: "android" | "ios", deviceId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId)), { force: true });
}

test("start_session detects stale lease from dead PID and allows new session", async () => {
  const server = createServer();
  const deviceId = `stale-lease-device-${Date.now()}`;
  const oldSessionId = `stale-lease-session-old-${Date.now()}`;
  const newSessionId = `stale-lease-session-new-${Date.now()}`;

  await cleanupSessionAndLease(oldSessionId, "android", deviceId);
  await cleanupSessionAndLease(newSessionId, "android", deviceId);

  try {
    // Simulate a stale lease from a dead process (PID 99999999 is guaranteed not running)
    const leasePath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", deviceId));
    await mkdir(path.dirname(leasePath), { recursive: true });
    await writeFile(leasePath, JSON.stringify({
      leaseId: `stale-lease-${Date.now()}`,
      sessionId: oldSessionId,
      platform: "android",
      deviceId,
      state: "busy",
      ownerPid: 99999999,
      acquiredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      heartbeatAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }), "utf8");

    // New session should succeed because the lease is stale (owner process is dead)
    const newSession = await server.invoke("start_session", {
      sessionId: newSessionId,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    assert.equal(newSession.status, "success");
  } finally {
    await cleanupSessionAndLease(oldSessionId, "android", deviceId);
    await cleanupSessionAndLease(newSessionId, "android", deviceId);
  }
});

test("start_session handles corrupted lease file gracefully (invalid JSON)", async () => {
  const server = createServer();
  const deviceId = `corrupt-lease-device-${Date.now()}`;
  const sessionId = `corrupt-lease-session-${Date.now()}`;

  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    // Write corrupted JSON to the lease file
    const leasePath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", deviceId));
    await mkdir(path.dirname(leasePath), { recursive: true });
    await writeFile(leasePath, "{this is not valid json!!!", "utf8");

    // Session should handle corrupted lease gracefully
    const result = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    // Should not throw — either succeeds (treats as no lease) or fails with a proper error
    assert.ok(["success", "failed"].includes(result.status));
  } finally {
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});
