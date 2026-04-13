/**
 * Auth pre-flight checks for the explorer.
 *
 * Handles app launch and optional handoff wait based on the configured
 * auth strategy.
 */

import type { ExplorerConfig, McpToolInterface } from "./types.js";

/**
 * Run auth pre-flight checks.
 *
 * - 'already-logged-in': launch app and verify it's running
 * - 'auto-login': launch app (credentials would be used in a full impl)
 * - 'handoff': launch app and wait for user to complete login
 * - 'skip-auth': no-op (app launched by engine)
 *
 * For Phase 1, this simply launches the app and optionally prints
 * a handoff message.
 */
export async function checkAuth(
  config: Pick<ExplorerConfig, "auth" | "appId">,
  mcp: McpToolInterface,
): Promise<{ success: boolean; reason?: string }> {
  const auth = config.auth;

  if (auth.type === "skip-auth") {
    // No auth needed — engine will launch
    return { success: true };
  }

  // Launch the app for all other auth types
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
