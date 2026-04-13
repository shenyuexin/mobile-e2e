/**
 * Unit tests for config module: loadConfig, saveConfig, AdaptiveMaxPages, shouldReuseConfig.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadConfig,
  saveConfig,
  shouldReuseConfig,
  AdaptiveMaxPages,
  buildDefaultConfig,
  INTERVIEW_QUESTIONS,
} from "../src/config.js";

// ---------------------------------------------------------------------------
// Helper: create a temp directory for each test
// ---------------------------------------------------------------------------

function tempDir(): string {
  const dir = join(tmpdir(), `explorer-config-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// loadConfig tests
// ---------------------------------------------------------------------------

describe("loadConfig", () => {
  it("returns null when file does not exist", () => {
    const result = loadConfig("/nonexistent/path/config.json");
    assert.equal(result, null);
  });

  it("parses valid JSON config", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const config = buildDefaultConfig({ appId: "com.test.App" });
    saveConfig(config, path);

    const loaded = loadConfig(path);
    assert.ok(loaded !== null);
    assert.equal(loaded.appId, "com.test.App");
    assert.equal(loaded.mode, "scoped");
    assert.equal(loaded.platform, "ios-simulator");

    // Cleanup
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null for invalid JSON", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, "not json", "utf-8");

    const loaded = loadConfig(path);
    assert.equal(loaded, null);

    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// saveConfig tests
// ---------------------------------------------------------------------------

describe("saveConfig", () => {
  it("writes valid JSON to file", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const config = buildDefaultConfig({ appId: "com.example.App" });
    saveConfig(config, path);

    assert.ok(existsSync(path));
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.appId, "com.example.App");

    rmSync(dir, { recursive: true, force: true });
  });

  it("persists all config fields", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const config = buildDefaultConfig({
      appId: "com.test.App",
      mode: "full",
      platform: "android-emulator",
      maxDepth: 10,
      timeoutMs: 600000,
    });
    saveConfig(config, path);

    const loaded = loadConfig(path)!;
    assert.equal(loaded.appId, "com.test.App");
    assert.equal(loaded.mode, "full");
    assert.equal(loaded.platform, "android-emulator");
    assert.equal(loaded.maxDepth, 10);
    assert.equal(loaded.timeoutMs, 600000);

    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// AdaptiveMaxPages tests
// ---------------------------------------------------------------------------

describe("AdaptiveMaxPages", () => {
  it("initializes with default estimate of 9000ms", () => {
    const amp = new AdaptiveMaxPages();
    assert.equal(amp.rollingAvgMs, 9000);
  });

  it("calculates maxPages correctly for default values", () => {
    const amp = new AdaptiveMaxPages(9000);
    const pages = amp.getMaxPages(300_000);
    // 300000 * 0.8 / 9000 = 26.67 -> 26, clamped to min 50
    assert.equal(pages, 50);
  });

  it("calculates maxPages correctly for fast pages", () => {
    const amp = new AdaptiveMaxPages(3000);
    const pages = amp.getMaxPages(300_000);
    // 300000 * 0.8 / 3000 = 80
    assert.equal(pages, 80);
  });

  it("EMA converges after several updates", () => {
    const amp = new AdaptiveMaxPages(9000, 0.3);

    // Feed several observations of 5000ms
    for (let i = 0; i < 10; i++) {
      amp.update(5000);
    }

    // After many updates, should converge near 5000
    assert.ok(amp.rollingAvgMs < 6000, `Expected < 6000, got ${amp.rollingAvgMs}`);
    assert.ok(amp.rollingAvgMs > 4900, `Expected > 4900, got ${amp.rollingAvgMs}`);
  });

  it("clamps maxPages to [50, 500]", () => {
    // Very slow pages -> should hit min clamp
    const slow = new AdaptiveMaxPages(50000);
    assert.equal(slow.getMaxPages(300_000), 50);

    // Very fast pages -> should hit max clamp
    const fast = new AdaptiveMaxPages(100);
    assert.equal(fast.getMaxPages(300_000), 500);
  });

  it("uses custom alpha", () => {
    const amp = new AdaptiveMaxPages(10000, 0.5);
    amp.update(2000);
    // 0.5 * 10000 + 0.5 * 2000 = 6000
    assert.equal(amp.rollingAvgMs, 6000);
  });
});

// ---------------------------------------------------------------------------
// shouldReuseConfig tests
// ---------------------------------------------------------------------------

describe("shouldReuseConfig", () => {
  it("returns false when file does not exist", () => {
    assert.equal(shouldReuseConfig("/nonexistent/.explorer-config.json"), false);
  });

  it("returns true for recently created file", () => {
    const dir = tempDir();
    const path = join(dir, ".explorer-config.json");
    const config = buildDefaultConfig({ appId: "com.test.App" });
    saveConfig(config, path);

    assert.equal(shouldReuseConfig(path), true);

    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// INTERVIEW_QUESTIONS tests
// ---------------------------------------------------------------------------

describe("INTERVIEW_QUESTIONS", () => {
  it("has 7 questions", () => {
    assert.equal(INTERVIEW_QUESTIONS.length, 7);
  });

  it("covers all required ids", () => {
    const ids = INTERVIEW_QUESTIONS.map((q) => q.id);
    assert.ok(ids.includes("mode"));
    assert.ok(ids.includes("auth"));
    assert.ok(ids.includes("failureStrategy"));
    assert.ok(ids.includes("maxDepth"));
    assert.ok(ids.includes("compareWith"));
    assert.ok(ids.includes("platform"));
    assert.ok(ids.includes("destructiveActionPolicy"));
  });

  it("has Chinese labels for mode options", () => {
    const modeQ = INTERVIEW_QUESTIONS.find((q) => q.id === "mode")!;
    assert.ok(modeQ.options[0].label.includes("主流程冒烟"));
    assert.ok(modeQ.options[1].label.includes("指定模块"));
    assert.ok(modeQ.options[2].label.includes("全量探索"));
  });
});

// ---------------------------------------------------------------------------
// buildDefaultConfig tests
// ---------------------------------------------------------------------------

describe("buildDefaultConfig", () => {
  it("builds config with defaults", () => {
    const config = buildDefaultConfig();
    assert.equal(config.mode, "scoped");
    assert.equal(config.platform, "ios-simulator");
    assert.equal(config.failureStrategy, "retry-3");
    assert.equal(config.destructiveActionPolicy, "skip");
    assert.equal(config.maxDepth, 8);
    assert.equal(config.compareWith, null);
  });

  it("applies mode-based default depth", () => {
    assert.equal(buildDefaultConfig({ mode: "smoke" }).maxDepth, 5);
    assert.equal(buildDefaultConfig({ mode: "scoped" }).maxDepth, 8);
    assert.equal(buildDefaultConfig({ mode: "full" }).maxDepth, Infinity);
  });

  it("overrides with provided values", () => {
    const config = buildDefaultConfig({
      appId: "com.override.App",
      timeoutMs: 120_000,
    });
    assert.equal(config.appId, "com.override.App");
    assert.equal(config.timeoutMs, 120_000);
  });
});
