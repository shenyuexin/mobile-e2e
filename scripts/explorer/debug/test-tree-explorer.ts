/**
 * Debug: explore the full tree structure and find clickable elements
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-tree-explorer-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId,
  };

  const mcp = createMcpAdapter(server, sessionCtx);

  console.log("1. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  console.log("2. Inspecting UI...");
  const inspectResult = await mcp.inspectUi();
  const data = (inspectResult.data as any)?.content;
  const uiRoot = typeof data === "string" ? JSON.parse(data) : data;
  
  // Flatten tree to find all clickable elements
  function flattenTree(node: any, depth: number = 0, results: any[] = []): any[] {
    if (!node) return results;
    
    const nodes = Array.isArray(node) ? node : [node];
    for (const n of nodes) {
      results.push({ ...n, _depth: depth });
      if (n.children) {
        flattenTree(n.children, depth + 1, results);
      } else if (n.AXChildren) {
        flattenTree(n.AXChildren, depth + 1, results);
      }
    }
    return results;
  }
  
  const allNodes = flattenTree(uiRoot);
  console.log(`\n   Total nodes: ${allNodes.length}`);
  
  // Find clickable/enabled elements
  const clickableNodes = allNodes.filter(n => 
    n.AXEnabled === true && 
    (n.AXActionIdentifier === "AXButton" || n.type === "Button" || n.clickable === true)
  );
  
  console.log(`\n   Clickable/Button elements: ${clickableNodes.length}`);
  for (const btn of clickableNodes.slice(0, 20)) {
    const label = btn.AXLabel || btn.label || btn.title || btn.AXValue || "(no label)";
    const type = btn.type || btn.AXRole || "(unknown)";
    const resourceId = btn.AXUniqueId || "(no id)";
    console.log(`     [${btn._depth}] "${label.slice(0, 50)}" (${type}) id:${resourceId.slice(0, 30)}`);
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
