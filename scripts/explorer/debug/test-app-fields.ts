/**
 * Check what fields iOS axe provides for bundle ID detection
 */

const DEVICE_ID = "ADA078B9-3C6B-4875-8B85-A7789F368816";

async function main(): Promise<void> {
  const { createServer } = await import("../packages/mcp-server/src/index.js");
  const { createMcpAdapter } = await import("../packages/explorer/src/mcp-adapter.js");

  const server = createServer();
  const sessionId = "test-fields-" + Date.now();
  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId: DEVICE_ID,
  };
  const mcp = createMcpAdapter(server, sessionCtx);

  async function dumpAppFields(appId: string, label: string): Promise<void> {
    console.log(`\n${label} (${appId}):`);
    await mcp.launchApp({ appId });
    await new Promise(r => setTimeout(r, 5000));

    const inspectResult = await mcp.inspectUi();
    const data = (inspectResult.data as any)?.content;
    const tree = typeof data === "string" ? JSON.parse(data) : data;

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

    const appNode = findAppNode(tree);
    if (appNode) {
      const allKeys = Object.keys(appNode);
      const relevantKeys = allKeys.filter(k =>
        k.toLowerCase().includes('bundle') ||
        k.toLowerCase().includes('id') ||
        k.toLowerCase().includes('package') ||
        k.toLowerCase().includes('process') ||
        k.toLowerCase().includes('app') ||
        k === 'AXLabel' ||
        k === 'AXUniqueId' ||
        k === 'name' ||
        k === 'title' ||
        k === 'pid'
      );

      console.log(`   Relevant fields:`);
      for (const key of relevantKeys) {
        console.log(`     ${key}: ${JSON.stringify(appNode[key])}`);
      }
      console.log(`   All keys: ${allKeys.join(', ')}`);
    } else {
      console.log("   No Application node found!");
    }
  }

  await dumpAppFields("com.apple.Preferences", "Settings");
  await dumpAppFields("com.apple.mobilesafari", "Safari");

  await server.dispose?.();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
