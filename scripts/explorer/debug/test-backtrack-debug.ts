/**
 * Debug script: test the explorer's MCP adapter navigate_back behavior
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-backtrack-debug-" + Date.now();
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

  const homeInspect = await mcp.inspectUi();
  console.log("   Home screen loaded");

  console.log("2. Tapping General via adapter...");
  const tapResult = await mcp.tapElement({ text: "General", limit: 1 });
  console.log("   Tap result:", tapResult.status, tapResult.reasonCode);

  await mcp.waitForUiStable({ timeoutMs: 10000 });

  const afterTap = await mcp.inspectUi();
  const data = (afterTap.data as any)?.content;
  const uiTree = typeof data === "string" ? JSON.parse(data) : data;
  
  // Find screen title
  function findTitle(node: any): string | null {
    if (!node) return null;
    if (node.accessibilityRole === "AXHeading" || node.elementType === "Heading") {
      return node.accessibilityLabel || node.label || node.AXValue || null;
    }
    if (node.children) {
      for (const child of Array.isArray(node.children) ? node.children : [node.children]) {
        const t = findTitle(child);
        if (t) return t;
      }
    }
    return null;
  }
  
  console.log("   Current screen title:", findTitle(uiTree) || "(unknown)");

  console.log("3. navigate_back with parentPageTitle='Settings'...");
  const backResult = await mcp.navigateBack({ parentPageTitle: "Settings" });
  console.log("   Back result:", backResult.status, backResult.reasonCode);
  console.log("   Back data:", JSON.stringify(backResult.data, null, 2).slice(0, 400));

  await mcp.waitForUiStable({ timeoutMs: 10000 });

  const afterBack = await mcp.inspectUi();
  const data2 = (afterBack.data as any)?.content;
  const uiTree2 = typeof data2 === "string" ? JSON.parse(data2) : data2;
  console.log("   After back, screen title:", findTitle(uiTree2) || "(unknown)");

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
