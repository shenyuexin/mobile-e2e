import assert from "node:assert/strict";
import test from "node:test";
import { WdaRealDeviceBackend } from "../src/ios-backend-wda.js";

test("WdaRealDeviceBackend has correct backendId", () => {
  const backend = new WdaRealDeviceBackend();
  assert.equal(backend.backendId, "wda");
});

test("WdaRealDeviceBackend has correct backendName", () => {
  const backend = new WdaRealDeviceBackend();
  assert.equal(backend.backendName, "WebDriverAgent");
});

test("WdaRealDeviceBackend declares full support for all actions", () => {
  const backend = new WdaRealDeviceBackend();
  assert.deepEqual(backend.supportLevel, {
    tap: "full",
    typeText: "full",
    swipe: "full",
    hierarchy: "full",
    screenshot: "full",
  });
});

test("probeAvailability returns unavailable when WDA is not running", async () => {
  const backend = new WdaRealDeviceBackend();
  const result = await backend.probeAvailability("/repo");
  assert.equal(result.available, false);
  assert.ok(result.error?.includes("not reachable") || result.error?.includes("failed"));
});

test("buildTapCommand returns WDA HTTP descriptor", () => {
  const backend = new WdaRealDeviceBackend();
  const cmd = backend.buildTapCommand("device-123", 100, 200);
  assert.deepEqual(cmd, ["__wda_http__", "device-123", "POST", "/wda/tap", '{"x":100,"y":200}']);
});

test("buildTypeTextCommand returns WDA HTTP descriptor", () => {
  const backend = new WdaRealDeviceBackend();
  const cmd = backend.buildTypeTextCommand("device-123", "hello");
  assert.deepEqual(cmd, ["__wda_http__", "device-123", "POST", "/wda/keys", '{"value":["h","e","l","l","o"]}']);
});

test("buildSwipeCommand returns WDA HTTP descriptor", () => {
  const backend = new WdaRealDeviceBackend();
  const cmd = backend.buildSwipeCommand("device-123", {
    start: { x: 100, y: 500 },
    end: { x: 100, y: 200 },
    durationMs: 300,
  });
  assert.deepEqual(cmd, ["__wda_http__", "device-123", "POST", "/wda/dragfromtoforduration", '{"fromX":100,"fromY":500,"toX":100,"toY":200,"duration":0.3}']);
});

test("buildHierarchyCaptureCommand returns WDA HTTP descriptor", () => {
  const backend = new WdaRealDeviceBackend();
  const cmd = backend.buildHierarchyCaptureCommand("device-123");
  assert.deepEqual(cmd, ["__wda_http__", "device-123", "GET", "/source", "{}"]);
});

test("buildScreenshotCommand returns WDA HTTP descriptor", () => {
  const backend = new WdaRealDeviceBackend();
  const cmd = backend.buildScreenshotCommand("device-123", "/tmp/screen.png");
  assert.deepEqual(cmd, ["__wda_http__", "device-123", "GET", "/screenshot", "{}"]);
});

test("transformWdaSource strips XCUIElementType prefix and maps fields", () => {
  const backend = new WdaRealDeviceBackend();
  const wdaSource = {
    type: "XCUIElementTypeButton",
    name: "Submit",
    label: "Submit button",
    value: null,
    rect: { x: 50, y: 100, width: 200, height: 50 },
    isEnabled: true,
    children: [],
  };
  const transformed = backend.transformWdaSource(wdaSource as any);
  assert.equal(transformed.type, "Button");
  assert.equal(transformed.AXLabel, "Submit");
  assert.equal(transformed.title, "Submit button");
  assert.deepEqual(transformed.frame, { x: 50, y: 100, width: 200, height: 50 });
  assert.equal(transformed.enabled, true);
  assert.deepEqual(transformed.custom_actions, ["default"]);
  assert.deepEqual(transformed.children, []);
});

test("transformWdaSource handles nested children", () => {
  const backend = new WdaRealDeviceBackend();
  const wdaSource = {
    type: "XCUIElementTypeCell",
    name: "Cell 1",
    children: [
      { type: "XCUIElementTypeStaticText", name: "Text", children: [] },
    ],
  };
  const transformed = backend.transformWdaSource(wdaSource as any);
  assert.equal(transformed.type, "Cell");
  assert.equal(transformed.custom_actions.length, 1);
  assert.equal(transformed.children.length, 1);
  assert.equal(transformed.children[0].type, "StaticText");
  assert.deepEqual(transformed.children[0].custom_actions, []);
});

test("transformWdaSource handles non-clickable types", () => {
  const backend = new WdaRealDeviceBackend();
  const wdaSource = {
    type: "XCUIElementTypeStaticText",
    name: "Label",
    children: [],
  };
  const transformed = backend.transformWdaSource(wdaSource as any);
  assert.equal(transformed.type, "StaticText");
  assert.deepEqual(transformed.custom_actions, []);
});

test("buildFailureSuggestion returns action-specific suggestions", () => {
  const backend = new WdaRealDeviceBackend();
  const suggestion = backend.buildFailureSuggestion("hierarchy", "device-123");
  assert.ok(suggestion.includes("source"));
  assert.ok(suggestion.includes("localhost:8100"));
});

test("buildFailureSuggestion returns generic suggestion for unknown action", () => {
  const backend = new WdaRealDeviceBackend();
  const suggestion = backend.buildFailureSuggestion("unknown", "device-123");
  assert.ok(suggestion.includes("WDA"));
  assert.ok(suggestion.includes("8100"));
});
