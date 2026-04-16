import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStateGraph } from "../src/state-graph.js";
import type { PageSnapshot, UiHierarchy } from "../src/types.js";

function makeUiTree(label: string): UiHierarchy {
  return {
    className: "Application",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [
      {
        className: "StaticText",
        clickable: false,
        enabled: true,
        scrollable: false,
        text: label,
        children: [],
      },
    ],
  };
}

function makeSnapshot(screenId: string, title: string): PageSnapshot {
  return {
    screenId,
    screenTitle: title,
    uiTree: makeUiTree(title),
    clickableElements: [{
      label: "About",
      selector: { contentDesc: "About" },
      elementType: "Button",
    }],
    screenshotPath: "/tmp/test.png",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: 0,
    loadTimeMs: 1,
    stabilityScore: 1,
    appId: "com.apple.Preferences",
    isExternalApp: false,
  };
}

describe("state-graph", () => {
  it("deduplicates state nodes for same fingerprint and app context", () => {
    const graph = createStateGraph();
    const s1 = makeSnapshot("s1", "General");
    const s2 = makeSnapshot("s1", "General");

    const n1 = graph.registerState(s1, "struct-hash-a");
    const n2 = graph.registerState(s2, "struct-hash-a");

    assert.equal(n1.id, n2.id);
    assert.equal(graph.getSummary().nodeCount, 1);
  });

  it("tracks committed and rejected transition counts", () => {
    const graph = createStateGraph();
    const base = graph.registerState(makeSnapshot("s1", "General"), "struct-a");
    const next = graph.registerState(makeSnapshot("s2", "About"), "struct-b");

    graph.registerTransition({
      from: base.id,
      to: next.id,
      kind: "forward",
      intentLabel: "About",
      committed: true,
      attempts: 1,
    });
    graph.registerTransition({
      from: next.id,
      kind: "forward",
      intentLabel: "NoOp",
      committed: false,
      attempts: 1,
      failureReason: "no navigation",
    });

    const summary = graph.getSummary();
    assert.equal(summary.edgeCount, 2);
    assert.equal(summary.committedEdgeCount, 1);
    assert.equal(summary.rejectedEdgeCount, 1);
  });
});
