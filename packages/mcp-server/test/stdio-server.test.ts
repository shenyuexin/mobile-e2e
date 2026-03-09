import assert from "node:assert/strict";
import test from "node:test";
import { buildToolList, handleRequest } from "../src/stdio-server.ts";

test("buildToolList includes the new UI tools", () => {
  const tools = buildToolList();
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(toolNames.includes("query_ui"));
  assert.ok(toolNames.includes("resolve_ui_target"));
  assert.ok(toolNames.includes("wait_for_ui"));
  assert.ok(toolNames.includes("scroll_and_resolve_ui_target"));
  assert.ok(toolNames.includes("tap_element"));
  assert.ok(toolNames.includes("type_into_element"));
});

test("handleRequest returns stdio initialize payload", async () => {
  const result = await handleRequest({ id: 1, method: "initialize" });
  const typedResult = result as { name: string; protocol: string; tools: Array<{ name: string }> };

  assert.equal(typedResult.name, "mobile-e2e-mcp");
  assert.equal(typedResult.protocol, "minimal-stdio-v1");
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_crash_signals"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "wait_for_ui"));
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
