import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function buildTestDeviceId(sessionId: string): string {
  return `${sessionId}-device`;
}

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", buildTestDeviceId(sessionId))), { force: true });
}

test("interruption tools are invokable through server", async () => {
  const sessionId = "server-interruption-tools";
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const detected = await server.invoke("detect_interruption", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial"].includes(detected.status));
  assert.equal(Array.isArray(detected.data.signals), true);

  const classified = await server.invoke("classify_interruption", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial"].includes(classified.status));
  assert.equal(Array.isArray(classified.data.signals), true);

  const resolved = await server.invoke("resolve_interruption", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial", "failed"].includes(resolved.status));
  assert.equal(typeof resolved.data.status, "string");

  const resumed = await server.invoke("resume_interrupted_action", {
    sessionId,
    platform: "android",
    dryRun: true,
    checkpoint: {
      actionId: "checkpoint-action",
      sessionId,
      platform: "android",
      actionType: "wait_for_ui",
      selector: { text: "Home" },
      params: { text: "Home", waitUntil: "visible", timeoutMs: 500, intervalMs: 100 },
      createdAt: new Date().toISOString(),
    },
  });
  assert.ok(["success", "partial", "failed"].includes(resumed.status));
  assert.equal(typeof resumed.data.attempted, "boolean");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});
