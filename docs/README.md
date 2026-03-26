# Docs Index (Public)

This directory now keeps only public-facing architecture and delivery references.

## Public sections

- `engineering/` — durable implementation-facing guidance for contributors extending the harness
- `architecture/` — reference architecture, capability model, platform/adapter design, governance/security
- `delivery/roadmap.md` — public roadmap and phase-level delivery direction
- `delivery/npm-release-and-git-tagging.zh-CN.md` — release/tagging operational guide
- `delivery/p0-p2-execution-plan.zh-CN.md` — phased execution plan for trust/value-positioning improvements
- `showcase/` — reproducible demo evidence, recordings, and run reports
  - `showcase/README.md` — showcase entry with reproducible scripts and canonical video assets
  - `showcase/demo-playbook.zh-CN.md` — verified happy-path and interruption-recovery demo scripts
- `guides/ai-agent-invocation.zh-CN.md` — canonical AI-agent invocation guide and tool-sequencing rules
- `guides/golden-path.md` — front-door closed-loop guide for first-run success
- `guides/flow-generation.md` — flow export/replay guide, including `run_flow` Android replay configuration
- `guides/vivo-oppo-multi-user-replay.md` — OEM multi-user replay diagnosis and user-0 / OEM-fallback guidance
- `templates/` — reusable templates for ADR, review, evidence, and planning artifacts

## Publication boundary

The following document classes are intentionally not kept in public docs:

- Dated execution snapshots and one-off trial records
- Internal checklists used for temporary rollout waves
- In-flight phase/program tracking files tied to mutable internal ownership

If a delivery process becomes stable and reusable, promote it into `architecture/` or a durable `delivery/` document.

## Recommended engineering guides

- `engineering/type-export-sequencing-guideline.md` — avoid cross-package type export sequencing mistakes
- `engineering/ai-first-capability-expansion-guideline.md` — keep new features aligned with AI-first, deterministic-first, policy-aware harness design
- `engineering/capability-family-inventory.md` — capability family ownership and phased refactor guardrails
- `engineering/adapter-maestro-index-decomposition-implementation-playbook.zh-CN.md` — step-by-step implementation playbook for shrinking adapter-maestro `index.ts` without boundary regressions

## Recommended architecture entry points

- `architecture/orchestration-robustness-strategy.md` — priority deepening areas for high-frequency automation-flow failures and network anomaly handling
- `architecture/harness-deepening-debug-first-strategy.zh-CN.md` — debug-first harness deepening strategy focused on stronger evidence, attribution, recovery, and stop decisions
- `architecture/harness-deepening-debug-first-implementation-checklist.zh-CN.md` — milestone-based execution checklist for outcome proof, diagnosis packet, session memory, recovery follow-on, and validation gates
- `architecture/bounded-retry-and-state-change-evidence-architecture.md` — runtime design for bounded retry, checkpoint, replay-safe resume, and state-change proof
- `architecture/network-anomaly-runtime-architecture.md` — runtime design for network-aware readiness, attribution, retry, and early-stop behavior
- `architecture/orchestration-robustness-implementation-checklist.md` — directly executable milestone checklist for robustness work
- `architecture/failure-attribution-and-recovery-architecture.zh-CN.md` — bounded failure-to-recovery closure
- `architecture/interruption-orchestrator-v2.zh-CN.md` — interruption handling runtime architecture
