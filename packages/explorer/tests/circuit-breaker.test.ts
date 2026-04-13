/**
 * Unit tests for circuit-breaker state transitions.
 *
 * Tests: closed -> open threshold, success reset, skip-page detection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCircuitBreaker,
  recordPageSuccess,
  recordPageFailure,
  resetCircuit,
  isCircuitOpen,
  shouldSkipPage,
} from "../src/circuit-breaker.js";

// ---------------------------------------------------------------------------
// createCircuitBreaker tests
// ---------------------------------------------------------------------------

describe("createCircuitBreaker", () => {
  it("initializes with default threshold of 3", () => {
    const cb = createCircuitBreaker();
    assert.equal(cb.threshold, 3);
    assert.equal(cb.consecutiveFailedPages, 0);
    assert.equal(cb.currentPageFailures, 0);
  });

  it("initializes with custom threshold", () => {
    const cb = createCircuitBreaker(5);
    assert.equal(cb.threshold, 5);
  });
});

// ---------------------------------------------------------------------------
// recordPageFailure tests
// ---------------------------------------------------------------------------

describe("recordPageFailure", () => {
  it("increments currentPageFailures", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    assert.equal(cb.currentPageFailures, 1);
    assert.equal(cb.consecutiveFailedPages, 1);
  });

  it("returns true when threshold is reached", () => {
    const cb = createCircuitBreaker(3);
    assert.equal(recordPageFailure(cb), false); // 1
    assert.equal(recordPageFailure(cb), false); // 2
    assert.equal(recordPageFailure(cb), true);  // 3 = threshold
  });

  it("increments consecutiveFailedPages on each call", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageFailure(cb);
    assert.equal(cb.consecutiveFailedPages, 3);
  });
});

// ---------------------------------------------------------------------------
// recordPageSuccess tests
// ---------------------------------------------------------------------------

describe("recordPageSuccess", () => {
  it("resets currentPageFailures to 0", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    assert.equal(cb.currentPageFailures, 2);

    recordPageSuccess(cb);
    assert.equal(cb.currentPageFailures, 0);
  });

  it("does NOT reset consecutiveFailedPages", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    assert.equal(cb.consecutiveFailedPages, 2);

    recordPageSuccess(cb);
    assert.equal(cb.consecutiveFailedPages, 2); // unchanged
  });
});

// ---------------------------------------------------------------------------
// resetCircuit tests
// ---------------------------------------------------------------------------

describe("resetCircuit", () => {
  it("resets all counters to 0", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageFailure(cb);

    resetCircuit(cb);
    assert.equal(cb.consecutiveFailedPages, 0);
    assert.equal(cb.currentPageFailures, 0);
  });
});

// ---------------------------------------------------------------------------
// isCircuitOpen tests
// ---------------------------------------------------------------------------

describe("isCircuitOpen", () => {
  it("returns false when below threshold * 2", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageFailure(cb);
    assert.equal(isCircuitOpen(cb), false); // 5 < 6
  });

  it("returns true when consecutiveFailedPages >= threshold * 2", () => {
    const cb = createCircuitBreaker(3);
    for (let i = 0; i < 6; i++) {
      recordPageFailure(cb);
    }
    assert.equal(isCircuitOpen(cb), true); // 6 >= 6
  });
});

// ---------------------------------------------------------------------------
// shouldSkipPage tests
// ---------------------------------------------------------------------------

describe("shouldSkipPage", () => {
  it("returns false when below threshold", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    assert.equal(shouldSkipPage(cb), false);
  });

  it("returns true when currentPageFailures >= threshold", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageFailure(cb);
    assert.equal(shouldSkipPage(cb), true);
  });

  it("resets per-page but keeps consecutive counter", () => {
    const cb = createCircuitBreaker(3);
    recordPageFailure(cb);
    recordPageFailure(cb);
    recordPageSuccess(cb); // resets currentPageFailures
    assert.equal(shouldSkipPage(cb), false);
    assert.equal(cb.consecutiveFailedPages, 2);
  });
});
