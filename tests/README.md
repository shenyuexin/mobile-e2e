# Tests

This directory is reserved for:

- contract validation
- integration checks for scripts and MCP tools
- reusable test fixtures

Current committed fixtures:

- `tests/fixtures/ui/android-cart.xml` - stable Android hierarchy sample for parsing/query/action tests
- `tests/fixtures/ui/ios-sample.json` - stable iOS hierarchy sample for partial-support summary tests

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

Current regression layers are now explicitly named:

- `pnpm test:adapter` - adapter-only deterministic unit coverage
- `pnpm test:mcp-server` - server/stdio/dev-cli smoke coverage
- `pnpm test:unit` - combined no-device regression layer
- `pnpm test:smoke` - asserted root dry-run validation layer
- `pnpm test:ci` - build + typecheck + unit + smoke in one CI-oriented sequence
