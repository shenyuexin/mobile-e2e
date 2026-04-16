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
  };
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

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
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
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    };

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

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
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
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    };

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

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
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
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    };

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
      "Font A": makePage("Font A", []),
      "Font B": makePage("Font B", []),
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

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
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
        }

        return okResult({ tapped: true } as any);
      },
      navigateBack: async (args) => {
        const target = args?.parentPageTitle;
        if ((currentPage === "Font A" || currentPage === "Font B") && target === "System Fonts") {
          currentPage = "System Fonts";
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
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    };

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
      result.failed.getEntries().some((entry) => entry.failureType === "BACKTRACK_MISMATCH"),
      false,
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

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
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
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    };

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

    const mcp: McpToolInterface = {
      launchApp: async () => okResult({}),
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
      requestManualHandoff: async () => okResult({ handedOff: true } as any),
    };

    const result = await explore(createMockConfig(), mcp);
    const lifecycle = result.transitionLifecycle;

    assert.ok(lifecycle);
    assert.equal(lifecycle?.actionSent, 3);
    assert.equal(lifecycle?.postStateObserved, 3);
    assert.equal(lifecycle?.transitionCommitted, 2);
    assert.equal(lifecycle?.transitionRejected, 1);
  });
});
