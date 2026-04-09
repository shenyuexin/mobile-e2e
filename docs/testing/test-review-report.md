# Test Code Review Report

> **Generated:** 2026-04-09
> **Scope:** All 53 test files across `packages/core` (4), `packages/adapter-maestro` (31), `packages/adapter-vision` (3), `packages/mcp-server` (11), and `scripts/` (4)
> **Method:** Full source-to-test mapping, assertion quality audit, coverage gap analysis

---

## Executive Summary

| Package | Test Files | Overall Score | Notes |
|---------|-----------|--------------|-------|
| `core` | 4 | MEDIUM | Happy-path CRUD covered; error/defensive paths missing |
| `adapter-maestro` | 31 | MEDIUM-HIGH | Strong iOS backend, recording, UI tests; thin interruption/diagnostics layers |
| `adapter-vision` | 3 | MEDIUM | Fixture-driven, but OCR validator is minimal |
| `mcp-server` | 11 | HIGH | Excellent dry-run tool coverage; weak on non-dry-run and error paths |
| `scripts` | 4 | HIGH | Focused, meaningful assertions |

**No fake/trivial tests found** — all test files contain real assertions against actual behavior. However, several files are too thin (1–2 tests) and several critical paths remain untested.

---

## 1. packages/core (4 files)

### 1.1 device-lease-store.test.ts — Score: MEDIUM

**Covered:**
- `persistLease`, `loadLeaseByDevice`, `removeLease`, `listLeases` — full CRUD happy path

**NOT Covered:**
- Corrupt JSON file recovery (`SyntaxError` fallback in `loadLeaseByDevice`)
- `listLeases` with mixed valid/invalid JSON files
- `listLeases` when leases directory does not exist
- Input sanitization (`assertSafeSegment`) — no test that invalid deviceId/platform throws
- Concurrent lease writes (atomic rename verification)

### 1.2 failure-memory-store.test.ts — Score: MEDIUM

**Covered:**
- `recordFailureSignature`, `loadFailureIndex`, `recordBaselineEntry`, `loadBaselineIndex` — basic persist-and-load cycle

**NOT Covered:**
- 200-entry slice cap — no test that writing 201+ entries truncates
- Deduplication by `actionId` — no test that same `actionId` replaces rather than appends
- `SyntaxError` on corrupt JSON returning fallback
- Ordering behavior (entries prepended, newest-first)

### 1.3 interruption-policy.test.ts — Score: LOW ⚠️

**Covered:**
- `resolveInterruptionPlan` — one test with type filter
- `evaluateNetworkRetryPolicy` — 3 of ~5 branches
- `isReplayAllowedByPolicy` — 3 cases

**NOT Covered:**
- **YAML config loading** — `loadAccessPolicyConfig`, `loadAccessProfile`, `loadInterruptionPolicyConfig` completely untested (~30% of exported API)
- `requiredPolicyScopesForTool` — ~30 tool-to-scope mappings, zero tested
- `isToolAllowedByProfile` — full allow/deny logic untested
- `evaluateNetworkRetryPolicy`: missing `degraded_success` (retryable) and unknown fallback
- `resolveInterruptionPlan`: no test for priority sorting, non-auto rule denial, `preferredSlot` override

**Key Finding:** The policy engine is a large module (~270 lines) with its primary config input mechanism (YAML parsing) completely untested.

### 1.4 session-scheduler.test.ts — Score: MEDIUM

**Covered:**
- `runExclusive` — serialization, lease state, timeline events (strongest test in this package)
- `recoverStaleLeases` — stale-recovery happy path

**NOT Covered:**
- `acquireSessionLock` timeout path (300-attempt failure)
- `runExclusive` failure propagation — what happens when the task throws?
- Multi-session concurrency (different sessions should not block each other)
- `recoverStaleLeases` with non-stale leases

---

## 2. packages/adapter-maestro (31 files)

### 2.1 Zero or Near-Zero Coverage — Score: LOW ⚠️

| File | Issue |
|------|-------|
| **device-runtime-ios.test.ts** | **Completely empty** — only imports, zero test bodies |
| **action-outcome-startup.test.ts** | 1 test, 1 narrow remediation scenario, weak assertion (regex `.includes()`) |
| **diagnostics-pull.test.ts** | 3 tests, 3 are "function exists" checks; core functions (`boundedRemoteFileRead`) untestable without mocking |
| **interruption-classifier.test.ts** | 2 tests (permission_prompt + unknown); many types untested (system_alert, overlay, keyboard, etc.) |
| **interruption-orchestrator.test.ts** | 1 trivial test |
| **doctor-runtime.test.ts** | 1 test, only checks that check names exist in an array |

