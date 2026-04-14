/**
 * Auth pre-flight checks for the explorer.
 *
 * Handles app launch and optional handoff wait based on the configured
 * auth strategy.
 *
 * IMPORTANT: For iOS, terminate + relaunch to ensure a clean home page.
 * launch_app alone just brings the app to foreground, which may leave it in
 * search mode, a sub-page, or a system dialog state from a previous session.
 */

import type { ExplorerConfig, McpToolInterface } from "./types.js";

/**
 * Run auth pre-flight checks.
 */
export async function checkAuth(
  config: Pick<ExplorerConfig, "auth" | "appId">,
  mcp: McpToolInterface,
): Promise<{ success: boolean; reason?: string }> {
  const auth = config.auth;

  if (auth.type === "skip-auth") {
    return { success: true };
  }

  // Terminate first to ensure clean state
  try {
    await mcp.resetAppState({ appId: config.appId });
    // Give the OS time to fully terminate the process
    await new Promise(r => setTimeout(r, 3000));
  } catch {
    // Non-fatal
  }

  // Launch the app
  const launchResult = await mcp.launchApp({ appId: config.appId });
  if (launchResult.status !== "success" && launchResult.status !== "partial") {
    return {
      success: false,
      reason: `App launch failed: ${launchResult.reasonCode}`,
    };
  }

  // Wait for UI to stabilize
  const stableResult = await mcp.waitForUiStable({ timeoutMs: 10000 });
  if (stableResult.status !== "success" && stableResult.status !== "partial") {
    return {
      success: false,
      reason: "UI did not stabilize after app launch",
    };
  }

  if (auth.type === "handoff") {
    console.log("\n[HANDOFF] Please complete login manually, then press Enter to continue...");
    await waitForEnter();
  }

  if (auth.type === "already-logged-in") {
    console.log("[AUTH] App launched — assuming already logged in");
  }

  if (auth.type === "auto-login") {
    console.log("[AUTH] App launched — auto-login would use env vars (Phase 1: no credentials provided)");
  }

  return { success: true };
}

/** Wait for the user to press Enter. */
async function waitForEnter(): Promise<void> {
  return new Promise<void>((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", () => {
      resolve();
    });
  });
}
