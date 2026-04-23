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

  // Top-level data shape
  assert.ok(typeof detected.data.detected === "boolean", "data.detected should be boolean");
  assert.ok(typeof detected.data.sessionRecordFound === "boolean", "data.sessionRecordFound should be boolean");
  assert.ok(Array.isArray(detected.data.signals), "data.signals should be array");

  // Each signal must have source, key, confidence; value is optional string
  const validSignalSources = ["ui_tree", "state_summary", "runtime", "visual"];
  for (const signal of detected.data.signals) {
    assert.ok(typeof signal.source === "string", "signal.source should be string");
    assert.ok(validSignalSources.includes(signal.source), `signal.source should be valid InterruptionSignalSource: ${signal.source}`);
    assert.ok(typeof signal.key === "string", "signal.key should be string");
    assert.ok(signal.value === undefined || typeof signal.value === "string", "signal.value should be string or undefined");
    assert.ok(typeof signal.confidence === "number", "signal.confidence should be number");
    assert.ok(signal.confidence >= 0 && signal.confidence <= 1, "signal.confidence should be 0-1");
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

  const validTypes = ["system_alert", "action_sheet", "permission_prompt", "app_modal", "overlay", "keyboard_blocking", "unknown"];
  assert.ok(
    validTypes.includes(classified.data.classification.type),
    `Invalid classification type: ${classified.data.classification.type}`,
  );
  assert.ok(typeof classified.data.classification.confidence === "number");
  assert.ok(classified.data.classification.confidence >= 0 && classified.data.classification.confidence <= 1);
  assert.ok(Array.isArray(classified.data.classification.rationale));
  assert.ok(typeof classified.data.found === "boolean", "data.found should be boolean");
  assert.ok(Array.isArray(classified.data.signals), "data.signals should be array");
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
  assert.ok(["success", "failed"].includes(resolved.status));

  const validStatuses = ["resolved", "denied", "not_needed", "failed"];
  assert.ok(
    validStatuses.includes(resolved.data.status),
    `Unexpected resolution status: ${resolved.data.status}`,
  );
  assert.ok(typeof resolved.data.strategy === "string", "data.strategy should be string");
  assert.ok(typeof resolved.data.attempted === "boolean", "data.attempted should be boolean");
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

  assert.ok(typeof resumed.data.attempted === "boolean", "data.attempted should be boolean");
  assert.ok(typeof resumed.data.resumed === "boolean", "data.resumed should be boolean");
  assert.ok(typeof resumed.data.driftDetected === "boolean", "data.driftDetected should be boolean");

  const checkpoint = resumed.data.checkpoint;
  assert.ok(checkpoint !== undefined, "data.checkpoint should be present");
  assert.equal(checkpoint.actionType, "wait_for_ui");
  assert.deepEqual(checkpoint.selector, { text: "Home" });
  assert.equal(checkpoint.platform, "android");
  assert.equal(checkpoint.actionId, "checkpoint-action");
  assert.equal(checkpoint.sessionId, sessionId);
  assert.ok(typeof checkpoint.createdAt === "string", "checkpoint.createdAt should be string");
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
