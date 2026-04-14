/**
 * Test: Full exploration cycle - terminate, launch, tap, back
 */

import { createServer } from "../packages/mcp-server/src/index.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-cycle-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  console.log("=== Full Cycle Test ===\n");

  // 1. Terminate + Relaunch
  console.log("1. Terminate...");
  await server.invoke("terminate_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  await new Promise(r => setTimeout(r, 3000));

  console.log("2. Relaunch...");
  await server.invoke("launch_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  // 2. Check home page
  let insp = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  console.log("3. Home page:", findTitle(insp.data));

  // 3. Tap each element one by one and test back
  const elementsToTest = ["General", "Accessibility", "Camera", "Privacy & Security", "iCloud"];

  for (const elem of elementsToTest) {
    console.log(`\n--- Testing: ${elem} ---`);

    // Tap
    const tap = await server.invoke("tap_element", {
      sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
      text: elem, limit: 1,
    });
    console.log(`  tap: ${tap.status} ${tap.reasonCode || ''}`);

    if (tap.status === "failed") continue;

    await server.invoke("wait_for_ui_stable", {
      sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
      timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
    });

    insp = await server.invoke("inspect_ui", {
      sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    });
    const childTitle = findTitle(insp.data);
    console.log(`  child page: ${childTitle}`);

    // Navigate back with "Settings" as parent title
    const back = await server.invoke("navigate_back", {
      sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
      target: "app",
      selector: { text: "Settings" },
    });
    console.log(`  back: ${back.status} ${back.reasonCode || ''}`);

    await server.invoke("wait_for_ui_stable", {
      sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
      timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
    });

    insp = await server.invoke("inspect_ui", {
      sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    });
    const afterTitle = findTitle(insp.data);
    console.log(`  after back: ${afterTitle || '(empty)'}`);
    console.log(`  SUCCESS: ${afterTitle === "Settings" ? "YES" : "NO"}`);

    // If back failed, try terminate + relaunch to recover
    if (back.status === "failed" || back.status === "partial" || afterTitle !== "Settings") {
      console.log("  RECOVERING: terminate + relaunch...");
      await server.invoke("terminate_app", {
        sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
        appId: "com.apple.Preferences",
      });
      await new Promise(r => setTimeout(r, 2000));
      await server.invoke("launch_app", {
        sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
        appId: "com.apple.Preferences",
      });
      await server.invoke("wait_for_ui_stable", {
        sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
        timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
      });
    }
  }
}

function findTitle(data: any): string {
  const d = typeof data === 'object' ? data : {};
  const c = typeof d?.content === "string" ? JSON.parse(d.content) : d?.content;
  const nodes = Array.isArray(c) ? c : [c];
  for (const n of nodes) {
    if (n.type === "Heading" || n.role === "AXHeading") return n.AXLabel || n.AXValue || "";
    if (n.children) {
      const t = findInTree(n.children);
      if (t) return t;
    }
  }
  return "";
}

function findInTree(nodes: any[]): string {
  for (const n of nodes) {
    if (n.type === "Heading" || n.role === "AXHeading") return n.AXLabel || n.AXValue || "";
    if (n.children) {
      const t = findInTree(n.children);
      if (t) return t;
    }
  }
  return "";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
