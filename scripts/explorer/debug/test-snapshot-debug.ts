/**
 * Debug: test snapshot extraction to see what clickable elements are found
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { createMcpAdapter } from "../packages/explorer/src/mcp-adapter.js";
import { createSnapshotter } from "../packages/explorer/src/snapshot.js";
import { buildDefaultConfig } from "../packages/explorer/src/config.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-snapshot-debug-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId,
  };

  const mcp = createMcpAdapter(server, sessionCtx);
  const snapshotter = createSnapshotter(mcp);
  
  // Build a minimal config
  const config = buildDefaultConfig({
    appId: "com.apple.Preferences",
    platform: "ios-simulator",
    mode: "smoke",
  });

  console.log("1. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await mcp.waitForUiStable({ timeoutMs: 10000 });

  console.log("2. Capturing snapshot...");
  const snapshot = await snapshotter.captureSnapshot(config);
  
  console.log(`\n   Screen ID: ${snapshot.screenId}`);
  console.log(`   Screen Title: ${snapshot.screenTitle || "(unknown)"}`);
  console.log(`   Clickable Elements: ${snapshot.clickableElements.length}`);
  
  for (let i = 0; i < Math.min(20, snapshot.clickableElements.length); i++) {
    const el = snapshot.clickableElements[i];
    console.log(`   [${i}] "${el.label.slice(0, 50)}" (${el.elementType})`);
    console.log(`       selector: ${JSON.stringify(el.selector)}`);
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
