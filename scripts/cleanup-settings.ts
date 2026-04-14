/**
 * Terminate Settings app to ensure clean state before testing.
 */

import { createServer } from "../packages/mcp-server/src/index.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "cleanup-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  console.log("Terminating Settings app...");
  const term = await server.invoke("terminate_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  console.log("terminate:", term.status, term.reasonCode);

  console.log("Waiting 3s for full termination...");
  await new Promise(r => setTimeout(r, 3000));

  console.log("Relaunching Settings...");
  const launch = await server.invoke("launch_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  console.log("launch:", launch.status, launch.reasonCode);

  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  // Check home page
  const insp = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const d = insp.data as any;
  const c = typeof d?.content === "string" ? JSON.parse(d.content) : d?.content;
  const nodes = Array.isArray(c) ? c : [c];

  function findBtns(ns: any[], depth = 0): string[] {
    const r: string[] = [];
    for (const n of ns) {
      if ((n.type === "Button" || n.role === "AXButton") && n.AXLabel) {
        r.push("  ".repeat(depth) + n.AXLabel);
      }
      if (n.children) r.push(...findBtns(n.children, depth + 1));
    }
    return r;
  }

  console.log("\nCurrent page buttons:");
  findBtns(nodes).slice(0, 20).forEach(b => console.log("  " + b));

  // Check if there's a "Settings" back button (means we're in a sub-page)
  const hasBackButton = findBtns(nodes).some(b => b.trim() === "Settings");
  console.log("\nIs on home page:", !hasBackButton ? "YES" : "NO (in a sub-page)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
