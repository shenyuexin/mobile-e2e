/**
 * Unit tests for backtrack module.
 *
 * Tests: navigateBack success/failure paths with mock MCP interface.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpToolInterface } from "../src/types.js";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";

// We test the createBacktracker logic via its interface contract.
// Since the real MCP tools are not available, we use mock implementations.

// ---------------------------------------------------------------------------
// Mock MCP interface
// ---------------------------------------------------------------------------

function createMockMcp(options: {
  navigateBackStatus: "success" | "failed";
  waitForUiStableStatus: "success" | "failed";
  inspectUiContent?: Record<string, unknown>;
}): McpToolInterface {
  const mockResult = (status: "success" | "failed"): ToolResult<unknown> => ({
    status: status === "success" ? "success" : "failed",
    reasonCode: status === "success" ? "OK" : "ACTION_TAP_FAILED",
    sessionId: "test-session",
    durationMs: 100,
    attempts: 1,
    artifacts: [],
    data: {},
    nextSuggestions: [],
  }) as ToolResult<unknown>;

  return {
    launchApp: async () => mockResult("success") as ToolResult<any>,
    waitForUiStable: async () =>
      mockResult(options.waitForUiStableStatus) as ToolResult<any>,
    inspectUi: async () => {
      const result = mockResult("success") as ToolResult<any>;
      result.data = { content: options.inspectUiContent ?? {} } as unknown as typeof result.data;
      return result;
    },
    tapElement: async () => mockResult("success") as ToolResult<any>,
    navigateBack: async () =>
      mockResult(options.navigateBackStatus) as ToolResult<any>,
    takeScreenshot: async () => mockResult("success") as ToolResult<any>,
    recoverToKnownState: async () => mockResult("success") as ToolResult<any>,
    resetAppState: async () => mockResult("success") as ToolResult<any>,
    requestManualHandoff: async () => mockResult("success") as ToolResult<any>,
  };
}

// ---------------------------------------------------------------------------
// navigateBack tests
// ---------------------------------------------------------------------------

describe("navigateBack — success path", () => {
  it("returns true when both navigateBack and waitForUiStable succeed", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      waitForUiStableStatus: "success",
    });
    const backtracker = createBacktracker(mcp);
    const result = await backtracker.navigateBack();
    assert.equal(result, true);
  });
});

describe("navigateBack — failure paths", () => {
  it("returns false when navigateBack fails", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      waitForUiStableStatus: "success",
    });
    const backtracker = createBacktracker(mcp);
    const result = await backtracker.navigateBack();
    assert.equal(result, false);
  });

  it("returns false when waitForUiStable fails after navigateBack succeeds", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      waitForUiStableStatus: "failed",
    });
    const backtracker = createBacktracker(mcp);
    const result = await backtracker.navigateBack();
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// isOnExpectedPage tests
// ---------------------------------------------------------------------------

describe("isOnExpectedPage", () => {
  it("returns true when screenId matches", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      waitForUiStableStatus: "success",
      inspectUiContent: {
        className: "Application",
        children: [
          { className: "StaticText", text: "General", clickable: false, enabled: true, scrollable: false, children: [] },
        ],
      },
    });
    const backtracker = createBacktracker(mcp);
    // We need to compute the expected hash — import it
    const { hashVisibleTexts } = await import("../src/page-registry.js");
    const expectedHash = hashVisibleTexts({
      className: "Application",
      children: [
        { className: "StaticText", text: "General", clickable: false, enabled: true, scrollable: false, children: [] },
      ],
      clickable: false,
      enabled: true,
      scrollable: false,
    });
    const result = await backtracker.isOnExpectedPage(expectedHash);
    assert.equal(result, true);
  });

  it("returns false when screenId does not match", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      waitForUiStableStatus: "success",
      inspectUiContent: {
        className: "Application",
        children: [
          { className: "StaticText", text: "Camera", clickable: false, enabled: true, scrollable: false, children: [] },
        ],
      },
    });
    const backtracker = createBacktracker(mcp);
    const result = await backtracker.isOnExpectedPage("nonexistent-hash");
    assert.equal(result, false);
  });
});
