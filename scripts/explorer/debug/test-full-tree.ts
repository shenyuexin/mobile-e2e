/**
 * Debug: print full tree structure with all properties
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-full-tree-" + Date.now();
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
  
  // Print with depth
  function printTree(node: any, depth: number = 0, prefix: string = ""): void {
    if (!node) return;
    
    const nodes = Array.isArray(node) ? node : [node];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const indent = "  ".repeat(depth);
      const label = n.AXLabel || n.label || n.title || n.AXValue || "(no label)";
      const type = n.type || n.AXRole || "(unknown)";
      const enabled = n.AXEnabled;
      const actionId = n.AXActionIdentifier || "";
      const hasChildren = (n.children || n.AXChildren) ? "✓" : "✗";
      
      console.log(`${prefix}${indent}[${i}] ${type} "${label?.toString().slice(0, 40)}" enabled=${enabled} action=${actionId} children=${hasChildren}`);
      
      const childKey = n.children ? "children" : (n.AXChildren ? "AXChildren" : null);
      if (childKey) {
        printTree(n[childKey], depth + 1, prefix);
      }
    }
  }
  
  console.log("\nFull tree:");
  printTree(uiRoot);

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
