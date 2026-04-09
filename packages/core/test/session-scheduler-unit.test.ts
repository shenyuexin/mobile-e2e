import assert from "node:assert/strict";
import { rm, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runExclusive } from "../src/session-scheduler.ts";
import { loadSessionRecord, buildSessionRecordRelativePath, buildDeviceLeaseRecordRelativePath, removeLease, persistStartedSession } from "../src/index.ts";
import type { Session } from "@mobile-e2e-mcp/contracts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionAndLease(sessionId: string, platform: "android" | "ios", deviceId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId)), { force: true });
}

function buildSession(sessionId: string, deviceId: string): Session {
  return {
    sessionId,
    platform: "android",
    deviceId,
    appId: "host.exp.exponent",
    policyProfile: "sample-harness-default",
    startedAt: new Date().toISOString(),
    artifactsRoot: "artifacts",
    timeline: [],
    profile: "phase1",
    phase: "phase2",
    sampleName: "sample-maestro-flow",
  };
}

test("runExclusive releases lock even when task throws", async () => {
  const sessionId = `scheduler-throw-${Date.now()}`;
  const deviceId = `scheduler-throw-device-${Date.now()}`;
  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    await persistStartedSession(repoRoot, buildSession(sessionId, deviceId));

    await assert.rejects(
      () => runExclusive(
        { repoRoot, sessionId, platform: "android", deviceId, toolName: "throwing_tool" },
        async () => { throw new Error("task failed intentionally"); },
      ),
      /task failed intentionally/,
    );

    // Verify lock directory is cleaned up (no stale lock)
    const lockDir = path.resolve(repoRoot, "artifacts", "scheduler", ".locks", `${sessionId}.lock`);
    await assert.rejects(
      () => readdir(lockDir),
      /ENOENT/,
    );
  } finally {
    await removeLease(repoRoot, "android", deviceId);
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});

test("runExclusive records queue_wait_started and queue_wait_ended timeline events", async () => {
  const sessionId = `scheduler-timeline-${Date.now()}`;
  const deviceId = `scheduler-timeline-device-${Date.now()}`;
  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    await persistStartedSession(repoRoot, buildSession(sessionId, deviceId));

    const result = await runExclusive(
      { repoRoot, sessionId, platform: "android", deviceId, toolName: "test_tool" },
      async () => "done",
    );

    assert.equal(result.value, "done");
    assert.ok(result.queueWaitMs >= 0);

    const sessionRecord = await loadSessionRecord(repoRoot, sessionId);
    const queueStartEvents = sessionRecord?.session.timeline.filter((e) => e.type === "queue_wait_started") ?? [];
    const queueEndEvents = sessionRecord?.session.timeline.filter((e) => e.type === "queue_wait_ended") ?? [];
    assert.equal(queueStartEvents.length, 1, "Should have exactly 1 queue_wait_started event");
    assert.equal(queueEndEvents.length, 1, "Should have exactly 1 queue_wait_ended event");
  } finally {
    await removeLease(repoRoot, "android", deviceId);
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});
