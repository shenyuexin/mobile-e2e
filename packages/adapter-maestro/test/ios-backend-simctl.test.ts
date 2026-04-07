import assert from "node:assert/strict";
import test from "node:test";
import { SimctlSimulatorBackend } from "../src/ios-backend-simctl.js";
import { setExecuteRunnerForTesting, resetExecuteRunnerForTesting } from "../src/runtime-shared.js";

test.afterEach(() => {
  resetExecuteRunnerForTesting();
});

test("SimctlSimulatorBackend has correct backendId", () => {
  const backend = new SimctlSimulatorBackend();
  assert.equal(backend.backendId, "simctl");
});

test("SimctlSimulatorBackend has correct backendName", () => {
  const backend = new SimctlSimulatorBackend();
  assert.equal(backend.backendName, "Xcode simctl");
});

test("SimctlSimulatorBackend declares none for UI actions and full for screenshot", () => {
  const backend = new SimctlSimulatorBackend();
  assert.deepEqual(backend.supportLevel, {
    tap: "none",
    typeText: "none",
    swipe: "none",
    hierarchy: "none",
    screenshot: "full",
  });
});

test("probeAvailability returns available when xcrun simctl help succeeds", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 0,
    stdout: "Xcode 15.0\nUsage: simctl ...",
    stderr: "",
  }));

  const backend = new SimctlSimulatorBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, true);
  assert.equal(result.version, "15.0");
});

test("probeAvailability returns unavailable when xcrun simctl help fails", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 1,
    stdout: "",
    stderr: "command not found",
  }));

  const backend = new SimctlSimulatorBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, false);
  assert.ok(result.error?.includes("failed"));
});

test("probeAvailability returns unavailable when executeRunner throws", async () => {
  setExecuteRunnerForTesting(async () => {
    throw new Error("xcrun not found");
  });

  const backend = new SimctlSimulatorBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, false);
  assert.equal(result.error, "xcrun not found");
});

test("unsupported: buildTapCommand throws", () => {
  const backend = new SimctlSimulatorBackend();
  assert.throws(() => backend.buildTapCommand("ABC", 1, 2), /axe/);
});

test("unsupported: buildTypeTextCommand throws", () => {
  const backend = new SimctlSimulatorBackend();
  assert.throws(() => backend.buildTypeTextCommand("ABC", "text"), /axe/);
});

test("unsupported: buildSwipeCommand throws", () => {
  const backend = new SimctlSimulatorBackend();
  assert.throws(() => backend.buildSwipeCommand("ABC", { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, durationMs: 100 }), /axe/);
});

test("unsupported: buildHierarchyCaptureCommand throws", () => {
  const backend = new SimctlSimulatorBackend();
  assert.throws(() => backend.buildHierarchyCaptureCommand("ABC"), /axe/);
});

test("buildScreenshotCommand returns correct simctl io screenshot command", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildScreenshotCommand("ABCD-1234", "/tmp/screen.png");
  assert.deepEqual(cmd, ["xcrun", "simctl", "io", "ABCD-1234", "screenshot", "/tmp/screen.png"]);
});

test("buildFailureSuggestion returns screenshot-specific suggestion", () => {
  const backend = new SimctlSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("screenshot", "ABCD-1234");
  assert.ok(suggestion.includes("simulator is booted"));
});

test("buildFailureSuggestion returns axe suggestion for unsupported tap", () => {
  const backend = new SimctlSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("tap", "ABCD-1234");
  assert.ok(suggestion.includes("axe"));
  assert.ok(suggestion.includes("brew install"));
});

test("buildFailureSuggestion returns generic suggestion for unsupported action", () => {
  const backend = new SimctlSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("unknown", "ABCD-1234");
  assert.ok(suggestion.includes("unknown"));
});
