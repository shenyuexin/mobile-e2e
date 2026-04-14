/**
 * Check what extractScreenTitle returns for Settings home page
 */

import { createServer } from "../packages/mcp-server/src/index.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-title-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  // Terminate + relaunch for clean state
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

  const insp = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const d = insp.data as any;
  const c = typeof d?.content === "string" ? JSON.parse(d.content) : d?.content;
  const nodes = Array.isArray(c) ? c : [c];

  // Find all Heading and StaticText elements
  function findHeadings(ns: any[], depth = 0): string[] {
    const r: string[] = [];
    for (const n of ns) {
      const t = n.type || "";
      const role = n.role || "";
      const label = n.AXLabel || n.AXValue || "";
      if ((t === "Heading" || t === "StaticText" || role === "AXHeading" || role === "AXStaticText") && label) {
        r.push("  ".repeat(depth) + label + " (type=" + t + ", role=" + role + ")");
      }
      if (n.children) r.push(...findHeadings(n.children, depth + 1));
    }
    return r;
  }
  console.log("Heading/StaticText elements:");
  findHeadings(nodes).slice(0, 10).forEach(l => console.log(l));

  // Now test extractScreenTitle from explorer
  const { extractScreenTitle } = await import("../packages/explorer/src/snapshot.js");
  const { flattenTree } = await import("../packages/explorer/src/element-prioritizer.js");

  // Parse uiTree into UiHierarchy format
  const { normalizeToUiHierarchy } = await import("../packages/explorer/src/snapshot.js");

  // The explorer uses normalizeToUiHierarchy internally
  // Let's just check what extractScreenTitle sees
  console.log("\nextractScreenTitle result:");

  // We need to parse the nodes into UiHierarchy
  // Let me just check the raw axe output
  console.log("Raw content type:", typeof d?.content);
  if (typeof d?.content === "string") {
    console.log("Content length:", d.content.length);
    const parsed = JSON.parse(d.content);
    console.log("Parsed type:", Array.isArray(parsed) ? "array" : typeof parsed);
    if (Array.isArray(parsed)) {
      console.log("Root node count:", parsed.length);
      if (parsed.length > 0) {
        console.log("First root type:", parsed[0]?.type, "label:", parsed[0]?.AXLabel);
        console.log("First root children count:", parsed[0]?.children?.length);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
