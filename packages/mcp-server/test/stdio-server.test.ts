import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSessionRecordRelativePath } from "@mobile-e2e-mcp/core";
import { buildToolList, handleRequest } from "../src/stdio-server.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
}

test("buildToolList includes the new UI tools", () => {
  const tools = buildToolList();
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(toolNames.includes("query_ui"));
  assert.ok(toolNames.includes("capture_js_console_logs"));
  assert.ok(toolNames.includes("capture_js_network_events"));
  assert.ok(toolNames.includes("collect_debug_evidence"));
  assert.ok(toolNames.includes("list_js_debug_targets"));
  assert.ok(toolNames.includes("describe_capabilities"));
  assert.ok(toolNames.includes("measure_android_performance"));
  assert.ok(toolNames.includes("measure_ios_performance"));
  assert.ok(toolNames.includes("resolve_ui_target"));
  assert.ok(toolNames.includes("wait_for_ui"));
  assert.ok(toolNames.includes("scroll_and_resolve_ui_target"));
  assert.ok(toolNames.includes("scroll_and_tap_element"));
  assert.ok(toolNames.includes("tap_element"));
  assert.ok(toolNames.includes("tap"));
  assert.ok(toolNames.includes("type_text"));
  assert.ok(toolNames.includes("type_into_element"));
  assert.ok(toolNames.includes("run_flow"));
  assert.ok(toolNames.includes("install_app"));
  assert.ok(toolNames.includes("launch_app"));
  assert.ok(toolNames.includes("terminate_app"));
});

