/**
 * Direct test: Launch Safari, check pid/AXLabel, then launch Settings and compare
 */

const DEVICE_ID = "ADA078B9-3C6B-4875-8B85-A7789F368816";

async function main(): Promise<void> {
  const { createServer } = await import("../packages/mcp-server/src/index.js");
  const { createMcpAdapter } = await import("../packages/explorer/src/mcp-adapter.js");

  const server = createServer();
  const sessionId = "test-direct-app-" + Date.now();
  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId: DEVICE_ID,
  };
  const mcp = createMcpAdapter(server, sessionCtx);

  // Test 1: Launch Safari
  console.log("1. Launching Safari...");
  await mcp.launchApp({ appId: "com.apple.mobilesafari" });
  await new Promise(r => setTimeout(r, 5000));

  const safariInspect = await mcp.inspectUi();
  const safariData = (safariInspect.data as any)?.content;
  const safariTree = typeof safariData === "string" ? JSON.parse(safariData) : safariData;

  function findAppNode(node: any): any | null {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findAppNode(child);
        if (found) return found;
      }
      return null;
    }
    const className = node.className || node.type || node.elementType;
    if (className === "Application") return node;
    if (node.children || node.AXChildren) {
      const children = node.children || node.AXChildren;
      (Array.isArray(children) ? children : [children]).forEach(child => {
        const found = findAppNode(child);
        if (found && !node._found) node._found = found;
      });
      return node._found || null;
    }
    return null;
  }

  const safariAppNode = findAppNode(safariTree);
  if (safariAppNode) {
    console.log(`   Safari Application node:`);
    console.log(`   pid: ${safariAppNode.pid}`);
    console.log(`   AXLabel: "${safariAppNode.AXLabel}"`);
    console.log(`   type: "${safariAppNode.type}"`);
    console.log(`   role: "${safariAppNode.role}"`);
  } else {
    console.log("   No Application node found in Safari UI tree!");
    console.log(`   Root: ${Array.isArray(safariTree) ? 'array[' + safariTree.length + ']' : typeof safariTree}`);
    if (Array.isArray(safariTree) && safariTree.length > 0) {
      console.log(`   First element type: ${safariTree[0].className || safariTree[0].type || safariTree[0].elementType}`);
      console.log(`   First element pid: ${safariTree[0].pid}`);
      console.log(`   First element AXLabel: ${safariTree[0].AXLabel}`);
    }
  }

  // Test 2: Launch Settings
  console.log("\n2. Launching Settings...");
  await mcp.launchApp({ appId: "com.apple.Preferences" });
  await new Promise(r => setTimeout(r, 5000));

  const settingsInspect = await mcp.inspectUi();
  const settingsData = (settingsInspect.data as any)?.content;
  const settingsTree = typeof settingsData === "string" ? JSON.parse(settingsData) : settingsData;
  const settingsAppNode = findAppNode(settingsTree);

  if (settingsAppNode) {
    console.log(`   Settings Application node:`);
    console.log(`   pid: ${settingsAppNode.pid}`);
    console.log(`   AXLabel: "${settingsAppNode.AXLabel}"`);
    console.log(`   type: "${settingsAppNode.type}"`);
  }

  // Compare
  if (safariAppNode && settingsAppNode) {
    console.log("\n3. Comparison:");
    console.log(`   pid different: ${safariAppNode.pid !== settingsAppNode.pid ? "✅ YES" : "❌ NO"}`);
    console.log(`   AXLabel different: ${safariAppNode.AXLabel !== settingsAppNode.AXLabel ? "✅ YES" : "❌ NO"}`);
    console.log(`   Safari pid: ${safariAppNode.pid}, Settings pid: ${settingsAppNode.pid}`);
    console.log(`   Safari AXLabel: "${safariAppNode.AXLabel}", Settings AXLabel: "${settingsAppNode.AXLabel}"`);
  }

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
