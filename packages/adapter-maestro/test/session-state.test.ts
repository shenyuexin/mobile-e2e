import assert from "node:assert/strict";
import test from "node:test";
import { buildLogSummary, buildStateSummaryFromSignals, hasStateChanged } from "../src/session-state.ts";
import { computeTreeHash, sampleNodeSignatures } from "../src/ui-tree-hash.ts";

test("partial-render-before-business-readiness is classified as waiting_network", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 20,
      clickableNodes: 4,
      scrollableNodes: 1,
      nodesWithText: 10,
      nodesWithContentDesc: 2,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "Loading products" },
        { clickable: true, enabled: true, scrollable: false, text: "Retry" },
      ],
    },
    logSummary: buildLogSummary("Network timeout while loading catalog"),
  });

  assert.equal(summary.readiness, "waiting_network");
});

test("network-degraded-retryable is classified as degraded_success", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 32,
      clickableNodes: 6,
      scrollableNodes: 2,
      nodesWithText: 12,
      nodesWithContentDesc: 3,
      sampleNodes: [
        { clickable: true, enabled: true, scrollable: false, text: "Products" },
        { clickable: true, enabled: true, scrollable: false, text: "Add to cart" },
      ],
    },
    logSummary: buildLogSummary("HTTP timeout recovered after retry"),
  });

  assert.equal(summary.readiness, "degraded_success");
});

test("network-terminal-stop-early is classified as backend_failed_terminal", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 16,
      clickableNodes: 1,
      scrollableNodes: 0,
      nodesWithText: 8,
      nodesWithContentDesc: 1,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "Service unavailable" },
        { clickable: true, enabled: true, scrollable: false, text: "Try again" },
      ],
    },
    logSummary: buildLogSummary("HTTP 503 server error from backend"),
  });

  assert.equal(summary.readiness, "backend_failed_terminal");
});

test("offline-terminal-stop is classified as offline_terminal", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 10,
      clickableNodes: 1,
      scrollableNodes: 0,
      nodesWithText: 4,
      nodesWithContentDesc: 1,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "You are offline" },
      ],
    },
    logSummary: buildLogSummary("No internet connection. offline mode."),
  });

  assert.equal(summary.readiness, "offline_terminal");
});

test("otp verification surfaces trigger protected-page and manual-handoff signals", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 18,
      clickableNodes: 3,
      scrollableNodes: 0,
      nodesWithText: 9,
      nodesWithContentDesc: 1,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "请输入验证码" },
        { clickable: false, enabled: true, scrollable: false, text: "验证码已发送至 177****2554" },
        { clickable: true, enabled: true, scrollable: false, text: "下一步" },
      ],
    },
  });

  assert.equal(summary.appPhase, "authentication");
  assert.equal(summary.protectedPage?.suspected, true);
  assert.equal(summary.protectedPage?.observability, "ui_tree_only");
  assert.equal(summary.manualHandoff?.required, true);
  assert.equal(summary.manualHandoff?.reason, "otp_required");
  assert.equal(summary.derivedSignals?.includes("protected_page_suspected"), true);
  assert.equal(summary.derivedSignals?.includes("manual_handoff:otp_required"), true);
});

// ─── pageIdentity derivation tests ───────────────────────────────────────

test("pageIdentity is derived from uiSummary when present", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 5,
      clickableNodes: 2,
      scrollableNodes: 0,
      nodesWithText: 3,
      nodesWithContentDesc: 1,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "Settings", className: "UIAStaticText", bounds: "[0,50][400,100]" },
        { clickable: true, enabled: true, scrollable: false, text: "Back", className: "UIAButton", bounds: "[10,20][60,60]" },
        { clickable: true, enabled: true, scrollable: false, text: "Toggle", className: "UIASwitch", bounds: "[100,100][200,150]" },
      ],
    },
  });

  assert.ok(summary.pageIdentity, "pageIdentity should be present");
  assert.ok(summary.pageIdentity!.treeHash, "treeHash should be present");
  assert.equal(summary.pageIdentity!.visibleElementCount, 5);
  assert.equal(summary.pageIdentity!.primaryHeading, "Settings");
  assert.equal(summary.pageIdentity!.identitySource, "heading");
  assert.equal(summary.pageIdentity!.hasBackAffordance, true);
  assert.equal(summary.pageIdentity!.backAffordanceLabel, "Back");
  assert.equal(summary.pageIdentity!.isTopLevel, false);
});

