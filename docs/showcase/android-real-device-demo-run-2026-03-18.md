# Android Real-Device Demo Run (2026-03-18)

## Goal

Validate a real-device demo path and produce reusable recording/evidence assets for README/showcase.

## Environment

- Device: `10AEA40Z3Y000R5` (Android physical device)
- App: `com.epam.mobitru`
- Repo: `mobile-e2e-mcp`

## What Was Executed

1. Real-run readiness checks: `describe_capabilities`, `doctor`, `list_devices`
2. App preparation: install + launch demo Android app
3. Session-based evidence run (explicit lifecycle):
   - `start_session`
   - `perform_action_with_evidence`
   - `detect_interruption`
   - `classify_interruption`
   - `resolve_interruption`
   - `end_session`
4. Real-device screen recording with scripted visible taps for demo material.

## Key Outcome

- Real-device recording assets were produced successfully for README/showcase usage.
- During validation, interruption detection showed a false-positive pattern on normal app screens.
- Root cause was narrowed to owner-package-only interruption signal handling and has been fixed in code.

Post-fix verification:

- `perform_action_with_evidence` no longer fails with `INTERRUPTION_RESOLUTION_FAILED` on normal app screens.
- `detect_interruption` now returns `detected: false` (`INTERRUPTION_UNCLASSIFIED`) for normal screens.

## Generated Artifacts

### Screen recordings (raw, local artifacts)

- `artifacts/screen-recordings/m2e-interaction-demo-15s.mp4`
- `artifacts/screen-recordings/m2e-interaction-demo-slow-30s-v3.mp4`
- `artifacts/screen-recordings/m2e-interaction-demo-slow-25s-v2.mp4`
- `artifacts/screen-recordings/m2e-happy-path-full-35s.mp4` (full happy path: login -> add to cart -> orders -> cart)
- `artifacts/screen-recordings/m2e-happy-path-scroll-pause-40s.mp4` (enhanced happy path: visible double scroll + pause before add to cart)
- `artifacts/screen-recordings/m2e-demo-failure-intelligence.mp4`
- `artifacts/screen-recordings/m2e-interruption-demo.mp4`
- `artifacts/screen-recordings/m2e-interruption-demo-20s.mp4`

Curated README-facing videos (tracked under docs):

- `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4`
- `docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4`

### Repeatable scripts

- `pnpm tsx scripts/dev/demo-happy-path-android.ts`
- `pnpm tsx scripts/dev/demo-interruption-home-recovery-android.ts`

### Session evidence (example session)

- `artifacts/sessions/demo-record-android-01.json`
- `artifacts/audit/demo-record-android-01.json`
- `artifacts/ui-dumps/demo-record-android-01/android-native_android.xml`
- `artifacts/state-summaries/demo-record-android-01/android-native_android.logs.txt`
- `artifacts/state-summaries/demo-record-android-01/android-native_android.crash.txt`

## Notes for Next Iteration

1. Keep `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4` as primary README visual candidate.
2. Avoid tapping product-card body in showcase runs unless detail-page route is implemented (current app shows toast: `Product details screen not implemented`).
3. Keep interruption demo as a separate clip from happy-path interaction clip.
