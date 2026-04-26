import { createServer } from "../../packages/mcp-server/src/index.js";

const deviceId = process.env.M2E_DEVICE_ID?.trim() || "10AEA40Z3Y000R5";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("=== Current Page Diagnostic ===\n");

  const server = createServer();

  // Just capture current screen - device should already be on Add apps page
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

  const sampleNodes = inspectResult.data?.summary?.sampleNodes || [];
  const pageContext = inspectResult.data?.pageContext;
  const content = inspectResult.data?.content || "";

  console.log(`  inspect status: ${inspectResult.status}`);
  console.log(`  page type: ${pageContext?.type || "undefined"}`);
  console.log(`  page title: ${pageContext?.title || "undefined"}`);
  console.log(`  detectionSource: ${pageContext?.detectionSource || "undefined"}`);
  console.log(`  confidence: ${pageContext?.confidence ?? "undefined"}`);
  console.log(`  totalNodes: ${inspectResult.data?.summary?.totalNodes}`);
  console.log(`  sampleNodes.length: ${sampleNodes.length}`);

  const addAppsIndex = sampleNodes.findIndex(
    (node) => (node.text || "").toLowerCase().includes("add apps")
  );
  console.log(`\n  "Add apps" in sampleNodes: ${addAppsIndex >= 0 ? `YES (index ${addAppsIndex})` : "NO"}`);

  const listViewIndex = sampleNodes.findIndex(
    (node) =>
      (node.className || "").toLowerCase().includes("listview") ||
      (node.resourceId || "").toLowerCase().includes("listview")
  );
  console.log(`  ListView in sampleNodes: ${listViewIndex >= 0 ? `YES (index ${listViewIndex})` : "NO"}`);

  console.log(`\n  All ${sampleNodes.length} sampleNodes:`);
  sampleNodes.forEach((node, i) => {
    console.log(`    [${i}] text="${node.text || ""}" resourceId="${node.resourceId || ""}" class="${node.className || ""}" clickable=${node.clickable}`);
  });

  console.log(`\n  "Add apps" in raw XML: ${content.toLowerCase().includes("add apps") ? "YES" : "NO"}`);
  console.log(`  "阿里巴巴" in raw XML: ${content.toLowerCase().includes("阿里巴巴") ? "YES" : "NO"}`);
  console.log(`  "cancel" in sampleNodes texts: ${sampleNodes.some((n) => (n.text || "").toLowerCase() === "cancel") ? "YES" : "NO"}`);
  console.log(`  "done" in sampleNodes texts: ${sampleNodes.some((n) => (n.text || "").toLowerCase() === "done") ? "YES" : "NO"}`);

  // Simulate detection
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

  console.log(`\n=== Detection Simulation ===`);
  console.log(`  hasCancelDoneChrome: ${hasCancelDoneChrome}`);
  console.log(`  hasAppPickerText: ${hasAppPickerText}`);
  console.log(`  hasListSelection: ${hasListSelection}`);
  console.log(`  => form_editor? ${hasAppPickerText || hasListSelection || hasCancelDoneChrome}`);

  await server.dispose?.();
  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
