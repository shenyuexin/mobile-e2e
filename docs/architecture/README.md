# Architecture Documentation

This directory contains the architecture and design documentation for mobile-e2e-mcp.

## Core Documents

| # | Document | Content |
|---|---|---|
| [01](./01-system-architecture.md) | System Architecture | High-level topology, control plane vs execution plane, session model, tool contracts, AUT contract, reliability controls |
| [02](./02-platform-adapters.md) | Platform Adapters & Framework Profiles | Android adapter (ADB), iOS adapter (AXe/WDA/simctl/devicectl), framework profiles (Native/RN/Flutter) |
| [03](./03-capability-model.md) | AI-First Capability Model | State model, action evidence, attribution, recovery, governance layers, maturity levels (L1–L5) |
| [04](./04-runtime-architecture.md) | Runtime Architecture | Execution coordinator, fallback ladder, bounded retry, failure attribution, evidence timeline, interruption handling, OCR fallback |
| [05](./05-governance-security.md) | Governance & Security | Policy profiles, audit, SLOs, cost controls, OCR governance, human handoff |

## Specialized Documents

- [Adapter Code Placement](./adapter-code-placement.md) — where to put new code in packages/adapter-maestro
- [RN Debugger Sequence](./rn-debugger-sequence.md) — Metro inspector capability gap analysis
- [Network Anomaly Runtime](./network-anomaly-runtime-architecture.md) — network-aware retry and stop logic
- [Human Handoff](./human-handoff-and-protected-page-awareness.md) — OTP/captcha/consent handling

## Chinese-Language Documents (zh-CN)

- [中文文档导航](./README.zh-CN.md) — 统一中文索引
- [Session Orchestration](./session-orchestration-architecture.zh-CN.md)
- [Policy Engine Runtime](./policy-engine-runtime-architecture.zh-CN.md)
- [Execution Coordinator](./execution-coordinator-and-fallback-ladder.zh-CN.md)
- [Evidence Timeline](./evidence-timeline-architecture.zh-CN.md)
- [Failure Attribution](./failure-attribution-and-recovery-architecture.zh-CN.md)
- [Interruption Orchestrator V2](./interruption-orchestrator-v2.zh-CN.md)
- [Platform Implementation Matrix](./platform-implementation-matrix.zh-CN.md)

## Guides

Setup, usage, and operational guides are in [`docs/guides/`](../guides/):

- [External Tools Setup](../guides/external-tools.md) — axe, WDA, iproxy, adb, Maestro, Perfetto
- [WDA Setup](../guides/wda-setup.md) — WebDriverAgent build, signing, and connection
- [Flow Generation](../guides/flow-generation.md) — record/export/replay
- [Golden Path](../guides/golden-path.md) — first-run closed loop
- [Vivo/Oppo Multi-User Replay](../guides/vivo-oppo-multi-user-replay.md)

## Reading Order

For new contributors:
1. **README.md** (this page) — orientation
2. **01-system-architecture.md** — system topology and contracts
3. **02-platform-adapters.md** — how each platform is automated
4. **03-capability-model.md** — what the system can do

For implementers:
1. **02-platform-adapters.md** — current backends and commands
2. **adapter-code-placement.md** — where to add new code
3. **04-runtime-architecture.md** — execution and fallback details

## Baseline Notes

- "Current baseline" refers to what `packages/contracts/*.schema.json` and `configs/policies/*.yaml` currently enforce.
- Capability support levels (Full/Partial/Unsupported) reflect the live code, not aspirational targets.
- When architecture docs conflict with schemas/configs: schemas/configs take precedence.
