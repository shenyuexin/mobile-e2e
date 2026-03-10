# Adapter Code Placement Guide

## 1. Purpose

This document answers one practical question for future work in `packages/adapter-maestro`:

> When a new feature is added, where should the code go?

The goal is to keep `packages/adapter-maestro/src/index.ts` thin over time, preserve clear ownership boundaries, and avoid re-introducing a single giant execution file.

This guide is intentionally implementation-facing. It complements:

- `docs/architecture/architecture.md`
- `docs/architecture/adapters-android.md`
- `docs/architecture/adapters-ios.md`
- `docs/architecture/governance-security.md`

## 2. Placement Rules

Use these rules before adding new code:

1. Put pure parsing, normalization, matching, and selector logic in a pure helper module.
2. Put platform command construction and execution orchestration in runtime modules.
3. Put policy parsing and access decisions in shared governance modules, not inside tool handlers.
4. Let `index.ts` compose modules and expose tool-facing functions, but avoid growing new low-level logic there.
5. If a new feature mixes Android/iOS execution with query logic, split the query/model part from the device-command part.

## 2.1 Contributor Rules

These rules are mandatory for future changes in `packages/adapter-maestro`.

1. Do not add a new helper to `index.ts` if it can live in an existing focused module.
2. Do not place platform command builders next to pure selector or parsing helpers.
3. Do not place YAML/config parsing in runtime execution modules.
4. Do not place policy scope mapping or allow/deny decisions inside adapter tool functions.
5. Prefer extraction by cohesive runtime cluster, not by file size alone.

## 2.2 Dependency Direction

Use this dependency direction when splitting files:

- `ui-model.ts` -> imports no adapter runtime modules
- `harness-config.ts` -> imports no execution modules
- runtime modules -> may import `ui-model.ts` and `harness-config.ts`
- tool orchestration modules -> may import runtime modules and pure model helpers
- `index.ts` -> imports focused modules and re-exports the public adapter surface

Avoid reverse imports from pure modules back into runtime/tool modules.

## 2.3 Naming Rule

Use these names consistently:

- `*-model.ts` for pure data transforms and matching
- `*-runtime.ts` for platform command execution and side effects
- `*-tools.ts` for tool-level orchestration over runtime/model modules
- `*-config.ts` for repository/profile/session config loading

## 2.4 Verification Rule

Every extraction should preserve behavior and update the surrounding layers together:

1. adapter tests
2. server/CLI/stdio/root validation when exports or behavior are observable there
3. capability text or docs if user-visible support boundaries changed

Do not merge a split that only moves code without keeping the verification chain green.

## 3. Current Module Map

### `packages/adapter-maestro/src/index.ts`

Current role:

- Tool-level orchestration entrypoint for adapter behavior.
- Aggregates platform execution, dry-run envelopes, and structured tool results.
- Still holds a large amount of runtime logic that should continue to move outward.

Keep in `index.ts`:

- top-level exported `*WithMaestro` tool functions
- final result-envelope shaping
- thin coordination across helper modules

Do not add more of these here unless unavoidable:

- YAML/config parsing
- selector matching algorithms
- reusable command builders
- policy access mapping
- JS debug helper internals

### `packages/adapter-maestro/src/harness-config.ts`

Current role:

- repo-root discovery
- harness YAML parsing
- runner-profile selection
- session defaults
- artifact directory resolution

Put here:

- any future harness/profile config readers
- environment/profile default selection
- adapter-side config validation

Do not put here:

- device command execution
- UI tree parsing
- policy allow/deny logic

### `packages/adapter-maestro/src/ui-model.ts`

Current role:

- Android XML parsing
- iOS hierarchy JSON flattening
- selector normalization
- query filtering
- bounds parsing
- target resolution
- swipe coordinate derivation

Put here:

- pure UI-tree transforms
- selector semantics
- matching/ranking/resolution helpers
- wait-condition evaluation helpers

Do not put here:

- `adb`, `idb`, `simctl`, or shell execution
- filesystem writes
- session or policy loading

### `packages/adapter-maestro/src/capability-model.ts`

Current role:

- platform capability descriptions
- support-level declarations
- grouped capability reporting

Put here:

- capability map updates
- support-level note changes
- new tool capability/group declarations

Do not put here:

- runtime checks
- actual policy enforcement
- execution branching

### `packages/adapter-maestro/src/js-debug.ts`

Current role:

- Metro target discovery
- JS debug target ranking and selection
- inspector WebSocket URL construction
- console/network capture
- JS summary construction and formatting helpers

Put here:

- Metro inspector-specific helpers
- console/network normalization and summary logic
- JS debug capture orchestration

Do not put here:

- native logcat/simulator log handling
- general UI hierarchy matching
- policy enforcement

## 4. Target Module Boundaries For New Work

The following file groups should guide future extraction work.

### A. Harness and Session Configuration

Primary home:

- `packages/adapter-maestro/src/harness-config.ts`

Owns:

- harness YAML parsing
- runner-profile compatibility
- device/app/sample defaults
- artifact-root resolution

