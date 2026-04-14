/**
 * Debug: inspect what bundle ID fields are available in iOS axe UI tree
 * Launch Settings > Certificate Trust Settings > "Learn more" link (opens Safari)
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";
import { createSnapshotter } from "../packages/explorer/src/snapshot.js";
import { buildDefaultConfig } from "../packages/explorer/src/config.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-app-switch-debug-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId,
  };

  const mcp = createMcpAdapter(server, sessionCtx);
  const snapshotter = createSnapshotter(mcp);
  
  const config = buildDefaultConfig({
    appId: "com.apple.Preferences",
    platform: "ios-simulator",
    mode: "smoke",
  });

  console.log("1. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  // Navigate to General
  console.log("2. Tapping General...");
  await mcp.tapElement({ resourceId: "com.apple.settings.general" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  // Navigate to About
  console.log("3. Tapping About...");
  await mcp.tapElement({ resourceId: "com.apple.settings.about" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  // Navigate to Certificate Trust Settings
  console.log("4. Tapping Certificate Trust Settings...");
  await mcp.tapElement({ text: "Certificate Trust Settings" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  // Check current page
  const certSnapshot = await snapshotter.captureSnapshot(config);
  console.log(`   Certificate page: ${certSnapshot.screenTitle}`);
  console.log(`   AppId: ${certSnapshot.appId}`);
  console.log(`   IsExternal: ${certSnapshot.isExternalApp}`);
  console.log(`   Clickable elements:`);
  for (const el of certSnapshot.clickableElements) {
    console.log(`     - "${el.label}" (${el.elementType}) resourceId=${el.selector.resourceId || '(none)'}`);
  }

  // Find and tap "Learn more" link
  const learnMore = certSnapshot.clickableElements.find(el => 
    el.label.includes("Learn more") || el.label.includes("learn more")
  );
  if (!learnMore) {
    console.log("   Learn more element not found, skipping");
    await server.dispose?.();
    return;
  }

  console.log(`\n5. Tapping "${learnMore.label}"...`);
  const tapArgs: any = {};
  if (learnMore.selector.resourceId) tapArgs.resourceId = learnMore.selector.resourceId;
  if (learnMore.selector.contentDesc) tapArgs.contentDesc = learnMore.selector.contentDesc;
  if (learnMore.selector.text) tapArgs.text = learnMore.selector.text;
  
  const tapResult = await mcp.tapElement(tapArgs);
  console.log(`   Tap result: ${tapResult.status} ${tapResult.reasonCode}`);
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  // Check what app we're in now
  const afterTapSnapshot = await snapshotter.captureSnapshot(config);
  console.log(`\n6. After tap, page: ${afterTapSnapshot.screenTitle}`);
  console.log(`   AppId: ${afterTapSnapshot.appId}`);
  console.log(`   IsExternal: ${afterTapSnapshot.isExternalApp}`);

  // Dump the full UI tree root to see bundle ID fields
  const data = await mcp.inspectUi();
  const rawTree = (data.data as any)?.content;
  const parsed = typeof rawTree === "string" ? JSON.parse(rawTree) : rawTree;
  
  // Print full Application node with all values
  function findAppNode(node: any, depth: number = 0): any | null {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findAppNode(child, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const className = node.className || node.type || node.elementType;
    if (className === "Application") {
      return node;
    }
    if (node.children || node.AXChildren) {
      const children = node.children || node.AXChildren;
      const childArray = Array.isArray(children) ? children : [children];
      for (const child of childArray) {
        const found = findAppNode(child, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  
  const appNode = findAppNode(parsed);
  if (appNode) {
    console.log("\n7. Application node FULL dump:");
    console.log(JSON.stringify(appNode, (key, value) => {
      // Skip children to keep output compact
      if (key === "children" || key === "AXChildren") return "[...]";
      return value;
    }, 2));
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
