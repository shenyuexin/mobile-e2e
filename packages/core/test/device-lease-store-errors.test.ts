import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildLeaseDirectoryAbsolutePath, listLeases, loadLeaseByDevice, persistLease } from "../src/device-lease-store.ts";
import type { DeviceLease } from "../src/device-lease-store.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const leaseDir = path.resolve(repoRoot, "artifacts", "leases");

test("loadLeaseByDevice returns undefined for corrupt JSON file", async () => {
  const deviceId = `corrupt-lease-${Date.now()}`;
  const leasePath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", deviceId));
  await mkdir(path.dirname(leasePath), { recursive: true });
  await writeFile(leasePath, "{invalid json!!!", "utf8");
  try {
    const result = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(result, undefined);
  } finally {
    await rm(leasePath, { force: true });
  }
});

test("loadLeaseByDevice returns undefined for non-existent device", async () => {
  const result = await loadLeaseByDevice(repoRoot, "android", "non-existent-device-12345");
  assert.equal(result, undefined);
});

test("listLeases returns [] when leases directory does not exist", async () => {
  // Use a fake repoRoot that has no artifacts/leases directory
  const fakeRoot = path.resolve(repoRoot, "artifacts", "_fake-lease-dir-" + Date.now());
  const result = await listLeases(fakeRoot);
  assert.deepEqual(result, []);
});

test("listLeases silently skips invalid JSON files", async () => {
  const validDeviceId = `valid-lease-${Date.now()}`;
  const invalidDeviceId = `invalid-lease-${Date.now()}`;
  const validPath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", validDeviceId));
  const invalidPath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", invalidDeviceId));

  await mkdir(leaseDir, { recursive: true });
  // Write valid lease
  const validLease: DeviceLease = {
    leaseId: `lease-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
    platform: "android",
    deviceId: validDeviceId,
    state: "leased",
    ownerPid: process.pid,
    acquiredAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  await persistLease(repoRoot, validLease);
  // Write corrupt JSON
  await writeFile(invalidPath, "not json at all", "utf8");

  try {
    const leases = await listLeases(repoRoot);
    // Should only contain the valid lease
    const found = leases.find((l) => l.deviceId === validDeviceId);
    assert.ok(found, "Should find valid lease");
    assert.equal(leases.some((l) => l.deviceId === invalidDeviceId), false, "Should NOT contain corrupt lease");
  } finally {
    await rm(validPath, { force: true });
    await rm(invalidPath, { force: true });
  }
});

test("persistLease throws for deviceId with path traversal characters", async () => {
  const badLease: DeviceLease = {
    leaseId: `lease-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
    platform: "android",
    deviceId: "../../../etc/evil",
    state: "leased",
    ownerPid: process.pid,
    acquiredAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  await assert.rejects(
    () => persistLease(repoRoot, badLease),
    /Invalid deviceId/,
  );
});
