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
4. Live repo delta-check (`git ls-files` + targeted file reads)

Do not treat `repomix-output.xml` as the only source of truth.

### Mandatory activation rule for AI coding agents

If your task adds or changes any of the following, you must read `docs/engineering/ai-first-capability-expansion-guideline.md` before planning or editing code:

- MCP tools or tool contracts
- adapter runtime, fallback, or platform support behavior
- policy, session, evidence, diagnostics, recovery, or capability claims
- README/docs text that changes support boundaries or maturity levels

Do not rely on memory or prior sessions for these rules. Re-read the guideline in the current session before making changes.

## 3) Monorepo Map

- `packages/contracts`: shared types and tool/session result contracts
- `packages/core`: policy engine, governance, session store/scheduler, execution coordination
- `packages/adapter-maestro`: deterministic adapter implementation and UI execution helpers
- `packages/adapter-vision`: OCR/vision fallback capability
- `packages/mcp-server`: MCP server, tool registry, stdio server, dev CLI
- `packages/cli`: CLI package boundary
- `configs/profiles`: framework profile contracts
- `configs/policies`: access/governance policy baselines
- `flows/samples`: sample flow baselines

## 4) Primary Runtime & Verification Commands

From repo root:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm mcp:dev
pnpm mcp:stdio
```

## 5) Global Invariants (Do Not Break)

1. Deterministic path is primary; visual fallback is bounded and explicit.
2. Tool responses are structured and machine-consumable (not raw string-only outputs).
3. Session and policy context must remain auditable.
4. Failure paths should preserve evidence quality (artifacts/timeline context).

## 6) Recommended Edit Strategy

1. Identify target package boundary first.
2. Mirror existing naming and file placement conventions.
3. Update docs near changed behavior (README/docs/tests notes) when behavior changes.
4. Re-run relevant verification commands before proposing changes.

## 6.5) Commit Message Expectations

- Commit messages should include a concise semantic-style title plus body text explaining **why** the change is needed.
- Do not stop at a title-only commit message when the change affects behavior, architecture, release automation, policy, or developer workflow.
- Good default pattern:
  - Title: `type(scope): short summary`
  - Body: 1-2 short paragraphs or bullets covering why the change was made, what boundary or workflow it affects, and any important rollout/review context.

## 7) Where to Go Deeper

- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/architecture/overview.md`
- `docs/architecture/architecture.md`
- `docs/architecture/capability-map.md`
- `docs/architecture/governance-security.md`
- `tests/README.md`
