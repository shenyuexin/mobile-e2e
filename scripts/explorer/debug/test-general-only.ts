/**
 * Focused test: Explore ONLY Settings > General with detailed logging
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";
import { createSnapshotter } from "../packages/explorer/src/snapshot.js";
import { createBacktracker } from "../packages/explorer/src/backtrack.js";
import { buildDefaultConfig } from "../packages/explorer/src/config.js";
import { findClickableElements, prioritizeElements } from "../packages/explorer/src/element-prioritizer.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-general-only-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId,
  };

  const mcp = createMcpAdapter(server, sessionCtx);
  const snapshotter = createSnapshotter(mcp);
  const backtracker = createBacktracker(mcp);
  
  const config = buildDefaultConfig({
    appId: "com.apple.Preferences",
    platform: "ios-simulator",
    mode: "full",
  });

  console.log("1. Launching Settings...");
  // Force terminate using simctl to ensure clean state
  const { execSync } = await import("child_process");
  try {
    execSync(`xcrun simctl terminate ${deviceId} com.apple.Preferences`, { stdio: "inherit" });
  } catch {}
  await new Promise(r => setTimeout(r, 3000));
  
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });
  
  // Verify we're on the home page
  const verifySnapshot = await snapshotter.captureSnapshot(config);
  console.log(`   Launched to: ${verifySnapshot.screenTitle || "(unknown)"} (screenId=${verifySnapshot.screenId.slice(0, 8)}...)`);
  if (verifySnapshot.screenTitle !== "Settings") {
    console.log("   Not on Settings home page - terminating and retrying...");
    try {
      execSync(`xcrun simctl terminate ${deviceId} com.apple.Preferences`, { stdio: "inherit" });
    } catch {}
    await new Promise(r => setTimeout(r, 4000));
    await mcp.launchApp({ appId: "com.apple.Preferences" });
    await mcp.waitForUiStable({ timeoutMs: 10000 });
    
    const verify2 = await snapshotter.captureSnapshot(config);
    console.log(`   Retry launched to: ${verify2.screenTitle || "(unknown)"}`);
  }

  console.log("2. Capturing home snapshot...");
  const homeSnapshot = await snapshotter.captureSnapshot(config);
  console.log(`   Home screenId: ${homeSnapshot.screenId}`);
  console.log(`   Home title: ${homeSnapshot.screenTitle}`);
  console.log(`   App ID: ${homeSnapshot.appId}, isExternal: ${homeSnapshot.isExternalApp}`);
  
  backtracker.registerPage(homeSnapshot.screenId, homeSnapshot.uiTree);

  // Find General element
  const generalElement = homeSnapshot.clickableElements.find(el => 
    el.label.includes("General") || el.label.includes("general")
  );
  if (!generalElement) {
    console.error("   ERROR: General element not found!");
    process.exit(1);
  }
  console.log(`   Found General: "${generalElement.label}"`);

  console.log("\n3. Tapping General...");
  const tapArgs: any = {};
  if (generalElement.selector.resourceId) tapArgs.resourceId = generalElement.selector.resourceId;
  if (generalElement.selector.contentDesc) tapArgs.contentDesc = generalElement.selector.contentDesc;
  if (generalElement.selector.text) tapArgs.text = generalElement.selector.text;
  
  const tapResult = await mcp.tapElement(tapArgs);
  console.log(`   Tap result: ${tapResult.status} ${tapResult.reasonCode}`);

  await mcp.waitForUiStable({ timeoutMs: 10000 });

  console.log("\n4. Capturing General page snapshot...");
  const generalSnapshot = await snapshotter.captureSnapshot(config);
  console.log(`   General screenId: ${generalSnapshot.screenId}`);
  console.log(`   General title: ${generalSnapshot.screenTitle || "(unknown)"}`);
  console.log(`   App ID: ${generalSnapshot.appId}, isExternal: ${generalSnapshot.isExternalApp}`);
  console.log(`   Clickable elements: ${generalSnapshot.clickableElements.length}`);
  
  for (let i = 0; i < generalSnapshot.clickableElements.length; i++) {
    const el = generalSnapshot.clickableElements[i];
    console.log(`     [${i}] "${el.label.slice(0, 50)}" (${el.elementType})`);
  }
  
  backtracker.registerPage(generalSnapshot.screenId, generalSnapshot.uiTree);

  console.log("\n5. Testing backtrack validation from General page...");
  const onGeneralPage = await backtracker.isOnExpectedPage(generalSnapshot.screenId);
  console.log(`   Is on General page (screenId=${generalSnapshot.screenId.slice(0, 8)}...): ${onGeneralPage ? "✅ YES" : "❌ NO"}`);

  if (!onGeneralPage) {
    console.log("\n   DEBUG: Capturing another snapshot to check stability...");
    const snapshot2 = await snapshotter.captureSnapshot(config);
    console.log(`   Snapshot 2 screenId: ${snapshot2.screenId}`);
    console.log(`   ScreenId match: ${snapshot2.screenId === generalSnapshot.screenId ? "✅ YES" : "❌ NO"}`);
    
    await mcp.waitForUiStable({ timeoutMs: 3000 });
    const snapshot3 = await snapshotter.captureSnapshot(config);
    console.log(`   Snapshot 3 screenId: ${snapshot3.screenId}`);
    console.log(`   ScreenId match: ${snapshot3.screenId === generalSnapshot.screenId ? "✅ YES" : "❌ NO"}`);
  }

  console.log("\n6. Navigate back to Settings...");
  const backOk = await backtracker.navigateBack("Settings");
  console.log(`   Back navigation: ${backOk ? "✅ OK" : "❌ FAILED"}`);

  await mcp.waitForUiStable({ timeoutMs: 5000 });

  console.log("\n7. Checking if we're back on expected page...");
  const onExpectedPage = await backtracker.isOnExpectedPage(homeSnapshot.screenId);
  console.log(`   On expected page (screenId=${homeSnapshot.screenId.slice(0, 8)}...): ${onExpectedPage ? "✅ YES" : "❌ NO"}`);

  if (!onExpectedPage) {
    console.log("\n   DEBUG: Capturing current state...");
    const afterBackSnapshot = await snapshotter.captureSnapshot(config);
    console.log(`   Current screenId: ${afterBackSnapshot.screenId}`);
    console.log(`   Current title: ${afterBackSnapshot.screenTitle || "(unknown)"}`);
    console.log(`   Expected screenId: ${homeSnapshot.screenId}`);
    console.log(`   ScreenId match: ${afterBackSnapshot.screenId === homeSnapshot.screenId ? "✅ YES" : "❌ NO"}`);
    
    // Check structure hash
    const { hashUiStructure } = await import("../packages/explorer/src/page-registry.js");
    const expectedHash = hashUiStructure(homeSnapshot.uiTree);
    const currentHash = hashUiStructure(afterBackSnapshot.uiTree);
    console.log(`   Structure hash match: ${expectedHash === currentHash ? "✅ YES" : "❌ NO"}`);
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
