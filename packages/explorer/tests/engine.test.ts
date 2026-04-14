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
});
