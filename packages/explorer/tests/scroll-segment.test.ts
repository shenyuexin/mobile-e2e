import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";
import { getElementKey } from "../src/element-prioritizer.js";
import {
  computePageFingerprint,
  discoverNextSegment,
  getCurrentSegmentElements,
  initScrollState,
  restoreSegment,
} from "../src/scroll-segment.js";
import type { ClickableTarget, ExplorerConfig, Frame, McpToolInterface, PageSnapshot, UiHierarchy } from "../src/types.js";
import { parseUiTreeFromInspectData } from "../src/ui-tree-parser.js";

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

function failedResult<T>(reasonCode = "ACTION_FAILED"): ToolResult<T> {
  return {
    status: "failed",
    reasonCode,
    sessionId: "test-session",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {} as T,
    nextSuggestions: [],
  } as ToolResult<T>;
}

function makeButton(label: string, resourceId?: string): UiHierarchy {
  return {
    className: "Button",
    text: label,
    contentDesc: label,
    resourceId,
    clickable: true,
    enabled: true,
    scrollable: false,
    children: [],
  };
}

function makeTarget(label: string, resourceId?: string): ClickableTarget {
  return {
    label,
    selector: resourceId ? { resourceId } : { contentDesc: label },
    elementType: "Cell",
  };
}

function makeScrollablePage(title: string, buttons: string[], appId = "com.test.app"): UiHierarchy {
  return {
    className: "Application",
    accessibilityLabel: appId,
    packageName: appId,
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [
      {
        className: "android.widget.ScrollView",
        clickable: false,
        enabled: true,
        scrollable: true,
        children: [
          {
            className: "android.widget.TextView",
            text: title,
            contentDesc: title,
            packageName: appId,
            clickable: false,
            enabled: true,
            scrollable: false,
            children: [],
          },
          ...buttons.map((label, i) => ({
            className: "android.view.ViewGroup",
            text: label,
            contentDesc: label,
            packageName: appId,
            resourceId: `com.test:id/item_${i}`,
            clickable: true,
            enabled: true,
            scrollable: false,
            children: [],
          })),
        ],
      },
    ],
  };
}

function makeNonScrollablePage(title: string, buttons: string[]): UiHierarchy {
  return {
    className: "Application",
    accessibilityLabel: "com.test.app",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [
      {
        className: "StaticText",
        text: title,
        contentDesc: title,
        clickable: false,
        enabled: true,
        scrollable: false,
        children: [],
      },
      ...buttons.map(makeButton),
    ],
  };
}

function makeGroupedPage(title: string, buttons: string[], appId = "com.apple.Preferences"): UiHierarchy {
  return {
    className: "Application",
    accessibilityLabel: appId,
    packageName: appId,
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [
      {
        className: "Heading",
        text: title,
        contentDesc: title,
        clickable: false,
        enabled: true,
        scrollable: false,
        children: [],
      },
      {
        className: "Group",
        clickable: false,
        enabled: true,
        scrollable: false,
        children: buttons.map(makeButton),
      },
    ],
  };
}

function createMockConfig(): ExplorerConfig {
  return {
    mode: "full",
    auth: { type: "skip-auth" },
    failureStrategy: "skip",
    maxDepth: 8,
    maxPages: 50,
    timeoutMs: 60_000,
    compareWith: null,
    platform: "android-device",
    destructiveActionPolicy: "skip",
    appId: "com.test.app",
    reportDir: "/tmp/explorer-scroll-test",
  };
}

function makeSnapshot(uiTree: UiHierarchy, title: string, appId: string): PageSnapshot {
  return {
    screenId: `screen-${title}`,
    screenTitle: title,
    uiTree,
    clickableElements: [],
    screenshotPath: "",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: 0,
    loadTimeMs: 0,
    stabilityScore: 1.0,
    appId,
    isExternalApp: false,
  };
}

