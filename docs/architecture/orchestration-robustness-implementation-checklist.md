# Orchestration Robustness Implementation Checklist

This checklist is the implementation companion for:

- `docs/architecture/orchestration-robustness-strategy.md`
- `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md`
- `docs/architecture/network-anomaly-runtime-architecture.md`

Use it to implement orchestration robustness in a deterministic-first, policy-aware, evidence-rich way.

## Implementation status snapshot

- Status: completed
- Completion basis: contracts/core/adapter/server implementation + unit/smoke/ci verification chain
- Latest verification baseline: `pnpm build`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:smoke`, `pnpm test:ci`

---

## 0) Target and Done Definition

### In scope

- stronger bounded retry semantics
- state-change evidence capture and decision rules
- replay-safe and resume-safe checkpoint boundaries
- network-aware readiness, retry, and stop logic
- validation lanes for frequent robustness scenarios

### Out of scope

- dynamic network fault injection as baseline rollout work
- debugger-grade network tooling
- unbounded self-healing
- vague “improve reliability” work without contracts, reason codes, tests, and evidence

### Done when all are true

- [ ] Contracts and reason codes support the new orchestration and network classes.
- [ ] Runtime orchestration can explain why it retried, replayed, continued, or stopped.
- [ ] Checkpoint/replay boundaries remain policy-safe and auditable.
- [ ] Network-driven instability can produce bounded retryable vs terminal stop behavior.
- [ ] Validation covers both happy-path recovery and terminal-stop behavior.
- [ ] Docs/support-boundary language stays honest about current vs partial vs future support.

### Required evidence artifacts

- [ ] Reason codes in tool results
- [ ] Relevant pre/post state summaries
- [ ] Timeline markers for retry / replay / stop decisions
- [ ] Action outcome artifacts for both success and failure branches

---

## 1) Milestone Order

### M1. Contracts and reason-code baseline

#### Tasks
- [ ] Add failing contract-level tests first for step-state, retry, replay, and network readiness semantics.
- [ ] Define or extend shared types in `packages/contracts/src/types.ts`.
- [ ] Define or extend reason codes in `packages/contracts/src/reason-codes.ts`.
- [ ] Ensure result envelopes can represent retry, replay, and network stop semantics cleanly.

#### Target files
- [ ] `packages/contracts/src/types.ts`
- [ ] `packages/contracts/src/reason-codes.ts`
- [ ] related contract tests / schema exports

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`

#### Evidence
- [ ] New or updated type definitions
- [ ] New or updated reason-code coverage

---

### M2. Step-state model and bounded retry

#### Tasks
- [ ] Add failing tests first for `slow-ready-but-recoverable` and `no-state-change-retry-budget-exhausted`.
- [ ] Implement step-state classification helpers.
- [ ] Add bounded retry decision logic with explicit stop conditions.
- [ ] Record whether retry was allowed because of strong, moderate, weak, or no state-change evidence.
- [ ] Preserve deterministic-first behavior before any fallback or replay path.

#### Target files
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
- [ ] `packages/adapter-maestro/src/task-planner.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`
- [ ] `packages/core/src/policy-engine.ts`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`

#### Scenario coverage
- [ ] `slow-ready-but-recoverable`
- [ ] `no-state-change-retry-budget-exhausted`

#### Evidence
- [ ] Retry decision trace present
- [ ] Stop reason present when budget exhausts
- [ ] Post-action verification trace present

---

### M3. Checkpoint and replay boundaries

#### Tasks
- [ ] Add failing tests first for `checkpoint-replay-recommended` and `replay-refused-high-risk-boundary`.
- [ ] Define stable checkpoint criteria.
- [ ] Define replay-safe and resume-safe refusal rules.
- [ ] Ensure high-risk or non-idempotent flows are blocked from unsafe replay.
- [ ] Persist enough context to explain why replay was chosen or refused.

#### Target files
- [ ] `packages/core/src/session-store.ts`
- [ ] `packages/adapter-maestro/src/recovery-tools.ts`
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
- [ ] `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`

#### Scenario coverage
- [ ] `checkpoint-replay-recommended`
- [ ] `replay-refused-high-risk-boundary`
- [ ] `interruption-resume-with-state-drift`

#### Evidence
- [ ] Checkpoint selection trace present
- [ ] Replay refusal reason present when blocked
- [ ] Timeline records replay / resume decision

---

### M4. Network-aware readiness and stop logic

#### Tasks
- [ ] Add failing tests first for `network-degraded-retryable`, `network-terminal-stop-early`, and `offline-terminal-stop`.
- [ ] Extend readiness/state modeling to distinguish retryable vs terminal network outcomes.
- [ ] Integrate network-aware decision logic into orchestration and recovery paths.
- [ ] Ensure Metro/RN network capture remains supplemental rather than the only network signal path.
- [ ] Stop early when evidence supports backend-terminal or offline-terminal state.

#### Target files
- [ ] `packages/adapter-maestro/src/session-state.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`
- [ ] `packages/adapter-maestro/src/diagnostics-tools.ts`
- [ ] `packages/adapter-maestro/src/js-debug.ts`
- [ ] `packages/adapter-maestro/src/recovery-tools.ts`
- [ ] `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`

#### Scenario coverage
- [ ] `network-degraded-retryable`
- [ ] `network-terminal-stop-early`
- [ ] `offline-terminal-stop`
- [ ] `partial-render-before-business-readiness`

#### Evidence
- [ ] Network-related reason code present
- [ ] Retryable vs terminal distinction visible in artifacts/results
- [ ] Timeline includes network-aware stop or retry decision

---

### M5. Validation lanes and evidence

#### Tasks
- [ ] Add or extend tests and reproducible scenarios for frequent robustness paths.
- [ ] Ensure both success-after-recovery and terminal-stop paths emit structured evidence.
- [ ] Verify failure packets remain machine-consumable and auditable.

#### Target files
- [ ] relevant adapter/server test files
- [ ] `tests/README.md` if validation boundary wording changes
- [ ] showcase or sample validation docs only if support claims are upgraded

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`
- [ ] `pnpm test:ci`

