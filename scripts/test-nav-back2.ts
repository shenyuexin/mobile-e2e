/**
 * Test: terminate + relaunch + check home page buttons
 */

import { createServer } from "../packages/mcp-server/src/index.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "cleanup-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  console.log("1. Terminate Settings...");
  await server.invoke("terminate_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log("2. Relaunch Settings...");
  const l = await server.invoke("launch_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  console.log("   launch:", l.status);

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const insp = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const d = insp.data as any;
  const c = typeof d?.content === "string" ? JSON.parse(d.content) : d?.content;
  const nodes = Array.isArray(c) ? c : [c];

  function findBtns(ns: any[], depth = 0): string[] {
    const r: string[] = [];
    for (const n of ns) {
      if ((n.type === "Button" || n.role === "AXButton") && n.AXLabel) {
        r.push("  ".repeat(depth) + n.AXLabel);
      }
      if (n.children) r.push(...findBtns(n.children, depth + 1));
    }
    return r;
  }

  console.log("\nButtons on home page:");
  findBtns(nodes).forEach(b => console.log(b));

  // Now tap General
  console.log("\n3. Tap General...");
  const tap = await server.invoke("tap_element", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    text: "General", limit: 1,
  });
  console.log("   tap:", tap.status, tap.reasonCode);

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const insp2 = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const d2 = insp2.data as any;
  const c2 = typeof d2?.content === "string" ? JSON.parse(d2.content) : d2?.content;
  const nodes2 = Array.isArray(c2) ? c2 : [c2];

  console.log("\nButtons on General page:");
  findBtns(nodes2).forEach(b => console.log(b));

  // Now navigate_back
  console.log("\n4. navigate_back with selector {text: 'Settings'}...");
  const back = await server.invoke("navigate_back", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    target: "app",
    selector: { text: "Settings" },
  });
  console.log("   back:", back.status, back.reasonCode);

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const insp3 = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const d3 = insp3.data as any;
  const c3 = typeof d3?.content === "string" ? JSON.parse(d3.content) : d3?.content;
  const nodes3 = Array.isArray(c3) ? c3 : [c3];

  console.log("\nAfter back, buttons:");
  findBtns(nodes3).forEach(b => console.log(b));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
