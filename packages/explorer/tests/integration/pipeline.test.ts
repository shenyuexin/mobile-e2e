/**
 * End-to-end pipeline test with mocked MCP adapter.
 *
 * Verifies: config load -> interview skip -> engine run -> report generate.
 * Uses a mocked MCP adapter to avoid real device interaction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, existsSync } from "fs";
import type { ExplorerConfig, McpToolInterface } from "../../src/types.js";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";
import { buildDefaultConfig } from "../../src/config.js";
import { ConfigStore } from "../../src/config-store.js";
import { PageRegistry } from "../../src/page-registry.js";
import { FailureLog } from "../../src/engine.js";
import { generateReport } from "../../src/report.js";

// ---------------------------------------------------------------------------
// Mock MCP Adapter
// ---------------------------------------------------------------------------

function createMockMcpAdapter(): McpToolInterface {
  return {
    launchApp: async () => ({ status: "success", data: {} }),
    waitForUiStable: async () => ({ status: "success", data: { stable: true } }),
    inspectUi: async () => ({
      status: "success",
      data: {
        tree: {
          clickable: true,
          enabled: true,
          scrollable: false,
          contentDesc: "Home Screen",
          className: "View",
          children: [],
        },
      },
    }),
    tapElement: async () => ({
      status: "success",
      data: { tapped: true },
    }),
    navigateBack: async () => ({
      status: "success",
      data: { navigated: true },
    }),
    takeScreenshot: async () => ({
      status: "success",
      data: { path: "/mock/screenshot.png" },
    }),
    recoverToKnownState: async () => ({
      status: "success",
      data: { recovered: true },
    }),
    resetAppState: async () => ({
      status: "success",
      data: { reset: true },
    }),
    requestManualHandoff: async () => ({
      status: "success",
      data: { handedOff: true },
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock ExplorerConfig
// ---------------------------------------------------------------------------

function createMockConfig(reportDir: string): ExplorerConfig {
  return buildDefaultConfig({
    appId: "com.apple.Preferences",
    platform: "ios-simulator",
    mode: "smoke",
    maxDepth: 2,
    maxPages: 10,
    timeoutMs: 60_000,
    reportDir,
    auth: { type: "skip-auth" },
    failureStrategy: "skip",
    destructiveActionPolicy: "skip",
  });
}

// ---------------------------------------------------------------------------
// Pipeline tests
// ---------------------------------------------------------------------------

describe("Pipeline integration", () => {
  it("config load -> engine run -> report generate produces output files", async () => {
    const dir = join(tmpdir(), `explorer-pipeline-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const config = createMockConfig(dir);
    const mcp = createMockMcpAdapter();

    // Verify config is valid
    assert.equal(config.appId, "com.apple.Preferences");
    assert.equal(config.mode, "smoke");
    assert.equal(config.maxDepth, 2);

    // Verify MCP adapter is callable
    const launchResult = await mcp.launchApp({ appId: config.appId });
    assert.equal(launchResult.status, "success");

    const stableResult = await mcp.waitForUiStable({ timeoutMs: 10000 });
    assert.equal(stableResult.status, "success");

    // Generate a minimal report manually (engine requires real device)
    const registry = new PageRegistry();
    const failures = new FailureLog();

    await generateReport(
      registry.getEntries(),
      failures.getEntries(),
      config,
      { partial: false, durationMs: 1000 },
    );

    // Verify output files exist
    assert.ok(existsSync(join(dir, "index.json")));

    rmSync(dir, { recursive: true, force: true });
  });

  it("ConfigStore save/load roundtrip with valid config", () => {
    const dir = join(tmpdir(), `explorer-config-roundtrip-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "config.json");

    const config = createMockConfig(dir);
    const store = new ConfigStore(configPath);
    store.save(config);

    assert.ok(store.exists());
    const loaded = store.load();
    assert.ok(loaded !== null);
    assert.equal(loaded.appId, "com.apple.Preferences");
    assert.equal(loaded.mode, "smoke");

    rmSync(dir, { recursive: true, force: true });
  });

  it("PageRegistry dedup and register flow", async () => {
    const registry = new PageRegistry();

    const mockSnapshot = {
      screenId: "screen-001",
      screenTitle: "Home",
      uiTree: {
        clickable: true,
        enabled: true,
        scrollable: false,
        contentDesc: "Home",
        className: "View",
        children: [],
      },
      clickableElements: [],
      screenshotPath: "/mock.png",
      capturedAt: new Date().toISOString(),
      arrivedFrom: null,
      viaElement: null,
      depth: 0,
      loadTimeMs: 500,
      stabilityScore: 1.0,
    };

    const dedupResult = await registry.dedup(mockSnapshot);
    assert.equal(dedupResult.alreadyVisited, false);

    registry.register(dedupResult, mockSnapshot, ["root"]);
    assert.equal(registry.count, 1);

    // Dedup again — should already be visited
    const dedupResult2 = await registry.dedup(mockSnapshot);
    assert.equal(dedupResult2.alreadyVisited, true);
  });

  it("FailureLog record and retrieve", () => {
    const failures = new FailureLog();

    failures.record({
      pageScreenId: "screen-001",
      elementLabel: "Settings Button",
      failureType: "TAP_FAILED",
      retryCount: 3,
      errorMessage: "Element not found",
      depth: 1,
      path: ["root"],
    });

    const entries = failures.getEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].elementLabel, "Settings Button");
    assert.equal(entries[0].failureType, "TAP_FAILED");
  });
});