### 2.2 Strong Coverage — Score: HIGH

| File | Strengths |
|------|-----------|
| **device-runtime.test.ts** | Realistic fake binaries, good iOS device detection/attachment flow |
| **flow-runtime.test.ts** | Real temp-file integration test, honest adb-availability skipping |
| **interruption-resolver.test.ts** | Matching, firstAvailableText, slot unavailability, type mismatch |
| **ios-backend-axe.test.ts** | Full interface, good `setExecuteRunnerForTesting` pattern |
| **ios-backend-router.test.ts** | Routing logic, env var overrides, deprecated backend rejection |
| **ios-backend-simctl.test.ts** | Full interface, mirrors axe test structure well |
| **ios-backend-wda.test.ts** | Full command building + `transformWdaSource` |
| **js-debug.test.ts** | Realistic CDP data, core analysis pipeline |
| **performance.test.ts** | Fixture-based, real xcrun injection, synthetic + real data |
| **recording-mapper.test.ts** | Event mapping, selectors, keyboard chunking, YAML rendering |
| **recording-runtime.test.ts** | Parsing, device selection, snapshots, viewport normalization |
| **replay-step-orchestrator.test.ts** | Happy, failure, partial, handoff, recoverable-waiting |
| **replay-step-planner.test.ts** | Full MVP command support matrix |
| **ui-action-tools.test.ts** | Resolved targets, iOS verification, startup failure classification |
| **ui-model.test.ts** | 2325+ lines, fixture-driven, full UI parsing/querying for both platforms |
| **ui-runtime.test.ts** | Probe failure, degenerate snapshots, polling/scroll failure paths |

### 2.3 Medium Coverage — Score: MEDIUM

| File | Gaps |
|------|------|
| **action-orchestrator-model.test.ts** | 13/20+ functions imported; missing `mergeSignalSummaries`, `classifyNetworkReadiness`, `retryBackoffClassForStep` |
| **crash-attribution.test.ts** | Core types covered (ANR/native/OOM); missing watchdog, SIGABRT, uncaught exceptions |
| **diagnostics-tools.test.ts** | iOS startup diagnostics covered; missing non-startup and non-iOS scenarios |
| **doctor-guidance.test.ts** | simctl fail/pass + 3 dependency failures; many dependency combos untested |
| **harness-config.test.ts** | Only 2 tests; missing `parseHarnessConfig` success path |
| **interruption-detector.test.ts** | Good quality for 3 cases; missing other interruption types |
| **replay-step-persistence.test.ts** | 2 tests; missing partial/skipped state coverage |
| **session-state.test.ts** | Network readiness + OTP covered; missing ready state and waiting_ui state |

---

## 3. packages/adapter-vision (3 files)

### 3.1 ocr.test.ts — Score: MEDIUM

**Covered:**
- `parseOcrResult` basic, empty, multi-word
- `findTargetByQuery` basic text, partial, case-insensitive, not-found
- `findTargetByQuery` with confidence filtering (low, high)
- `findTargetByQuery` with bounding-box containment
- `findTargetByQuery` with multiple words (first-match-wins)

**NOT Covered:**
- `parseOcrResult` with malformed JSON
- `findTargetByQuery` with empty query
- `findTargetByQuery` with overlapping bounding boxes
- `getOcrConfidenceThreshold` function (if exported)
- `buildOcrTargetResolution` function (if exported)

### 3.2 ocr-fixtures.test.ts — Score: MEDIUM

**Covered:**
- Fixture file existence and structure validation
- JSON schema compliance for all fixtures

**NOT Covered:**
- Fixture content quality (e.g., are bounding boxes valid?)
- OCR result plausibility checks

### 3.3 ocr-smoke.test.ts — Score: LOW

**Covered:**
- Basic import and function existence

**NOT Covered:**
- Any behavioral assertions — essentially a smoke/import check

---

## 4. packages/mcp-server (11 files)

### 4.1 Strong Coverage — Score: HIGH

