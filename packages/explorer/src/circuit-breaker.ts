/**
 * Circuit Breaker — per-page failure tracking.
 *
 * SPEC §4.1, R1-#4: Circuit breaker counts per-PAGE failures (not per-element).
 * This prevents infinite loops when entire pages become unreachable.
 *
 * State machine: closed (normal) -> open (threshold exceeded) -> half-open (recovery attempt)
 */

import type { CircuitBreakerState } from "./types.js";

/** Default failure threshold before circuit opens. */
const DEFAULT_THRESHOLD = 3;

/**
 * Create a circuit breaker with the given configuration.
 *
 * @param threshold - Number of consecutive page failures before opening the circuit.
 *                    Default: 3 failures per page.
 */
export function createCircuitBreaker(
  threshold: number = DEFAULT_THRESHOLD,
): CircuitBreakerState {
  return {
    consecutiveFailedPages: 0,
    currentPageFailures: 0,
    threshold,
  };
}

/**
 * Record a successful navigation on the current page.
 * Resets the per-page failure counter.
 */
export function recordPageSuccess(state: CircuitBreakerState): void {
  state.currentPageFailures = 0;
}

/**
 * Record a failure on the current page.
 * Returns true if the circuit should OPEN (threshold exceeded).
 */
export function recordPageFailure(state: CircuitBreakerState): boolean {
  state.currentPageFailures++;
  state.consecutiveFailedPages++;

  if (state.currentPageFailures >= state.threshold) {
    return true; // Circuit opens — all elements on this page failed
  }
  return false;
}

/**
 * Reset the circuit after a successful page navigation.
 * Called when we successfully navigate to a new page after failures.
 */
export function resetCircuit(state: CircuitBreakerState): void {
  state.consecutiveFailedPages = 0;
  state.currentPageFailures = 0;
}

/**
 * Check if the circuit is OPEN (should abort exploration).
 */
export function isCircuitOpen(state: CircuitBreakerState): boolean {
  return state.consecutiveFailedPages >= state.threshold * 2;
}

/**
 * Check if the current page should be skipped (all elements failed).
 */
export function shouldSkipPage(state: CircuitBreakerState): boolean {
  return state.currentPageFailures >= state.threshold;
}
