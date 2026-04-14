/**
 * Debug: inspect the raw UI tree structure from iOS Settings
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-inspect-structure-" + Date.now();
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
  
  // Parse the structure
  let uiTree: any;
  if (typeof data === "string") {
    uiTree = JSON.parse(data);
  } else if (typeof data === "object") {
    uiTree = data;
  }
  
  console.log("\n   Root type:", typeof uiTree);
  console.log("   Root isArray:", Array.isArray(uiTree));
  
  if (Array.isArray(uiTree)) {
    console.log("   Root length:", uiTree.length);
    console.log("\n   First 3 root elements:");
    for (let i = 0; i < Math.min(3, uiTree.length); i++) {
      console.log(`   [${i}]:`, JSON.stringify(uiTree[i], null, 2).slice(0, 300));
    }
  } else if (typeof uiTree === "object") {
    console.log("   Root keys:", Object.keys(uiTree).slice(0, 20));
    console.log("   Root:", JSON.stringify(uiTree, null, 2).slice(0, 500));
  }
  
  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
