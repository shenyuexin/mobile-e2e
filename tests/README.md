# Tests

This directory is reserved for:

- contract validation
- integration checks for scripts and MCP tools
- reusable test fixtures

Current committed fixtures:

- `tests/fixtures/ui/android-cart.xml` - stable Android hierarchy sample for parsing/query/action tests
- `tests/fixtures/ui/ios-sample.json` - stable iOS hierarchy sample for partial-support summary tests
- `tests/fixtures/ocr/*.png` - screenshot-style OCR fixtures for semi-real fallback regression tests
- `tests/fixtures/ocr/*.observations.json` - normalized MacVision-style OCR observation fixtures paired with the screenshot assets
- `tests/fixtures/ocr/manifest.json` - expected OCR fixture triads and text inventory used to catch fixture drift in unit tests

OCR fixture maintenance commands:

- `pnpm validate:ocr-fixtures` - cross-platform integrity check for OCR triads, text inventory, hashes, and dimensions
- `pnpm fixtures:ocr:sync [fixture-name...]` - macOS-only regeneration path that renders SVG -> PNG and refreshes observations plus hash metadata using the real Vision bridge

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

Current screenshot-driven OCR fallback coverage includes:

- adapter-vision fixture-based OCR service scenarios for assert success, tap verification success, low-confidence rejection, and ambiguity rejection
- adapter-maestro semi-real fallback path tests that use real screenshot fixtures plus mocked screenshot/tap/post-state seams

Current regression layers are now explicitly named:

- `pnpm test:adapter` - adapter-only deterministic unit coverage
- `pnpm test:ocr-smoke` - macOS-only OCR provider smoke coverage against a committed screenshot fixture
- `pnpm test:mcp-server` - server/stdio/dev-cli smoke coverage
- `pnpm test:unit` - combined no-device regression layer
- `pnpm test:smoke` - asserted root dry-run validation layer
- `pnpm test:ci` - build + typecheck + unit + smoke in one CI-oriented sequence

Current GitHub Actions CI scope:

- `.github/workflows/ci.yml` runs on `ubuntu-latest` because the current workflow is intentionally limited to no-device, no-simulator regression layers
- real Android emulator and real iOS simulator/device regression are still separate future lanes and should not be inferred from the current Ubuntu-only workflow
