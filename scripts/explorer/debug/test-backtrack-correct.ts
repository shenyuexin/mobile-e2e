/**
 * Debug script: test backtrack with correct element targeting
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-backtrack-correct-" + Date.now();
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

  // Get all clickable elements first
  const homeInspect = await mcp.inspectUi();
  const homeData = (homeInspect.data as any)?.content;
  const homeTree = typeof homeData === "string" ? JSON.parse(homeData) : homeData;
  
  console.log("\n2. Finding General element...");
  function findClickableElements(node: any, results: any[] = []): any[] {
    if (!node) return results;
    if (node.clickable && node.enabled !== false) {
      results.push({
        label: node.accessibilityLabel || node.label || node.contentDesc || node.text || "(no label)",
        elementType: node.elementType || node.className || node.accessibilityRole,
        text: node.text || node.AXValue,
        resourceId: node.resourceId,
      });
    }
    if (node.children) {
      const children = Array.isArray(node.children) ? node.children : [node.children];
      for (const child of children) {
        findClickableElements(child, results);
      }
    }
    return results;
  }
  
  const clickables = findClickableElements(homeTree);
  console.log(`   Found ${clickables.length} clickable elements:`);
  for (const el of clickables.slice(0, 20)) {
    console.log(`     - "${el.label}" (${el.elementType})`);
  }
  
  // Find "General" - it should have resourceId "com.apple.settings.general"
  const generalElement = clickables.find(el => 
    el.label.includes("General") || 
    el.resourceId?.includes("general")
  );
  console.log("\n   General element:", generalElement);

  console.log("\n3. Tapping General...");
  // Use the resourceId for more reliable targeting
  const tapResult = await mcp.tapElement({ 
    accessibilityId: "com.apple.settings.general",
    limit: 1 
  });
  console.log("   Tap result:", tapResult.status, tapResult.reasonCode);

  await mcp.waitForUiStable({ timeoutMs: 10000 });

  const afterTap = await mcp.inspectUi();
  const data = (afterTap.data as any)?.content;
  const uiTree = typeof data === "string" ? JSON.parse(data) : data;
  
  function findTitle(node: any): string | null {
    if (!node) return null;
    if (node.accessibilityRole === "AXHeading" || node.elementType === "Heading") {
      return node.accessibilityLabel || node.label || node.AXValue || null;
    }
    if (node.children) {
      const children = Array.isArray(node.children) ? node.children : [node.children];
      for (const child of children) {
        const t = findTitle(child);
        if (t) return t;
      }
    }
    return null;
  }
  
  const screenTitle = findTitle(uiTree);
  console.log("   Current screen title:", screenTitle || "(unknown)");

  console.log("\n4. navigate_back with parentPageTitle='Settings'...");
  const backResult = await mcp.navigateBack({ parentPageTitle: "Settings" });
  console.log("   Back result:", backResult.status, backResult.reasonCode);
  if (backResult.data) {
    console.log("   Back data keys:", Object.keys(backResult.data));
  }

  await mcp.waitForUiStable({ timeoutMs: 10000 });

  const afterBack = await mcp.inspectUi();
  const data2 = (afterBack.data as any)?.content;
  const uiTree2 = typeof data2 === "string" ? JSON.parse(data2) : data2;
  const homeTitle = findTitle(uiTree2);
  console.log("   After back, screen title:", homeTitle || "(unknown)");
  
  // Verify we're back on home
  const isBackHome = homeTitle === "Settings" || (homeTitle === null && screenTitle !== "General");
  console.log("   Back navigation successful:", isBackHome ? "✅ YES" : "❌ NO");

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
