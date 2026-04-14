/**
 * Quick test: navigate_back on iOS Settings app
 */

import { createServer } from "../packages/mcp-server/src/index.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-nav-back-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  console.log("1. Launching Settings...");
  const launch = await server.invoke("launch_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  console.log("   launch:", launch.status, launch.reasonCode);

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  console.log("2. Tapping General...");
  const tap = await server.invoke("tap_element", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    text: "General", limit: 1,
  });
  console.log("   tap:", tap.status, tap.reasonCode);

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const inspect1 = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const data1 = inspect1.data as any;
  const content1 = typeof data1?.content === "string" ? JSON.parse(data1.content) : data1?.content;
  console.log("   After tap, page title:", findTitle(Array.isArray(content1) ? content1 : [content1]));

  console.log("3. navigate_back with selector {text: 'Settings'}...");
  const back = await server.invoke("navigate_back", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    target: "app",
    selector: { text: "Settings" },
  });
  console.log("   back:", back.status, back.reasonCode);
  console.log("   data:", JSON.stringify(back.data, null, 2).slice(0, 300));

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const inspect2 = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const data2 = inspect2.data as any;
  const content2 = typeof data2?.content === "string" ? JSON.parse(data2.content) : data2?.content;
  console.log("   After back, page title:", findTitle(Array.isArray(content2) ? content2 : [content2]));
}

function findTitle(nodes: any[]): string {
  for (const n of nodes) {
    if (n.type === "Heading" || n.role === "AXHeading") return n.AXLabel || n.AXValue || "";
    if (n.children) {
      const t = findTitle(n.children);
      if (t) return t;
    }
  }
  return "";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
