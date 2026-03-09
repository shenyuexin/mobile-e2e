import assert from "node:assert/strict";
import test from "node:test";
import { buildToolList, handleRequest } from "../src/stdio-server.ts";

test("buildToolList includes the new UI tools", () => {
  const tools = buildToolList();
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(toolNames.includes("query_ui"));
  assert.ok(toolNames.includes("collect_debug_evidence"));
  assert.ok(toolNames.includes("describe_capabilities"));
  assert.ok(toolNames.includes("resolve_ui_target"));
  assert.ok(toolNames.includes("wait_for_ui"));
  assert.ok(toolNames.includes("scroll_and_resolve_ui_target"));
  assert.ok(toolNames.includes("scroll_and_tap_element"));
  assert.ok(toolNames.includes("tap_element"));
  assert.ok(toolNames.includes("type_into_element"));
});

test("handleRequest returns stdio initialize payload", async () => {
  const result = await handleRequest({ id: 1, method: "initialize" });
  const typedResult = result as { name: string; protocol: string; tools: Array<{ name: string }> };

  assert.equal(typedResult.name, "mobile-e2e-mcp");
  assert.equal(typedResult.protocol, "minimal-stdio-v1");
  assert.ok(typedResult.tools.some((tool) => tool.name === "collect_debug_evidence"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_crash_signals"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "describe_capabilities"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "wait_for_ui"));
});

test("handleRequest supports tools/call alias for describe_capabilities", async () => {
  const result = await handleRequest({
    id: 7,
    method: "tools/call",
    params: {
      name: "describe_capabilities",
      arguments: {
        sessionId: "stdio-capabilities",
        platform: "android",
        runnerProfile: "phase1",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { capabilities: { platform: string; toolCapabilities: Array<{ toolName: string; supportLevel: string }> } };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.capabilities.platform, "android");
  assert.equal(typedResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
});

test("handleRequest supports tools/call alias for resolve_ui_target", async () => {
  const result = await handleRequest({
    id: 2,
    method: "tools/call",
    params: {
      name: "resolve_ui_target",
      arguments: {
        sessionId: "stdio-resolve-dry-run",
        platform: "android",
        contentDesc: "View products",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { supportLevel: string; resolution: { status: string } };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.resolution.status, "not_executed");
});

test("handleRequest supports tools/call alias for wait_for_ui", async () => {
  const result = await handleRequest({
    id: 6,
    method: "tools/call",
    params: {
      name: "wait_for_ui",
      arguments: {
        sessionId: "stdio-wait-ios",
        platform: "ios",
        contentDesc: "View products",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { supportLevel: string; polls: number };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.supportLevel, "partial");
  assert.equal(typedResult.data.polls, 0);
});

test("handleRequest supports tools/list alias", async () => {
  const result = await handleRequest({ id: 3, method: "tools/list" });
  const typedResult = result as Array<{ name: string }>;

  assert.ok(typedResult.some((tool) => tool.name === "query_ui"));
  assert.ok(typedResult.some((tool) => tool.name === "collect_debug_evidence"));
  assert.ok(typedResult.some((tool) => tool.name === "wait_for_ui"));
});

test("handleRequest rejects invoke calls without an object payload", async () => {
  await assert.rejects(
    () => handleRequest({ id: 4, method: "invoke", params: null }),
    /invoke requires an object params payload/,
  );
});

test("handleRequest rejects unsupported stdio methods", async () => {
  await assert.rejects(
    () => handleRequest({ id: 5, method: "bogus_method" }),
    /Unsupported stdio method: bogus_method/,
  );
});