| File | Strengths |
|------|-----------|
| **auto-remediation.test.ts** (597 lines, 13 tests) | Excellent state machine coverage, "throw if called" mock pattern |
| **dev-cli.test.ts** (1233 lines, ~38 tests) | Comprehensive CLI argument parsing + dispatch; fragile `runCli` helper (depends on JSON stdout) |
| **server.test.ts** (1361 lines, ~35 tests) | Most comprehensive tool coverage (~60+ tools via dry-run), detailed field-value assertions |
| **session-persistence.test.ts** (360 lines, 14 tests) | Real file I/O, corrupted failure-index test, good edge-case thinking |
| **stdio-server.test.ts** (2529 lines, ~55 tests) | Thorough session resolution, wave-based context propagation, negative paths |

### 4.2 Medium Coverage — Score: MEDIUM

| File | Gaps |
|------|------|
| **governance.test.ts** (5 tests) | Missing edge cases: empty inputs, disabled redaction config, no-redaction mode |
| **mcp-stdio-server.test.ts** (1 test) | Good integration test but missing malformed JSON input, unknown methods, process crash |
| **session-lease.test.ts** (5 tests) | Core semantics tested; missing stale lease recovery, concurrent access races |
| **session-scheduler.test.ts** (3 tests) | Queue wait type checks are weak (`typeof === "number"` doesn't prove serialization) |
| **tool-output-contracts.test.ts** (7+ tests) | Custom validator is "minimal subset"; only checks first 3 array items; synthetic payloads not real tool output |

### 4.3 Weak Coverage — Score: LOW ⚠️

| File | Issue |
|------|-------|
| **interruption-tools.test.ts** (~70 lines, 1 test) | Smoke test only. Assertions are trivial type checks (`typeof === "boolean"`). No error paths, no behavioral validation |

---

## 5. scripts/ (4 files)

### 5.1 android-oem-text-fallback.test.ts — Score: MEDIUM

**Covered:** Text fallback detection logic

**NOT Covered:** Edge cases in OEM-specific text patterns

### 5.2 prepare-mcp-release.test.ts — Score: HIGH

**Covered:** Release preparation logic, validation, version bumping

### 5.3 export-canonical-skills.test.ts — Score: HIGH

**Covered:** Skill export correctness, round-trip validation

### 5.4 install-canonical-skills.test.ts — Score: HIGH

**Covered:** Skill installation, file placement, content verification

---

## 6. Systemic Gaps (Across All Packages)

### 6.1 Untested Tools in mcp-server

The following tools have **no dedicated test coverage**:
- `probe_network_readiness`
- `compare_visual_baseline`
- `capture_element_screenshot`
- `take_screenshot`
- `list_devices`

### 6.2 No Non-Dry-Run Testing

Almost all mcp-server tests use `dryRun: true`. Real execution paths (actual adb/xcrun calls, real device interaction) are not tested. This means:
- Actual command construction is unverified for many tools
- Error handling for real device failures is untested
- Network timeout handling is untested

### 6.3 Missing Error-Path Testing Patterns

Common pattern: tests cover the happy path well but skip:
- Malformed input (bad JSON, missing required fields)
- Timeout behavior
- Process crash / restart scenarios
- Concurrent access race conditions
- Empty or null inputs

### 6.4 Custom JSON Schema Validator Limitations

`tool-output-contracts.test.ts` uses a hand-rolled validator that:
- Only checks first 3 array items
- Doesn't enforce `additionalProperties: false`
- Doesn't test `oneOf`, `anyOf`, `pattern`, `format`
- Uses synthetic payloads, not real tool output

A real JSON Schema validator (e.g., `ajv`) with real tool output snapshots would be stronger.

### 6.5 Empty/Placeholder Test File

**`packages/adapter-maestro/test/device-runtime-ios.test.ts`** is completely empty — only imports `test` and `assert` but has zero test bodies. This is a zero-coverage file.

### 6.6 Testability Risk: Unmockable Shell Dependencies

**`packages/adapter-maestro/src/diagnostics-pull.ts`** imports `executeRunner` directly from `./runtime-shared.js` — it does NOT use the `setExecuteRunnerForTesting` / `executeRunnerWithTestHooks` pattern that the ios-backend files use. This means:

- Unit tests cannot mock `executeRunner` calls without module-level mocking (which `node:test` does not natively support)
- The existing test file resorted to "function exists" checks (`typeof fn === "function"`) instead of behavioral tests
- **Fix required:** Change the import to use `executeRunnerWithTestHooks` — a ~5-line source change with zero behavior impact, following the established ios-backend pattern

This is a structural testability gap, not a test quality gap. The tests can't be better until the source is slightly more testable.

**Other files with similar (but less severe) patterns:**
- `doctor-runtime.ts` (603 lines) — calls `executeRunner` directly; tests can only run against real environment
- `device-runtime-ios.ts` (641 lines) — same pattern; parser functions are testable but command builders are not

---

## 7. Quality Assessment Summary

### 7.1 Scores Overview

**Note:** Counts are by individual test file (53 total).

| Score | Count | Files |
|-------|-------|-------|
| **HIGH** | 23 | auto-remediation, dev-cli, server, session-persistence, stdio-server, device-runtime, flow-runtime, interruption-resolver, ios-backend-axe, ios-backend-router, ios-backend-simctl, ios-backend-wda, js-debug, performance, recording-mapper, recording-runtime, replay-step-orchestrator, replay-step-planner, ui-action-tools, ui-model, ui-runtime, prepare-mcp-release, export-canonical-skills, install-canonical-skills |
| **MEDIUM** | 19 | device-lease-store, failure-memory-store, session-scheduler (core), action-orchestrator-model, crash-attribution, diagnostics-tools, doctor-guidance, harness-config, interruption-detector, replay-step-persistence, session-state, ocr, ocr-fixtures, governance, mcp-stdio-server, session-lease, session-scheduler (mcp-server), tool-output-contracts, android-oem-text-fallback |
| **LOW** ⚠️ | 9 | interruption-policy, device-runtime-ios (empty), action-outcome-startup, diagnostics-pull, interruption-classifier, interruption-orchestrator, doctor-runtime, ocr-smoke, interruption-tools |

### 7.2 "Fake Test" Detection

**Result: No fake tests found.** All 53 test files contain real assertions against actual behavior. No instances of `expect(true).toBe(true)`, empty mocks with no assertions, or testing no-ops were detected.

However, the following are **weak assertions** that pass trivially:
- `interruption-tools.test.ts`: `typeof resumed.data.attempted === "boolean"` — passes for `true`, `false`, or even `0`
- `session-scheduler.test.ts` (mcp-server): `typeof firstData.queueWaitMs === "number"` — verifies field existence, not that serialization actually occurred
- `doctor-runtime.test.ts`: only checks that certain strings exist in an array, no behavioral validation
- `diagnostics-pull.test.ts`: `assert.equal(typeof fn, "function")` — existence checks, not behavioral tests

### 7.3 Anti-Patterns Found

| Anti-Pattern | Location | Description |
|-------------|----------|-------------|
| Fragile stdout parsing | `dev-cli.test.ts` | `runCli` helper intercepts `console.log` and parses JSON from last line — breaks if any tool adds non-JSON log |
| Repetitive test structure | `stdio-server.test.ts` (2529 lines) | Wave 1A/1B/2/3/4 missing/closed tests follow identical patterns — could use test helpers |
| Missing negative tests | Multiple | Many tests cover "it works" but not "it fails correctly" |
| Cross-module testing | `session-scheduler.test.ts` (core) | Tests across module boundaries — fine for integration but no isolated unit tests for lock acquisition |

---

## 8. Recommendations

### 8.1 Critical (Do First)

1. **Remove or implement `device-runtime-ios.test.ts`** — empty file with zero coverage
2. **Strengthen `interruption-tools.test.ts`** — currently 1 smoke test with trivial assertions; add per-tool behavioral tests
3. **Add YAML config loading tests to `interruption-policy.test.ts`** — the primary config input mechanism is completely untested

### 8.2 High Priority

4. **Add error-path tests to core** — corrupt JSON, missing directories, invalid input
5. **Add non-dry-run integration tests for critical tools** — at least verify command construction for untested tools
6. **Replace custom JSON Schema validator with `ajv`** — use real tool output snapshots
7. **Add deduplication and capping tests to `failure-memory-store.test.ts`** — the most interesting behaviors are untested

### 8.3 Medium Priority

8. **Add multi-rule priority tests to `interruption-resolver.test.ts`**
9. **Add success/happy paths to `recovery-tools.test.ts`** — currently only refusal paths tested
10. **Add success paths to `ui-runtime.test.ts`** — wait and scroll loops only tested for failure
11. **Add stale lease recovery tests to `session-lease.test.ts`**
12. **Consolidate repetitive tests in `stdio-server.test.ts`** with shared helpers

### 8.4 Low Priority

13. **Add missing interruption type tests** (system_alert, overlay, keyboard, low_battery, etc.)
14. **Add `probe_network_readiness`, `compare_visual_baseline`, screenshot tools tests**
15. **Add concurrent access race condition tests across packages**

---

## 9. Phase 21 Implementation Mapping

This report's findings have been converted into a 3-plan Phase 21 implementation track. Each plan has a detailed spec under `.planning/phases/21-test-quality-hardening/`.

### 9.1 Plan 01 — Critical Gap Closure (Wave 1)

| # | Gap | Source | Target File | Plan Step |
|---|-----|--------|-------------|-----------|
| 1 | Empty test file | `device-runtime-ios.ts` (641 lines) | `device-runtime-ios.test.ts` | Step 1 |
| 2 | Trivial type-check assertions | interruption tools (server) | `interruption-tools.test.ts` | Step 2 |
| 3 | 4 of 5 interruption types untested | `interruption-classifier.ts` (92 lines) | `interruption-classifier.test.ts` | Step 3 |
| 4 | Single trivial checkpoint test | `interruption-orchestrator.ts` (87 lines) | `interruption-orchestrator.test.ts` | Step 4 |
| 5 | Check-name-only assertions | `doctor-runtime.ts` (603 lines) | `doctor-runtime.test.ts` | Step 5 |
| 6 | "function exists" checks instead of behavioral tests | `diagnostics-pull.ts` (336 lines) | `diagnostics-pull.test.ts` | Step 6 |
| 7 | One narrow remediation scenario | `action-outcome.ts` (801 lines) | `action-outcome-startup.test.ts` | Step 7 |

**Expected outcome:** 0 empty test files, 0 trivial type-check assertions, all 7 files score ≥ MEDIUM.

### 9.2 Plan 02 — Medium-Path Strengthening (Wave 2)

| # | Gap | Files | New Tests |
|---|-----|-------|-----------|
| 1 | Missing error paths (corrupt JSON, missing dirs, invalid input) | `device-lease-store.test.ts`, `failure-memory-store.test.ts` | ~8 tests |
| 2 | YAML config loading, tool-scope mapping, allow/deny logic | `interruption-policy.test.ts` | ~6 tests |
| 3 | runExclusive failure propagation, lock timeout | `session-scheduler.test.ts` (core) | ~4 tests |
| 4 | Edge cases (empty inputs, disabled config) | `governance.test.ts`, `session-lease.test.ts` | ~5 tests |
| 5 | Additional crash types (watchdog, SIGABRT, uncaught Java exception) | `crash-attribution.test.ts` | ~4 tests |
| 6 | Missing success/happy paths | `recovery-tools.test.ts` | ~3 tests |
| 7 | Edge cases (malformed JSON, empty query) | `ocr.test.ts` | ~3 tests |

**Expected outcome:** All 9 files score ≥ HIGH.

### 9.3 Plan 03 — Systemic Infrastructure (Wave 3)

| # | Gap | Deliverable | Impact |
|---|-----|-------------|--------|
| 1 | No coverage tooling | `c8` integration, `test:coverage` script, baseline report | Measurable coverage for future drift detection |
| 2 | 5 untested MCP tools | `untested-tools.test.ts` with dryRun behavioral tests | 100% tool surface has at least smoke + behavioral test |
| 3 | Minimal custom JSON Schema validator | `ajv`-based validation + real tool output snapshots | Schema violations the old validator missed are now caught |
| 4 | Repetitive stdio-server tests (2529 lines) | Shared test helpers, consolidated Wave tests | ~800 lines reduced, easier maintenance |

**Expected outcome:** Coverage infrastructure in place, 100% tool coverage, stronger contract validation.

### 9.4 Pre/Post Metrics

| Metric | Pre-Phase 21 | Post-Phase 21 Target |
|--------|-------------|---------------------|
| Empty test files | 1 | 0 |
| LOW-scored test files | 9 | 0 |
| MEDIUM-scored test files | 19 | ≤ 10 (only those with inherently limited scope) |
| Untested MCP tools | 5 | 0 |
| Fake/trivial assertions | 4 instances | 0 |
| Coverage tooling | None | c8 with per-package baseline reports |
| JSON Schema validator | Custom (minimal) | ajv with real snapshots |

---

## 10. Files Changed by This Review

- `docs/testing/test-review-report.md` — this file (updated with Phase 21 mapping, §9)
- `.planning/phases/21-test-quality-hardening/21-PLAN.md` — Phase 21 Plan 01 (new)
- `.planning/phases/21-test-quality-hardening/21-02-PLAN.md` — Phase 21 Plan 02 (new)
- `.planning/phases/21-test-quality-hardening/21-03-PLAN.md` — Phase 21 Plan 03 (new)
