/**
 * Test: Check how the explorer parses the Settings home page UI tree.
 */

import { createServer } from "../packages/mcp-server/src/index.js";

async function main(): Promise<void> {
  const server = createServer();
  const sessionId = "test-parse-" + Date.now();
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  // Clean state
  await server.invoke("terminate_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  await new Promise(r => setTimeout(r, 2000));
  await server.invoke("launch_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });
  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const insp = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });

  // Import explorer functions
  const { extractScreenTitle, generateScreenId } =
    await import("../packages/explorer/src/snapshot.js");
  const { findClickableElements, flattenTree } =
    await import("../packages/explorer/src/element-prioritizer.js");

  // Parse the UI tree manually (normalizeToUiHierarchy is not exported)
  const d = insp.data as any;
  const content = typeof d?.content === "string" ? JSON.parse(d.content) : d?.content;
  const nodes = Array.isArray(content) ? content : [content];

  // Create a synthetic UiHierarchy root (mimicking what the explorer does internally)
  const uiTree = buildUiHierarchy(nodes[0] || {});

  // Test extractScreenTitle
  const title = extractScreenTitle(uiTree);
  console.log("extractScreenTitle:", title || "(empty)");

  // Test generateScreenId
  const screenId = generateScreenId(uiTree);
  console.log("generateScreenId:", screenId);

  // Test flattenTree and clickable elements
  const allElements = flattenTree(uiTree);
  console.log("Total elements in tree:", allElements.length);

  const config = {
    mode: "smoke" as const,
    auth: { type: "skip-auth" as const },
    failureStrategy: "skip" as const,
    maxDepth: 5,
    maxPages: 50,
    timeoutMs: 300000,
    compareWith: null,
    platform: "ios-simulator" as const,
    destructiveActionPolicy: "skip" as const,
    appId: "com.apple.Preferences",
    reportDir: "/tmp/test",
  };

  const clickable = findClickableElements(uiTree, config);
  console.log("Clickable elements:", clickable.length);
  clickable.forEach((el, i) => console.log(`  ${i + 1}. ${el.label} (${el.elementType})`));

  // Now check what the initialSnapshot would look like
  const snapshotScreenTitle = extractScreenTitle(uiTree);
  console.log("\nSnapshot screenTitle:", snapshotScreenTitle || "(empty)");

  // Test child page: tap General, check screenTitle
  console.log("\n--- Testing General sub-page ---");
  await server.invoke("tap_element", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    text: "General", limit: 1,
  });
  await server.invoke("wait_for_ui_stable", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    timeoutMs: 10000, intervalMs: 300, consecutiveStable: 2,
  });

  const insp2 = await server.invoke("inspect_ui", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
  });
  const d2 = insp2.data as any;
  const content2 = typeof d2?.content === "string" ? JSON.parse(d2.content) : d2?.content;
  const nodes2 = Array.isArray(content2) ? content2 : [content2];
  const uiTree2 = buildUiHierarchy(nodes2[0] || {});
  const title2 = extractScreenTitle(uiTree2);
  console.log("Child screenTitle:", title2 || "(empty)");
  console.log("Child screenId:", generateScreenId(uiTree2));
}

function buildUiHierarchy(node: any): any {
  const type = typeof node.type === "string" ? node.type : "";
  const role = typeof node.role === "string" ? node.role : "";
  const label = typeof node.AXLabel === "string" ? node.AXLabel :
                typeof node.AXValue === "string" ? node.AXValue : "";
  const children = Array.isArray(node.children) ? node.children.map((c: any) => buildUiHierarchy(c)) : [];

  return {
    index: typeof node.index === "number" ? node.index : undefined,
    depth: typeof node.depth === "number" ? node.depth : undefined,
    text: label,
    className: type || role,
    packageName: typeof node.packageName === "string" ? node.packageName : undefined,
    contentDesc: typeof node.AXUniqueId === "string" ? node.AXUniqueId : undefined,
    clickable: type === "Button" || role === "AXButton",
    enabled: node.enabled !== false,
    scrollable: node.scrollable === true,
    bounds: undefined,
    children,
    accessibilityLabel: label,
    accessibilityTraits: [],
    accessibilityRole: role,
    visibleTexts: label ? [label] : undefined,
    frame: typeof node.frame === "object" ? node.frame : undefined,
    AXUniqueId: typeof node.AXUniqueId === "string" ? node.AXUniqueId : undefined,
    AXValue: typeof node.AXValue === "string" ? node.AXValue : undefined,
    elementType: type,
    label,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
