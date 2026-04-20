import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";
import { createSnapshotter } from "../../src/snapshot.js";
import type { ClickableTarget, ExplorerConfig, McpToolInterface } from "../../src/types.js";

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

function iosConfig(): ExplorerConfig {
  return {
    mode: "smoke",
    auth: { type: "skip-auth" },
    failureStrategy: "skip",
    maxDepth: 2,
    maxPages: 5,
    timeoutMs: 5_000,
    compareWith: null,
    platform: "ios-simulator",
    destructiveActionPolicy: "skip",
    appId: "com.apple.Preferences",
    reportDir: "/tmp/explorer-ios-test",
    externalLinkMaxDepth: 1,
  };
}

function directIosTree() {
  return {
    type: "Application",
    AXLabel: "Settings",
    children: [
      { type: "Heading", AXLabel: "General" },
      { type: "Cell", AXLabel: "Wi-Fi", AXUniqueId: "wifi-cell" },
      { type: "Cell", AXLabel: "Bluetooth", AXUniqueId: "bluetooth-cell" },
    ],
  };
}

function clickableLabels(elements: ClickableTarget[]): string[] {
  return elements.map((element) => element.label);
}

describe("iOS snapshot parity", () => {
  it("captures title/actionability from direct iOS payload", async () => {
    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
      waitForUiStable: async () => okResult({ stable: true }),
      inspectUi: async () => okResult({ content: directIosTree() } as never),
      tapElement: async () => okResult({}),
      navigateBack: async () => okResult({}),
      takeScreenshot: async () => okResult({ outputPath: "/tmp/test-ios.png" } as never),
      recoverToKnownState: async () => okResult({}),
      resetAppState: async () => okResult({}),
      requestManualHandoff: async () => okResult({}),
      getScreenSummary: async () => okResult({} as never),
      tap: async () => okResult({}),
    };

    const snapshot = await createSnapshotter(mcp).captureSnapshot(iosConfig());

    assert.equal(snapshot.screenTitle, "General");
    assert.equal(snapshot.appId, "Settings");
    assert.deepEqual(clickableLabels(snapshot.clickableElements), ["wifi-cell", "bluetooth-cell"]);
    assert.equal(snapshot.clickableElements[0]?.selector.resourceId, "wifi-cell");
  });

  it("preserves iOS semantics for wrapped JSON payloads", async () => {
    const wrappedPayload = JSON.stringify([directIosTree()]);
    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
      waitForUiStable: async () => okResult({ stable: true }),
      inspectUi: async () => okResult({ content: wrappedPayload } as never),
      tapElement: async () => okResult({}),
      navigateBack: async () => okResult({}),
      takeScreenshot: async () => okResult({ outputPath: "/tmp/test-ios.png" } as never),
      recoverToKnownState: async () => okResult({}),
      resetAppState: async () => okResult({}),
      requestManualHandoff: async () => okResult({}),
      getScreenSummary: async () => okResult({} as never),
      tap: async () => okResult({}),
    };

    const snapshot = await createSnapshotter(mcp).captureSnapshot(iosConfig());

    assert.equal(snapshot.screenTitle, "General");
    assert.equal(snapshot.appId, "Settings");
    assert.deepEqual(clickableLabels(snapshot.clickableElements), ["wifi-cell", "bluetooth-cell"]);
    assert.equal(snapshot.clickableElements[1]?.selector.resourceId, "bluetooth-cell");
  });
});
