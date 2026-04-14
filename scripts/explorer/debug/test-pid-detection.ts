/**
 * Test: Can we detect app switch via pid comparison?
 * Launch Settings > General > About > Certificate Trust Settings > "Learn more" (opens Safari)
 * Compare pid before and after.
 */

import { execSync } from "child_process";

const DEVICE_ID = "ADA078B9-3C6B-4875-8B85-A7789F368816";

async function main(): Promise<void> {
  // 1. Get Settings pid
  console.log("1. Launching Settings...");
  execSync(`xcrun simctl launch ${DEVICE_ID} com.apple.Preferences`, { stdio: "pipe" });
  await new Promise(r => setTimeout(r, 5000));

  // Get Settings pid via simctl spawn
  console.log("2. Getting Settings pid via launchctl...");
  const settingsPid = await getProcessPid("com.apple.Preferences");
  console.log(`   Settings pid: ${settingsPid || '(not found)'}`);

  // 2. Open UI tree and check pid from AXE
  console.log("3. Inspecting Settings UI tree...");
  const { createServer } = await import("../packages/mcp-server/src/index.js");
  const { createMcpAdapter } = await import("../packages/explorer/src/mcp-adapter.js");

  const server = createServer();
  const sessionId = "test-pid-check-" + Date.now();
  const sessionCtx = {
    sessionId,
    platform: "ios" as const,
    runnerProfile: "native_ios" as const,
    deviceId: DEVICE_ID,
  };
  const mcp = createMcpAdapter(server, sessionCtx);

  const inspectResult = await mcp.inspectUi();
  const data = (inspectResult.data as any)?.content;
  const uiRoot = typeof data === "string" ? JSON.parse(data) : data;

  // Find Application node and get pid
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
    if (className === "Application") {
      return node;
    }
    if (node.children || node.AXChildren) {
      const children = node.children || node.AXChildren;
      const childArray = Array.isArray(children) ? children : [children];
      for (const child of childArray) {
        const found = findAppNode(child);
        if (found) return found;
      }
    }
    return null;
  }

  const settingsAppNode = findAppNode(uiRoot);
  const settingsAxePid = settingsAppNode?.pid;
  const settingsAXLabel = settingsAppNode?.AXLabel;
  console.log(`   AXE pid: ${settingsAxePid}`);
  console.log(`   AXLabel: ${settingsAXLabel}`);

  // 3. Navigate to Certificate Trust Settings
  console.log("\n4. Navigating to Certificate Trust Settings...");
  await mcp.tapElement({ resourceId: "com.apple.settings.general" });
  await new Promise(r => setTimeout(r, 2000));
  await mcp.tapElement({ resourceId: "com.apple.settings.about" });
  await new Promise(r => setTimeout(r, 2000));
  await mcp.tapElement({ text: "Certificate Trust Settings" });
  await new Promise(r => setTimeout(r, 2000));

  // Check clickable elements for "Learn more"
  const certInspect = await mcp.inspectUi();
  const certData = (certInspect.data as any)?.content;
  const certTree = typeof certData === "string" ? JSON.parse(certData) : certData;
  const certAppNode = findAppNode(certTree);
  console.log(`   After navigation, AXE pid: ${certAppNode?.pid}, AXLabel: ${certAppNode?.AXLabel}`);

  // Find and tap "Learn more"
  function findAllElements(node: any, results: any[] = []): any[] {
    if (!node) return results;
    if (Array.isArray(node)) {
      node.forEach(child => findAllElements(child, results));
      return results;
    }
    results.push({
      type: node.type || node.className || node.elementType || "(unknown)",
      label: node.AXLabel || node.label || node.title || "(no label)",
      clickable: node.clickable,
      role: node.role,
      AXActionIdentifier: node.AXActionIdentifier,
      AXRole: node.AXRole,
    });
    if (node.children || node.AXChildren) {
      const children = node.children || node.AXChildren;
      (Array.isArray(children) ? children : [children]).forEach(child =>
        findAllElements(child, results)
      );
    }
    return results;
  }

  const allElements = findAllElements(certTree);
  console.log(`   All elements on Certificate page:`);
  for (const el of allElements) {
    if (el.type.toLowerCase().includes("link") || 
        el.label.toLowerCase().includes("learn") ||
        el.label.toLowerCase().includes("more")) {
      console.log(`     - type="${el.type}", label="${el.label}", clickable=${el.clickable}, role=${el.role}, AXActionId=${el.AXActionIdentifier}`);
    }
  }

  // Look specifically for Link type elements
  const linkElements = allElements.filter(el => 
    el.type.toLowerCase().includes("link") || 
    el.role?.toLowerCase().includes("link")
  );
  console.log(`\n   Link elements found: ${linkElements.length}`);
  for (const el of linkElements) {
    console.log(`     - "${el.label}" (clickable=${el.clickable})`);
  }

  if (linkElements.length === 0) {
    console.log("   No Link elements found on Certificate page!");
    console.log("   Maybe Certificate Trust Settings has no external links.");
    console.log("   Let me try a different path: General -> About -> (should have links)");
    
    // Go back and try General -> About which might have "Learn more" links
    console.log("\n   Going back to General...");
    await mcp.navigateBack({ target: "app", selector: { text: "General" } });
    await new Promise(r => setTimeout(r, 3000));
    
    // Check About page
    console.log("   Tapping About...");
    await mcp.tapElement({ resourceId: "com.apple.settings.about" });
    await new Promise(r => setTimeout(r, 2000));
    
    const aboutInspect = await mcp.inspectUi();
    const aboutData = (aboutInspect.data as any)?.content;
    const aboutTree = typeof aboutData === "string" ? JSON.parse(aboutData) : aboutData;
    const aboutElements = findAllElements(aboutTree);
    const aboutLinks = aboutElements.filter(el => 
      el.type.toLowerCase().includes("link") || 
      el.label.toLowerCase().includes("learn")
    );
    console.log("   About page Link elements:");
    for (const el of aboutLinks) {
      console.log(`     - type="${el.type}", label="${el.label}"`);
    }
  } else {
    // Tap the first link
    const firstLink = linkElements[0];
    console.log(`\n5. Tapping "${firstLink.label}"...`);
    await mcp.tapElement({ text: firstLink.label });
    
    // Wait for app switch
    console.log("   Waiting 5s for app switch...");
    await new Promise(r => setTimeout(r, 5000));

    // 4. Check current app pid
    const safariInspect = await mcp.inspectUi();
    const safariData = (safariInspect.data as any)?.content;
    const safariTree = typeof safariData === "string" ? JSON.parse(safariData) : safariData;
    const safariAppNode = findAppNode(safariTree);
    const safariAxePid = safariAppNode?.pid;
    const safariAXLabel = safariAppNode?.AXLabel;

    console.log(`\n6. After tap:`);
    console.log(`   AXE pid: ${safariAxePid} (was ${settingsAxePid})`);
    console.log(`   AXLabel: "${safariAXLabel}" (was "${settingsAXLabel}")`);
    console.log(`   pid changed: ${safariAxePid !== settingsAxePid ? "✅ YES" : "❌ NO"}`);
    console.log(`   AXLabel changed: ${safariAXLabel !== settingsAXLabel ? "✅ YES" : "❌ NO"}`);
  }

  // 5. Also check via launchctl
  console.log("\n7. Checking running processes:");
  const preferencesPid = await getProcessPid("com.apple.Preferences");
  const safariPid_launchctl = await getProcessPid("com.apple.mobilesafari");
  console.log(`   com.apple.Preferences pid: ${preferencesPid || '(not running)'}`);
  console.log(`   com.apple.mobilesafari pid: ${safariPid_launchctl || '(not running)'}`);

  await server.dispose?.();
}

async function getProcessPid(bundleId: string): Promise<string | null> {
  try {
    // Use simctl spawn to run ps and grep for the bundle id
    // This is more reliable than launchctl list
    const output = execSync(
      `xcrun simctl spawn ${DEVICE_ID} sh -c "ps aux | grep '${bundleId}' | grep -v grep | head -1"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    if (output) {
      // ps output format: USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND
      const parts = output.split(/\s+/);
      if (parts.length >= 2) {
        return parts[1]; // PID
      }
    }
    return null;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
