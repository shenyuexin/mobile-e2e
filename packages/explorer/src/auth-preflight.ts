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

import type { ExplorerConfig, McpToolInterface, UiHierarchy } from "./types.js";

function collectTexts(node: UiHierarchy, result: string[] = []): string[] {
  const value = node.text || node.contentDesc || node.accessibilityLabel || node.label;
  if (value?.trim()) {
    result.push(value.trim());
  }
  for (const child of node.children ?? []) {
    collectTexts(child, result);
  }
  return result;
}

function extractPackageName(node: UiHierarchy): string | undefined {
  if (node.packageName) return node.packageName;
  for (const child of node.children ?? []) {
    const found = extractPackageName(child);
    if (found) return found;
  }
  return undefined;
}

function looksLikeSettingsHome(texts: string[]): boolean {
  const joined = texts.join(" ").toLowerCase();
  const matchedSignals = [
    "airplane mode",
    "wi-fi",
    "bluetooth",
    "mobile network",
    "more connections",
    "notifications",
    "display",
  ].filter((signal) => joined.includes(signal));
  return matchedSignals.length >= 3;
}

/**
 * Run auth pre-flight checks.
 */
export async function checkAuth(
  config: Pick<ExplorerConfig, "auth" | "appId" | "platform">,
  mcp: McpToolInterface,
): Promise<{ success: boolean; reason?: string }> {
  const auth = config.auth;

  if (auth.type === "skip-auth") {
    return { success: true };
  }

  if (process.env.EXPLORER_SKIP_PREFLIGHT_LAUNCH !== "1") {
    try {
      await mcp.resetAppState({ appId: config.appId });
      await new Promise(r => setTimeout(r, 3000));
    } catch {
      // Non-fatal
    }

    const launchResult = await mcp.launchApp({ appId: config.appId });
    if (launchResult.status !== "success" && launchResult.status !== "partial") {
      return {
        success: false,
        reason: `App launch failed: ${launchResult.reasonCode}`,
      };
    }

    const stableResult = await mcp.waitForUiStable({ timeoutMs: 10000 });
    if (stableResult.status !== "success" && stableResult.status !== "partial") {
      return {
        success: false,
        reason: "UI did not stabilize after app launch",
      };
    }
  }

  if (config.platform.startsWith("android")) {
    const inspectResult = await mcp.inspectUi();
    if (inspectResult.status === "success" || inspectResult.status === "partial") {
      const uiTree = inspectResult.data?.content as UiHierarchy | undefined;
      if (uiTree) {
        const packageName = extractPackageName(uiTree);
        const texts = collectTexts(uiTree);
        if (packageName && packageName !== config.appId && !looksLikeSettingsHome(texts)) {
          return {
            success: false,
            reason: `Foreground app mismatch after pre-flight: ${packageName} (expected ${config.appId})`,
          };
        }
      }
    }
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
