# Tests

This directory is reserved for:

- contract validation
- integration checks for scripts and MCP tools
- reusable test fixtures

Current committed fixtures:

- `tests/fixtures/ui/android-cart.xml` - stable Android hierarchy sample for parsing/query/action tests
- `tests/fixtures/ui/ios-sample.json` - stable iOS hierarchy sample for partial-support summary tests

OCR fixtures are intentionally **not committed** in this repository profile (`tests/fixtures/ocr/` is gitignored).
When present locally (for example after fixture sync on macOS), they are used by OCR-oriented tests and checks:

- `tests/fixtures/ocr/*.png` - screenshot-style OCR fixtures for semi-real fallback regression tests
- `tests/fixtures/ocr/*.observations.json` - normalized MacVision-style OCR observation fixtures paired with the screenshot assets
- `tests/fixtures/ocr/manifest.json` - expected OCR fixture triads and text inventory used to catch fixture drift in unit tests

OCR fixture maintenance commands:

- `pnpm validate:ocr-fixtures` - cross-platform integrity check for OCR triads, text inventory, hashes, and dimensions
- `pnpm fixtures:ocr:sync [--dry-run] [fixture-name...]` - macOS-only regeneration path that renders SVG -> PNG and refreshes observations plus hash metadata using the real Vision bridge
- `pnpm fixtures:ocr:check` - macOS-only strict check that fails when OCR triads would change

Current no-device regression layers:

- `packages/adapter-maestro/test/ui-model.test.ts` - fixture-driven parsing/query/bounds checks plus adapter-level envelope coverage for the new UI tools
- `packages/mcp-server/test/server.test.ts` - server registry and invoke smoke coverage
- `packages/mcp-server/test/stdio-server.test.ts` - stdio initialize/list/call and error-path coverage
- `packages/mcp-server/test/dev-cli.test.ts` - CLI argument parsing and dry-run dispatch coverage
- `scripts/validate-dry-run.ts` - top-level asserted dry-run validator that spawns the real CLI commands and checks returned JSON semantics

Capability discovery coverage now also lives in the same stack:

- adapter-level profile building and discovery results
- server/stdio/dev-cli smoke coverage for `describe_capabilities`
- root dry-run validation for session-attached capabilities and explicit capability discovery

Current orchestration-layer coverage also includes:

- adapter/server/stdio/dev-cli smoke coverage for `scroll_and_tap_element`
- root dry-run validation for the new scroll-then-tap composed action

Current evidence-model coverage includes:

- adapter-level dry-run evidence emission checks for screenshot, UI dump, logs, crash signals, diagnostics, and aggregated debug evidence
- compatibility guarantee that structured `evidence[]` is additive and does not replace the legacy top-level `artifacts[]`

Current debug-first harness deepening coverage also includes:

- outcome-proof assertions for `progressMarker`, `postconditionStatus`, `stateChangeCategory`, and `stateChangeConfidence`
- diagnosis-packet assertions for strongest suspect, causal signal, confidence, next probe, recovery hint, and escalation threshold
- causal memory / baseline assertions for `matchedSignals`, `replayValue`, `checkpointDivergence`, and preference for the closest matching baseline over shallow same-action matches
- bounded auto-remediation assertions for explicit `stateMachineStatus` / `stateMachineTrace`, including waiting recovery and terminal stop paths
- bounded auto-remediation assertions for checkpoint-drift-driven replay selection when baseline comparison says replay is safer than local retry

Current screenshot-driven OCR fallback coverage includes:

- adapter-vision fixture-based OCR service scenarios for assert success, tap verification success, low-confidence rejection, and ambiguity rejection
- adapter-maestro semi-real fallback path tests that use real screenshot fixtures plus mocked screenshot/tap/post-state seams

Current regression layers are now explicitly named:

- `pnpm test:adapter` - adapter-only deterministic unit coverage
- `pnpm test:ocr-smoke` - macOS-only OCR provider smoke coverage against local OCR fixtures; skips with an explicit reason when fixtures are absent (for example clean-clone environments)
- `pnpm test:mcp-server` - server/stdio/dev-cli smoke coverage
- `pnpm test:unit` - combined no-device regression layer
- `pnpm test:smoke` - asserted root dry-run validation layer
- `pnpm test:ci` - build + typecheck + unit + smoke in one CI-oriented sequence

Current GitHub Actions CI scope:

- `.github/workflows/ci.yml` runs on `ubuntu-latest` because the current workflow is intentionally limited to no-device, no-simulator regression layers
- `.github/workflows/ocr-smoke.yml` is a separate macOS-only lane; it runs automatically only when OCR-related paths change, and it can also be started manually with `workflow_dispatch`
- real Android emulator and real iOS simulator/device regression are still separate future lanes and should not be inferred from the current Ubuntu-only workflow

Evidence contract levels (must stay explicit):

- `pnpm test:smoke` and `scripts/validate-dry-run.ts` prove dry-run/smoke semantics only (no-device, deterministic contract checks).
- `.github/workflows/platform-smoke.yml` proves simulator/emulator baseline wiring only (toolchain smoke, not real-device acceptance).
- `.github/workflows/real-device-acceptance.yml` is the acceptance-evidence lane; it combines Phase 1 React Native backbone lanes with Phase 3 sample-profile lanes.
- The framework-profile baseline truth remains `validated-sample-baseline` for Native + React Native + Flutter (`configs/profiles/*.yaml`, `configs/matrices/framework-profile-matrix.md`), not `ci-verified`.
- In the shared acceptance runner/report path for framework profiles, Flutter proof is currently Android-only; Flutter iOS remains outside that shared path.

Important boundary note:

- the current debug-first recovery/state-machine coverage is still primarily no-device and dry-run oriented; it improves structured observability and bounded decision regression, but it does not by itself prove generalized real-run recovery maturity across all platforms
