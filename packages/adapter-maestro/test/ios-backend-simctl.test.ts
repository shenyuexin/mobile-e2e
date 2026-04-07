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

test("SimctlSimulatorBackend declares full support for all actions", () => {
  const backend = new SimctlSimulatorBackend();
  assert.deepEqual(backend.supportLevel, {
    tap: "full",
    typeText: "full",
    swipe: "full",
    hierarchy: "full",
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

test("buildTapCommand returns correct simctl io tap command", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildTapCommand("ABCD-1234", 100, 200);
  assert.deepEqual(cmd, ["xcrun", "simctl", "io", "ABCD-1234", "tap", "100", "200"]);
});

test("buildTypeTextCommand returns correct simctl keyboard type command", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildTypeTextCommand("ABCD-1234", "hello");
  assert.deepEqual(cmd, ["xcrun", "simctl", "keyboard", "ABCD-1234", "type", "--", "hello"]);
});

test("buildTypeTextCommand escapes double quotes in text", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildTypeTextCommand("ABCD-1234", 'hello "world"');
  assert.deepEqual(cmd, ["xcrun", "simctl", "keyboard", "ABCD-1234", "type", "--", 'hello \\"world\\"']);
});

test("buildTypeTextCommand escapes backslashes", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildTypeTextCommand("ABCD-1234", "path\\to\\file");
  assert.deepEqual(cmd, ["xcrun", "simctl", "keyboard", "ABCD-1234", "type", "--", "path\\\\to\\\\file"]);
});

test("buildSwipeCommand returns correct simctl io swipe command", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildSwipeCommand("ABCD-1234", {
    start: { x: 100, y: 500 },
    end: { x: 100, y: 200 },
    durationMs: 300,
  });
  assert.deepEqual(cmd, ["xcrun", "simctl", "io", "ABCD-1234", "swipe", "100", "500", "100", "200"]);
});

test("buildHierarchyCaptureCommand returns correct simctl spawn accessibility dump command", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildHierarchyCaptureCommand("ABCD-1234");
  assert.deepEqual(cmd, ["xcrun", "simctl", "spawn", "ABCD-1234", "accessibility", "dump"]);
});

test("buildScreenshotCommand returns correct simctl io screenshot command", () => {
  const backend = new SimctlSimulatorBackend();
  const cmd = backend.buildScreenshotCommand("ABCD-1234", "/tmp/screen.png");
  assert.deepEqual(cmd, ["xcrun", "simctl", "io", "ABCD-1234", "screenshot", "/tmp/screen.png"]);
});

test("buildFailureSuggestion returns tap-specific suggestion", () => {
  const backend = new SimctlSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("tap", "ABCD-1234");
  assert.ok(suggestion.includes("simulator is booted"));
  assert.ok(suggestion.includes("iOS version is 15+"));
});

test("buildFailureSuggestion returns hierarchy-specific suggestion", () => {
  const backend = new SimctlSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("hierarchy", "ABCD-1234");
  assert.ok(suggestion.includes("accessibility dump"));
});

test("buildFailureSuggestion returns generic suggestion for unknown action", () => {
  const backend = new SimctlSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("unknown", "ABCD-1234");
  assert.ok(suggestion.includes("unknown"));
});
