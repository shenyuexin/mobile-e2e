import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";
import { createSnapshotter } from "../../src/snapshot.js";
import type { ExplorerConfig, McpToolInterface, UiHierarchy } from "../../src/types.js";

function okResult<T>(data: T): ToolResult<T> {
  return {
    status: "success",
    reasonCode: "OK",
    sessionId: "test-session",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data,
    nextSuggestions: [],
  } as ToolResult<T>;
}

function mockConfig(): ExplorerConfig {
  return {
    mode: "smoke",
    auth: { type: "skip-auth" },
    failureStrategy: "skip",
    maxDepth: 2,
    maxPages: 5,
    timeoutMs: 5_000,
    compareWith: null,
    platform: "android-device",
    destructiveActionPolicy: "skip",
    appId: "com.android.settings",
    reportDir: "/tmp/explorer-test",
    externalLinkMaxDepth: 1,
  };
}

function flattenTree(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
  result.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, result);
    }
  }
  return result;
}

describe("snapshot parser", () => {
  it("parses Android XML inspect content into non-empty hierarchy", async () => {
    const xml = "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\"><node index=\"0\" text=\"Settings\" class=\"android.widget.FrameLayout\" clickable=\"false\" enabled=\"true\" scrollable=\"false\" bounds=\"[0,0][100,100]\"><node index=\"1\" text=\"Wi-Fi\" class=\"android.widget.TextView\" clickable=\"true\" enabled=\"true\" scrollable=\"false\" content-desc=\"Wi-Fi\" bounds=\"[0,10][100,30]\"></node></node></hierarchy>";

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
      waitForUiStable: async () => okResult({ stable: true }),
      inspectUi: async () => okResult({ content: xml } as never),
      tapElement: async () => okResult({}),
      navigateBack: async () => okResult({}),
      takeScreenshot: async () => okResult({ outputPath: "/tmp/test.png" } as never),
      recoverToKnownState: async () => okResult({}),
      resetAppState: async () => okResult({}),
      requestManualHandoff: async () => okResult({}),
      getScreenSummary: async () => okResult({} as never),
      tap: async () => okResult({}),
    };

    const snapshotter = createSnapshotter(mcp);
    const snapshot = await snapshotter.captureSnapshot(mockConfig());
    const labels = flattenTree(snapshot.uiTree)
      .map((node) => node.text ?? node.contentDesc ?? node.accessibilityLabel)
      .filter((value): value is string => typeof value === "string");

    assert.notEqual(snapshot.screenId, "e3b0c44298fc1c14");
    assert.equal(labels.includes("Wi-Fi"), true);
  });
});
