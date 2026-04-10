# AGENTS Guide for `mobile-e2e-mcp`

This file is for AI coding agents and contributors who need a fast, reliable way to understand and modify this repository.

## 1) Project Identity

`mobile-e2e-mcp` is an AI-first mobile E2E orchestration monorepo for Android/iOS/React Native/Flutter.

Core execution model:

- deterministic-first action path
- bounded OCR/CV fallback
- policy-guarded, session-oriented execution

## 2) Start Here (Required Reading Order)

1. `repomix-output.xml` (global context snapshot)
2. `README.md` or `README.zh-CN.md` (entry-level architecture + scripts)
3. `docs/engineering/ai-first-capability-expansion-guideline.md` (mandatory capability-expansion guardrails)
4. `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` when the task is non-trivial or depends on current execution context
5. `.planning/PLANNING-PROTOCOL.md` when the task adds, inserts, completes, or re-scopes planned work
6. Live repo delta-check (`git ls-files` + targeted file reads)
7. For implementation lookup, use `repomix-output.xml` for broad context first, then use Serena for symbol-level discovery (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) and impact analysis

Do not treat `repomix-output.xml` as the only source of truth.

### Internal planning workspace rule

This repository keeps its internal planning system under `.planning/`.

- `PROJECT.md` = stable planning charter and long-lived decisions
- `ROADMAP.md` = phase sequencing, dependencies, and completion tracking
- `STATE.md` = current execution reality and resume point
- `PLANNING-PROTOCOL.md` = update order and sync rules for new plans, summaries, verification, and roadmap/state changes

Use `.planning/` for execution coordination and session continuity. Do not treat it as the only source of shipped product truth; formal behavior still lives in code, tests, CI, and public docs.

### Mandatory activation rule for AI coding agents

If your task adds or changes any of the following, you must read `docs/engineering/ai-first-capability-expansion-guideline.md` before planning or editing code:

- MCP tools or tool contracts
- adapter runtime, fallback, or platform support behavior
- policy, session, evidence, diagnostics, recovery, or capability claims
- README/docs text that changes support boundaries or maturity levels

Do not rely on memory or prior sessions for these rules. Re-read the guideline in the current session before making changes.

## 3) Global Invariants (Do Not Break)

1. Deterministic path is primary; visual fallback is bounded and explicit.
2. Tool responses are structured and machine-consumable (not raw string-only outputs).
3. Session and policy context must remain auditable.
4. Failure paths should preserve evidence quality (artifacts/timeline context).

### 3.1) UI Stabilization Timing (Critical)

Every UI-affecting action requires a settle delay before the next action or UI capture. Failure to wait causes `OCR_POST_VERIFY_FAILED`, `NO_MATCH`, and `stateChanged=false` — the tool executed correctly on-device but post-action capture happened before the screen updated.

See [`docs/guides/ui-stabilization-timing.md`](docs/guides/ui-stabilization-timing.md) for the full timing table, root cause analysis, and flow authoring patterns.

## 4) Recommended Edit Strategy

1. Identify target package boundary first.
2. Mirror existing naming and file placement conventions.
3. Update docs near changed behavior (README/docs/tests notes) when behavior changes.
4. Re-run relevant verification commands before proposing changes.

**When writing flows or automation scripts**: Always insert settle delays between UI-affecting actions. See `docs/guides/ui-stabilization-timing.md`.

## 5) Canonical References

Use these as source-of-truth references instead of duplicating details in this file:

- `README.md` / `README.zh-CN.md` for monorepo map and runtime/verification commands
- `CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md` for commit/PR quality expectations
- `tests/README.md` for test-layer validation scope

## 6) Where to Go Deeper

- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/architecture/overview.md`
- `docs/architecture/architecture.md`
- `docs/architecture/capability-map.md`
- `docs/architecture/governance-security.md`
- `docs/guides/ui-stabilization-timing.md` — **UI 稳定时序**：为什么需要等待、各动作推荐时间、Flow 编写最佳实践
- `tests/README.md`

### 6.6) Release Doc-Sync Guardrail (README is not always required)

Use a layered **doc-sync** check for releases: PR gate first, pre-tag drift-check second, and tag-workflow warning fallback.
Do not hard-block tag publishing solely because README was not edited.

Canonical policy, trigger paths, and exemptions are maintained in:

- `docs/delivery/npm-release-and-git-tagging.zh-CN.md`

## 7) GitNexus — Code Intelligence

This project is indexed by GitNexus. Full tool guide, workflows, and skill files are in:
**`docs/engineering/gitnexus-agent-guide.md`**

Quick reference:
- Before editing any symbol: run `gitnexus_impact({target: "symbolName", direction: "upstream"})`
- Before committing: run `gitnexus_detect_changes()` to verify scope
- If index is stale: run `npx gitnexus analyze`
- Skill files: `.agent/skills/gitnexus/` (exploring, debugging, refactoring, impact analysis, guide, CLI)
