# CI Evidence and Boundary Guide

This page is the fixed entry for CI execution evidence referenced by `README.md` and `README.zh-CN.md`.

## Where to view the latest CI runs

- CI workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml
- Platform smoke workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml
- Real-device acceptance workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml

## What evidence CI provides

For each run of `CI` (`.github/workflows/ci.yml`):

1. Job logs for `unit-and-typecheck` and `dry-run-smoke`
2. Two uploaded metadata artifacts:
   - `ci-unit-typecheck-metadata`
   - `ci-dry-run-smoke-metadata`
3. Job-level step summary with:
   - job status
   - run URL
   - artifact names
   - boundary reminder

For each run of `Platform Smoke` (`.github/workflows/platform-smoke.yml`):

1. iOS simulator Maestro baseline lane (`flows/samples/ci/ios-settings-smoke.yaml`)
2. Android emulator Maestro baseline lane (`flows/samples/ci/android-settings-smoke.yaml`)
3. Uploaded debug artifacts for each lane under `artifacts/platform-smoke/**`
4. Job summaries that explicitly describe baseline scope vs real-device acceptance scope

For each run of `Real Device Acceptance` (`.github/workflows/real-device-acceptance.yml`):

1. Dry-run baseline (`validate:phase3-samples`) on Ubuntu
2. Self-hosted macOS real-run matrix + acceptance evidence artifacts
3. Quality gate: workflow fails when any expected lane is missing/`NO_DATA`, or any lane status is `NO_GO` in `reports/phase-sample-report.json`
4. Lane semantics:
    - Phase 1 lanes (`react-native-ios`, `react-native-android`) are acceptance backbone lanes in this workflow.
    - Phase 2 now defines a dedicated React Native Android acceptance entrypoint: `pnpm run validate:phase2-rn-android-acceptance`.
    - Phase 3 framework-profile lanes are sample-profile acceptance lanes (`flutter-android`, `native-android`, `native-ios` when enabled).
    - The first framework-profile acceptance proof in the shared runner/report path is Flutter Android; Flutter iOS is not in that shared acceptance lane today.

## CI boundary (important)

- Ubuntu CI validates **buildability, type-safety, and smoke-level tool behavior**.
- Platform smoke validates simulator/emulator toolchain baseline only.
- Ubuntu CI and platform smoke do **not** fully prove real-device execution fidelity.
- `validate:phase2-rn-android` is the clean-clone prerequisite gate for the default RN Android acceptance lane and must pass before self-hosted acceptance is meaningful.
- `validate:phase3-samples` preserves profile/matrix contract truth for Native + Flutter `validated-sample-baseline` and dry-run CLI semantics, but it is still smoke-level (not acceptance proof).
- `validate:phase2-rn-android-acceptance` is the smallest dedicated command path for the default Phase 02 framework lane; it reuses the shared report generators but isolates the RN Android lane as an explicit entrypoint.
- Real-device confidence should be validated through showcase scripts and artifacts under:
  - `docs/showcase/README.md`
  - `docs/showcase/demo-playbook.zh-CN.md`
  - `real-device-acceptance` workflow artifacts and summaries

## Quick review checklist for maintainers

- CI run is green on `main` and target PR branch.
- Platform smoke run is green and both lane summaries are present.
- If real-device acceptance ran, no platform should show `NO_GO` in `phase-sample-report.json`.
- If real-device acceptance ran, verify docs/summaries keep lane boundaries explicit: smoke vs acceptance, framework-profile sample lanes vs React Native acceptance backbone lanes.
- Boundary statements remain visible in this document and workflow summaries.
