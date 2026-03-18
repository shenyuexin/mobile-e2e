# Mobile E2E MCP (2026)

[![CI (build + typecheck + unit + smoke)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)
[![pnpm test:ci](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/test-ci.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/test-ci.yml)

> AI-first mobile E2E orchestration for Android/iOS/React Native/Flutter, with deterministic-first execution, bounded visual fallback, and governance-aware automation.

This repository is a pnpm monorepo that combines MCP tooling, adapter execution, and architecture docs for a scalable mobile E2E platform.

## 30-Second Proof 

If you want to verify this project is runnable before reading architecture details, start here:

- Happy path video (login -> scroll -> add to cart -> orders -> cart):
  - `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4`
- Visible interruption + recovery video (HOME interruption -> recover_to_known_state -> continue action):
  - `docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4`
- Repro scripts:
  - `bash scripts/dev/record-demo-happy-path-android.sh`
  - `bash scripts/dev/record-demo-interruption-home-recovery-android.sh`
  - `bash scripts/dev/publish-showcase-assets-android.sh` (record + curate videos + refresh snapshots/GIFs)
- Demo playbook and evidence index:
  - [docs/showcase/README.md](docs/showcase/README.md)
  - [docs/showcase/demo-playbook.zh-CN.md](docs/showcase/demo-playbook.zh-CN.md)
  - [docs/showcase/failure-intelligence-demo.md](docs/showcase/failure-intelligence-demo.md)
- Golden path guide:
  - [docs/guides/golden-path.md](docs/guides/golden-path.md)
- CI evidence and boundary notes:
  - [docs/showcase/ci-evidence.md](docs/showcase/ci-evidence.md)
  - [Latest CI workflow runs](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)

### Quick GIF Preview

| Happy path GIF | Interruption recovery GIF |
|---|---|
| ![Happy path preview](docs/showcase/assets/happy-preview.gif) | ![Interruption recovery preview](docs/showcase/assets/interruption-preview.gif) |

## Mobile E2E Harness Positioning 

This project is an **AI mobile E2E harness**: a policy-aware, session-oriented, deterministic-first execution harness for real-device mobile automation.

If you're searching for terms like **mobile test harness**, **real-device Android test harness**, **AI automation harness**, or **mobile CI harness**, this repository is built for that exact workflow.

### Why teams use this harness

- **Deterministic-first harness**: stable selectors and structured retries before OCR/CV fallback
- **Failure-intelligence harness**: reason codes, evidence artifacts, and remediation suggestions
- **Governance-aware harness**: policy profiles, auditable sessions, and controlled tool surfaces
- **Real-device demo harness**: reproducible scripts + videos for happy path and interruption recovery

## Appium / Maestro vs This Harness

| Dimension | Appium / Maestro | Mobile E2E MCP Harness |
|---|---|---|
| Core role | Automation framework / flow runner | AI-facing orchestration harness |
| Execution strategy | Action execution centric | Deterministic-first + policy/session governance |
| Failure handling | Assertion/command failure outputs | Structured diagnostics + ranked causes + remediation hints |
| AI integration | Possible but not primary abstraction | Primary design target (tools for AI agents) |
| Evidence model | Varies by setup | Built-in evidence-first action outcomes |

## FAQ 

### What is a mobile E2E harness for AI agents?

It is an execution layer that lets AI agents run mobile test actions safely and reproducibly. This harness adds session control, policy boundaries, deterministic action routing, and structured evidence beyond basic command execution.

### Can this harness run on real Android devices?

Yes. This repository includes real-device scripts and recordings under `scripts/dev/*` and `docs/showcase/*`, including happy-path and interruption-recovery demos.

### How does interruption recovery work in this harness?

It detects interruption signals, classifies likely interruption type, and applies bounded recovery actions (for example `recover_to_known_state`) before continuing the flow.

### Is this a replacement for Appium or Maestro?

Not necessarily. It is better understood as an orchestration harness that can coexist with existing execution ecosystems while adding AI-oriented governance and diagnostics.

### Which scenarios are the best fit?

Release-gate mobile regression, flaky-flow triage, AI-driven exploratory checks, and real-device CI workflows that require auditable, evidence-rich outcomes.

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

## Complete MCP Tool Catalog (Current)

The server currently exposes **46 tools**. For AI agents, this is the fastest way to understand what actions are available.

### 1) Session & lifecycle

`start_session`, `end_session`, `run_flow`, `reset_app_state`

### 2) Device & app control

`list_devices`, `install_app`, `launch_app`, `terminate_app`, `describe_capabilities`, `doctor`

### 3) UI perception, targeting, and interaction

`inspect_ui`, `query_ui`, `resolve_ui_target`, `scroll_and_resolve_ui_target`, `wait_for_ui`, `tap`, `tap_element`, `scroll_and_tap_element`, `type_text`, `type_into_element`

### 4) Evidence, observability, and diagnostics

`take_screenshot`, `record_screen`, `get_logs`, `get_crash_signals`, `collect_diagnostics`, `collect_debug_evidence`, `get_screen_summary`, `get_session_state`, `capture_js_console_logs`, `capture_js_network_events`, `list_js_debug_targets`

### 5) Interruption handling

`detect_interruption`, `classify_interruption`, `resolve_interruption`, `resume_interrupted_action`

### 6) Failure analysis, recovery, and remediation

`perform_action_with_evidence`, `get_action_outcome`, `explain_last_failure`, `rank_failure_candidates`, `find_similar_failures`, `compare_against_baseline`, `recover_to_known_state`, `replay_last_stable_path`, `suggest_known_remediation`

### 7) Performance profiling

`measure_android_performance`, `measure_ios_performance`

For exact signatures and supported inputs/outputs, use `packages/mcp-server/src/server.ts` (the tool registry source of truth).

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
- [docs/showcase/README.md](docs/showcase/README.md) — real-device demo evidence and repro scripts
- [tests/README.md](tests/README.md) — test layers and CI scope

## Roadmap Snapshot (Short)

- Near term: harden deterministic session/action reliability and evidence model.
- Mid term: broaden framework/profile maturity and real-run coverage.
- Long term: stronger agentic remediation/governance and enterprise controls.

Detailed public planning references are maintained in `docs/delivery/roadmap.md` and `docs/architecture/*`.

## Positioning

This project is not another isolated test framework. It is a universal AI-facing orchestration layer that routes mobile E2E actions across multiple backends with deterministic-first behavior and strict governance boundaries.

## Support This Project

If this project helps your team, you can support it by:

1. Starring and sharing the repository
2. Opening issues/PRs with reproducible evidence
3. Sponsoring the project

Donation note:

- [![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://paypal.me/shenyuexin) [paypal.me/shenyuexin](https://paypal.me/shenyuexin)
