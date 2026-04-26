/**
 * Diagnostic script: capture real UI hierarchy from Add apps page and analyze
 * whether the current detection logic would identify it as form_editor.
 *
 * Run:
 *   pnpm exec tsx scripts/explorer/diagnose-add-apps-page.ts
 */

import { createServer } from "../../packages/mcp-server/src/index.js";
import { execFile } from "node:child_process";

const deviceId = process.env.M2E_DEVICE_ID?.trim() || "10AEA40Z3Y000R5";
const appId = "com.android.settings";

function execAdb(args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile("adb", ["-s", deviceId, ...args], { timeout }, (err, stdout) => {
      resolve(err ? "" : stdout);
    });
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("=== Add apps Page Diagnostic ===\n");

  const server = createServer();

  // Step 1: Launch Settings
  console.log("[1/4] Launching Settings...");
  await server.invoke("launch_app", {
    sessionId: `diag-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    appId,
    launchUrl: "android.settings.SETTINGS",
  });
  await sleep(3000);

  // Step 2: Navigate to Do Not Disturb > Work
  console.log("[2/4] Navigating to Sounds & vibration...");
  const tapResult1 = await server.invoke("tap_element", {
    sessionId: `diag-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    text: "Sounds & vibration",
  });
  console.log(`  tap Sounds & vibration: ${tapResult1.status}`);
  await sleep(2000);

  console.log("[2/4] Navigating to Focus mode...");
  const tapResult2 = await server.invoke("tap_element", {
    sessionId: `diag-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    text: "Focus mode",
  });
  console.log(`  tap Focus mode: ${tapResult2.status}`);
  await sleep(2000);

  console.log("[2/4] Navigating to Work...");
  const tapResult3 = await server.invoke("tap_element", {
    sessionId: `diag-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    text: "Work",
  });
  console.log(`  tap Work: ${tapResult3.status}`);
  await sleep(2000);

  // Step 3: Tap Apps to open Add apps page
  console.log("[3/4] Tapping Apps to open Add apps page...");
  const tapAppsResult = await server.invoke("tap_element", {
    sessionId: `diag-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    resourceId: "com.android.settings:id/ll_apps",
  });
  console.log(`  tap Apps: ${tapAppsResult.status}`);
  await sleep(3000);

  // Step 4: Capture UI and analyze
  console.log("[4/4] Capturing UI hierarchy...");
  const inspectResult = await server.invoke("inspect_ui", {
    sessionId: `diag-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
  }) as {
    status: string;
    data?: {
      content?: string;
      summary?: {
        totalNodes?: number;
        sampleNodes?: Array<{
          text?: string;
          resourceId?: string;
          className?: string;
          clickable?: boolean;
          contentDesc?: string;
        }>;
      };
      pageContext?: {
        type?: string;
        title?: string;
        detectionSource?: string;
        confidence?: number;
      };
    };
  };

  console.log(`\n  inspect_ui status: ${inspectResult.status}`);
  console.log(`  pageContext.type: ${inspectResult.data?.pageContext?.type || "undefined"}`);
  console.log(`  pageContext.title: ${inspectResult.data?.pageContext?.title || "undefined"}`);
  console.log(`  totalNodes: ${inspectResult.data?.summary?.totalNodes || "undefined"}`);
  console.log(`  sampleNodes.length: ${inspectResult.data?.summary?.sampleNodes?.length || 0}`);

  const sampleNodes = inspectResult.data?.summary?.sampleNodes || [];
  const content = inspectResult.data?.content || "";

  // Find "Add apps" position
  const addAppsIndex = sampleNodes.findIndex(
    (node) => (node.text || "").toLowerCase().includes("add apps")
  );
  console.log(`\n  "Add apps" in sampleNodes: ${addAppsIndex >= 0 ? `YES (index ${addAppsIndex})` : "NO"}`);

  // Find ListView position
  const listViewIndex = sampleNodes.findIndex(
    (node) =>
      (node.className || "").toLowerCase().includes("listview") ||
      (node.resourceId || "").toLowerCase().includes("listview")
  );
  console.log(`  ListView in sampleNodes: ${listViewIndex >= 0 ? `YES (index ${listViewIndex})` : "NO"}`);

  // Full sampleNodes dump (first 20)
  console.log(`\n  First 20 sampleNodes:`);
  sampleNodes.slice(0, 20).forEach((node, i) => {
    console.log(`    [${i}] text="${node.text || ""}" resourceId="${node.resourceId || ""}" class="${node.className || ""}" clickable=${node.clickable}`);
  });

  // Check if content has "Add apps" text anywhere
  const hasAddAppsInContent = content.toLowerCase().includes("add apps");
  console.log(`\n  "Add apps" in raw XML content: ${hasAddAppsInContent ? "YES" : "NO"}`);

  // Test current detection logic against real data
  console.log(`\n=== Detection Simulation ===`);
  const texts = new Set(sampleNodes.flatMap((n) => [n.text, n.contentDesc]).filter(Boolean).map((t) => (t as string).trim().toLowerCase()));
  const hasCancelDoneChrome = texts.has("cancel") && texts.has("done");
  const hasAppPickerText = sampleNodes.some((node) => {
    const text = (node.text ?? node.contentDesc ?? "").trim().toLowerCase();
    return /\b(add|choose|select)\s+(apps?|items?|contacts?)\b/.test(text);
  });
  const hasListSelection = sampleNodes.some((node) => {
    const className = (node.className || "").toLowerCase();
    const resourceId = (node.resourceId || "").toLowerCase();
    return className.includes("listview") || className.includes("recyclerview") || resourceId.includes("listview") || resourceId.includes("recyclerview");
  });

  console.log(`  hasCancelDoneChrome: ${hasCancelDoneChrome}`);
  console.log(`  hasAppPickerText: ${hasAppPickerText}`);
  console.log(`  hasListSelection: ${hasListSelection}`);
  console.log(`  => detectFormEditor would return: ${hasAppPickerText || hasListSelection || hasCancelDoneChrome}`);

  await server.dispose?.();
  console.log("\n=== Diagnostic Complete ===");
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
