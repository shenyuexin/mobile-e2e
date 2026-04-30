/**
 * Tests for summary JSON generation.
 *
 * Validates the structure and content of summary.json output.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferModules } from "../../src/report/modules.js";
import {
  countPageTypes,
  countUniquePaths,
  formatRunTimestamp,
  generateRunId,
  generateSummaryJson,
  sanitizeRunIdTimestamp,
} from "../../src/report/summary.js";
import type { ExplorerConfig, FailureEntry, PageEntry } from "../../src/types.js";

function expectedLocalTimestamp(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, "0");
  const offsetRemainderMinutes = String(absOffsetMinutes % 60).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}
type PageContextType = NonNullable<NonNullable<PageEntry["pageContext"]>["type"]>;

function makePage(
  id: string,
  depth: number,
  path: string[],
  hasFailure = false,
  pageType: PageContextType = "app_dialog",
): PageEntry {
  return {
    id,
    screenId: `screen-${id}`,
    screenTitle: id,
    pageContext: {
      type: pageType,
      platform: "android",
      detectionSource: "deterministic",
      confidence: 0.9,
    },
    depth,
    path,
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs: 100,
    clickableCount: 5,
    hasFailure,
    explorationStatus: "expanded",
  };
}

function makeFailure(pageScreenId: string, failureType = "TAP_FAILED"): FailureEntry {
  return {
    pageScreenId,
    elementLabel: "some-element",
    failureType,
    retryCount: 1,
    errorMessage: "tap failed",
    depth: 1,
    path: ["some-path"],
  };
}

const mockConfig: ExplorerConfig = {
  mode: "scoped",
  auth: { type: "skip-auth" },
  failureStrategy: "retry-3",
  maxDepth: 8,
  maxPages: 100,
  timeoutMs: 300_000,
  compareWith: null,
  platform: "ios-simulator",
  destructiveActionPolicy: "skip",
  appId: "com.example.app",
  reportDir: "/tmp/reports",
  statefulFormPolicy: "skip",
};

describe("generateSummaryJson", () => {
  it("includes correct page count", () => {
    const pages = [
      makePage("p1", 0, []),
      makePage("p2", 1, ["p1"]),
      makePage("p3", 2, ["p1", "p2"]),
    ];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.totalPages, 3);
  });

  it("partial report includes aborted: true and abortReason", () => {
    const pages = [makePage("p1", 0, [])];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: true,
      abortReason: "Timeout reached",
      durationMs: 3000,
    });
    assert.equal(summary.aborted, true);
    assert.equal(summary.abortReason, "Timeout reached");
  });

  it("full report does not include aborted", () => {
    const pages = [makePage("p1", 0, [])];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.aborted, undefined);
    assert.equal(summary.abortReason, undefined);
  });

  it("uniqueModules matches module inference output", () => {
    const pages = [
      makePage("p1", 0, []),
      makePage("p2", 1, ["Settings"]),
      makePage("p3", 1, ["Bluetooth"]),
    ];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.deepEqual(summary.uniqueModules, ["Bluetooth", "Home", "Settings"]);
  });

  it("maxDepthReached is correct", () => {
    const pages = [
      makePage("p1", 0, []),
      makePage("p2", 1, ["p1"]),
      makePage("p3", 3, ["p1", "p2", "p3"]),
    ];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.maxDepthReached, 3);
  });

  it("maxDepthReached is 0 for empty pages", () => {
    const modules = inferModules([]);
    const summary = generateSummaryJson([], [], modules, mockConfig, {
      partial: false,
      durationMs: 0,
    });
    assert.equal(summary.maxDepthReached, 0);
    assert.equal(summary.totalPages, 0);
  });

  it("includes failure details", () => {
    const pages = [makePage("p1", 0, [])];
    const failures = [makeFailure("screen-p1", "TIMEOUT")];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, failures, modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.totalFailures, 1);
    assert.equal(summary.failures[0].failureType, "TIMEOUT");
    assert.equal(summary.failures[0].pageScreenId, "screen-p1");
  });

  it("includes page inventory", () => {
    const pages = [makePage("p1", 0, ["home"], false)];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.pages.length, 1);
    assert.equal(summary.pages[0].id, "p1");
    assert.equal(summary.pages[0].depth, 0);
    assert.equal(summary.pages[0].hasFailure, false);
  });

  it("includes reached-but-not-expanded page metadata", () => {
    const page = makePage("p1", 1, ["Profile"]);
    page.screenTitle = "Create shipping address";
    page.explorationStatus = "reached-not-expanded";
    page.stoppedByPolicy = "statefulFormPolicy:skip";
    page.ruleFamily = "stateful_form_entry";
    page.recoveryMethod = "backtrack-cancel-first";
    const modules = inferModules([page]);
    const summary = generateSummaryJson([page], [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.pages[0].explorationStatus, "reached-not-expanded");
    assert.equal(summary.pages[0].stoppedByPolicy, "statefulFormPolicy:skip");
    assert.equal(summary.pages[0].ruleFamily, "stateful_form_entry");
    assert.equal(summary.pages[0].recoveryMethod, "backtrack-cancel-first");
  });

  it("includes per-page and aggregate rule decision metadata", () => {
    const page = makePage("p1", 1, ["Settings", "Help"]);
    page.explorationStatus = "reached-not-expanded";
    page.ruleDecision = {
      ruleId: "default.element.help.low-value-skip",
      category: "low-value-content",
      action: "skip-element",
      reason: "Help/FAQ pages typically contain low-value leaf content",
      source: "default",
      path: ["Settings", "Help"],
      screenTitle: "Help",
      elementLabel: "Help",
    };
    const modules = inferModules([page]);
    const summary = generateSummaryJson([page], [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.equal(summary.pages[0].ruleDecision?.ruleId, "default.element.help.low-value-skip");
    assert.equal(summary.ruleDecisions?.total, 1);
    assert.equal(summary.ruleDecisions?.byRuleId["default.element.help.low-value-skip"], 1);
    assert.equal(summary.ruleDecisions?.byCategory["low-value-content"], 1);
    assert.equal(summary.ruleDecisions?.byAction["skip-element"], 1);
  });

  it("includes stateGraph summary when provided", () => {
    const pages = [makePage("p1", 0, ["home"], false)];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
      stateGraph: {
        nodeCount: 5,
        edgeCount: 7,
        committedEdgeCount: 4,
        rejectedEdgeCount: 3,
      },
    });

    assert.deepEqual(summary.stateGraph, {
      nodeCount: 5,
      edgeCount: 7,
      committedEdgeCount: 4,
      rejectedEdgeCount: 3,
    });
  });

  it("generates a valid runId", () => {
    const runId = generateRunId();
    assert.ok(typeof runId === "string");
    assert.ok(runId.length > 0);
    assert.ok(!runId.includes(":"));
    assert.ok(!runId.includes("."));
  });

  it("formats timestamps in the local timezone", () => {
    assert.equal(
      formatRunTimestamp("2026-04-28T03:38:20.759Z"),
      expectedLocalTimestamp("2026-04-28T03:38:20.759Z"),
    );
  });

  it("converts UTC timestamps into local-time runIds", () => {
    assert.equal(
      sanitizeRunIdTimestamp("2026-04-28T03:38:20.759Z"),
      expectedLocalTimestamp("2026-04-28T03:38:20.759Z").replace(/[:.]/g, "-").slice(0, 19),
    );
  });

  it("includes pageTypeCounts distribution", () => {
    const pages = [
      makePage("p1", 0, [], false, "normal_page"),
      makePage("p2", 1, ["p1"], false, "normal_page"),
      makePage("p3", 1, ["p1"], false, "app_modal"),
      makePage("p4", 2, ["p1", "p3"], false, "unknown"),
      makePage("p5", 2, ["p1", "p3"], false, "system_alert_surface"),
    ];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.ok(summary.pageTypeCounts);
		assert.equal(summary.pageTypeCounts?.normalPages, 2);
		assert.equal(summary.pageTypeCounts?.formEditorPages, 0);
		assert.equal(summary.pageTypeCounts?.modalPages, 1);
    assert.equal(summary.pageTypeCounts?.unknownPages, 1);
    assert.equal(summary.pageTypeCounts?.alertPages, 1);
    assert.equal(summary.pageTypeCounts?.dialogPages, 0);
    assert.equal(summary.pageTypeCounts?.actionSheetPages, 0);
    assert.equal(summary.pageTypeCounts?.overlayPages, 0);
    assert.equal(summary.pageTypeCounts?.permissionPages, 0);
    assert.equal(summary.pageTypeCounts?.keyboardPages, 0);
  });

  it("pageTypeCounts defaults to zero for empty pages", () => {
    const modules = inferModules([]);
    const summary = generateSummaryJson([], [], modules, mockConfig, {
      partial: false,
      durationMs: 0,
    });
    assert.ok(summary.pageTypeCounts);
		assert.equal(summary.pageTypeCounts?.normalPages, 0);
		assert.equal(summary.pageTypeCounts?.formEditorPages, 0);
		assert.equal(summary.pageTypeCounts?.unknownPages, 0);
  });
});

describe("countPageTypes", () => {
  it("counts all known page types correctly", () => {
    const pages = [
      makePage("p1", 0, [], false, "normal_page"),
      makePage("p2", 0, [], false, "app_dialog"),
      makePage("p3", 0, [], false, "system_alert_surface"),
      makePage("p4", 0, [], false, "action_sheet_surface"),
      makePage("p5", 0, [], false, "app_modal"),
      makePage("p6", 0, [], false, "system_overlay"),
      makePage("p7", 0, [], false, "permission_surface"),
      makePage("p8", 0, [], false, "keyboard_surface"),
      makePage("p9", 0, [], false, "unknown"),
    ];
    const counts = countPageTypes(pages);
		assert.equal(counts.normalPages, 1);
		assert.equal(counts.formEditorPages, 0);
		assert.equal(counts.dialogPages, 1);
    assert.equal(counts.alertPages, 1);
    assert.equal(counts.actionSheetPages, 1);
    assert.equal(counts.modalPages, 1);
    assert.equal(counts.overlayPages, 1);
    assert.equal(counts.permissionPages, 1);
    assert.equal(counts.keyboardPages, 1);
    assert.equal(counts.unknownPages, 1);
  });

  it("counts pages without pageContext as unknown", () => {
    const page: PageEntry = {
      id: "p1",
      screenId: "screen-p1",
      screenTitle: "p1",
      depth: 0,
      path: [],
      arrivedFrom: null,
      viaElement: null,
      loadTimeMs: 100,
      clickableCount: 5,
      hasFailure: false,
      explorationStatus: "expanded",
    };
    const counts = countPageTypes([page]);
		assert.equal(counts.unknownPages, 1);
		assert.equal(counts.normalPages, 0);
		assert.equal(counts.formEditorPages, 0);
  });

  it("returns zero for empty array", () => {
    const counts = countPageTypes([]);
		assert.equal(counts.normalPages, 0);
		assert.equal(counts.formEditorPages, 0);
		assert.equal(counts.unknownPages, 0);
    assert.equal(counts.dialogPages, 0);
  });
});

describe("countUniquePaths", () => {
  it("counts unique paths correctly", () => {
    const pages = [
      makePage("p1", 0, []),
      makePage("p2", 0, []),
      makePage("p3", 1, ["a"]),
      makePage("p4", 2, ["a", "b"]),
    ];
    assert.equal(countUniquePaths(pages), 3);
  });

  it("returns 0 for empty pages", () => {
    assert.equal(countUniquePaths([]), 0);
  });
});
