import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.ts";

test("createServer lists newly added UI tools", () => {
  const server = createServer();
  const tools = server.listTools();

  assert.ok(tools.includes("collect_debug_evidence"));
  assert.ok(tools.includes("collect_diagnostics"));
  assert.ok(tools.includes("describe_capabilities"));
  assert.ok(tools.includes("get_crash_signals"));
  assert.ok(tools.includes("query_ui"));
  assert.ok(tools.includes("resolve_ui_target"));
  assert.ok(tools.includes("wait_for_ui"));
  assert.ok(tools.includes("scroll_and_resolve_ui_target"));
  assert.ok(tools.includes("tap_element"));
  assert.ok(tools.includes("type_into_element"));
});

test("server invoke returns capability discovery profiles", async () => {
  const server = createServer();
  const result = await server.invoke("describe_capabilities", {
    sessionId: "server-capabilities",
    platform: "ios",
    runnerProfile: "phase1",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.capabilities.platform, "ios");
  assert.equal(result.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "partial");
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

test("server invoke keeps query_ui Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("query_ui", {
    sessionId: "server-query-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.result.totalMatches, 0);
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

test("server invoke keeps scroll_and_resolve_ui_target Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("scroll_and_resolve_ui_target", {
    sessionId: "server-scroll-dry-run",
    platform: "android",
    contentDesc: "View products",
    maxSwipes: 2,
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
  assert.equal(result.data.maxSwipes, 2);
});

test("server invoke keeps type_into_element iOS partial semantics", async () => {
  const server = createServer();
  const result = await server.invoke("type_into_element", {
    sessionId: "server-type-ios",
    platform: "ios",
    contentDesc: "View products",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "partial");
  assert.equal(result.data.resolution.status, "unsupported");
});

test("server invoke keeps tap_element iOS partial semantics", async () => {
  const server = createServer();
  const result = await server.invoke("tap_element", {
    sessionId: "server-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "partial");
  assert.equal(result.data.resolution?.status, "unsupported");
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

test("server invoke supports collect_diagnostics Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("collect_diagnostics", {
    sessionId: "server-collect-diagnostics-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.artifactCount, 0);
});

test("server invoke supports collect_debug_evidence Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("collect_debug_evidence", {
    sessionId: "server-collect-debug-evidence-dry-run",
    platform: "android",
    dryRun: true,
    query: "error",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.evidenceCount, 0);
  assert.equal(result.data.logSummary?.query, "error");
});
