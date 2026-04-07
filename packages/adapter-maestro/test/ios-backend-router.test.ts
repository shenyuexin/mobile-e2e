import assert from "node:assert/strict";
import test from "node:test";
import { IosBackendRouter, getIosBackendRouter, setBackendForTesting, resetForTesting } from "../src/ios-backend-router.js";
import type { IosExecutionBackend, BackendProbeResult } from "../src/ios-backend-types.js";

test.afterEach(() => {
  resetForTesting();
});

test("selectBackend selects simctl for simulator UDID", () => {
  const router = new IosBackendRouter();
  // Simulator UDIDs are proper UUIDs with hex chars only (0-9, A-F)
  const backend = router.selectBackend("ABCD1234-5678-5678-5678-901234567890");
  assert.equal(backend.backendId, "simctl");
});

test("selectBackend selects devicectl for physical device UDID", () => {
  const router = new IosBackendRouter();
  // Physical device UDIDs are not UUIDs - they're hex strings like "00008110-001234567890001E"
  const backend = router.selectBackend("00008110-001234567890001E");
  assert.equal(backend.backendId, "devicectl");
});

test("selectBackend uses simctl when IOS_EXECUTION_BACKEND=simctl", () => {
  const router = new IosBackendRouter();
  const backend = router.selectBackend("any-device", { IOS_EXECUTION_BACKEND: "simctl" } as NodeJS.ProcessEnv);
  assert.equal(backend.backendId, "simctl");
});

test("selectBackend uses devicectl when IOS_EXECUTION_BACKEND=devicectl", () => {
  const router = new IosBackendRouter();
  const backend = router.selectBackend("any-device", { IOS_EXECUTION_BACKEND: "devicectl" } as NodeJS.ProcessEnv);
  assert.equal(backend.backendId, "devicectl");
});

test("selectBackend throws for invalid IOS_EXECUTION_BACKEND", () => {
  const router = new IosBackendRouter();
  assert.throws(
    () => router.selectBackend("any-device", { IOS_EXECUTION_BACKEND: "invalid" } as NodeJS.ProcessEnv),
    /Invalid IOS_EXECUTION_BACKEND/,
  );
});

test("selectBackend throws for deprecated idb backend", () => {
  const router = new IosBackendRouter();
  assert.throws(
    () => router.selectBackend("any-device", { IOS_EXECUTION_BACKEND: "idb" } as NodeJS.ProcessEnv),
    /deprecated/,
  );
});

test("selectBackend throws for unimplemented maestro backend", () => {
  const router = new IosBackendRouter();
  assert.throws(
    () => router.selectBackend("any-device", { IOS_EXECUTION_BACKEND: "maestro" } as NodeJS.ProcessEnv),
    /not yet implemented/,
  );
});

test("setBackendForTesting overrides selectBackend", () => {
  const mockBackend: IosExecutionBackend = {
    backendId: "simctl",
    backendName: "Mock",
    supportLevel: { tap: "full", typeText: "full", swipe: "full", hierarchy: "full", screenshot: "full" },
    probeAvailability: async () => ({ available: true, version: "mock" }),
    buildTapCommand: () => [],
    buildTypeTextCommand: () => [],
    buildSwipeCommand: () => [],
    buildHierarchyCaptureCommand: () => [],
    buildScreenshotCommand: () => [],
    buildFailureSuggestion: () => "",
  };
  setBackendForTesting(mockBackend);
  const router = new IosBackendRouter();
  const backend = router.selectBackend("any-device");
  assert.equal(backend, mockBackend);
});

test("resetForTesting clears override", () => {
  const mockBackend: IosExecutionBackend = {
    backendId: "simctl",
    backendName: "Mock",
    supportLevel: { tap: "full", typeText: "full", swipe: "full", hierarchy: "full", screenshot: "full" },
    probeAvailability: async () => ({ available: true, version: "mock" }),
    buildTapCommand: () => [],
    buildTypeTextCommand: () => [],
    buildSwipeCommand: () => [],
    buildHierarchyCaptureCommand: () => [],
    buildScreenshotCommand: () => [],
    buildFailureSuggestion: () => "",
  };
  setBackendForTesting(mockBackend);
  resetForTesting();
  const router = new IosBackendRouter();
  const backend = router.selectBackend("ABCD1234-5678-5678-5678-901234567890");
  assert.equal(backend.backendId, "simctl");
});

test("probeAllBackends returns summary with simctl, devicectl, and maestro", async () => {
  const router = new IosBackendRouter();
  const summary = await router.probeAllBackends(process.cwd());
  assert.ok("simctl" in summary);
  assert.ok("devicectl" in summary);
  assert.ok("maestro" in summary);
  assert.ok("available" in summary.simctl);
  assert.ok("available" in summary.devicectl);
  assert.ok("available" in summary.maestro);
});
