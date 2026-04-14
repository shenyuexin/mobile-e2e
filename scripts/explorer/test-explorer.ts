/**
 * Quick test harness for the explorer on iOS Settings simulator.
 *
 * Run: npx tsx scripts/test-explorer.ts [smoke|full]
 *
 * First terminates Settings app to ensure clean home page state,
 * then runs the explorer.
 */

import { createServer } from "../../packages/mcp-server/src/index.js";
import { explore } from "../../packages/explorer/src/cli.js";

const mode = process.argv[2] === "full" ? "full" : "smoke";
const outputDir = mode === "full" ? "artifacts/explorer/full" : "artifacts/explorer/smoke";
const maxDepth = mode === "full" ? "8" : "5";
const timeoutMs = mode === "full" ? "1800000" : "900000";

async function terminateSettingsApp(): Promise<void> {
  console.log("\n[CLEANUP] Terminating Settings app to ensure clean state...");
  const server = createServer();
  const sessionId = "cleanup-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  await server.invoke("terminate_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });

  // Wait for full termination
  await new Promise(r => setTimeout(r, 3000));

  // Dispose to free resources
  await (server as any).dispose?.();
  console.log("[CLEANUP] Settings terminated.\n");
}

async function main(): Promise<void> {
  // Step 0: Clean state
  await terminateSettingsApp();

  console.log(`=== Explorer Test Harness: iOS Settings App ===`);
  console.log(`Target: com.apple.Preferences on iOS simulator`);
  console.log(`Mode: ${mode} (${mode === "smoke" ? "shallow breadth" : "deep coverage"})\n`);

  const server = await createServer();

  await explore(
    [
      "--mode", mode,
      "--app-id", "com.apple.Preferences",
      "--platform", "ios-simulator",
      "--no-prompt",
      "--output", outputDir,
      "--max-depth", maxDepth,
      "--timeout-ms", timeoutMs,
    ],
    server,
  );

  console.log(`\n${mode} mode complete. Reports in ${outputDir}/`);

  await server.dispose?.();
  process.exit(0);
}

main().catch((err) => {
  console.error("Explorer test failed:", err);
  process.exit(1);
});
