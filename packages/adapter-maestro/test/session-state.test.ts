import assert from "node:assert/strict";
import test from "node:test";
import { buildLogSummary, buildStateSummaryFromSignals } from "../src/session-state.ts";

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
