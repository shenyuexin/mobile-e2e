/**
 * Debug: check what extractAppId returns after tapping "Learn more"
 */

import { execSync } from "child_process";

const DEVICE_ID = "ADA078B9-3C6B-4875-8B85-A7789F368816";

async function main(): Promise<void> {
  const { createServer } = await import("../packages/mcp-server/src/index.js");
  const { createMcpAdapter } = await import("../packages/explorer/src/mcp-adapter.js");
  const { createSnapshotter } = await import("../packages/explorer/src/snapshot.js");
  const { buildDefaultConfig } = await import("../packages/explorer/src/config.js");
  const { extractAppId } = await import("../packages/explorer/src/snapshot.js");

  const server = createServer();
  const sessionId = "debug-extract-" + Date.now();
  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId: DEVICE_ID,
  };
  const mcp = createMcpAdapter(server, sessionCtx);
  const snapshotter = createSnapshotter(mcp);
  const config = buildDefaultConfig({
    appId: "com.apple.Preferences",
    platform: "ios-simulator",
    mode: "smoke",
  });

  // Clean state
  try { execSync(`xcrun simctl terminate ${DEVICE_ID} com.apple.Preferences`, { stdio: "pipe" }); } catch {}
  await new Promise(r => setTimeout(r, 2000));

  console.log("1. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  const homeSnap = await snapshotter.captureSnapshot(config);
  console.log(`   Home: appId="${homeSnap.appId}"`);

  // Navigate to Certificate Trust Settings
  console.log("\n2. Navigating to Certificate Trust Settings...");
  await mcp.tapElement({ resourceId: "com.apple.settings.general" });
  await new Promise(r => setTimeout(r, 2000));
  await mcp.tapElement({ resourceId: "com.apple.settings.about" });
  await new Promise(r => setTimeout(r, 2000));
  await mcp.tapElement({ text: "Certificate Trust Settings" });
  await new Promise(r => setTimeout(r, 3000));

  const certSnap = await snapshotter.captureSnapshot(config);
  console.log(`   Certificate: appId="${certSnap.appId}"`);
  console.log(`   Certificate clickable: ${certSnap.clickableElements.length}`);
  for (const el of certSnap.clickableElements) {
    console.log(`     - "${el.label}" (type=${el.elementType}, isExternalLink=${el.isExternalLink})`);
  }

  // Find and tap "Learn more"
  const learnMore = certSnap.clickableElements.find(el =>
    el.label.toLowerCase().includes("learn more") || el.isExternalLink
  );
  
  if (!learnMore) {
    console.log("   No 'Learn more' found. Let me inspect the raw UI tree...");
    const inspectResult = await mcp.inspectUi();
    const data = (inspectResult.data as any)?.content;
    const tree = typeof data === "string" ? JSON.parse(data) : data;
    
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
      if (className === "Application") return { ...node, _depth: depth };
      if (node.children || node.AXChildren) {
        const children = node.children || node.AXChildren;
        (Array.isArray(children) ? children : [children]).forEach(child => {
          const found = findAppNode(child, depth + 1);
          if (found && !node._found) node._found = found;
        });
        return node._found || null;
      }
      return null;
    }
    
    const appNode = findAppNode(tree);
    if (appNode) {
      console.log(`   Application node at depth ${appNode._depth}:`);
      console.log(`     className: ${appNode.className}`);
      console.log(`     type: ${appNode.type}`);
      console.log(`     AXLabel: ${appNode.AXLabel}`);
      console.log(`     pid: ${appNode.pid}`);
    } else {
      console.log("   No Application node found in UI tree!");
      console.log(`   Root is: ${Array.isArray(tree) ? 'array' : typeof tree}`);
    }
    
    await server.dispose?.();
    return;
  }

  console.log(`\n3. Tapping "${learnMore.label}"...`);
  const tapArgs: any = {};
  if (learnMore.selector.resourceId) tapArgs.resourceId = learnMore.selector.resourceId;
  if (learnMore.selector.contentDesc) tapArgs.contentDesc = learnMore.selector.contentDesc;
  if (learnMore.selector.text) tapArgs.text = learnMore.selector.text;
  
  const tapResult = await mcp.tapElement(tapArgs);
  console.log(`   Tap: ${tapResult.status} ${tapResult.reasonCode}`);

  console.log("   Waiting 5s for app switch...");
  await new Promise(r => setTimeout(r, 5000));

  // Check appId
  const afterSnap = await snapshotter.captureSnapshot(config);
  console.log(`\n4. After tap:`);
  console.log(`   appId="${afterSnap.appId}"`);
  console.log(`   screenTitle="${afterSnap.screenTitle}"`);
  console.log(`   isExternalApp=${afterSnap.isExternalApp}`);

  // Also check raw UI tree for Application node
  const inspectResult = await mcp.inspectUi();
  const data = (inspectResult.data as any)?.content;
  const tree = typeof data === "string" ? JSON.parse(data) : data;
  
  function findAppNode(node: any): any | null {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findAppNode(child);
        if (found) return found;
      }
      return null;
    }
    const className = node.className || node.type || node.elementType;
    if (className === "Application") return node;
    if (node.children || node.AXChildren) {
      const children = node.children || node.AXChildren;
      (Array.isArray(children) ? children : [children]).forEach(child => {
        const found = findAppNode(child);
        if (found && !node._found) node._found = found;
      });
      return node._found || null;
    }
    return null;
  }
  
  const appNode = findAppNode(tree);
  if (appNode) {
    console.log(`\n   Raw Application node:`);
    console.log(`   className: ${appNode.className}`);
    console.log(`   type: ${appNode.type}`);
    console.log(`   elementType: ${appNode.elementType}`);
    console.log(`   AXLabel: "${appNode.AXLabel}"`);
    console.log(`   pid: ${appNode.pid}`);
  } else {
    console.log("   No Application node found!");
  }

  // Test extractAppId directly
  console.log(`\n5. Testing extractAppId directly...`);
  // We can't easily call extractAppId here since it's internal to snapshotter
  // But we can see what appId was captured

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
