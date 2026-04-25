import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";
import type { ExplorerConfig, McpToolInterface, UiHierarchy } from "../src/types.js";
import { explore } from "../src/engine.js";

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

function failedResult<T>(reasonCode = "ACTION_TAP_FAILED"): ToolResult<T> {
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

function makeButton(label: string): UiHierarchy {
  return {
    className: "Button",
    text: label,
    contentDesc: label,
    clickable: true,
    enabled: true,
    scrollable: false,
    children: [],
  };
}

function makePage(title: string, buttons: string[]): UiHierarchy {
  return {
    className: "Application",
    accessibilityLabel: "Settings",
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

function makePageInApp(appId: string, title: string, buttons: string[]): UiHierarchy {
  return {
    className: "Application",
    accessibilityLabel: appId,
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

function makeAndroidPageInApp(appId: string, title: string, buttons: string[]): UiHierarchy {
  return {
    className: "Application",
    packageName: appId,
    clickable: false,
    enabled: true,
    scrollable: false,
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
      ...buttons.map((label) => ({
        className: "android.view.ViewGroup",
        text: label,
        contentDesc: label,
        packageName: appId,
        clickable: true,
        enabled: true,
        scrollable: false,
        children: [],
      })),
    ],
  };
}

function createMockConfig(): ExplorerConfig {
  return {
    mode: "smoke",
    auth: { type: "skip-auth" },
    failureStrategy: "skip",
    maxDepth: 4,
    maxPages: 10,
    timeoutMs: 10_000,
    compareWith: null,
    platform: "ios-simulator",
    destructiveActionPolicy: "skip",
    appId: "com.apple.Preferences",
    reportDir: "/tmp/explorer-engine-test",
    externalLinkMaxDepth: 1,
    statefulFormPolicy: "skip",
  };
}

function withDefaultMcp(
  overrides: Omit<McpToolInterface, "tap" | "getScreenSummary"> &
    Partial<Pick<McpToolInterface, "tap" | "getScreenSummary">>,
): McpToolInterface {
  return {
    tap: async () => okResult({ tapped: true } as any),
    getScreenSummary: async () =>
      okResult({
        title: "mock",
        screenId: "mock-screen",
        backAffordance: { hasBackAffordance: false },
      } as any),
    ...overrides,
  } as McpToolInterface;
}

describe("explore engine recovery", () => {
  it("does not tap stale siblings when frame recovery fails", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["About", "Dictionary"]),
      About: makePage("About", []),
      Dictionary: makePage("Dictionary", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "About") {
        currentPage = "About";
      } else if (currentPage === "General" && label === "Dictionary") {
        currentPage = "Dictionary";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
    
      if (currentPage === "General" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
    
      if (currentPage === "About" && target === "General") {
        return failedResult("NAVIGATE_BACK_FAILED");
      }
    
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(createMockConfig(), mcp);

    assert.equal(
      tapLog.some((entry) => entry.label === "Dictionary" && entry.page === "About"),
      false,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      true,
    );
  });

  it("preserves parentTitle so DFS can continue siblings after sampled back flow", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["Fonts", "Keyboard"]),
      Fonts: makePage("Fonts", ["Back"]),
      Keyboard: makePage("Keyboard", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];
    const backLog: Array<{ page: string; target?: string }> = [];

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Fonts") {
        currentPage = "Fonts";
      } else if (currentPage === "Fonts" && label === "Back") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Keyboard") {
        currentPage = "Keyboard";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      backLog.push({ page: currentPage, target: args?.parentPageTitle });
      const target = args?.parentPageTitle;
    
      if (currentPage === "General" && target === "Fonts") {
        currentPage = "Fonts";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Fonts" && target === "General") {
        currentPage = "General";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "General" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
    
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(createMockConfig(), mcp);

    assert.equal(
      tapLog.some((entry) => entry.page === "General" && entry.label === "Keyboard"),
      true,
    );
    assert.equal(
      backLog.some((entry) => entry.page === "Fonts" && entry.target === "General"),
      true,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      false,
    );
  });

  it("does not execute stale child taps after BACKTRACK-POP", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["About", "Keyboard"]),
      About: makePage("About", ["Back", "iOS Version"]),
      Keyboard: makePage("Keyboard", []),
      "iOS Version": makePage("iOS Version", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "About") {
        currentPage = "About";
      } else if (currentPage === "About" && label === "Back") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Keyboard") {
        currentPage = "Keyboard";
      } else if (currentPage === "About" && label === "iOS Version") {
        currentPage = "iOS Version";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "About" && (target === "Back" || target === "General")) {
        currentPage = "General";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "General" && (target === "Back" || target === "Settings")) {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    await explore(createMockConfig(), mcp);

    assert.equal(
      tapLog.some((entry) => entry.page === "General" && entry.label === "iOS Version"),
      false,
    );
    assert.equal(
      tapLog.some((entry) => entry.page === "General" && entry.label === "Keyboard"),
      true,
    );
  });

  it("applies sampling rule only at full path prefix depth", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["Fonts", "Keyboard"]),
      Fonts: makePage("Fonts", ["System Fonts", "My Fonts"]),
      "System Fonts": makePage("System Fonts", ["Font A", "Font B"]),
      "My Fonts": makePage("My Fonts", []),
      Keyboard: makePage("Keyboard", []),
      "Font A": makePage("Font A", ["System Fonts", "Plain"]),
      "Font B": makePage("Font B", []),
      Plain: makePage("Plain", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const config = {
      ...createMockConfig(),
      samplingRules: [
        {
          match: { pathPrefix: ["General", "Fonts", "System Fonts"] },
          strategy: "representative-child" as const,
          maxChildrenToValidate: 1,
          mode: "smoke" as const,
        },
      ],
    };

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Fonts") {
        currentPage = "Fonts";
      } else if (currentPage === "General" && label === "Keyboard") {
        currentPage = "Keyboard";
      } else if (currentPage === "Fonts" && label === "System Fonts") {
        currentPage = "System Fonts";
      } else if (currentPage === "Fonts" && label === "My Fonts") {
        currentPage = "My Fonts";
      } else if (currentPage === "System Fonts" && label === "Font A") {
        currentPage = "Font A";
      } else if (currentPage === "System Fonts" && label === "Font B") {
        currentPage = "Font B";
      } else if (currentPage === "Font A" && label === "System Fonts") {
        currentPage = "System Fonts";
      } else if (currentPage === "Font A" && label === "Plain") {
        currentPage = "Plain";
      } else if (currentPage === "Plain" && label === "Back") {
        currentPage = "Font A";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if ((currentPage === "Font A" || currentPage === "Font B") && target === "System Fonts") {
        currentPage = "System Fonts";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Plain" && target === "Font A") {
        currentPage = "Font A";
        return okResult({ navigated: true } as any);
      }
      if ((currentPage === "System Fonts" || currentPage === "My Fonts") && target === "Fonts") {
        currentPage = "Fonts";
        return okResult({ navigated: true } as any);
      }
      if ((currentPage === "Fonts" || currentPage === "Keyboard") && target === "General") {
        currentPage = "General";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "General" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(
      tapLog.some((entry) => entry.page === "Fonts" && entry.label === "My Fonts"),
      true,
    );
    assert.equal(
      tapLog.some((entry) => entry.page === "General" && entry.label === "Keyboard"),
      true,
    );

    const tappedSystemFontChildren = tapLog.filter(
      (entry) => entry.page === "System Fonts" && (entry.label === "Font A" || entry.label === "Font B"),
    );
    assert.equal(tappedSystemFontChildren.length, 1);
    assert.equal(
      tapLog.some((entry) => entry.page === "Font A" && entry.label === "Plain"),
      true,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      false,
    );
  });

  it("collapses descendant frames when a child action returns to an ancestor page", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["Fonts", "Keyboard"]),
      Fonts: makePage("Fonts", ["System Fonts"]),
      "System Fonts": makePage("System Fonts", ["Academy Engraved LET"]),
      "Academy Engraved LET": makePage("Academy Engraved LET", ["System Fonts"]),
      Keyboard: makePage("Keyboard", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Fonts") {
        currentPage = "Fonts";
      } else if (currentPage === "General" && label === "Keyboard") {
        currentPage = "Keyboard";
      } else if (currentPage === "Fonts" && label === "System Fonts") {
        currentPage = "System Fonts";
      } else if (currentPage === "System Fonts" && label === "Academy Engraved LET") {
        currentPage = "Academy Engraved LET";
      } else if (currentPage === "Academy Engraved LET" && label === "System Fonts") {
        currentPage = "System Fonts";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "System Fonts" && target === "Fonts") {
        currentPage = "Fonts";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Fonts" && target === "General") {
        currentPage = "General";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "General" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(createMockConfig(), mcp);

    assert.equal(
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      false,
    );
    assert.equal(
      tapLog.some((entry) => entry.page === "General" && entry.label === "Keyboard"),
      true,
    );
  });

  it("aborts when home frame recovery fails to avoid ghost taps on wrong page", async () => {
    const pages = {
      Settings: makePage("Settings", ["General", "Accessibility"]),
      General: makePage("General", ["Language & Region"]),
      "PREFERRED LANGUAGES": makePage("PREFERRED LANGUAGES", ["Add Language…"]),
      "IPHONE LANGUAGES": makePage("IPHONE LANGUAGES", []),
      Accessibility: makePage("Accessibility", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const config = {
      ...createMockConfig(),
      maxPages: 20,
      maxDepth: 5,
    };

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Language & Region") {
        currentPage = "PREFERRED LANGUAGES";
      } else if (currentPage === "PREFERRED LANGUAGES" && label === "Add Language…") {
        currentPage = "IPHONE LANGUAGES";
      } else if (currentPage === "Settings" && label === "Accessibility") {
        currentPage = "Accessibility";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async () => failedResult("NAVIGATE_BACK_FAILED"),
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(result.aborted, true);
    assert.ok((result.abortReason ?? "").includes("Home recovery failed"));
    assert.equal(
      tapLog.some((entry) => entry.page === "Settings" && entry.label === "Accessibility"),
      false,
    );
  });

  it("records transition lifecycle counters for committed and rejected actions", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["About", "NoOp"]),
      About: makePage("About", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "About") {
        currentPage = "About";
      } else if (currentPage === "About" && label === "Back") {
        currentPage = "General";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "About" && target === "General") {
        currentPage = "General";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "General" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(createMockConfig(), mcp);
    const lifecycle = result.transitionLifecycle;

    assert.ok(lifecycle);
    assert.equal(lifecycle?.actionSent, 3);
    assert.equal(lifecycle?.postStateObserved, 3);
    assert.equal(lifecycle?.transitionCommitted, 2);
    assert.equal(lifecycle?.transitionRejected, 1);
  });

  it("continues to tap My Fonts after recovering from System Fonts backtrack", async () => {
    const pages = {
      Settings: makePage("Settings", ["General"]),
      General: makePage("General", ["Fonts"]),
      Fonts: makePage("Fonts", ["System Fonts", "My Fonts"]),
      "System Fonts": makePage("System Fonts", ["Academy Engraved LET"]),
      "My Fonts": makePage("My Fonts", []),
      "Academy Engraved LET": makePage("Academy Engraved LET", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const mcp = withDefaultMcp({ launchApp: async () => okResult({}),
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "General") {
        currentPage = "General";
      } else if (currentPage === "General" && label === "Fonts") {
        currentPage = "Fonts";
      } else if (currentPage === "Fonts" && label === "System Fonts") {
        currentPage = "System Fonts";
      } else if (currentPage === "Fonts" && label === "My Fonts") {
        currentPage = "My Fonts";
      } else if (currentPage === "System Fonts" && label === "Academy Engraved LET") {
        currentPage = "Academy Engraved LET";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "Academy Engraved LET" && target === "System Fonts") {
        currentPage = "System Fonts";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "System Fonts" && target === "Fonts") {
        currentPage = "Fonts";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Fonts" && target === "General") {
        currentPage = "General";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "General" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    await explore(createMockConfig(), mcp);

    assert.equal(
      tapLog.some((entry) => entry.page === "Fonts" && entry.label === "My Fonts"),
      true,
    );
  });

  it("collapses descendant frames when external-app back returns to an ancestor page", async () => {
    const pages = {
      Settings: makeAndroidPageInApp("com.android.settings", "Settings", ["Account", "Display"]),
      Profile: makeAndroidPageInApp("com.bbk.account", "Profile", ["Profile picture"]),
      "Profile picture": makeAndroidPageInApp("com.bbk.account", "Profile picture", ["Profile picture settings"]),
      "Profile picture settings": makeAndroidPageInApp("com.bbk.account", "Profile picture settings", ["Back", "Change avatar"]),
      Display: makeAndroidPageInApp("com.android.settings", "Display", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      externalLinkMaxDepth: 1,
      maxPages: 10,
    };

    const mcp = withDefaultMcp({ launchApp: async () => {
      currentPage = "Settings";
      return okResult({});
    },
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
        if (currentPage === "Settings" && label === "Account") {
          currentPage = "Profile";
        } else if (currentPage === "Settings" && label === "Display") {
          currentPage = "Display";
        } else if (currentPage === "Profile" && label === "Profile picture") {
          currentPage = "Profile picture";
        } else if (currentPage === "Profile picture" && label === "Profile picture settings") {
        currentPage = "Profile picture settings";
      } else if (currentPage === "Profile picture settings" && label === "Back") {
        currentPage = "Profile picture";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "Profile picture settings" && (target === "Profile picture" || target === "Back")) {
        currentPage = "Profile picture";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Profile picture" && target === "Profile") {
        currentPage = "Profile";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Profile" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(
      result.failed.getEntries().some((entry) => entry.path.join(" > ").includes("Account")),
      false,
    );
    assert.equal(
      tapLog.filter((entry) => entry.page === "Profile picture settings" && entry.label === "Change avatar").length,
      0,
    );
    assert.equal(
      tapLog.some((entry) => entry.page === "Settings" && entry.label === "Display"),
      true,
    );
  });

  it("resumes root siblings when external-app return lands on home page", async () => {
    const pages = {
      Settings: makeAndroidPageInApp("com.android.settings", "Settings", ["Bluetooth", "Display"]),
      Bluetooth: makeAndroidPageInApp("com.android.settings", "Bluetooth", [
        "Files received via Bluetooth",
        "Other Bluetooth setting",
      ]),
      "No transfer history": makeAndroidPageInApp("com.android.bluetooth", "No transfer history", []),
      Display: makeAndroidPageInApp("com.android.settings", "Display", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      maxPages: 10,
    };

    const mcp = withDefaultMcp({ launchApp: async () => {
      currentPage = "Settings";
      return okResult({});
    },
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "Bluetooth") {
        currentPage = "Bluetooth";
      } else if (currentPage === "Settings" && label === "Display") {
        currentPage = "Display";
      } else if (currentPage === "Bluetooth" && label === "Files received via Bluetooth") {
        currentPage = "No transfer history";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "Bluetooth" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Display" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(
      tapLog.some((entry) => entry.page === "Settings" && entry.label === "Display"),
      true,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.path.join(" > ").includes("Bluetooth")),
      false,
    );
  });

  it("uses Android system back to return from an external app before relaunching root", async () => {
    const pages = {
      Settings: makeAndroidPageInApp("com.android.settings", "Settings", ["Bluetooth", "Display"]),
      Bluetooth: makeAndroidPageInApp("com.android.settings", "Bluetooth", [
        "Files received via Bluetooth",
        "Other Bluetooth setting",
      ]),
      "No transfer history": makeAndroidPageInApp("com.android.bluetooth", "No transfer history", []),
      Display: makeAndroidPageInApp("com.android.settings", "Display", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];
    const backLog: string[] = [];
    let launchCalls = 0;

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      maxPages: 10,
    };

    const mcp = withDefaultMcp({ launchApp: async () => {
      launchCalls += 1;
      currentPage = "Settings";
      return okResult({});
    },
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });

      if (currentPage === "Settings" && label === "Bluetooth") {
        currentPage = "Bluetooth";
      } else if (currentPage === "Settings" && label === "Display") {
        currentPage = "Display";
      } else if (currentPage === "Bluetooth" && label === "Files received via Bluetooth") {
        currentPage = "No transfer history";
      }

      return okResult({ tapped: true } as any);
    },
    navigateBack: async () => {
      backLog.push(currentPage);
      if (currentPage === "No transfer history") {
        currentPage = "Bluetooth";
        return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
      }
      if (currentPage === "Bluetooth") {
        currentPage = "Settings";
        return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
      }
      if (currentPage === "Display") {
        currentPage = "Settings";
        return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(backLog.includes("No transfer history"), true);
    assert.equal(
      tapLog.some((entry) => entry.page === "Settings" && entry.label === "Display"),
      true,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.path.join(" > ").includes("Bluetooth")),
      false,
    );
  });

  it("accepts Android ancestor returns after transient phone selection flows", async () => {
    const pages = {
      Settings: makeAndroidPageInApp("com.android.settings", "Settings", ["SIMs & mobile network", "Display"]),
      "Data connection": makeAndroidPageInApp("com.android.phone", "Data connection", [
        "Default calling SIM",
        "Data management",
      ]),
      "Dial primary": makeAndroidPageInApp("com.android.phone", "Dial", ["Default calling SIM"]),
      "Default calling SIM": makeAndroidPageInApp("com.android.phone", "Default calling SIM", ["giffgaff"]),
      "Dial secondary": makeAndroidPageInApp("com.android.phone", "Dial", []),
      Display: makeAndroidPageInApp("com.android.settings", "Display", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      maxPages: 12,
    };

    const mcp = withDefaultMcp({ launchApp: async () => {
      currentPage = "Settings";
      return okResult({});
    },
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });

      if (currentPage === "Settings" && label === "SIMs & mobile network") {
        currentPage = "Data connection";
      } else if (currentPage === "Settings" && label === "Display") {
        currentPage = "Display";
      } else if (currentPage === "Data connection" && label === "Default calling SIM") {
        currentPage = "Dial primary";
      } else if (currentPage === "Dial primary" && label === "Default calling SIM") {
        currentPage = "Default calling SIM";
      } else if (currentPage === "Default calling SIM" && label === "giffgaff") {
        currentPage = "Dial secondary";
      }

      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      const target = args?.parentPageTitle;
      if (currentPage === "Dial secondary" && !target) {
        currentPage = "Data connection";
        return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
      }
      if (currentPage === "Data connection" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
      }
      if (currentPage === "Display" && target === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(
      tapLog.some((entry) => entry.page === "Data connection" && entry.label === "Data management"),
      true,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      false,
    );
  });

  it("does not DFS-expand foreign app pages and resumes target-app siblings", async () => {
    const pages = {
      Settings: makeAndroidPageInApp("com.android.settings", "Settings", ["Bluetooth", "Display"]),
      Bluetooth: makeAndroidPageInApp("com.android.settings", "Bluetooth", ["Files received via Bluetooth"]),
      "No transfer history": makeAndroidPageInApp("com.android.bluetooth", "No transfer history", ["Delete history"]),
      Display: makeAndroidPageInApp("com.android.settings", "Display", []),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];
    const backLog: string[] = [];

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      maxPages: 10,
    };

    const mcp = withDefaultMcp({
      launchApp: async () => {
        currentPage = "Settings";
        return okResult({});
      },
      waitForUiStable: async () => okResult({ stable: true }),
      inspectUi: async () => okResult({ content: pages[currentPage] } as any),
      tapElement: async (args) => {
        const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
        tapLog.push({ page: currentPage, label });

        if (currentPage === "Settings" && label === "Bluetooth") {
          currentPage = "Bluetooth";
        } else if (currentPage === "Settings" && label === "Display") {
          currentPage = "Display";
        } else if (currentPage === "Bluetooth" && label === "Files received via Bluetooth") {
          currentPage = "No transfer history";
        } else if (currentPage === "No transfer history" && label === "Delete history") {
          throw new Error("should not explore inside external app");
        }

        return okResult({ tapped: true } as any);
      },
      navigateBack: async () => {
        backLog.push(currentPage);
        if (currentPage === "No transfer history") {
          currentPage = "Bluetooth";
          return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
        }
        if (currentPage === "Bluetooth") {
          currentPage = "Settings";
          return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
        }
        if (currentPage === "Display") {
          currentPage = "Settings";
          return okResult({ navigated: true, stateChanged: true, executedStrategy: "android_keyevent" } as any);
        }
        return failedResult("NAVIGATE_BACK_FAILED");
      },
      takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
      recoverToKnownState: async () => okResult({ recovered: true } as any),
      resetAppState: async () => okResult({ reset: true } as any),
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    });

    const result = await explore(config, mcp);
    const externalPage = result.visited
      .getEntries()
      .find((entry) => entry.screenTitle === "No transfer history");

    assert.ok(externalPage);
    assert.equal(externalPage?.explorationStatus, "reached-not-expanded");
    assert.equal(externalPage?.ruleFamily, "foreign_app_boundary");
    assert.equal(backLog.includes("No transfer history"), true);
    assert.equal(
      tapLog.some((entry) => entry.page === "No transfer history" && entry.label === "Delete history"),
      false,
    );
    assert.equal(
      tapLog.some((entry) => entry.page === "Settings" && entry.label === "Display"),
      true,
    );
  });

  it("dismisses Account nickname dialog via Cancel-first backtrack instead of exploring inside it", async () => {
    const pages = {
      Settings: makePageInApp("com.android.settings", "Settings", ["Account"]),
      Profile: makePageInApp("com.bbk.account", "Profile", ["Profile picture"]),
      "Profile picture": makePageInApp("com.bbk.account", "Profile picture", ["Account nickname"]),
      "Account nickname": makePageInApp("com.bbk.account", "Account nickname", ["OK", "Cancel"]),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];
    const backLog: Array<{ page: string; target?: string }> = [];

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      externalLinkMaxDepth: 1,
      maxPages: 10,
    };

    const mcp = withDefaultMcp({ launchApp: async () => {
      currentPage = "Settings";
      return okResult({});
    },
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "Account") {
        currentPage = "Profile";
      } else if (currentPage === "Profile" && label === "Profile picture") {
        currentPage = "Profile picture";
      } else if (currentPage === "Profile picture" && label === "Account nickname") {
        currentPage = "Account nickname";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      backLog.push({ page: currentPage, target: args?.parentPageTitle });
      if (currentPage === "Account nickname") {
        currentPage = "Profile picture";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Profile picture" && args?.parentPageTitle === "Profile") {
        currentPage = "Profile";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Profile" && args?.parentPageTitle === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);

    assert.equal(
      backLog.some((entry) => entry.page === "Account nickname"),
      true,
    );
    assert.equal(
      tapLog.some((entry) => entry.page === "Account nickname" && entry.label === "OK"),
      false,
    );
    assert.equal(
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      false,
    );
  });

  it("records stateful create-address branch as reached but not expanded when policy is skip", async () => {
    const pages = {
      Settings: makePageInApp("com.android.settings", "Settings", ["Account"]),
      Profile: makePageInApp("com.bbk.account", "Profile", ["Manage shipping addresses"]),
      "Manage shipping addresses": makePageInApp("com.bbk.account", "Manage shipping addresses", ["Create shipping address"]),
      "Create shipping address": makePageInApp("com.bbk.account", "Create shipping address", ["Select country/region", "Address line 1"]),
    } satisfies Record<string, UiHierarchy>;

    let currentPage: keyof typeof pages = "Settings";
    const tapLog: Array<{ page: string; label: string }> = [];
    const backLog: Array<{ page: string; target?: string }> = [];

    const config = {
      ...createMockConfig(),
      platform: "android-device" as const,
      appId: "com.android.settings",
      externalLinkMaxDepth: 1,
      maxPages: 10,
      statefulFormPolicy: "skip" as const,
    };

    const mcp = withDefaultMcp({ launchApp: async () => {
      currentPage = "Settings";
      return okResult({});
    },
    waitForUiStable: async () => okResult({ stable: true }),
    inspectUi: async () => okResult({ content: pages[currentPage] } as any),
    tapElement: async (args) => {
      const label = args.contentDesc ?? args.text ?? args.resourceId ?? "unknown";
      tapLog.push({ page: currentPage, label });
    
      if (currentPage === "Settings" && label === "Account") {
        currentPage = "Profile";
      } else if (currentPage === "Profile" && label === "Manage shipping addresses") {
        currentPage = "Manage shipping addresses";
      } else if (currentPage === "Manage shipping addresses" && label === "Create shipping address") {
        currentPage = "Create shipping address";
      }
    
      return okResult({ tapped: true } as any);
    },
    navigateBack: async (args) => {
      backLog.push({ page: currentPage, target: args?.parentPageTitle });
      if (currentPage === "Create shipping address") {
        currentPage = "Manage shipping addresses";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Manage shipping addresses" && args?.parentPageTitle === "Profile") {
        currentPage = "Profile";
        return okResult({ navigated: true } as any);
      }
      if (currentPage === "Profile" && args?.parentPageTitle === "Settings") {
        currentPage = "Settings";
        return okResult({ navigated: true } as any);
      }
      return failedResult("NAVIGATE_BACK_FAILED");
    },
    takeScreenshot: async () => okResult({ outputPath: "/tmp/mock.png" } as any),
    recoverToKnownState: async () => okResult({ recovered: true } as any),
    resetAppState: async () => okResult({ reset: true } as any),
    requestManualHandoff: async () => okResult({ handedOff: true } as any), });

    const result = await explore(config, mcp);
    const createAddressEntry = result.visited.getEntries().find((entry) => entry.screenTitle === "Create shipping address");

    assert.ok(createAddressEntry);
    assert.equal(createAddressEntry?.explorationStatus, "reached-not-expanded");
    assert.equal(createAddressEntry?.stoppedByPolicy, "statefulFormPolicy:skip");
    assert.equal(createAddressEntry?.ruleFamily, "stateful_form_entry");
    assert.equal(createAddressEntry?.recoveryMethod, "backtrack-cancel-first");
    assert.equal(
      tapLog.some((entry) => entry.page === "Create shipping address" && entry.label === "Select country/region"),
      false,
    );
    assert.equal(
      backLog.some((entry) => entry.page === "Create shipping address"),
      true,
    );
  });
});