describe("scroll-segment: initScrollState", () => {
  it("initializes scrollState for scrollable pages", () => {
    const uiTree = makeScrollablePage("Settings", ["Bluetooth", "Wi-Fi", "Display"]);
    const snapshot = makeSnapshot(uiTree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
    };

    initScrollState(frame, snapshot, createMockConfig());

    assert.ok(frame.scrollState);
    assert.equal(frame.scrollState.enabled, true);
    assert.equal(frame.scrollState.segmentIndex, 0);
    assert.equal(frame.scrollState.segments.length, 1);
    assert.ok(frame.scrollState.segments[0].length > 0);
    assert.ok(frame.scrollState.seenKeys.size > 0);
    assert.ok(frame.scrollState.pageFingerprint.length > 0);
    assert.equal(frame.scrollState.maxSegments, 10);
    assert.equal(frame.scrollState.maxRestoreAttempts, 3);
  });

  it("does not initialize scrollState for non-scrollable pages", () => {
    const uiTree = makeNonScrollablePage("About", ["Version"]);
    const snapshot = makeSnapshot(uiTree, "About", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-2", screenTitle: "About" },
      depth: 1,
      path: ["Settings"],
      elementIndex: 0,
      elements: [],
    };

    initScrollState(frame, snapshot, createMockConfig());

    assert.equal(frame.scrollState, undefined);
  });

  it("initializes scrollState for iOS Settings table containers", () => {
    const uiTree = parseUiTreeFromInspectData(
      {
        content: {
          type: "Application",
          AXLabel: "Settings",
          children: [
            {
              type: "Table",
              AXFrame: "{{0,88},{393,764}}",
              children: [
                { type: "Cell", AXLabel: "General", AXUniqueId: "com.apple.settings.general" },
                { type: "Cell", AXLabel: "Privacy & Security", AXUniqueId: "com.apple.settings.privacyAndSecurity" },
                { type: "Cell", AXLabel: "Game Center", AXUniqueId: "com.apple.settings.gameCenter" },
              ],
            },
          ],
        },
      },
      { fallbackToDataRoot: true },
    );
    assert.ok(uiTree);
    const snapshot = makeSnapshot(uiTree, "Settings", "com.apple.Preferences");
    const frame: Frame = {
      state: { screenId: "settings-root", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [
        makeTarget("General", "com.apple.settings.general"),
        makeTarget("Privacy & Security", "com.apple.settings.privacyAndSecurity"),
        makeTarget("Game Center", "com.apple.settings.gameCenter"),
      ],
    };
    const config = { ...createMockConfig(), platform: "ios-simulator" as const, appId: "com.apple.Preferences" };

    initScrollState(frame, snapshot, config);

    assert.ok(frame.scrollState);
    assert.equal(frame.scrollState.enabled, true);
    assert.equal(frame.scrollState.segments[0].length, 3);
  });

  it("initializes scrollState for iOS Group-backed high-fanout Settings pages", () => {
    const labels = [
      "General",
      "Accessibility",
      "Action Button",
      "Siri",
      "Camera",
      "Home Screen & App Library",
      "StandBy",
      "Screen Time",
      "Privacy & Security",
      "Game Center",
    ];
    const uiTree = makeGroupedPage("Settings", labels);
    const snapshot = makeSnapshot(uiTree, "Settings", "com.apple.Preferences");
    const frame: Frame = {
      state: { screenId: "settings-root", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: labels.map((label) => makeTarget(label, `com.apple.settings.${label.replace(/\W+/g, "")}`)),
    };
    const config = { ...createMockConfig(), platform: "ios-simulator" as const, appId: "com.apple.Preferences" };

    initScrollState(frame, snapshot, config);

    assert.ok(frame.scrollState);
    assert.equal(frame.scrollState.enabled, true);
    assert.equal(frame.scrollState.segments[0].length, labels.length);
  });

  it("initializes scrollState for low-fanout iOS Group-backed Settings detail pages", () => {
    const labels = ["View", "Settings"];
    const uiTree = makeGroupedPage("Developer", labels);
    const snapshot = makeSnapshot(uiTree, "Developer", "com.apple.Preferences");
    const frame: Frame = {
      state: { screenId: "developer", screenTitle: "Developer" },
      depth: 1,
      path: ["Developer"],
      elementIndex: 0,
      elements: labels.map((label) => makeTarget(label)),
    };
    const config = { ...createMockConfig(), platform: "ios-simulator" as const, appId: "com.apple.Preferences" };

    initScrollState(frame, snapshot, config);

    assert.ok(frame.scrollState);
    assert.equal(frame.scrollState.enabled, true);
    assert.equal(frame.scrollState.segments[0].length, labels.length);
  });

  it("initializes scrollState for low-fanout iOS Settings detail pages with extra visible signals", () => {
    const labels = ["View", "Settings"];
    const uiTree = makeNonScrollablePage("Developer", labels);
    const snapshot = {
      ...makeSnapshot(uiTree, "Developer", "com.apple.Preferences"),
      pageContext: {
        type: "normal_page" as const,
        platform: "ios" as const,
        visibleSignals: [
          "Settings",
          "Default",
          "View",
          "Clear Trusted Computers",
          "Developer",
          "APPEARANCE",
          "Dark Appearance",
        ],
      },
    };
    const frame: Frame = {
      state: { screenId: "developer", screenTitle: "Developer" },
      depth: 1,
      path: ["Developer"],
      elementIndex: 0,
      elements: labels.map((label) => makeTarget(label)),
    };
    const config = { ...createMockConfig(), platform: "ios-simulator" as const, appId: "com.apple.Preferences" };

    initScrollState(frame, snapshot, config);

    assert.ok(frame.scrollState);
    assert.equal(frame.scrollState.enabled, true);
    assert.equal(frame.scrollState.segments[0].length, labels.length);
  });

  it("does not use the iOS Group fallback for Android pages", () => {
    const labels = [
      "General",
      "Accessibility",
      "Action Button",
      "Siri",
      "Camera",
      "Home Screen & App Library",
      "StandBy",
      "Screen Time",
    ];
    const uiTree = makeGroupedPage("Settings", labels, "com.android.settings");
    const snapshot = makeSnapshot(uiTree, "Settings", "com.android.settings");
    const frame: Frame = {
      state: { screenId: "settings-root", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: labels.map((label) => makeTarget(label)),
    };

    initScrollState(frame, snapshot, createMockConfig());

    assert.equal(frame.scrollState, undefined);
  });

  it("logs a diagnostic when a high-fanout page does not arm scrollState", () => {
    const uiTree = makeNonScrollablePage("Settings", [
      "General",
      "Accessibility",
      "Action Button",
      "Siri",
      "Camera",
      "Home Screen & App Library",
      "StandBy",
      "Screen Time",
    ]);
    const snapshot = makeSnapshot(uiTree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "settings-root", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: uiTree.children?.slice(1).map((node) => makeTarget(node.text ?? "")) ?? [],
    };
    const originalLog = console.log;
    const messages: string[] = [];
    console.log = (message?: unknown, ...optionalParams: unknown[]) => {
      messages.push([message, ...optionalParams].map(String).join(" "));
    };

    try {
      initScrollState(frame, snapshot, createMockConfig());
    } finally {
      console.log = originalLog;
    }

    assert.equal(frame.scrollState, undefined);
    assert.equal(
      messages.some((message) => message.includes("[SCROLL-STATE] Not initialized") && message.includes("visibleElements=8")),
      true,
    );
  });

  it("uses rule registry disabledRuleIds when filtering initial scroll segment", () => {
    const uiTree = makeScrollablePage("Settings", ["Help", "Wi-Fi"]);
    const snapshot = makeSnapshot(uiTree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-settings", screenTitle: "Settings" },
      depth: 0,
      path: ["Settings"],
      elementIndex: 0,
      elements: [],
    };
    const config = {
      ...createMockConfig(),
      rules: {
        version: 1 as const,
        defaults: { disabledRuleIds: ["default.element.help.low-value-skip"] },
      },
    };

    initScrollState(frame, snapshot, config);

    assert.ok(frame.scrollState);
    assert.ok(frame.scrollState.segments[0].some((element) => element.label === "Help"));
  });

  it("applies project rule registry element skips to initial scroll segment", () => {
    const uiTree = makeScrollablePage("Settings", ["Wi-Fi", "Display"]);
    const snapshot = makeSnapshot(uiTree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-settings", screenTitle: "Settings" },
      depth: 0,
      path: ["Settings"],
      elementIndex: 0,
      elements: [],
    };
    const config = {
      ...createMockConfig(),
      rules: {
        version: 1 as const,
        rules: [
          {
            id: "project.skip.display-scroll",
            category: "element-skip" as const,
            action: "skip-element" as const,
            reason: "Skip Display in scroll segment",
            match: { elementLabel: "Display" },
          },
        ],
      },
    };

    initScrollState(frame, snapshot, config);

    assert.ok(frame.scrollState);
    assert.deepEqual(frame.scrollState.segments[0].map((element) => element.label), []);
    assert.equal(frame.scrollState.ruleDecisions?.[0]?.ruleId, "project.skip.display-scroll");
  });
});

describe("scroll-segment: getCurrentSegmentElements", () => {
  it("returns frame.elements when no scrollState", () => {
    const frame: Frame = {
      state: { screenId: "s1" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [{ label: "A", selector: { text: "A" }, elementType: "Button" }],
    };
    const result = getCurrentSegmentElements(frame);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, "A");
  });

  it("returns current segment elements when scrollState is active", () => {
    const seg0 = [{ label: "A", selector: { text: "A" }, elementType: "Button" }];
    const seg1 = [{ label: "B", selector: { text: "B" }, elementType: "Button" }];
    const frame: Frame = {
      state: { screenId: "s1" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
      scrollState: {
        enabled: true,
        segmentIndex: 1,
        segments: [seg0, seg1],
        seenKeys: new Set(["A", "B"]),
        pageFingerprint: "fp",
        maxSegments: 10,
        restoreAttempts: 0,
        maxRestoreAttempts: 3,
      },
    };
    const result = getCurrentSegmentElements(frame);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, "B");
  });

  it("returns empty array when segmentIndex is out of bounds", () => {
    const frame: Frame = {
      state: { screenId: "s1" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
      scrollState: {
        enabled: true,
        segmentIndex: 5,
        segments: [[{ label: "A", selector: { text: "A" }, elementType: "Button" }]],
        seenKeys: new Set(["A"]),
        pageFingerprint: "fp",
        maxSegments: 10,
        restoreAttempts: 0,
        maxRestoreAttempts: 3,
      },
    };
    const result = getCurrentSegmentElements(frame);
    assert.equal(result.length, 0);
  });
});

describe("scroll-segment: discoverNextSegment", () => {
  it("discovers new elements after scroll (3-segment page)", async () => {
    const seg0Buttons = ["Bluetooth", "SIMs", "Display"];
    const seg1Buttons = ["Apps", "Security", "Privacy"];
    const seg2Buttons = ["Storage", "Accounts"];

    const seg0Tree = makeScrollablePage("Settings", seg0Buttons);
    const seg1Tree = makeScrollablePage("Settings", seg1Buttons);
    const seg2Tree = makeScrollablePage("Settings", seg2Buttons);

    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 3,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());
    assert.ok(frame.scrollState);
    assert.equal(frame.scrollState.segments[0].length, 3);

    let scrollCallCount = 0;
    const scrollDirections: string[] = [];
    const mcp = {
      scrollOnly: async (args: { direction: string }) => {
        scrollCallCount++;
        scrollDirections.push(args.direction);
        return okResult({ swipesPerformed: 1 } as any);
      },
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => {
        if (scrollCallCount === 1) return okResult({ content: seg1Tree } as any);
        return okResult({ content: seg2Tree } as any);
      },
    } as unknown as McpToolInterface;

    const config = createMockConfig();

    const result1 = await discoverNextSegment(mcp, frame, config);
    assert.equal(result1.success, true);
    assert.ok(result1.newElements);
    assert.equal(result1.newElements.length, 3);
    assert.equal(frame.scrollState.segmentIndex, 1);
    assert.equal(frame.scrollState.segments.length, 2);

    const result2 = await discoverNextSegment(mcp, frame, config);
    assert.equal(result2.success, true);
    assert.ok(result2.newElements);
    assert.equal(result2.newElements.length, 2);
    assert.equal(frame.scrollState.segmentIndex, 2);
    assert.equal(frame.scrollState.segments.length, 3);
    assert.deepEqual(scrollDirections, ["up", "up"]);
  });

  it("stops when page fingerprint changes (same-page detection)", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth"]);
    const differentPageTree = makeScrollablePage("DifferentPage", ["Other"]);

    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 1,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());

    const mcp = {
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: differentPageTree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, false);
    assert.equal(result.isLastSegment, true);
  });

  it("keeps discovering when the same page scrolls but visible item texts change", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth", "Display"]);
    const seg1Tree = makeScrollablePage("Settings", ["Apps", "Security"]);

    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 2,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());

    const mcp = {
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: seg1Tree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, true);
    assert.equal(result.isLastSegment, false);
    assert.deepEqual(result.newElements?.map((entry) => entry.label), ["Apps", "Security"]);
  });

  it("stops when no new elements after scroll (bottom detection)", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth", "Display"]);
    const sameTree = makeScrollablePage("Settings", ["Bluetooth", "Display"]);

    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 2,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());

    const mcp = {
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: sameTree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, false);
    assert.equal(result.isLastSegment, true);
  });

  it("deduplicates overlapping elements across segments (cumulative dedup)", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth", "Display"]);
    const seg1Tree = makeScrollablePage("Settings", ["Display", "Apps", "Security"]);

    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 2,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());

    const mcp = {
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: seg1Tree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, true);
    assert.ok(result.newElements);
    assert.equal(result.newElements.length, 2);
    const labels = result.newElements.map(e => e.label);
    assert.ok(labels.includes("Apps"));
    assert.ok(labels.includes("Security"));
    assert.ok(!labels.includes("Display"));
  });

  it("returns failure when scrollOnly fails", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth"]);
    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 1,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());

    const mcp = {
      scrollOnly: async () => failedResult("SCROLL_FAILED"),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: seg0Tree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, false);
    assert.equal(result.isLastSegment, true);
  });

  it("returns failure when maxSegments reached", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth"]);
    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 1,
      elements: [],
    };
    initScrollState(frame, snapshot0, createMockConfig());
    if (frame.scrollState) {
      frame.scrollState.segmentIndex = 9;
      frame.scrollState.maxSegments = 10;
    }

    const mcp = {
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: seg0Tree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, false);
    assert.equal(result.isLastSegment, true);
  });

  it("returns failure when scrollState is not enabled", async () => {
    const frame: Frame = {
      state: { screenId: "s1" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [{ label: "A", selector: { text: "A" }, elementType: "Button" }],
    };
    const mcp = {} as McpToolInterface;
    const result = await discoverNextSegment(mcp, frame, createMockConfig());
    assert.equal(result.success, false);
    assert.equal(result.isLastSegment, true);
  });

  it("applies skip-element filtering to newly discovered segments", async () => {
    const seg0Tree = makeScrollablePage("Settings", ["Bluetooth"]);
    const seg1Tree = makeScrollablePage("Settings", ["Restricted item", "Allowed item"]);

    const snapshot0 = makeSnapshot(seg0Tree, "Settings", "com.test.app");
    const frame: Frame = {
      state: { screenId: "screen-1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 1,
      elements: [],
    };

    const config = {
      ...createMockConfig(),
      skipElements: [
        {
          match: {
            screenTitle: "Settings",
            elementLabel: "Restricted",
          },
        },
      ],
    } satisfies ExplorerConfig;

    initScrollState(frame, snapshot0, config);

    const mcp = {
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
      inspectUi: async () => okResult({ content: seg1Tree } as any),
    } as unknown as McpToolInterface;

    const result = await discoverNextSegment(mcp, frame, config);
    assert.equal(result.success, true);
    assert.deepEqual(result.newElements?.map((entry) => entry.label), ["Allowed item"]);
  });
});

