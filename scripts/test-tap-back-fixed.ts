/**
 * Test: tap General correctly, then navigate back, verify page validation
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";
import { createSnapshotter } from "../packages/explorer/src/snapshot.js";
import { createBacktracker } from "../packages/explorer/src/backtrack.js";
import { buildDefaultConfig } from "../packages/explorer/src/config.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-tap-back-fixed-" + Date.now();
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
    mode: "smoke",
  });

  console.log("1. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  console.log("2. Capturing home snapshot...");
  const homeSnapshot = await snapshotter.captureSnapshot(config);
  console.log(`   Home screenId: ${homeSnapshot.screenId}`);
  console.log(`   Home title: ${homeSnapshot.screenTitle}`);
  console.log(`   Clickable: ${homeSnapshot.clickableElements.length} elements`);
  
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
  console.log(`   Selector: ${JSON.stringify(generalElement.selector)}`);

  console.log("\n3. Tapping General using explorer's McpToolInterface...");
  // Use the correct field names that McpToolInterface expects
  const selector = generalElement.selector;
  const tapArgs: any = {};
  if (selector.accessibilityId) tapArgs.contentDesc = selector.accessibilityId;
  if (selector.text) tapArgs.text = selector.text;
  if (selector.resourceId) tapArgs.resourceId = selector.resourceId;
  if (selector.className) tapArgs.className = selector.className;
  
  console.log(`   Tap args: ${JSON.stringify(tapArgs)}`);
  const tapResult = await mcp.tapElement(tapArgs);
  console.log(`   Tap result: ${tapResult.status} ${tapResult.reasonCode}`);

  await mcp.waitForUiStable({ timeoutMs: 10000 });

  console.log("\n4. Capturing page after tap...");
  const afterTapSnapshot = await snapshotter.captureSnapshot(config);
  console.log(`   After tap screenId: ${afterTapSnapshot.screenId}`);
  console.log(`   After tap title: ${afterTapSnapshot.screenTitle || "(unknown)"}`);
  console.log(`   Navigated: ${afterTapSnapshot.screenId !== homeSnapshot.screenId ? "✅ YES" : "❌ NO (same page)"}`);
  
  backtracker.registerPage(afterTapSnapshot.screenId, afterTapSnapshot.uiTree);

  console.log("\n5. Navigate back to Settings...");
  const backOk = await backtracker.navigateBack("Settings");
  console.log(`   Back navigation: ${backOk ? "✅ OK" : "❌ FAILED"}`);

  await mcp.waitForUiStable({ timeoutMs: 5000 });

  console.log("\n6. Checking if we're back on expected page...");
  const onExpectedPage = await backtracker.isOnExpectedPage(homeSnapshot.screenId);
  console.log(`   On expected page (screenId=${homeSnapshot.screenId.slice(0, 8)}...): ${onExpectedPage ? "✅ YES" : "❌ NO"}`);

  if (!onExpectedPage) {
    console.log("\n7. Capturing current state after failed back...");
    const afterBackSnapshot = await snapshotter.captureSnapshot(config);
    console.log(`   Current screenId: ${afterBackSnapshot.screenId}`);
    console.log(`   Current title: ${afterBackSnapshot.screenTitle || "(unknown)"}`);
    console.log(`   Expected screenId: ${homeSnapshot.screenId}`);
    console.log(`   ScreenId match: ${afterBackSnapshot.screenId === homeSnapshot.screenId ? "✅ YES" : "❌ NO"}`);
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
