import assert from "node:assert/strict";
import test from "node:test";
import { AxeSimulatorBackend } from "../src/ios-backend-axe.js";
import { setExecuteRunnerForTesting, resetExecuteRunnerForTesting } from "../src/runtime-shared.js";

test.afterEach(() => {
  resetExecuteRunnerForTesting();
});

test("AxeSimulatorBackend has correct backendId", () => {
  const backend = new AxeSimulatorBackend();
  assert.equal(backend.backendId, "axe");
});

test("AxeSimulatorBackend has correct backendName", () => {
  const backend = new AxeSimulatorBackend();
  assert.equal(backend.backendName, "AXe CLI");
});

test("AxeSimulatorBackend declares full support for all actions", () => {
  const backend = new AxeSimulatorBackend();
  assert.deepEqual(backend.supportLevel, {
    tap: "full",
    typeText: "full",
    swipe: "full",
    hierarchy: "full",
    screenshot: "full",
  });
});

test("probeAvailability returns available when axe --version succeeds", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 0,
    stdout: "1.6.0",
    stderr: "",
  }));

  const backend = new AxeSimulatorBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, true);
  assert.equal(result.version, "1.6.0");
});

test("probeAvailability returns unavailable when axe --version fails", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 1,
    stdout: "",
    stderr: "command not found",
  }));

  const backend = new AxeSimulatorBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, false);
  assert.ok(result.error?.includes("failed"));
});

test("probeAvailability returns unavailable when executeRunner throws", async () => {
  setExecuteRunnerForTesting(async () => {
    throw new Error("axe not found");
  });

  const backend = new AxeSimulatorBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, false);
  assert.equal(result.error, "axe not found");
});

test("buildTapCommand returns correct axe tap command", () => {
  const backend = new AxeSimulatorBackend();
  const cmd = backend.buildTapCommand("ABCD-1234", 100, 200);
  assert.deepEqual(cmd, ["axe", "tap", "-x", "100", "-y", "200", "--udid", "ABCD-1234"]);
});

test("buildTypeTextCommand returns correct axe type command", () => {
  const backend = new AxeSimulatorBackend();
  const cmd = backend.buildTypeTextCommand("ABCD-1234", "hello");
  assert.deepEqual(cmd, ["axe", "type", "hello", "--udid", "ABCD-1234"]);
});

test("buildTypeTextCommand prefixes -- for text starting with dash", () => {
  const backend = new AxeSimulatorBackend();
  const cmd = backend.buildTypeTextCommand("ABCD-1234", "-special");
  assert.deepEqual(cmd, ["axe", "type", "---special", "--udid", "ABCD-1234"]);
});

test("buildSwipeCommand returns correct axe swipe command", () => {
  const backend = new AxeSimulatorBackend();
  const cmd = backend.buildSwipeCommand("ABCD-1234", {
    start: { x: 100, y: 500 },
    end: { x: 100, y: 200 },
    durationMs: 300,
  });
  assert.deepEqual(cmd, ["axe", "swipe", "--start-x", "100", "--start-y", "500", "--end-x", "100", "--end-y", "200", "--duration", "0.3", "--udid", "ABCD-1234"]);
});

test("buildHierarchyCaptureCommand returns correct axe describe-ui command", () => {
  const backend = new AxeSimulatorBackend();
  const cmd = backend.buildHierarchyCaptureCommand("ABCD-1234");
  assert.deepEqual(cmd, ["axe", "describe-ui", "--udid", "ABCD-1234"]);
});

test("buildScreenshotCommand returns correct axe screenshot command", () => {
  const backend = new AxeSimulatorBackend();
  const cmd = backend.buildScreenshotCommand("ABCD-1234", "/tmp/screen.png");
  assert.deepEqual(cmd, ["axe", "screenshot", "--udid", "ABCD-1234", "--output", "/tmp/screen.png"]);
});

test("buildFailureSuggestion returns tap-specific suggestion", () => {
  const backend = new AxeSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("tap", "ABCD-1234");
  assert.ok(suggestion.includes("simulator is booted"));
});

test("buildFailureSuggestion returns hierarchy-specific suggestion", () => {
  const backend = new AxeSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("hierarchy", "ABCD-1234");
  assert.ok(suggestion.includes("describe-ui"));
});

test("buildFailureSuggestion returns generic suggestion for unknown action", () => {
  const backend = new AxeSimulatorBackend();
  const suggestion = backend.buildFailureSuggestion("unknown", "ABCD-1234");
  assert.ok(suggestion.includes("axe"));
  assert.ok(suggestion.includes("brew install"));
});