describe("scroll-segment: restoreSegment", () => {
  it("returns true for segment 0 (always at top)", async () => {
    const frame: Frame = {
      state: { screenId: "s1" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
      scrollState: {
        enabled: true,
        segmentIndex: 0,
        segments: [[{ label: "A", selector: { text: "A" }, elementType: "Button" }]],
        seenKeys: new Set(["A"]),
        pageFingerprint: "fp",
        maxSegments: 10,
        restoreAttempts: 0,
        maxRestoreAttempts: 3,
      },
    };
    const mcp = {} as McpToolInterface;
    const result = await restoreSegment(mcp, frame, createMockConfig());
    assert.equal(result, true);
  });

  it("returns true when no scrollState", async () => {
    const frame: Frame = {
      state: { screenId: "s1" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
    };
    const mcp = {} as McpToolInterface;
    const result = await restoreSegment(mcp, frame, createMockConfig());
    assert.equal(result, true);
  });

  it("restores viewport by replaying forward scroll gestures to target segment", async () => {
    const seg0 = [
      { label: "Bluetooth", selector: { text: "Bluetooth" }, elementType: "Button" },
    ];
    const seg1 = [
      { label: "Apps", selector: { text: "Apps" }, elementType: "Button" },
    ];
    const frame: Frame = {
      state: { screenId: "s1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
      scrollState: {
        enabled: true,
        segmentIndex: 1,
        segments: [seg0, seg1],
        seenKeys: new Set(["Bluetooth", "Apps"]),
        pageFingerprint: "fp",
        maxSegments: 10,
        restoreAttempts: 0,
        maxRestoreAttempts: 3,
      },
    };

    let inspectCall = 0;
    const scrollDirections: string[] = [];
    const mcp = {
      inspectUi: async () => {
        inspectCall += 1;
        return okResult({
          content: inspectCall === 1 ? makeScrollablePage("Settings", ["Bluetooth"]) : makeScrollablePage("Settings", ["Apps"]),
        } as any);
      },
      scrollOnly: async (args: { direction: string }) => {
        scrollDirections.push(args.direction);
        return okResult({ swipesPerformed: 1 } as any);
      },
      waitForUiStable: async () => okResult({ stable: true } as any),
    } as unknown as McpToolInterface;

    const result = await restoreSegment(mcp, frame, createMockConfig());
    assert.equal(result, true);
    assert.equal(frame.scrollState?.restoreAttempts, 0);
    assert.deepEqual(scrollDirections, ["up"]);
  });

  it("fails when maxRestoreAttempts exceeded", async () => {
    const seg0 = [
      { label: "Bluetooth", selector: { text: "Bluetooth" }, elementType: "Button" },
    ];
    const seg1 = [
      { label: "Apps", selector: { text: "Apps" }, elementType: "Button" },
    ];
    const wrongTree = makeScrollablePage("Settings", ["Bluetooth"]);

    const frame: Frame = {
      state: { screenId: "s1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
      scrollState: {
        enabled: true,
        segmentIndex: 1,
        segments: [seg0, seg1],
        seenKeys: new Set(["Bluetooth", "Apps"]),
        pageFingerprint: "fp",
        maxSegments: 10,
        restoreAttempts: 3,
        maxRestoreAttempts: 3,
      },
    };

    const mcp = {
      inspectUi: async () => okResult({ content: wrongTree } as any),
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
    } as unknown as McpToolInterface;

    const result = await restoreSegment(mcp, frame, createMockConfig());
    assert.equal(result, false);
  });

  it("does not burn restore budget across repeated successful restores", async () => {
    const seg0 = [
      { label: "Bluetooth", selector: { text: "Bluetooth" }, elementType: "Button" },
    ];
    const seg1 = [
      { label: "Apps", selector: { text: "Apps" }, elementType: "Button" },
    ];

    const frame: Frame = {
      state: { screenId: "s1", screenTitle: "Settings" },
      depth: 0,
      path: [],
      elementIndex: 0,
      elements: [],
      scrollState: {
        enabled: true,
        segmentIndex: 1,
        segments: [seg0, seg1],
        seenKeys: new Set(["Bluetooth", "Apps"]),
        pageFingerprint: "fp",
        maxSegments: 10,
        restoreAttempts: 0,
        maxRestoreAttempts: 1,
      },
    };

    let inspectCall = 0;
    const mcp = {
      inspectUi: async () => {
        inspectCall += 1;
        return okResult({
          content: inspectCall % 2 === 1 ? makeScrollablePage("Settings", ["Bluetooth"]) : makeScrollablePage("Settings", ["Apps"]),
        } as any);
      },
      scrollOnly: async () => okResult({ swipesPerformed: 1 } as any),
      waitForUiStable: async () => okResult({ stable: true } as any),
    } as unknown as McpToolInterface;

    assert.equal(await restoreSegment(mcp, frame, createMockConfig()), true);
    assert.equal(frame.scrollState?.restoreAttempts, 0);
    assert.equal(await restoreSegment(mcp, frame, createMockConfig()), true);
    assert.equal(frame.scrollState?.restoreAttempts, 0);
  });
});

describe("scroll-segment: computePageFingerprint", () => {
  it("produces a stable fingerprint for the same page", () => {
    const tree1 = makeScrollablePage("Settings", ["A", "B"]);
    const tree2 = makeScrollablePage("Settings", ["A", "B"]);
    const snap1 = makeSnapshot(tree1, "Settings", "com.test.app");
    const snap2 = makeSnapshot(tree2, "Settings", "com.test.app");
    assert.equal(computePageFingerprint(snap1), computePageFingerprint(snap2));
  });

  it("ignores scroll-only changes in visible child items for the same page", () => {
    const snap1 = makeSnapshot(makeScrollablePage("Settings", ["Bluetooth", "Display"]), "Settings", "com.test.app");
    const snap2 = makeSnapshot(makeScrollablePage("Settings", ["Apps", "Privacy"]), "Settings", "com.test.app");
    assert.equal(computePageFingerprint(snap1), computePageFingerprint(snap2));
  });

  it("produces different fingerprints for different pages", () => {
    const tree1 = makeScrollablePage("Settings", ["A"]);
    const tree2 = makeScrollablePage("General", ["B"]);
    const snap1 = makeSnapshot(tree1, "Settings", "com.test.app");
    const snap2 = makeSnapshot(tree2, "General", "com.test.app");
    assert.notEqual(computePageFingerprint(snap1), computePageFingerprint(snap2));
  });
});

describe("scroll-segment: getElementKey", () => {
  it("produces a key from resourceId, contentDesc, and text", () => {
    const el: UiHierarchy = {
      resourceId: "com.test:id/item_0",
      contentDesc: "Bluetooth",
      text: "Bluetooth",
      clickable: true,
      enabled: true,
      scrollable: false,
    };
    const key = getElementKey(el);
    assert.ok(key.includes("com.test:id/item_0"));
    assert.ok(key.includes("Bluetooth"));
  });

  it("produces different keys for different elements", () => {
    const el1: UiHierarchy = {
      resourceId: "id1",
      text: "A",
      clickable: true,
      enabled: true,
      scrollable: false,
    };
    const el2: UiHierarchy = {
      resourceId: "id2",
      text: "B",
      clickable: true,
      enabled: true,
      scrollable: false,
    };
    assert.notEqual(getElementKey(el1), getElementKey(el2));
  });
});
