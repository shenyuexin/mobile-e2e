# Smoke-Mode Walkthrough — iOS 26.0 Settings

**Date:** 2026-04-13
**Device:** iPhone 16 Plus (iOS 26.0 Simulator)
**Session:** session-1776061377689

---

## Step-by-Step Results

| Step | Action | Expected Result | Time (ms) | Pass/Fail | Notes |
|------|--------|----------------|-----------|-----------|-------|
| 1 | launch_app(Settings) | Home screen visible | 1125 | PASS | Launched via simctl, not MCP launch_app (which used Expo URL) |
| 2 | wait_for_ui_stable(10s) | Returns true | 1441 | PASS | 3 polls, confidence 0.95 |
| 3 | inspect_ui() | UI tree captured | 294 | PASS | 18 nodes, 14 clickable |
| 4 | resolve "Wi-Fi" | Element resolved | N/A | SKIP | Wi-Fi not visible on iOS 26.0 home screen (reorganized) |
| 5 | tap_element(General) | General page opens | 8041 | PASS | Resolved via text match, tapped at (215, 356) |
| 6 | wait_for_ui_stable(10s) | Returns true | 1304 | PASS | 3 polls, confidence 0.95 |
| 7 | navigate_back() | Returns to home | 4119 | PASS | Tapped "Settings" back button (text selector) |
| 8 | wait_for_ui_stable(10s) | Returns true | 1556 | PASS | 3 polls, confidence 0.95 |
| 9 | resolve "Accessibility" | Element resolved | N/A | PASS | Resolved via text + elementType |
| 10 | tap_element(Accessibility) | Accessibility page opens | 7470 | PASS | Tapped at (215, 400) |
| 11 | wait_for_ui_stable(10s) | Returns true | 1288 | PASS | 3 polls, confidence 0.95 |
| 12 | resolve "About" | Element resolved | N/A | SKIP | About is on General page, not Accessibility |
| 13 | tap_element(About) | About page opens | N/A | SKIP | Would require navigating to General first |
| 14 | wait_for_ui_stable(10s) | Returns true | N/A | SKIP | — |
| 15 | navigate_back() | Returns to General | 4097 | PASS | From Accessibility back to home |
| 16 | navigate_back() | Returns to home | N/A | SKIP | Already on home |

## Summary

| Metric | Value |
|--------|-------|
| Total steps attempted | 10 (of 16 planned) |
| Passed | 10/10 |
| Failed | 0 |
| Skipped | 6 (plan assumed iOS 17.4 section ordering) |
| Total time | ~29,000ms |
| Average per-page time | ~7,250ms (tap only) / ~14,500ms (full cycle) |

## Notes on Deviations from Plan

The original smoke-mode walkthrough plan assumed iOS 17.4 Settings structure with Wi-Fi as the first section. On iOS 26.0:
- Wi-Fi is not visible on the home screen (moved into a different section or below the fold)
- The first sections are: Apple Account, General, Accessibility, Action Button, Apple Intelligence & Siri, Camera...
- Back navigation uses a "Settings" text button instead of a system-level back gesture

## Additional Walkthrough Steps (beyond original plan)

| Step | Action | Expected Result | Time (ms) | Pass/Fail | Notes |
|------|--------|----------------|-----------|-----------|-------|
| 17 | tap_element(Privacy & Security) | Page opens | 16654 | PASS | Slowest tap (near bottom of screen) |
| 18 | wait_for_ui_stable(10s) | Returns true | 1423 | PASS | 3 polls, confidence 0.95 |
| 19 | navigate_back() | Returns to home | 4375 | PASS | Tapped Settings back button |
| 20 | wait_for_ui_stable(10s) | Returns true | 1349 | PASS | 3 polls, confidence 0.95 |
| 21 | tap_element(Camera) | Page opens | 7925 | PASS | Tapped at (215, 532) |
| 22 | wait_for_ui_stable(10s) | Returns true | 1498 | PASS | 3 polls, confidence 0.95 |
| 23 | navigate_back() | Returns to home | 4186 | PASS | Resolved with 2 matches, picked correct one |
| 24 | wait_for_ui_stable(10s) | Returns true | 1390 | PASS | 3 polls, confidence 0.95 |

## Back Navigation Reliability (observed, not 30-attempt test)

| Attempt | From Page | Method | Success | Time (ms) |
|---------|-----------|--------|---------|-----------|
| 1 | General | Tap "Settings" back button | Yes | 4119 |
| 2 | Accessibility | Tap "Settings" back button | Yes | 4097 |
| 3 | Privacy & Security | Tap "Settings" back button | Yes | 4375 |
| 4 | Camera | Tap "Settings" back button | Yes | 4186 |

**Observed reliability: 4/4 (100%)** — Insufficient sample size for R5-C (requires 30 attempts at >=95%).
