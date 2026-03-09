import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.ts";

test("createServer lists newly added UI tools", () => {
  const server = createServer();
  const tools = server.listTools();

  assert.ok(tools.includes("get_crash_signals"));
  assert.ok(tools.includes("query_ui"));
  assert.ok(tools.includes("resolve_ui_target"));
  assert.ok(tools.includes("wait_for_ui"));
  assert.ok(tools.includes("scroll_and_resolve_ui_target"));
  assert.ok(tools.includes("tap_element"));
  assert.ok(tools.includes("type_into_element"));
});

test("server invoke keeps resolve_ui_target Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("resolve_ui_target", {
    sessionId: "server-resolve-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("server invoke keeps wait_for_ui iOS partial semantics", async () => {
  const server = createServer();
  const result = await server.invoke("wait_for_ui", {
    sessionId: "server-wait-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "partial");
  assert.equal(result.data.polls, 0);
});

test("server invoke supports get_crash_signals Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("get_crash_signals", {
    sessionId: "server-crash-signals-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.signalCount, 0);
});
