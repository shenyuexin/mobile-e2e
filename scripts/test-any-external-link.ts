/**
 * Find any external link in Settings and test pid detection
 */

const DEVICE_ID = "ADA078B9-3C6B-4875-8B85-A7789F368816";

async function main(): Promise<void> {
  const { createServer } = await import("../packages/mcp-server/src/index.js");
  const { createMcpAdapter } = await import("../packages/explorer/src/mcp-adapter.js");
  const { createSnapshotter } = await import("../packages/explorer/src/snapshot.js");
  const { buildDefaultConfig } = await import("../packages/explorer/src/config.js");

  const server = createServer();
  const sessionId = "test-any-link-" + Date.now();
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

  // Terminate and relaunch
  const { execSync } = await import("child_process");
  try { execSync(`xcrun simctl terminate ${DEVICE_ID} com.apple.Preferences`, { stdio: "pipe" }); } catch {}
  await new Promise(r => setTimeout(r, 2000));

  console.log("1. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  const homeSnap = await snapshotter.captureSnapshot(config);
  const homeAppId = homeSnap.appId;
  console.log(`   Home: title="${homeSnap.screenTitle}", appId="${homeAppId}"`);
  console.log(`   Home clickable (${homeSnap.clickableElements.length}):`);
  for (const el of homeSnap.clickableElements.slice(0, 13)) {
    console.log(`     - "${el.label}" (isExternalLink=${el.isExternalLink})`);
  }

  // Navigate: General > About
  console.log("\n2. Tapping General...");
  await mcp.tapElement({ resourceId: "com.apple.settings.general" });
  await new Promise(r => setTimeout(r, 2000));
  
  const generalSnap = await snapshotter.captureSnapshot(config);
  console.log(`   General: title="${generalSnap.screenTitle}", appId="${generalSnap.appId}"`);
  console.log(`   General clickable (${generalSnap.clickableElements.length}):`);
  for (const el of generalSnap.clickableElements) {
    console.log(`     - "${el.label}" (isExternalLink=${el.isExternalLink})`);
  }

  // Find external links on General page
  const externalLinks = generalSnap.clickableElements.filter(el => el.isExternalLink);
  if (externalLinks.length > 0) {
    console.log(`\n3. Found ${externalLinks.length} external link(s) on General page:`);
    for (const el of externalLinks) {
      console.log(`     - "${el.label}"`);
    }

    // Tap first external link
    const extLink = externalLinks[0];
    console.log(`\n4. Tapping "${extLink.label}"...`);
    const tapArgs: any = {};
    if (extLink.selector.resourceId) tapArgs.resourceId = extLink.selector.resourceId;
    if (extLink.selector.contentDesc) tapArgs.contentDesc = extLink.selector.contentDesc;
    if (extLink.selector.text) tapArgs.text = extLink.selector.text;

    const tapResult = await mcp.tapElement(tapArgs);
    console.log(`   Tap: ${tapResult.status} ${tapResult.reasonCode}`);
    
    console.log("   Waiting 5s for app switch...");
    await new Promise(r => setTimeout(r, 5000));

    const afterSnap = await snapshotter.captureSnapshot(config);
    console.log(`\n5. After tap:`);
    console.log(`   screenTitle="${afterSnap.screenTitle}"`);
    console.log(`   appId="${afterSnap.appId}"`);
    console.log(`   isExternalApp=${afterSnap.isExternalApp}`);
    console.log(`   App switched (appId changed): ${afterSnap.appId !== homeAppId ? "✅ YES" : "❌ NO"}`);
  } else {
    console.log("   No external links on General page. Let me check About page...");
    
    // Tap About
    console.log("\n3. Tapping About...");
    await mcp.tapElement({ resourceId: "com.apple.settings.about" });
    await new Promise(r => setTimeout(r, 2000));

    const aboutSnap = await snapshotter.captureSnapshot(config);
    console.log(`   About: title="${aboutSnap.screenTitle}", appId="${aboutSnap.appId}"`);
    console.log(`   About clickable (${aboutSnap.clickableElements.length}):`);
    for (const el of aboutSnap.clickableElements) {
      console.log(`     - "${el.label}" (type=${el.elementType}, isExternalLink=${el.isExternalLink})`);
    }

    // Find external links on About page
    const aboutExternalLinks = aboutSnap.clickableElements.filter(el => el.isExternalLink);
    if (aboutExternalLinks.length > 0) {
      console.log(`\n4. Found ${aboutExternalLinks.length} external link(s):`);
      for (const el of aboutExternalLinks) {
        console.log(`     - "${el.label}"`);
      }

      const extLink = aboutExternalLinks[0];
      console.log(`\n5. Tapping "${extLink.label}"...`);
      const tapArgs: any = {};
      if (extLink.selector.resourceId) tapArgs.resourceId = extLink.selector.resourceId;
      if (extLink.selector.contentDesc) tapArgs.contentDesc = extLink.selector.contentDesc;
      if (extLink.selector.text) tapArgs.text = extLink.selector.text;

      const tapResult = await mcp.tapElement(tapArgs);
      console.log(`   Tap: ${tapResult.status} ${tapResult.reasonCode}`);
      
      console.log("   Waiting 5s for app switch...");
      await new Promise(r => setTimeout(r, 5000));

      const afterSnap = await snapshotter.captureSnapshot(config);
      console.log(`\n6. After tap:`);
      console.log(`   screenTitle="${afterSnap.screenTitle}"`);
      console.log(`   appId="${afterSnap.appId}"`);
      console.log(`   isExternalApp=${afterSnap.isExternalApp}`);
      console.log(`   App switched: ${afterSnap.appId !== homeAppId ? "✅ YES" : "❌ NO"}`);
    } else {
      console.log("   No external links on About page either.");
      console.log("   Let me dump ALL elements on About page to see what's there:");
      const inspectResult = await mcp.inspectUi();
      const data = (inspectResult.data as any)?.content;
      const tree = typeof data === "string" ? JSON.parse(data) : data;
      
      function dumpElements(node: any, depth: number = 0, results: any[] = []): any[] {
        if (!node) return results;
        if (Array.isArray(node)) {
          node.forEach(child => dumpElements(child, depth, results));
          return results;
        }
        const label = node.AXLabel || node.label || node.title || "";
        const type = node.type || node.className || node.elementType || "";
        const clickable = node.clickable;
        if (label || clickable || type.toLowerCase().includes("link")) {
          results.push({ depth, label: label.slice(0, 60), type, clickable, role: node.role });
        }
        if (node.children || node.AXChildren) {
          const children = node.children || node.AXChildren;
          (Array.isArray(children) ? children : [children]).forEach(child => dumpElements(child, depth + 1, results));
        }
        return results;
      }
      
      const allEls = dumpElements(tree);
      console.log("   All elements with labels or clickable:");
      for (const el of allEls.slice(0, 40)) {
        console.log(`     [depth=${el.depth}] "${el.label}" type="${el.type}" clickable=${el.clickable} role="${el.role}"`);
      }
    }
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