#### Scenario coverage
- [ ] happy-path: bounded retry recovers after verified state change
- [ ] edge-case: no state change across retry budget stops early with structured reason
- [ ] failure-case: network-terminal scenario refuses optimistic continuation and returns auditable stop reason
- [ ] combined-case: interruption resolved but resumed state triggers replay or stop based on state drift

#### Evidence
- [ ] reason codes
- [ ] artifacts
- [ ] timeline markers
- [ ] post-action verification trace

---

### M6. Doc-sync and support-boundary update

#### Tasks
- [ ] Update architecture and support-boundary docs only where behavior is actually implemented.
- [ ] Keep `Current baseline`, `Partial support`, and `Future` wording aligned with code and tests.
- [ ] Avoid upgrading README or capability claims ahead of real validation evidence.

#### Target files
- [ ] `docs/architecture/orchestration-robustness-strategy.md` when needed
- [ ] `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md` when needed
- [ ] `docs/architecture/network-anomaly-runtime-architecture.md` when needed
- [ ] `docs/architecture/README.zh-CN.md` or `docs/README.md` only if navigation changes

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:ci`

#### Evidence
- [ ] support-boundary wording remains conservative and source-of-truth aligned

---

## 2) File-Level Change Map

### Contracts
- [ ] `packages/contracts/src/types.ts`
- [ ] `packages/contracts/src/reason-codes.ts`

### Core
- [ ] `packages/core/src/policy-engine.ts`
- [ ] `packages/core/src/session-store.ts`

### Adapter runtime
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
- [ ] `packages/adapter-maestro/src/task-planner.ts`
- [ ] `packages/adapter-maestro/src/recovery-tools.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`
- [ ] `packages/adapter-maestro/src/session-state.ts`
- [ ] `packages/adapter-maestro/src/diagnostics-tools.ts`
- [ ] `packages/adapter-maestro/src/js-debug.ts`

### MCP server
- [ ] `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`
- [ ] additional tool wrappers only if contract or result shaping changes require them

### Tests
- [ ] adapter tests
- [ ] server/tool tests
- [ ] smoke/CI layers where support boundaries are affected

### Docs
- [ ] architecture/support-boundary docs only after behavior lands

---

## 3) Risks and Rollback

### Main risks

- [ ] Retry logic becomes blind looping instead of evidence-driven.
- [ ] Replay broadens into unsafe side-effect repetition.
- [ ] Network support claims get ahead of current runtime maturity.
- [ ] Contracts drift from actual tool outputs.

### Rollback rule

- [ ] Each milestone must remain independently revertible.
- [ ] If a milestone fails verification, revert to the last green milestone instead of stacking more logic on top.
- [ ] Do not merge a milestone that degrades deterministic-first or policy-safe behavior.

---

## 4) Execution Order

- [ ] M1 depends on no later milestone.
- [ ] M2 depends on M1 contract/reason-code baseline.
- [ ] M3 depends on M2 state model and bounded retry semantics.
- [ ] M4 depends on M1 and should ideally build on M2/M3 orchestration hooks.
- [ ] M5 depends on implemented behavior from M2-M4.
- [ ] M6 happens after actual behavior and validation evidence exist.

Each milestone should be small enough to land in an independently reviewable PR or commit series.

---

## Exit Criteria

- [ ] The repo can distinguish retryable vs terminal high-frequency instability more clearly.
- [ ] Retry, replay, continue, and stop decisions are bounded and explainable.
- [ ] Network-driven waiting and terminal failure have clearer runtime semantics.
- [ ] Evidence artifacts support post-failure analysis without overstating shipped support.
- [ ] Validation covers both recovery success and safe early stop.
