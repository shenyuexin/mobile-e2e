/**
 * Simplified test: Find and tap external link, check pid/AXLabel change
 */

import { execSync } from "child_process";

const DEVICE_ID = "ADA078B9-3C6B-4875-8B85-A7789F368816";

async function main(): Promise<void> {
  const { createServer } = await import("../packages/mcp-server/src/index.js");
  const { createMcpAdapter } = await import("../packages/explorer/src/mcp-adapter.js");
  const { createSnapshotter } = await import("../packages/explorer/src/snapshot.js");
  const { buildDefaultConfig } = await import("../packages/explorer/src/config.js");

  const server = createServer();
  const sessionId = "test-simple-" + Date.now();
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

  // Terminate and relaunch for clean state
  console.log("1. Terminating Settings...");
  try { execSync(`xcrun simctl terminate ${DEVICE_ID} com.apple.Preferences`, { stdio: "pipe" }); } catch {}
  await new Promise(r => setTimeout(r, 2000));

  console.log("2. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  // Get Settings pid/AXLabel
  const homeSnap = await snapshotter.captureSnapshot(config);
  console.log(`   Home: screenTitle="${homeSnap.screenTitle}", appId="${homeSnap.appId}"`);

  // Navigate: General > About > Certificate Trust Settings
  console.log("3. Navigating to Certificate Trust Settings...");
  await mcp.tapElement({ resourceId: "com.apple.settings.general" });
  await new Promise(r => setTimeout(r, 2000));
  await mcp.tapElement({ resourceId: "com.apple.settings.about" });
  await new Promise(r => setTimeout(r, 2000));
  await mcp.tapElement({ text: "Certificate Trust Settings" });
  await new Promise(r => setTimeout(r, 3000));

  // Check certificate page elements
  const certSnap = await snapshotter.captureSnapshot(config);
  console.log(`   Certificate: screenTitle="${certSnap.screenTitle}"`);
  console.log(`   Clickable elements: ${certSnap.clickableElements.length}`);
  for (let i = 0; i < certSnap.clickableElements.length; i++) {
    const el = certSnap.clickableElements[i];
    console.log(`     [${i}] "${el.label}" (type=${el.elementType}, isExternalLink=${el.isExternalLink})`);
  }

  // Find "Learn more" link
  const learnMore = certSnap.clickableElements.find(el =>
    el.label.toLowerCase().includes("learn more") ||
    el.isExternalLink
  );

  if (!learnMore) {
    console.log("   No 'Learn more' found on Certificate page!");
    console.log("   Let me dump the full UI tree to see what's on this page...");
    
    const inspectResult = await mcp.inspectUi();
    const data = (inspectResult.data as any)?.content;
    const tree = typeof data === "string" ? JSON.parse(data) : data;
    
    // Find all elements with "learn" or "link" in label
    function findElements(node: any, results: any[] = []): any[] {
      if (!node) return results;
      if (Array.isArray(node)) {
        node.forEach(child => findElements(child, results));
        return results;
      }
      const label = node.AXLabel || node.label || node.title || "";
      const type = node.type || node.className || node.elementType || "";
      if (label.toLowerCase().includes("learn") || type.toLowerCase().includes("link")) {
        results.push({ label, type, clickable: node.clickable, role: node.role });
      }
      if (node.children || node.AXChildren) {
        const children = node.children || node.AXChildren;
        (Array.isArray(children) ? children : [children]).forEach(child => findElements(child, results));
      }
      return results;
    }
    
    const allElements = findElements(tree);
    console.log(`   All "learn"/"link" elements: ${allElements.length}`);
    for (const el of allElements) {
      console.log(`     - label="${el.label}", type="${el.type}", clickable=${el.clickable}, role="${el.role}"`);
    }
    
    if (allElements.length === 0) {
      console.log("   No such elements at all. Maybe this iOS version doesn't have external links here.");
      console.log("   Let me try General -> About -> Legal page instead...");
      
      // Navigate: General -> About
      await mcp.navigateBack({ target: "app", selector: { text: "Settings" } });
      await new Promise(r => setTimeout(r, 3000));
      await mcp.tapElement({ resourceId: "com.apple.settings.general" });
      await new Promise(r => setTimeout(r, 2000));
      await mcp.tapElement({ resourceId: "com.apple.settings.about" });
      await new Promise(r => setTimeout(r, 3000));
      
      const aboutSnap = await snapshotter.captureSnapshot(config);
      console.log(`   About: screenTitle="${aboutSnap.screenTitle}"`);
      console.log(`   About clickable elements:`);
      for (let i = 0; i < aboutSnap.clickableElements.length; i++) {
        const el = aboutSnap.clickableElements[i];
        console.log(`     [${i}] "${el.label}" (type=${el.elementType}, isExternalLink=${el.isExternalLink})`);
      }
    }
    
    await server.dispose?.();
    return;
  }

  console.log(`\n4. Tapping "${learnMore.label}"...`);
  const tapArgs: any = {};
  if (learnMore.selector.resourceId) tapArgs.resourceId = learnMore.selector.resourceId;
  if (learnMore.selector.contentDesc) tapArgs.contentDesc = learnMore.selector.contentDesc;
  if (learnMore.selector.text) tapArgs.text = learnMore.selector.text;
  
  const tapResult = await mcp.tapElement(tapArgs);
  console.log(`   Tap result: ${tapResult.status} ${tapResult.reasonCode}`);
  
  // Wait for potential app switch
  console.log("   Waiting 5s for app switch...");
  await new Promise(r => setTimeout(r, 5000));

  // Check pid/AXLabel after tap
  const afterSnap = await snapshotter.captureSnapshot(config);
  console.log(`\n5. After tap:`);
  console.log(`   screenTitle="${afterSnap.screenTitle}"`);
  console.log(`   appId="${afterSnap.appId}"`);
  console.log(`   isExternalApp=${afterSnap.isExternalApp}`);
  console.log(`   App switched: ${afterSnap.appId !== homeSnap.appId ? "✅ YES" : "❌ NO"}`);

  // Also inspect raw UI tree for Application node
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
        if (found && !node._found) {
          node._found = found;
        }
      });
      return node._found || null;
    }
    return null;
  }
  
  const appNode = findAppNode(tree);
  if (appNode) {
    console.log(`\n   Application node:`);
    console.log(`   pid: ${appNode.pid}`);
    console.log(`   AXLabel: ${appNode.AXLabel}`);
    console.log(`   type: ${appNode.type}`);
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
