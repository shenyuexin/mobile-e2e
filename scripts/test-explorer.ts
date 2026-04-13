/**
 * Quick test harness for the explorer on iOS Settings simulator.
 *
 * Run: npx tsx scripts/test-explorer.ts [smoke|full]
 */

import { createServer } from "../packages/mcp-server/src/index.js";
import { explore } from "../packages/explorer/src/cli.js";

const mode = process.argv[2] === "full" ? "full" : "smoke";
const outputDir = mode === "full" ? "/tmp/explorer-test-full" : "/tmp/explorer-test-smoke";
const maxDepth = mode === "full" ? "8" : "5";
const timeoutMs = mode === "full" ? "600000" : "300000";

async function main(): Promise<void> {
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
