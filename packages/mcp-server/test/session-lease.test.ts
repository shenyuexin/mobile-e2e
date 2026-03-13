import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath, loadLeaseByDevice, loadSessionRecord } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionAndLease(sessionId: string, platform: "android" | "ios", deviceId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId)), { force: true });
}

test("start_session rejects leasing the same device to another active session", async () => {
  const server = createServer();
  const deviceId = `lease-conflict-device-${Date.now()}`;
  const sessionA = `lease-conflict-a-${Date.now()}`;
  const sessionB = `lease-conflict-b-${Date.now()}`;

  await cleanupSessionAndLease(sessionA, "android", deviceId);
  await cleanupSessionAndLease(sessionB, "android", deviceId);

  try {
    const first = await server.invoke("start_session", {
      sessionId: sessionA,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    assert.equal(first.status, "success");

    const second = await server.invoke("start_session", {
      sessionId: sessionB,
      platform: "android",
      deviceId,
      profile: "phase1",
    });

    assert.equal(second.status, "failed");
    assert.equal(second.reasonCode, "DEVICE_UNAVAILABLE");
    assert.equal(second.nextSuggestions[0]?.includes("busy"), true);

    const secondRecord = await loadSessionRecord(repoRoot, sessionB);
    assert.equal(secondRecord, undefined);
  } finally {
    await server.invoke("end_session", { sessionId: sessionA });
    await cleanupSessionAndLease(sessionA, "android", deviceId);
    await cleanupSessionAndLease(sessionB, "android", deviceId);
  }
});

test("second session can start on same device after first session ends", async () => {
  const server = createServer();
  const deviceId = `lease-reuse-device-${Date.now()}`;
  const sessionA = `lease-reuse-a-${Date.now()}`;
  const sessionB = `lease-reuse-b-${Date.now()}`;

  await cleanupSessionAndLease(sessionA, "android", deviceId);
  await cleanupSessionAndLease(sessionB, "android", deviceId);

  try {
    const first = await server.invoke("start_session", {
      sessionId: sessionA,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    assert.equal(first.status, "success");

    const firstEnd = await server.invoke("end_session", { sessionId: sessionA });
    assert.equal(firstEnd.status, "success");

    const second = await server.invoke("start_session", {
      sessionId: sessionB,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    assert.equal(second.status, "success");
  } finally {
    await server.invoke("end_session", { sessionId: sessionA });
    await server.invoke("end_session", { sessionId: sessionB });
    await cleanupSessionAndLease(sessionA, "android", deviceId);
    await cleanupSessionAndLease(sessionB, "android", deviceId);
  }
});

test("start_session rejects active sessionId reuse across different devices", async () => {
  const server = createServer();
  const sessionId = `lease-session-reuse-${Date.now()}`;
  const deviceA = `lease-session-reuse-a-${Date.now()}`;
  const deviceB = `lease-session-reuse-b-${Date.now()}`;

  await cleanupSessionAndLease(sessionId, "android", deviceA);
  await cleanupSessionAndLease(sessionId, "android", deviceB);

  try {
    const first = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: deviceA,
      profile: "phase1",
    });
    assert.equal(first.status, "success");

    const second = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: deviceB,
      profile: "phase1",
    });

    assert.equal(second.status, "failed");
    assert.equal(second.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(second.nextSuggestions[0]?.includes("already active"), true);
  } finally {
    await server.invoke("end_session", { sessionId });
    await cleanupSessionAndLease(sessionId, "android", deviceA);
    await cleanupSessionAndLease(sessionId, "android", deviceB);
  }
});

test("end_session releases the device lease file", async () => {
  const server = createServer();
  const deviceId = `lease-release-device-${Date.now()}`;
  const sessionId = `lease-release-session-${Date.now()}`;

  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    const started = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    assert.equal(started.status, "success");

    const leasedBeforeEnd = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(leasedBeforeEnd?.sessionId, sessionId);

    const ended = await server.invoke("end_session", { sessionId });
    assert.equal(ended.status, "success");

    const leasedAfterEnd = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(leasedAfterEnd, undefined);

    const persisted = await loadSessionRecord(repoRoot, sessionId);
    assert.equal(persisted?.session.timeline.some((event) => event.type === "lease_released"), true);
  } finally {
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});

test("second end_session call remains idempotent after lease release", async () => {
  const server = createServer();
  const deviceId = `lease-idempotent-device-${Date.now()}`;
  const sessionId = `lease-idempotent-session-${Date.now()}`;

  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId,
      profile: "phase1",
    });

    const firstEnd = await server.invoke("end_session", { sessionId });
    const secondEnd = await server.invoke("end_session", { sessionId });

    assert.equal(firstEnd.status, "success");
    assert.equal(secondEnd.status, "success");
    assert.equal(firstEnd.data.endedAt, secondEnd.data.endedAt);

    const lease = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(lease, undefined);
  } finally {
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});
