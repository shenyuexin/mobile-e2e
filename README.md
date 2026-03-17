# Mobile E2E MCP (2026)

> AI-first mobile E2E orchestration for Android/iOS/React Native/Flutter, with deterministic-first execution, bounded visual fallback, and governance-aware automation.

This repository is a pnpm monorepo that combines MCP tooling, adapter execution, and architecture docs for a scalable mobile E2E platform.

## What This Repository Actually Is

This repo contains both:

1. **Executable implementation** (MCP server, adapters, contracts, core orchestration), and
2. **Architecture and delivery knowledge base** (design principles, capability model, phased rollout docs).

If you only remember one thing: this project is designed as a **mobile orchestration layer for AI agents**, not a single-framework test runner.

## Quick Start

```json
{
  "mcpServers": {
    "mobile-e2e-mcp": {
      "command": "npx",
      "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest"]
    }
  }
}
```

## Build Locally (Fast Validation)

Use this sequence to verify the repository is buildable end-to-end:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test:ci
```

If you only need the local MCP runtime:

```bash
pnpm mcp:dev
# or
pnpm mcp:stdio
```

## AI Agent Start Here

For AI/code-analysis workflows, use this order:

1. **Read `repomix-output.xml` first** for global architecture and code-path context.
2. **Delta-check live repo files** (`git ls-files` + targeted reads).
3. Treat `repomix-output.xml` as the **primary entry point**, not the only source of truth.

Why: packed context may omit some files (binary assets, ignored paths, etc.), so final conclusions must be verified against live files.

## Monorepo at a Glance

- `packages/contracts` — shared types/contracts for tools, sessions, and result envelopes
- `packages/core` — policy engine, session store/scheduler, governance primitives
- `packages/adapter-maestro` — deterministic execution adapter, UI model/query/action path
- `packages/adapter-vision` — OCR/visual fallback services
- `packages/mcp-server` — MCP tool registry + stdio/dev CLI entry points
- `packages/cli` — CLI package boundary
- `configs/profiles` — framework profile contracts
- `configs/policies` — governance/access policy baselines
- `flows/samples` — sample flow baselines

Dependency direction (high level):

`contracts -> core -> adapters -> mcp-server -> CLI/stdio/dev runtime`

## How It Works (End-to-End)

Typical runtime path:

1. Agent/client invokes an MCP tool via stdio or dev CLI.
2. MCP server validates input and applies policy checks.
3. Session context is resolved (or created), with lease/scheduling guardrails.
4. Adapter router selects deterministic execution path first.
5. Action executes and returns a structured result envelope.
6. Artifacts/evidence (screens, logs, summaries) are attached for audit/debug.
7. If deterministic resolution fails and policy allows it, bounded OCR/CV fallback is attempted.

This is why the project emphasizes **session + policy + evidence**, not only UI actions.

## High-Level Architecture

Reference split:

- **Control plane**: tool contracts, policy checks, session orchestration, audit/evidence indexing
- **Execution plane**: platform actions, UI resolution, retries, interruption handling, visual fallback

Architecture reference:

- [System architecture overview (Mermaid, in-repo)](docs/architecture/system-architecture-overview.md)
- [Reference architecture details](docs/architecture/architecture.md)
- [Architecture navigation index (zh-CN)](docs/architecture/README.zh-CN.md)

Source-of-truth note:

- Architecture docs describe both current baseline and target-state design.
- If a doc statement conflicts with strict validation behavior, prefer `packages/contracts/*.schema.json` and `configs/policies/*.yaml` for current enforced behavior.

## Capability Map (Current Scope)

- **Environment & device control** — discovery, lease/isolation, environment shaping
- **App lifecycle** — install/launch/terminate/reset/deep-link entry
- **Perception & interaction** — inspect/query UI, tap/type/wait, flow execution
- **Diagnostics & evidence** — logs, crash signals, performance, screenshot/timeline artifacts
- **Reliability & remediation** — reason-coded failures, bounded retries, remediation helpers

Tool registry and signatures live in `packages/mcp-server/src/server.ts` and `packages/mcp-server/src/tools/*`.

Representative MCP tools currently implemented include:

- Session/lifecycle: `start_session`, `end_session`, `run_flow`, `reset_app_state`
- Device/app: `list_devices`, `install_app`, `launch_app`, `terminate_app`
- UI actions: `tap`, `type_text`, `wait_for_ui`, `tap_element`, `type_into_element`
- UI perception: `inspect_ui`, `query_ui`, `resolve_ui_target`, `scroll_and_resolve_ui_target`, `scroll_and_tap_element`
- Observability: `take_screenshot`, `record_screen`, `get_logs`, `get_crash_signals`, `collect_diagnostics`
- Intelligence/recovery: `perform_action_with_evidence`, `explain_last_failure`, `rank_failure_candidates`, `recover_to_known_state`, `replay_last_stable_path`, `suggest_known_remediation`

For exact signatures and supported inputs/outputs, use `packages/mcp-server/src/server.ts`.

## Deterministic Ladder and Fallback Policy

Action resolution order is intentional and strict:

1. Stable ID/resource-id/testID/accessibility identifier
2. Semantic tree match (text/label/role)
3. OCR text-region fallback (bounded)
4. CV/template fallback (bounded)
5. Fail with reason code + artifacts

Prohibited behavior:

- OCR/CV as the default first path
- Unbounded retries without state-change evidence
- Silent downgrade from deterministic to probabilistic execution

## Repository-Wide Principles

- **Deterministic-first**: use stable IDs/tree/native capabilities first; OCR/CV is bounded fallback.
- **Structured tool contracts**: return machine-consumable result envelopes (`status`, `reasonCode`, artifacts).
- **Session-oriented execution**: actions run in auditable sessions with explicit policy profiles.
- **Evidence-rich failures**: failures should carry enough context for explain/replay/remediation.

## Session, Policy, and Governance Model

- Sessions are auditable execution units with timeline and artifact references.
- Policy profiles can restrict tool classes (for example read-only vs interactive/full-control).
- Lease/scheduler constraints prevent unsafe concurrent execution on the same target.
- Redaction/governance paths exist to keep evidence useful while respecting data boundaries.

Key policy/config locations:

- `configs/policies/*.yaml`
- `configs/profiles/*.yaml`

## Current Test and Validation Model

Regression layers intentionally separate no-device core coverage from heavier lanes:

- Unit stack across core/adapters/server (`pnpm test:unit`)
- Root smoke validators (`pnpm test:smoke`)
- Optional OCR smoke (`pnpm test:ocr-smoke`)

Primary CI-oriented command:

```bash
pnpm test:ci
```

Testing details and fixture strategy: `tests/README.md`.

## Non-Goals (Important for Correct Expectations)

- This is not a replacement for every mobile framework internals.
- This is not OCR-first automation.
- This is not a guarantee of immediate parity across all native/RN/Flutter edge cases.
- This is not a single abstraction that erases all platform differences.

## Practical Reading Path (Human + AI)

If you want to get productive quickly, read in this sequence:

1. This README (mental model + commands + boundaries)
2. `AGENTS.md` (repo navigation and invariants)
3. `docs/architecture/architecture.md` (control plane vs execution plane)
4. `packages/mcp-server/src/server.ts` (actual tool registry and invocation surface)
5. `tests/README.md` (what is truly validated today)

## Open Source Collaboration

- License: [MIT](LICENSE)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Code ownership: [.github/CODEOWNERS](.github/CODEOWNERS)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Support guide: [SUPPORT.md](SUPPORT.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## Recommended GitHub Repository Topics

To improve discoverability for developers and AI agents, set these topics in
the repository settings:

`mcp`, `mobile-testing`, `e2e-testing`, `android`, `ios`, `react-native`, `flutter`, `automation`, `ai-agent`

## Selected Docs

- [README.zh-CN.md](README.zh-CN.md) — Chinese overview
- [docs/README.md](docs/README.md) — public documentation index and publication policy
- [docs/architecture/overview.md](docs/architecture/overview.md) — goals/scope/principles
- [docs/architecture/architecture.md](docs/architecture/architecture.md) — reference architecture
- [docs/architecture/capability-map.md](docs/architecture/capability-map.md) — capability taxonomy/maturity
- [docs/architecture/governance-security.md](docs/architecture/governance-security.md) — governance/security model
- [docs/architecture/README.zh-CN.md](docs/architecture/README.zh-CN.md) — architecture navigation index (zh-CN)
- [docs/architecture/session-orchestration-architecture.zh-CN.md](docs/architecture/session-orchestration-architecture.zh-CN.md) — session lease/scheduler/runtime orchestration
- [docs/architecture/policy-engine-runtime-architecture.zh-CN.md](docs/architecture/policy-engine-runtime-architecture.zh-CN.md) — policy runtime/guard/scope mapping
- [docs/architecture/platform-implementation-matrix.zh-CN.md](docs/architecture/platform-implementation-matrix.zh-CN.md) — cross-platform support matrix
- [docs/delivery/roadmap.md](docs/delivery/roadmap.md) — delivery phases
- [docs/delivery/npm-release-and-git-tagging.zh-CN.md](docs/delivery/npm-release-and-git-tagging.zh-CN.md) — npm 发版与 Git tag 一体化规范（@shenyuexin/mobile-e2e-mcp）
- [tests/README.md](tests/README.md) — test layers and CI scope

## Roadmap Snapshot (Short)

- Near term: harden deterministic session/action reliability and evidence model.
- Mid term: broaden framework/profile maturity and real-run coverage.
- Long term: stronger agentic remediation/governance and enterprise controls.

Detailed public planning references are maintained in `docs/delivery/roadmap.md` and `docs/architecture/*`.

## Positioning

This project is not another isolated test framework. It is a universal AI-facing orchestration layer that routes mobile E2E actions across multiple backends with deterministic-first behavior and strict governance boundaries.
