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

### 3.2) Explorer Rule Registry

When adding or changing Explorer traversal rules (skip page, skip element, sampling, risk gating, stateful-form gating, external-app boundary, or report explainability), use the rule registry guide instead of adding ad-hoc checks in traversal code:

- `docs/engineering/explorer-rule-registry.zh-CN.md`

Rules should have stable IDs, machine-readable categories/actions, explicit reasons, compatibility with legacy config fields, and report-visible decision metadata.

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
- `docs/engineering/explorer-rule-registry.zh-CN.md` — Explorer 规则添加、覆盖、禁用、校验与报告解释指南
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **mobile-e2e-mcp** (4789 symbols, 11003 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/mobile-e2e-mcp/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/mobile-e2e-mcp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/mobile-e2e-mcp/clusters` | All functional areas |
| `gitnexus://repo/mobile-e2e-mcp/processes` | All execution flows |
| `gitnexus://repo/mobile-e2e-mcp/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
