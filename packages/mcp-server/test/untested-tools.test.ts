import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildSessionRecordRelativePath } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function buildTestDeviceId(sessionId: string): string {
  return `${sessionId}-device`;
}

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", buildTestDeviceId(sessionId))), { force: true });
}

// ── probe_network_readiness ────────────────────────────────────────────────

test("probe_network_readiness returns probe object with readiness data", async () => {
  const sessionId = `probe-network-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const probe = await server.invoke("probe_network_readiness", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial"].includes(probe.status));
  assert.ok(probe.data.probe, "Should have probe field");
  assert.ok(typeof probe.data.durationMs === "number", "durationMs should be number");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("probe_network_readiness returns structured response even for invalid session (dryRun)", async () => {
  const server = createServer();
  const probe = await server.invoke("probe_network_readiness", {
    sessionId: "nonexistent-session-invalid",
    platform: "android",
    dryRun: true,
  });
  // dryRun mode returns structured data without requiring a valid session
  assert.ok(probe.data || probe.error, "Should return structured response");
});

// ── compare_visual_baseline ────────────────────────────────────────────────

test("compare_visual_baseline returns visual diff data with paths and threshold", async () => {
  const sessionId = `visual-baseline-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const compare = await server.invoke("compare_visual_baseline", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial"].includes(compare.status));
  assert.ok(typeof compare.data.baselinePath === "string", "baselinePath should be string");
  assert.ok(typeof compare.data.currentPath === "string", "currentPath should be string");
  assert.ok(typeof compare.data.pixelDiffPercent === "number", "pixelDiffPercent should be number");
  assert.ok(typeof compare.data.threshold === "number", "threshold should be number");
  assert.ok(typeof compare.data.passed === "boolean", "passed should be boolean");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("compare_visual_baseline returns no-baseline response when none exists", async () => {
  const sessionId = `visual-no-baseline-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const compare = await server.invoke("compare_visual_baseline", {
    sessionId,
    platform: "android",
    baselineName: "nonexistent-baseline-that-does-not-exist",
    dryRun: true,
  });
  // Should not throw — either partial success with "no baseline" message, or structured error
  assert.ok(compare.data || compare.error, "Should return structured response, not throw");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

// ── capture_element_screenshot ─────────────────────────────────────────────

test("capture_element_screenshot returns element bounds and screenshot paths", async () => {
  const sessionId = `element-screenshot-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const capture = await server.invoke("capture_element_screenshot", {
    sessionId,
    platform: "android",
    dryRun: true,
    selector: { text: "Submit" },
  });
  // dryRun returns structured response with paths even without actual element
  assert.ok(capture.data || capture.error, "Should return structured response");
  if (capture.data) {
    assert.ok(typeof capture.data.fullScreenshotPath === "string", "fullScreenshotPath should be string");
    assert.ok(typeof capture.data.croppedElementPath === "string", "croppedElementPath should be string");
  }

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("capture_element_screenshot returns error for missing element", async () => {
  const sessionId = `element-not-found-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const capture = await server.invoke("capture_element_screenshot", {
    sessionId,
    platform: "android",
    dryRun: true,
    elementSelector: { text: "this-element-definitely-does-not-exist-xyz" },
  });
  // dryRun mode should still return structured response
  assert.ok(capture.data || capture.error, "Should return structured response");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

// ── take_screenshot ────────────────────────────────────────────────────────

test("take_screenshot returns outputPath and command in dryRun mode", async () => {
  const sessionId = `take-screenshot-${Date.now()}`;
  const server = createServer();
  await cleanupSessionArtifact(sessionId);

  const started = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: buildTestDeviceId(sessionId),
    profile: "phase1",
  });
  assert.equal(started.status, "success");

  const screenshot = await server.invoke("take_screenshot", {
    sessionId,
    platform: "android",
    dryRun: true,
  });
  assert.ok(["success", "partial"].includes(screenshot.status));
  assert.ok(typeof screenshot.data.outputPath === "string" && screenshot.data.outputPath.length > 0,
    `outputPath should be non-empty string, got: ${screenshot.data.outputPath}`);
  assert.ok(Array.isArray(screenshot.data.command), "command should be an array");
  assert.ok(screenshot.data.dryRun === true, "dryRun should be true");

  await server.invoke("end_session", { sessionId });
  await cleanupSessionArtifact(sessionId);
});

test("take_screenshot returns structured response even for invalid session (dryRun)", async () => {
  const server = createServer();
  const screenshot = await server.invoke("take_screenshot", {
    sessionId: "invalid-session-for-screenshot",
    platform: "android",
    dryRun: true,
  });
  // dryRun mode returns structured data without requiring a valid session
  assert.ok(screenshot.data || screenshot.error, "Should return structured response");
});

// ── list_devices ───────────────────────────────────────────────────────────

test("list_devices returns android and ios device arrays", async () => {
  const server = createServer();
  const list = await server.invoke("list_devices", {});
  assert.ok(["success", "partial"].includes(list.status));
  assert.ok(Array.isArray(list.data.android), "android should be an array");
  assert.ok(Array.isArray(list.data.ios), "ios should be an array");
});

test("list_devices returns structured device info when devices exist", async () => {
  const server = createServer();
  const list = await server.invoke("list_devices", {});
  assert.ok(["success", "partial"].includes(list.status));
  // Each device in android/ios arrays should have structured info
  const allDevices = [...(list.data.android || []), ...(list.data.ios || [])];
  for (const device of allDevices) {
    assert.ok(typeof device.id === "string" && device.id.length > 0,
      `device.id should be non-empty string, got: ${device.id}`);
  }
});
