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

test("detect_interruption returns signals array with known structure", async () => {
  const sessionId = `interruption-detect-${Date.now()}`;
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
  assert.ok(Array.isArray(detected.data.signals));
  // Each signal should have source, key, confidence fields
  for (const signal of detected.data.signals) {
    assert.ok(typeof signal.source === "string", "signal.source should be string");
    assert.ok(typeof signal.key === "string", "signal.key should be string");
    assert.ok(typeof signal.confidence === "number", "signal.confidence should be number");
  }

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("classify_interruption returns valid classification type", async () => {
  const sessionId = `interruption-classify-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const classified = await server.invoke("classify_interruption", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial"].includes(classified.status));
  // Classification type should be a known InterruptionType
  const validTypes = ["permission_prompt", "action_sheet", "system_alert", "overlay", "keyboard_blocking", "unknown"];
  assert.ok(
    validTypes.includes(classified.data.classification.type),
    `Invalid classification type: ${classified.data.classification.type}`,
  );
  assert.ok(typeof classified.data.classification.confidence === "number");
  assert.ok(Array.isArray(classified.data.classification.rationale));

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("resolve_interruption returns known resolution status", async () => {
  const sessionId = `interruption-resolve-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const resolved = await server.invoke("resolve_interruption", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial", "failed"].includes(resolved.status));
  // Status should be a known resolution value (not just any string)
  const validStatuses = ["resolved", "escalated", "unresolved", "dismissed", "not_needed"];
  assert.ok(
    validStatuses.includes(resolved.data.status),
    `Unexpected resolution status: ${resolved.data.status}`,
  );
  assert.ok(resolved.data.strategy === undefined || typeof resolved.data.strategy === "string");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("resume_interrupted_action preserves checkpoint fields", async () => {
  const sessionId = `interruption-resume-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

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
  assert.equal(resumed.data.checkpoint?.actionType, "wait_for_ui");
  assert.deepEqual(resumed.data.checkpoint?.selector, { text: "Home" });
  assert.equal(resumed.data.checkpoint?.platform, "android");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("interruption tools reject invalid sessionId", async () => {
  const server = createServer();

  const detected = await server.invoke("detect_interruption", {
    sessionId: "nonexistent-session",
    platform: "android",
    dryRun: true,
  });
  assert.ok(["failed", "partial"].includes(detected.status) || detected.error !== undefined);
});
