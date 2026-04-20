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
  inspectUiContent?: unknown;
  inspectUiContents?: Array<unknown>;
  navigateBackStatuses?: Array<"success" | "failed">;
  navigateBackDataList?: Array<Record<string, unknown>>;
  onNavigateBack?: (args: { title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }) => void;
  onTapElement?: (args: { resourceId?: string; contentDesc?: string; text?: string; className?: string; clickable?: boolean }) => void;
  tapElementStatus?: "success" | "failed";
  tapElementStatuses?: Array<"success" | "failed">;
  screenSummaryData?: Record<string, unknown>;
  tapStatus?: "success" | "failed";
  onCoordinateTap?: (args: { x: number; y: number }) => void;
}): McpToolInterface {
  let inspectCounter = 0;
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
      const sequenceContent = options.inspectUiContents?.shift();
      inspectCounter += 1;
      const fallbackDynamicContent = {
        className: "Application",
        children: [{ className: "StaticText", text: `screen-${inspectCounter}`, clickable: false, enabled: true, scrollable: false, children: [] }],
      };
      result.data = {
        content: sequenceContent ?? options.inspectUiContent ?? fallbackDynamicContent,
      } as unknown as typeof result.data;
      return result;
    },
    tapElement: async (args) => {
      options.onTapElement?.(args ?? {});
      const nextTap = options.tapElementStatuses?.shift() ?? options.tapElementStatus ?? "failed";
      return mockResult(nextTap) as ToolResult<any>;
    },
    navigateBack: async (args) => {
      options.onNavigateBack?.({
        title: args?.parentPageTitle,
        iosStrategy: args?.iosStrategy,
      });
      const nextStatus = options.navigateBackStatuses?.shift() ?? options.navigateBackStatus;
      const result = mockResult(nextStatus) as ToolResult<any>;
      const data = options.navigateBackDataList?.shift();
      if (data) {
        result.data = data;
      }
      return result;
    },
    takeScreenshot: async () => mockResult("success") as ToolResult<any>,
    recoverToKnownState: async () => mockResult("success") as ToolResult<any>,
    resetAppState: async () => mockResult("success") as ToolResult<any>,
    requestManualHandoff: async () => mockResult("success") as ToolResult<any>,
    getScreenSummary: async () => {
      const result = mockResult("success") as ToolResult<any>;
      result.data = {
        dryRun: false,
        runnerProfile: "native_ios",
        outputPath: "",
        command: [],
        exitCode: 0,
        supportLevel: "full",
        summarySource: "ui_only",
        screenSummary: options.screenSummaryData ?? {
          pageIdentity: {
            hasBackAffordance: false,
          },
        },
      };
      return result;
    },
    tap: async (args) => {
      options.onCoordinateTap?.({ x: args.x, y: args.y });
      return mockResult(options.tapStatus ?? "failed") as ToolResult<any>;
    },
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

  it("uses iOS app-level back selector family before edge_swipe", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["success"],
      navigateBackDataList: [{ stateChanged: true, executedStrategy: "ios_selector_tap" }],
      waitForUiStableStatus: "success",
      inspectUiContents: [
        {
          className: "Application",
          children: [{ className: "StaticText", text: "INSTALLED FONTS", clickable: false, enabled: true, scrollable: false, children: [] }],
        },
        {
          className: "Application",
          children: [{ className: "StaticText", text: "Fonts", clickable: false, enabled: true, scrollable: false, children: [] }],
        },
      ],
      onNavigateBack: (info) => attempts.push(info),
    });

    const backtracker = createBacktracker(mcp, "ios-simulator");
    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, true);
    assert.deepEqual(attempts, [
      { title: undefined, iosStrategy: undefined },
      { title: "Fonts", iosStrategy: "selector_tap" },
    ]);
  });

  it("uses Android system back before nav-point probing", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const coordinateTaps: Array<{ x: number; y: number }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["success"],
      navigateBackDataList: [{ stateChanged: true, executedStrategy: "android_keyevent" }],
      waitForUiStableStatus: "success",
      inspectUiContents: [
        {
          className: "Application",
          children: [
            {
              className: "Group",
              accessibilityRole: "Nav bar",
              frame: { x: 0, y: 50, width: 430, height: 96 },
              clickable: false,
              enabled: true,
              scrollable: false,
              children: [],
            },
            { className: "StaticText", text: "Real-name authentication", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
        {
          className: "Application",
          children: [
            { className: "StaticText", text: "Real-name authentication", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
        {
          className: "Application",
          children: [
            { className: "StaticText", text: "Real-name authentication", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
        {
          className: "Application",
          children: [{ className: "StaticText", text: "Profile picture", clickable: false, enabled: true, scrollable: false, children: [] }],
        },
      ],
      onNavigateBack: (info) => attempts.push(info),
      onCoordinateTap: (args) => coordinateTaps.push(args),
    });

    const backtracker = createBacktracker(mcp, "android-device");
    const result = await backtracker.navigateBack("Profile picture");

    assert.equal(result, true);
    assert.deepEqual(attempts, [{ title: undefined, iosStrategy: undefined }]);
    assert.equal(coordinateTaps.length, 0);
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

  it("tries Back then Cancel before falling back to parent title", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      navigateBackStatuses: ["failed", "success"],
      waitForUiStableStatus: "success",
      onNavigateBack: (info) => attempts.push(info),
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("General");

    assert.equal(result, true);
    assert.deepEqual(attempts, [
      { title: undefined, iosStrategy: "edge_swipe" },
      { title: undefined, iosStrategy: undefined },
    ]);
  });

  it("treats success-with-unchanged-page as failed back navigation", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["success", "success"],
      navigateBackDataList: [
        { stateChanged: false, pageTreeHashUnchanged: true },
        { stateChanged: true, pageTreeHashUnchanged: false },
      ],
      waitForUiStableStatus: "success",
      onNavigateBack: (info) => attempts.push(info),
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("General");

    assert.equal(result, true);
    assert.deepEqual(attempts, [
      { title: undefined, iosStrategy: "edge_swipe" },
      { title: undefined, iosStrategy: undefined },
      { title: "General", iosStrategy: "selector_tap" },
    ]);
  });

  it("does not reject solely because pageTreeHashUnchanged is true", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["success"],
      navigateBackDataList: [{ stateChanged: "unknown", pageTreeHashUnchanged: true }],
      waitForUiStableStatus: "success",
      inspectUiContents: [
        {
          className: "Application",
          children: [{ className: "StaticText", text: "INSTALLED FONTS", clickable: false, enabled: true, scrollable: false, children: [] }],
        },
        {
          className: "Application",
          children: [{ className: "StaticText", text: "Fonts", clickable: false, enabled: true, scrollable: false, children: [] }],
        },
      ],
      onNavigateBack: (info) => attempts.push(info),
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, true);
    assert.deepEqual(attempts, [{ title: undefined, iosStrategy: "edge_swipe" }]);
  });

  it("parses Android XML inspect content when verifying back transition", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["success"],
      navigateBackDataList: [{ stateChanged: "unknown", pageTreeHashUnchanged: true }],
      waitForUiStableStatus: "success",
      inspectUiContents: [
        "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\"><node index=\"0\" text=\"General\" class=\"android.widget.TextView\" clickable=\"false\" enabled=\"true\" scrollable=\"false\" bounds=\"[0,0][100,20]\"></node></hierarchy>",
        "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\"><node index=\"0\" text=\"Settings\" class=\"android.widget.TextView\" clickable=\"false\" enabled=\"true\" scrollable=\"false\" bounds=\"[0,0][100,20]\"></node></hierarchy>",
      ],
    });

    const backtracker = createBacktracker(mcp);
    const result = await backtracker.navigateBack();

    assert.equal(result, true);
  });

  it("falls back to tapping Cancel when navigate_back selectors fail", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      waitForUiStableStatus: "success",
      onNavigateBack: (info) => attempts.push(info),
      tapElementStatuses: ["failed", "success"],
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("General");

    assert.equal(result, true);
    assert.deepEqual(attempts, [
      { title: undefined, iosStrategy: "edge_swipe" },
      { title: undefined, iosStrategy: undefined },
      { title: "General", iosStrategy: "selector_tap" },
    ]);
  });

  it("falls back to tapping parent title when Back/Cancel are unavailable", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      waitForUiStableStatus: "success",
      onNavigateBack: (info) => attempts.push(info),
      tapElementStatuses: ["failed", "failed", "success"],
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, true);
    assert.deepEqual(attempts, [
      { title: undefined, iosStrategy: "edge_swipe" },
      { title: undefined, iosStrategy: undefined },
      { title: "Fonts", iosStrategy: "selector_tap" },
    ]);
  });

  it("reuses cached semantic selector strategy before re-running generic ladder", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["failed", "failed", "success", "success"],
      navigateBackDataList: [
        { stateChanged: false, pageTreeHashUnchanged: true },
        { stateChanged: false, pageTreeHashUnchanged: true },
        { stateChanged: true, executedStrategy: "ios_selector_tap" },
        { stateChanged: true, executedStrategy: "ios_selector_tap" },
      ],
      waitForUiStableStatus: "success",
      onNavigateBack: (info) => attempts.push(info),
    });
    const backtracker = createBacktracker(mcp, "ios-simulator");

    const first = await backtracker.navigateBack("Fonts");
    const second = await backtracker.navigateBack("Fonts");

    assert.equal(first, true);
    assert.equal(second, true);
    assert.deepEqual(attempts, [
      { title: undefined, iosStrategy: undefined },
      { title: "Fonts", iosStrategy: "selector_tap" },
      { title: "Fonts", iosStrategy: "selector_tap" },
    ]);
  });

  it("uses screen summary back affordance label as final fallback", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const tapSelectors: Array<{ resourceId?: string; contentDesc?: string; text?: string; className?: string; clickable?: boolean }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      waitForUiStableStatus: "success",
      tapElementStatuses: Array.from({ length: 200 }, () => "failed" as const),
      screenSummaryData: {
        pageIdentity: {
          hasBackAffordance: true,
          backAffordanceLabel: "Fonts",
        },
      },
      onTapElement: (args) => tapSelectors.push(args),
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, false);
    assert.equal(
      tapSelectors.some((selector) => selector.contentDesc === "Fonts" && selector.className === "Button"),
      true,
    );
  });

  it("uses nav-bar coordinate tap as last-resort fallback", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const coordinateTaps: Array<{ x: number; y: number }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      waitForUiStableStatus: "success",
      tapElementStatuses: Array.from({ length: 200 }, () => "failed" as const),
      tapStatus: "success",
      inspectUiContents: [
        {
          className: "Application",
          children: [
            {
              className: "Group",
              accessibilityRole: "Nav bar",
              frame: { x: 0, y: 50, width: 430, height: 96 },
              clickable: false,
              enabled: true,
              scrollable: false,
              children: [],
            },
            { className: "Heading", text: "INSTALLED FONTS", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
        {
          className: "Application",
          children: [
            { className: "Heading", text: "Fonts", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
      ],
      onCoordinateTap: (args) => coordinateTaps.push(args),
      screenSummaryData: {
        pageIdentity: {
          hasBackAffordance: false,
        },
      },
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, true);
    assert.equal(coordinateTaps.length > 0, true);
  });

  it("prioritizes point-band on iOS non-dialog pages before edge_swipe when selectors are absent", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const coordinateTaps: Array<{ x: number; y: number }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      navigateBackStatuses: ["failed", "failed", "failed", "failed"],
      navigateBackDataList: [
        {},
        {},
        {},
        {},
      ],
      waitForUiStableStatus: "success",
      tapStatus: "success",
      inspectUiContents: [
        {
          className: "Application",
          children: [
            { className: "Heading", text: "INSTALLED FONTS", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
        {
          className: "Application",
          children: [
            { className: "Heading", text: "INSTALLED FONTS", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
        {
          className: "Application",
          children: [
            { className: "Heading", text: "Fonts", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
      ],
      screenSummaryData: {
        pageIdentity: { hasBackAffordance: false },
      },
      onNavigateBack: (info) => attempts.push(info),
      onCoordinateTap: (args) => coordinateTaps.push(args),
    });
    const backtracker = createBacktracker(mcp, "ios-simulator");

    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, true);
    assert.equal(coordinateTaps.length > 0, true);
    assert.equal(attempts.some((entry) => entry.iosStrategy === "edge_swipe"), false);
  });

  it("still prefers cancel/close before point-band on iOS dialog-like pages", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const attempts: Array<{ title?: string; iosStrategy?: "selector_tap" | "edge_swipe" }> = [];
    const coordinateTaps: Array<{ x: number; y: number }> = [];
    const mcp = createMockMcp({
      navigateBackStatus: "failed",
      navigateBackStatuses: ["failed", "failed", "failed", "failed"],
      waitForUiStableStatus: "success",
      tapStatus: "success",
      tapElementStatuses: ["success"],
      inspectUiContents: [
        {
          className: "Application",
          children: [
            { className: "Heading", text: "Delete font?", clickable: false, enabled: true, scrollable: false, children: [] },
            { className: "Button", text: "Cancel", clickable: true, enabled: true, scrollable: false, frame: { x: 300, y: 120, width: 80, height: 30 }, children: [] },
            { className: "Button", text: "OK", clickable: true, enabled: true, scrollable: false, frame: { x: 380, y: 120, width: 40, height: 30 }, children: [] },
          ],
        },
        {
          className: "Application",
          children: [
            { className: "Heading", text: "Fonts", clickable: false, enabled: true, scrollable: false, children: [] },
          ],
        },
      ],
      onNavigateBack: (info) => attempts.push(info),
      onCoordinateTap: (args) => coordinateTaps.push(args),
    });
    const backtracker = createBacktracker(mcp, "ios-simulator");

    const result = await backtracker.navigateBack("Fonts");

    assert.equal(result, true);
    assert.equal(coordinateTaps.length, 0);
    assert.equal(attempts.some((entry) => entry.iosStrategy === "edge_swipe"), false);
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
        clickable: false,
        enabled: true,
        scrollable: false,
        children: [
          { className: "StaticText", text: "General", clickable: false, enabled: true, scrollable: false, children: [] },
        ],
      },
    });
    const backtracker = createBacktracker(mcp);
    // We need to compute the expected hash — import it
    const { hashUiStructure } = await import("../src/page-registry.js");
    const expectedStructureHash = hashUiStructure({
      className: "Application",
      clickable: false,
      enabled: true,
      scrollable: false,
      children: [
        { className: "StaticText", text: "General", clickable: false, enabled: true, scrollable: false, children: [] },
      ],
    });
    const result = await backtracker.isOnExpectedPage("nonexistent-hash", "General", expectedStructureHash);
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

  it("falls back to normalized title match when hash and screenId differ", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      waitForUiStableStatus: "success",
      inspectUiContent: {
        className: "Application",
        children: [
          { className: "StaticText", text: "Preferred   Languages", clickable: false, enabled: true, scrollable: false, children: [] },
        ],
      },
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.isOnExpectedPage("screen-id-that-does-not-match", "PREFERRED LANGUAGES", "hash-that-does-not-match");
    assert.equal(result, true);
  });

  it("matches normalized parent title from wrapped iOS inspect payload", async () => {
    const { createBacktracker } = await import("../src/backtrack.js");
    const mcp = createMockMcp({
      navigateBackStatus: "success",
      waitForUiStableStatus: "success",
      inspectUiContent: JSON.stringify([
        {
          type: "Application",
          AXLabel: "Settings",
          children: [
            { type: "StaticText", AXLabel: "Preferred   Languages" },
          ],
        },
      ]),
    });
    const backtracker = createBacktracker(mcp);

    const result = await backtracker.isOnExpectedPage(
      "screen-id-that-does-not-match",
      "preferred languages",
      "hash-that-does-not-match",
    );
    assert.equal(result, true);
  });
});