Typical new features:

- new framework profile contracts
- environment-specific defaults
- per-profile execution flags

### B. UI Model and Selector Semantics

Primary home:

- `packages/adapter-maestro/src/ui-model.ts`

Owns:

- tree parsing
- selector normalization
- query result shaping
- ambiguity detection
- coordinate derivation

Typical new features:

- richer selector fields
- hierarchy ranking heuristics
- platform-specific node normalization

### C. UI Runtime

Recommended future file:

- `packages/adapter-maestro/src/ui-runtime.ts`

Should own:

- Android UI dump capture
- iOS hierarchy capture
- `adb`/`idb` command builders for tap, type, swipe
- reusable runtime helpers for inspect/query/resolve/wait/scroll flows

Typical new features:

- live iOS tree polling improvements
- screenshot-assisted fallback hooks
- WDA-backed iOS runtime in the future

Why split this out:

- it is currently the largest execution-heavy cluster inside `index.ts`
- it mixes command building, retries, and platform-specific side effects

### D. UI Tool Orchestration

Recommended future file:

- `packages/adapter-maestro/src/ui-tools.ts`

Should own:

- `inspectUiWithMaestro`
- `queryUiWithMaestro`
- `resolveUiTargetWithMaestro`
- `waitForUiWithMaestro`
- `scrollAndResolveUiTargetWithMaestro`
- `tapElementWithMaestro`
- `typeIntoElementWithMaestro`
- `scrollAndTapElementWithMaestro`

This layer should call `ui-model.ts` and `ui-runtime.ts`, but avoid reimplementing either one.

### E. Device/App Runtime

Recommended future file:

- `packages/adapter-maestro/src/device-runtime.ts`

Should own:

- install / launch / terminate command construction
- screenshots, logs, crash signal capture
- simulator/emulator process-facing helpers

Typical new features:

- uninstall / clear-data support
- richer diagnostics bundles
- platform-specific launch variants

### F. JS Debug Runtime

Primary home:

- `packages/adapter-maestro/src/js-debug.ts`

Should own:

- Metro target discovery
- target ranking/selection
- console/network inspector capture
- debug evidence aggregation helpers

Why split this out:

- it is a cohesive subsystem with very different concerns from UI execution
- it already has substantial structured summary logic

### G. Governance / Policy

Primary home for shared policy engine:

- `packages/core/src/policy-engine.ts`

Primary home for MCP enforcement:

- `packages/mcp-server/src/policy-guard.ts`

Put here:

- policy profile loading
- required-scope mapping
- allow/deny decisions
- enforcement wrappers at MCP entrypoints

Do not duplicate inside `adapter-maestro`:

- access-profile parsing
- policy scope mapping
- session-governance decisions

## 5. Quick Placement Table

| New work item | Put it here first | Notes |
|---|---|---|
| New harness YAML field | `packages/adapter-maestro/src/harness-config.ts` | If it affects defaults or profile selection |
| New selector field | `packages/adapter-maestro/src/ui-model.ts` | Keep it pure and fixture-testable |
| New `adb`/`idb` command helper | `packages/adapter-maestro/src/ui-runtime.ts` or `device-runtime.ts` | Depends on UI vs app/device scope |
| New UI wait/retry behavior | `packages/adapter-maestro/src/ui-tools.ts` plus `ui-model.ts` | Split orchestration from pure evaluation |
| New Metro inspector helper | `packages/adapter-maestro/src/js-debug.ts` | Do not add more to generic UI files |
| New policy scope or profile rule | `packages/core/src/policy-engine.ts` | Enforcement stays in `packages/mcp-server` |
| New MCP tool description about support levels | `packages/adapter-maestro/src/capability-model.ts` and `packages/mcp-server/src/stdio-server.ts` | Keep advertised support consistent |

## 6. Update Checklist For New Features

When adding a new adapter feature, update all relevant layers together:

1. Implementation module (`adapter-maestro` or `core`)
2. Capability declaration in `packages/adapter-maestro/src/capability-model.ts`
3. MCP entrypoint wiring in `packages/mcp-server/src/tools/`
4. stdio/CLI exposure if relevant
5. tests across adapter/server/CLI/stdio/root validation as appropriate
6. architecture or adapter docs when placement or support boundaries changed

## 7. Near-Term Refactor Order

If continuing the split from the current repo state, the highest-value extraction order is:

1. `ui-runtime.ts`
2. `device-runtime.ts`
3. `ui-tools.ts`
4. `doctor.ts`

This order reduces `index.ts` quickly while keeping behavior changes bounded.

## 8. Decision Rule

If you are unsure where a new feature belongs, ask this question:

> Is this code describing data semantics, executing platform commands, or composing tool behavior?

- data semantics -> `ui-model.ts`
- platform config/defaults -> `harness-config.ts`
- policy/governance -> `packages/core/src/policy-engine.ts` or `packages/mcp-server/src/policy-guard.ts`
- platform execution -> runtime module
- tool orchestration/result shaping -> `index.ts` or a future tool module
