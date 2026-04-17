/**
 * Unit tests for page-registry dedup logic.
 *
 * Tests: L1 text hash, L2 structure hash, registration, and retrieval.
 * L3 visual comparison is deferred pending spike validation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PageRegistry, hashVisibleTexts, hashUiStructure } from "../src/page-registry.js";
import type { PageSnapshot, UiHierarchy } from "../src/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeUiTree(overrides: Partial<UiHierarchy>): UiHierarchy {
  return {
    className: "Application",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [],
    ...overrides,
  };
}

function makeSnapshot(
  uiTree: UiHierarchy,
  overrides: Partial<PageSnapshot> = {},
): PageSnapshot {
  return {
    screenId: "test-screen",
    uiTree,
    clickableElements: [],
    screenshotPath: "/tmp/test.png",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: 0,
    loadTimeMs: 0,
    stabilityScore: 1.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hashVisibleTexts tests
// ---------------------------------------------------------------------------

describe("hashVisibleTexts", () => {
  it("produces same hash for identical text content", () => {
    const tree1 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "General", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "General", children: [] },
      ],
    });
    assert.equal(hashVisibleTexts(tree1), hashVisibleTexts(tree2));
  });

  it("produces different hash for different text content", () => {
    const tree1 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "General", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "Camera", children: [] },
      ],
    });
    assert.notEqual(hashVisibleTexts(tree1), hashVisibleTexts(tree2));
  });

  it("is order-independent (sorted texts)", () => {
    const tree1 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "A", children: [] },
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "B", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "B", children: [] },
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "A", children: [] },
      ],
    });
    assert.equal(hashVisibleTexts(tree1), hashVisibleTexts(tree2));
  });
});

// ---------------------------------------------------------------------------
// hashUiStructure tests
// ---------------------------------------------------------------------------

describe("hashUiStructure", () => {
  it("produces same hash for identical structure", () => {
    const tree1 = makeUiTree({
      children: [
        { className: "Button", clickable: true, enabled: true, scrollable: false, children: [] },
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "Button", clickable: true, enabled: true, scrollable: false, children: [] },
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, children: [] },
      ],
    });
    assert.equal(hashUiStructure(tree1), hashUiStructure(tree2));
  });

  it("produces different hash for different structure", () => {
    const tree1 = makeUiTree({
      children: [
        { className: "Button", clickable: true, enabled: true, scrollable: false, children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "Button", clickable: true, enabled: true, scrollable: false, children: [] },
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, children: [] },
      ],
    });
    assert.notEqual(hashUiStructure(tree1), hashUiStructure(tree2));
  });
});

// ---------------------------------------------------------------------------
// PageRegistry tests
// ---------------------------------------------------------------------------

describe("PageRegistry", () => {
  it("dedup finds registered page with identical text content", async () => {
    const registry = new PageRegistry();
    const uiTree = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "General", children: [] },
      ],
    });
    const snapshot = makeSnapshot(uiTree, { screenId: "hash-1" });

    const dedup1 = await registry.dedup(snapshot);
    assert.equal(dedup1.alreadyVisited, false);

    registry.register(dedup1, snapshot, ["General"]);

    const dedup2 = await registry.dedup(snapshot);
    assert.equal(dedup2.alreadyVisited, true);
    assert.equal(dedup2.confidence, "text");
    assert.equal(dedup2.matchedId, "page-001");
  });

  it("dedup returns not-visited for different text content", async () => {
    const registry = new PageRegistry();
    const tree1 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "General", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "Camera", children: [] },
      ],
    });

    const snap1 = makeSnapshot(tree1, { screenId: "hash-1" });
    const snap2 = makeSnapshot(tree2, { screenId: "hash-2" });

    const dedup1 = await registry.dedup(snap1);
    registry.register(dedup1, snap1, ["General"]);

    const dedup2 = await registry.dedup(snap2);
    assert.equal(dedup2.alreadyVisited, false);
  });

  it("count increments correctly", async () => {
    const registry = new PageRegistry();
    assert.equal(registry.count, 0);

    const tree1 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "Page A", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "Page B", children: [] },
      ],
    });

    const snap1 = makeSnapshot(tree1, { screenId: "hash-a" });
    const snap2 = makeSnapshot(tree2, { screenId: "hash-b" });

    registry.register({ alreadyVisited: false }, snap1, []);
    assert.equal(registry.count, 1);

    registry.register({ alreadyVisited: false }, snap2, []);
    assert.equal(registry.count, 2);
  });

  it("does NOT increment count for already-visited page", async () => {
    const registry = new PageRegistry();
    const tree = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "Same", children: [] },
      ],
    });
    const snap = makeSnapshot(tree, { screenId: "hash-same" });

    const dedup1 = await registry.dedup(snap);
    registry.register(dedup1, snap, []);
    assert.equal(registry.count, 1);

    const dedup2 = await registry.dedup(snap);
    registry.register(dedup2, snap, []); // should be a no-op
    assert.equal(registry.count, 1);
  });

  it("getEntries returns all registered pages", async () => {
    const registry = new PageRegistry();
    const tree1 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "A", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "B", children: [] },
      ],
    });

    registry.register({ alreadyVisited: false }, makeSnapshot(tree1, { screenId: "h1" }), ["A"]);
    registry.register({ alreadyVisited: false }, makeSnapshot(tree2, { screenId: "h2" }), ["B"]);

    const entries = registry.getEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, "page-001");
    assert.equal(entries[1].id, "page-002");
  });

  it("derives entry depth from traversal path length", async () => {
    const registry = new PageRegistry();
    const tree = makeUiTree({
      children: [
        { className: "StaticText", clickable: false, enabled: true, scrollable: false, text: "Leaf", children: [] },
      ],
    });

    registry.register(
      { alreadyVisited: false },
      makeSnapshot(tree, { screenId: "leaf-screen", depth: 0 }),
      ["General", "Fonts", "System Fonts"],
    );

    const [entry] = registry.getEntries();
    assert.equal(entry.depth, 3);
  });

  it("structurally similar pages return warning", async () => {
    const registry = new PageRegistry();
    // Two trees with same structure but different text
    const tree1 = makeUiTree({
      children: [
        { className: "Button", clickable: true, enabled: true, scrollable: false, text: "Text A", children: [] },
      ],
    });
    const tree2 = makeUiTree({
      children: [
        { className: "Button", clickable: true, enabled: true, scrollable: false, text: "Text B", children: [] },
      ],
    });

    const snap1 = makeSnapshot(tree1, { screenId: "struct-1" });
    const snap2 = makeSnapshot(tree2, { screenId: "struct-2" });

    const dedup1 = await registry.dedup(snap1);
    registry.register(dedup1, snap1, []);

    const dedup2 = await registry.dedup(snap2);
    assert.equal(dedup2.alreadyVisited, false);
    assert.equal(dedup2.warning, "structurally-similar-but-visually-unverified");
  });
});