test("pageIdentity isTopLevel when no back button detected", () => {
  const summary = buildStateSummaryFromSignals({
    uiSummary: {
      totalNodes: 3,
      clickableNodes: 1,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        { clickable: false, enabled: true, scrollable: false, text: "Home", className: "UIAStaticText", bounds: "[0,50][400,100]" },
        { clickable: true, enabled: true, scrollable: false, text: "Enter", className: "UIAButton", bounds: "[100,300][200,350]" },
      ],
    },
  });

  assert.ok(summary.pageIdentity, "pageIdentity should be present");
  assert.equal(summary.pageIdentity!.isTopLevel, true);
  assert.equal(summary.pageIdentity!.hasBackAffordance, false);
});

// ─── hasStateChanged tests ──────────────────────────────────────────────

test("hasStateChanged returns false for identical summaries", () => {
  const a = { appPhase: "ready" as const, readiness: "ready" as const, blockingSignals: [] as string[] };
  assert.equal(hasStateChanged(a, a), false);
});

test("hasStateChanged returns true when appPhase differs", () => {
  const a = { appPhase: "ready" as const, readiness: "ready" as const, blockingSignals: [] as string[] };
  const b = { appPhase: "blocked" as const, readiness: "ready" as const, blockingSignals: [] as string[] };
  assert.equal(hasStateChanged(a, b), true);
});

test("hasStateChanged ignores pageIdentity differences", () => {
  const base = { appPhase: "ready" as const, readiness: "ready" as const, blockingSignals: [] as string[] };
  const a = { ...base, pageIdentity: { treeHash: "abc123", visibleElementCount: 10 } };
  const b = { ...base, pageIdentity: { treeHash: "def456", visibleElementCount: 20, isTopLevel: true } };
  // Despite different pageIdentity, material state is the same
  assert.equal(hasStateChanged(a as typeof base & { pageIdentity?: unknown }, b as typeof base & { pageIdentity?: unknown }), false);
});

test("hasStateChanged detects real state changes even with same pageIdentity", () => {
  const base = { appPhase: "ready" as const, readiness: "ready" as const, blockingSignals: [] as string[] };
  const a = { ...base, pageIdentity: { treeHash: "same" } };
  const b = { ...base, readiness: "waiting_network" as const, pageIdentity: { treeHash: "same" } };
  assert.equal(hasStateChanged(a as typeof base & { pageIdentity?: unknown }, b as typeof base & { pageIdentity?: unknown }), true);
});

// ─── computeTreeHash tests ──────────────────────────────────────────────

test("computeTreeHash produces consistent output for same input", () => {
  const sigs = ["Button|Hello|[0,0][100,50]", "Text|World|[0,60][200,100]"];
  const hash1 = computeTreeHash(sigs);
  const hash2 = computeTreeHash(sigs);
  assert.equal(hash1, hash2);
});

test("computeTreeHash differs for different input", () => {
  const hash1 = computeTreeHash(["Button|Hello|[0,0][100,50]"]);
  const hash2 = computeTreeHash(["Button|World|[0,0][100,50]"]);
  assert.notEqual(hash1, hash2);
});

test("computeTreeHash returns empty-string hash for empty input", () => {
  const hash = computeTreeHash([]);
  assert.equal(hash, "00000000");
});

test("sampleNodeSignatures filters nodes without text or bounds", () => {
  const sigs = sampleNodeSignatures({
    sampleNodes: [
      { text: "Hello", bounds: "[0,0][100,50]", className: "Btn" },
      { text: "NoBounds", className: "Btn" },
      { bounds: "[0,0][100,50]", className: "Btn" },
      { text: "", bounds: "[0,0][100,50]" },
    ],
  });
  assert.equal(sigs.length, 1);
  assert.ok(sigs[0].includes("Hello"));
});