test("handleRequest returns stdio initialize payload", async () => {
  const result = await handleRequest({ id: 1, method: "initialize" });
  const typedResult = result as { name: string; protocol: string; tools: Array<{ name: string }> };

  assert.equal(typedResult.name, "mobile-e2e-mcp");
  assert.equal(typedResult.protocol, "minimal-stdio-v1");
  assert.ok(typedResult.tools.some((tool) => tool.name === "capture_js_console_logs"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "capture_js_network_events"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "collect_debug_evidence"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "list_js_debug_targets"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_crash_signals"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "describe_capabilities"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "measure_android_performance"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "measure_ios_performance"));
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
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.polls, 0);
});

test("handleRequest supports tools/call alias for run_flow dry-run", async () => {
  const result = await handleRequest({
    id: 8,
    method: "tools/call",
    params: {
      name: "run_flow",
      arguments: {
        sessionId: "stdio-run-flow-dry-run",
        platform: "android",
        dryRun: true,
        runCount: 1,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; runnerProfile: string };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.runnerProfile, "phase1");
});

test("handleRequest supports tools/call alias for measure_android_performance dry-run", async () => {
  const result = await handleRequest({
    id: 20,
    method: "tools/call",
    params: {
      name: "measure_android_performance",
      arguments: {
        sessionId: "stdio-android-performance-dry-run",
        runnerProfile: "phase1",
        durationMs: 4000,
        preset: "interaction",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; preset: string } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.captureMode, "time_window");
  assert.equal(typedResult.data.preset, "interaction");
});

test("handleRequest supports tools/call alias for measure_ios_performance dry-run", async () => {
  const result = await handleRequest({
    id: 21,
    method: "tools/call",
    params: {
      name: "measure_ios_performance",
      arguments: {
        sessionId: "stdio-ios-performance-dry-run",
        runnerProfile: "phase1",
        durationMs: 4000,
        template: "time-profiler",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; template: string } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.supportLevel, "partial");
  assert.equal(typedResult.data.captureMode, "time_window");
  assert.equal(typedResult.data.template, "time-profiler");
});

test("handleRequest supports tools/call alias for install_app dry-run", async () => {
  const result = await handleRequest({
    id: 9,
    method: "tools/call",
    params: {
      name: "install_app",
      arguments: {
        sessionId: "stdio-install-app-dry-run",
        platform: "android",
        runnerProfile: "native_android",
        artifactPath: "package.json",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; installCommand: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.installCommand.some((item) => item.endsWith("package.json")), true);
});

test("handleRequest supports tools/call alias for launch_app dry-run", async () => {
  const result = await handleRequest({
    id: 10,
    method: "tools/call",
    params: {
      name: "launch_app",
      arguments: {
        sessionId: "stdio-launch-app-dry-run",
        platform: "android",
        runnerProfile: "native_android",
        appId: "com.example.demo",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; launchCommand: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.launchCommand.includes("monkey"), true);
});

test("handleRequest supports tools/call alias for terminate_app dry-run", async () => {
  const result = await handleRequest({
    id: 11,
    method: "tools/call",
    params: {
      name: "terminate_app",
      arguments: {
        sessionId: "stdio-terminate-app-dry-run",
        platform: "ios",
        appId: "host.exp.Exponent",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; command: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.command[0], "xcrun");
});

test("handleRequest supports tools/call alias for iOS tap dry-run", async () => {
  const result = await handleRequest({
    id: 12,
    method: "tools/call",
    params: {
      name: "tap",
      arguments: {
        sessionId: "stdio-ios-tap-dry-run",
        platform: "ios",
        x: 12,
        y: 34,
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { command: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.deepEqual(typedResult.data.command.slice(1), ["ui", "tap", "12", "34", "--udid", "ADA078B9-3C6B-4875-8B85-A7789F368816"]);
});

test("handleRequest supports tools/call alias for iOS type_text dry-run", async () => {
  const result = await handleRequest({
    id: 13,
    method: "tools/call",
    params: {
      name: "type_text",
      arguments: {
        sessionId: "stdio-ios-type-text-dry-run",
        platform: "ios",
        text: "hello",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { command: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.deepEqual(typedResult.data.command.slice(1), ["ui", "text", "hello", "--udid", "ADA078B9-3C6B-4875-8B85-A7789F368816"]);
});


test("handleRequest supports tools/call alias for iOS scroll_and_resolve_ui_target dry-run", async () => {
  const result = await handleRequest({
    id: 17,
    method: "tools/call",
    params: {
      name: "scroll_and_resolve_ui_target",
      arguments: {
        sessionId: "stdio-ios-scroll-dry-run",
        platform: "ios",
        contentDesc: "View products",
        maxSwipes: 2,
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { supportLevel: string; resolution: { status: string }; commandHistory: string[][] };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.resolution.status, "not_executed");
  assert.equal(typedResult.data.commandHistory[1]?.includes("swipe"), true);
});

test("handleRequest supports tools/call alias for start_session", async () => {
  const result = await handleRequest({
    id: 14,
    method: "tools/call",
    params: {
      name: "start_session",
      arguments: {
        sessionId: "stdio-start-session",
        platform: "android",
        profile: "phase1",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    artifacts: string[];
    data: { sessionId: string };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.sessionId, "stdio-start-session");
  assert.equal(typedResult.artifacts.some((item) => item.endsWith("stdio-start-session.json")), true);
});

test("handleRequest supports tools/call alias for end_session", async () => {
  await handleRequest({
    id: 15,
    method: "tools/call",
    params: {
      name: "start_session",
      arguments: {
        sessionId: "stdio-end-session",
        platform: "android",
        profile: "phase1",
      },
    },
  });

  const result = await handleRequest({
    id: 16,
    method: "tools/call",
    params: {
      name: "end_session",
      arguments: {
        sessionId: "stdio-end-session",
        artifacts: ["artifacts/demo/output.txt"],
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    artifacts: string[];
    data: { closed: boolean; endedAt: string };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.closed, true);
  assert.equal(typeof typedResult.data.endedAt, "string");
  assert.equal(typedResult.artifacts.some((item) => item.endsWith("stdio-end-session.json")), true);
});

test("handleRequest denies tap under a read-only session policy", async () => {
  const sessionId = `stdio-read-only-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  try {
    await handleRequest({
      id: 18,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          profile: "phase1",
          policyProfile: "read-only",
        },
      },
    });

    const result = await handleRequest({
      id: 19,
      method: "tools/call",
      params: {
        name: "tap",
        arguments: {
          sessionId,
          platform: "android",
          x: 10,
          y: 20,
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "POLICY_DENIED");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest supports tools/list alias", async () => {
  const result = await handleRequest({ id: 3, method: "tools/list" });
  const typedResult = result as Array<{ name: string }>;

  assert.ok(typedResult.some((tool) => tool.name === "query_ui"));
  assert.ok(typedResult.some((tool) => tool.name === "capture_js_console_logs"));
  assert.ok(typedResult.some((tool) => tool.name === "capture_js_network_events"));
  assert.ok(typedResult.some((tool) => tool.name === "collect_debug_evidence"));
  assert.ok(typedResult.some((tool) => tool.name === "list_js_debug_targets"));
  assert.ok(typedResult.some((tool) => tool.name === "measure_android_performance"));
  assert.ok(typedResult.some((tool) => tool.name === "measure_ios_performance"));
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
