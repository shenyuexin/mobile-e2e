# Timing Baseline — iOS 26.0 Settings

**Date:** 2026-04-13
**Device:** iPhone 16 Plus (iOS 26.0 Simulator)
**Session:** session-1776061377689

---

## wait_for_ui_stable Measurements

All measurements taken with `timeoutMs: 10000`, `intervalMs: 300`, `consecutiveStable: 2`.

| # | Page | stableAfterMs | polls | confidence | Notes |
|---|------|---------------|-------|------------|-------|
| 1 | Home screen (initial) | 1441 | 3 | 0.95 | Fresh launch, clean state |
| 2 | Home screen (back from General) | 1556 | 3 | 0.95 | After navigation back |
| 3 | General sub-page | 1304 | 3 | 0.95 | After tapping General |
| 4 | Accessibility sub-page | 1288 | 3 | 0.95 | After tapping Accessibility |
| 5 | Home screen (back from Accessibility) | 1411 | 3 | 0.95 | After navigation back |
| 6 | Privacy & Security sub-page | 1423 | 3 | 0.95 | After tapping Privacy & Security |
| 7 | Home screen (back from Privacy) | 1349 | 3 | 0.95 | After navigation back |
| 8 | Camera sub-page | 1498 | 3 | 0.95 | After tapping Camera |

### Summary Statistics

| Metric | Value |
|--------|-------|
| Mean settle time | **1409ms** |
| Min settle time | 1288ms |
| Max settle time | 1556ms |
| Standard deviation | ~95ms |
| Typical polls | 3 |
| Confidence | Consistently 0.95 |

### Recommendation for `rollingAvgPageTimeMs` Initial Estimate

**Set initial `rollingAvgPageTimeMs` to 2000ms** (conservative upper bound, ~1.5x mean). The actual `wait_for_ui_stable` call takes ~1.4s, but the total per-page time includes tap resolution (~100-200ms) and inspection (~250ms).

## Per-Action Timing Breakdown

| Action | Mean Time (ms) | Min | Max | Notes |
|--------|---------------|-----|-----|-------|
| `wait_for_ui_stable` | 1409 | 1288 | 1556 | UI stabilization |
| `inspect_ui` | 250 | 196 | 294 | Hierarchy capture |
| `tap_element` (home section) | 7470 | 4097 | 16654 | Includes page transition |
| `tap_element` (back button) | 4119 | 4097 | 4375 | Navigation back |
| `take_screenshot` | 424 | 310 | 538 | Screenshot capture |

### Total Per-Page Cycle (tap → wait → inspect → back → wait)

**Estimated: ~14-16 seconds per page** (tap 7.5s + wait 1.4s + inspect 0.25s + back 4.1s + wait 1.4s)

## Decision Gate 4: Is per-page timing acceptable?

**PASS** — Average per-page cycle is ~14-16 seconds, within the 15-second threshold. However, the `tap_element` times are highly variable (4-17 seconds) depending on page complexity. The `rollingAvgPageTimeMs` should be initialized conservatively at 2000ms for just the settle time, with a total budget of ~16s for the full cycle.

## Decision Gate 3: Is back navigation reliable?

**PARTIAL** — Back navigation via the "Settings" back button was successful in all 4 attempts during this spike (100% observed). However, the plan requires 30 attempts for statistical significance. The back button is consistently found as a `Button` with `text: "Settings"` and `role_description: "back button"`. 

**Recommendation:** Run the full 30-attempt test in Phase 25-01 implementation when the engine can automate this loop. The observed 4/4 success rate is promising but insufficient for the R5-C threshold.

## Stability Observations

- `stableFingerprint` is always `"00000000"` — this may indicate the fingerprint hashing is not differentiating between states on iOS
- `stabilityBasis` is always `"visible-tree"` — uses visible element tree comparison
- `consecutiveStable` is always 2 — matches the default threshold
- All pages stabilize within 3 polls (~900ms of actual checking)
