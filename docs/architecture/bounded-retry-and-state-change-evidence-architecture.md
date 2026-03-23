# Bounded Retry and State-Change Evidence Architecture

This document deepens the automation-flow robustness direction defined in:

- `docs/architecture/orchestration-robustness-strategy.md`
- `docs/architecture/failure-attribution-and-recovery-architecture.zh-CN.md`
- `docs/architecture/execution-coordinator-and-fallback-ladder.zh-CN.md`

It focuses on the missing bridge between **evidence-rich single-action execution** and **stronger multi-step robustness**: bounded retry, state-change proof, and replay-safe checkpoint semantics.

---

## 1. Purpose and Boundary

The purpose of this document is to define how the harness should decide whether to:

- retry
- wait
- continue
- replay from a checkpoint
- stop early with a structured reason

### In scope

- step-state semantics for orchestration
- state-change evidence model
- bounded retry and backoff rules
- checkpoint and replay-safe resume boundaries
- contracts / core / adapter / MCP ownership mapping
- reason-code and artifact expectations

### Out of scope

- network-specific runtime semantics beyond what is required for retry integration
- dynamic network fault injection
- unbounded self-healing
- delivery dates, owners, or temporary rollout plans

---

## 2. Problem Statement

The repository already provides strong action envelopes, failure attribution, interruption handling, and bounded recovery helpers.

However, a recurring high-frequency gap remains:

1. an action fails or returns partial progress
2. the harness has useful evidence
3. but the next step logic is still too shallow to turn that evidence into a high-quality bounded decision

This gap appears in scenarios such as:

- UI becomes visible before it is actionable
- the previous action partially succeeded but the postcondition is not yet satisfied
- an interruption is handled but the resumed state is no longer equivalent to the original state
- repeated retries happen without strong proof that the state actually changed

The goal is to make retry behavior **deterministic-first, bounded, explainable, and evidence-driven**.

---

## 3. Step-State Model

The orchestration layer should reason about more than `success` / `failed` / `partial`.

### 3.1 Required state classes

Each step should be interpretable as one of the following orchestration states:

- `ready_to_execute`
- `recoverable_waiting`
- `partial_progress`
- `degraded_but_continue_safe`
- `checkpoint_candidate`
- `replay_recommended`
- `terminal_stop`

### 3.2 Semantics

#### `ready_to_execute`

The expected preconditions are satisfied and the next action may run without extra recovery logic.

#### `recoverable_waiting`

The system is not yet ready, but evidence suggests bounded waiting or retry may still succeed.

Examples:

- loading indicator remains present
- hierarchy changed but target region is still settling
- post-action state suggests server/UI propagation delay

#### `partial_progress`

Some expected change happened, but not enough to declare the step complete.

Examples:

- navigation began but destination postcondition is not yet met
- data region updated but action affordance remains disabled

#### `degraded_but_continue_safe`

The current state is weaker than ideal, but continuing is still safe and policy-compliant.

This should be used conservatively.

#### `checkpoint_candidate`

The current state is stable enough to anchor future replay or resume.

#### `replay_recommended`

The current local step should not be retried directly; the system should consider returning to the nearest stable checkpoint or replaying a known-good segment.

#### `terminal_stop`

The system should not continue automatically because:

- the retry budget is exhausted
- policy forbids the next action
- evidence shows no meaningful state change across attempts
- the state indicates a non-retryable or unsafe path

---

## 4. State-Change Evidence Model

Retry should depend on proof, not hope.

### 4.1 Evidence sources

State-change evidence may come from:

- pre/post screen summaries
- UI hierarchy delta
- target-resolution delta
- readiness-state delta
- interruption classification/resolution outcome
- action outcome artifacts
- logs, crash, runtime, or network deltas
- explicit postcondition checks

### 4.2 What counts as meaningful state change

Meaningful state change is any change that strengthens the belief that the workflow has progressed or that retry conditions have improved.

Examples:

- target becomes uniquely resolvable after previously ambiguous state
- destination screen identity becomes more confident
- loading/blocked state transitions toward ready
- interruption is resolved and blocking layer disappears
- the postcondition probe moves from absent to partially satisfied

### 4.3 What does not count

The following should not be treated as strong evidence by default:

- timestamp-only change
- repeated screenshot with no useful structural delta
- new logs that do not materially narrow the failure class
- action transport success without user-visible or state-level effect
- repeated hierarchy capture that preserves the same block condition

### 4.4 Evidence confidence rule

Retry decisions should record whether evidence confidence is:

- `strong`
- `moderate`
- `weak`
- `none`

Weak or absent evidence should push the system toward stop, escalation, or replay recommendation rather than repeated action-local retry.

---

## 5. Retry Semantics

### 5.1 Retry must be reason-aware

Retry policy should depend on failure class, not a universal loop.

Examples of retryable classes:

- slow-ready-but-recoverable
- target ambiguity that decreases over time
- interruption-resume-with-state-drift when replay-safe boundary exists
- network-degraded-retryable when the runtime doc marks the state as retryable

Examples of non-retryable-by-default classes:

- destructive action uncertainty
- crash/native exception with missing recovery preconditions
- terminal backend failure
- unchanged blocked state across exhausted attempts

### 5.2 Retry budget model

Each retry decision should carry:

- `maxAttempts`
- `attemptIndex`
- `backoffClass`
- `stateChangeRequired`
- `stopReason`

### 5.3 Backoff classes

Recommended backoff classes:

- `none` — immediate re-check only, no new action
- `short_ui_settle` — small delay for hierarchy/render stabilization
- `bounded_wait_ready` — readiness-oriented pause and re-sample
- `reason_aware_retry` — retry after failure-specific wait logic

### 5.4 Hard stop conditions

Retry must stop when any of the following occurs:

- retry budget exhausted
- state-change evidence remains absent across attempts
- postcondition confidence does not improve across attempts
- policy or risk boundary forbids further action
- failure becomes terminal by attribution

### 5.5 Forbidden retry patterns

- blind re-tap loops
- retry without new evidence capture
- retry that bypasses interruption or policy handling
- retry that upgrades to a riskier action without explicit policy support

---

## 6. Checkpoint and Replay Semantics

### 6.1 Stable checkpoint definition

A stable checkpoint is a state that satisfies all of:

1. screen identity is sufficiently confident
2. required blockers are absent or resolved
3. expected replay entry conditions are known
4. replay from this point is lower-risk than retrying locally

### 6.2 Replay-safe boundary

Replay-safe means a known-good segment may be re-executed without introducing unacceptable side effects.

Replay should be refused when:

- the previous action cluster includes payment/purchase/confirm-like side effects
- idempotency is unknown
- the destination state is already semantically beyond the checkpoint
- the current failure class indicates corrupted or unsafe state

### 6.3 Resume-safe boundary

Resume is allowed only when:

- the interrupted action still maps to the same intended postcondition
- the target context remains compatible after interruption resolution
- no stronger replay recommendation exists

### 6.4 Checkpoint ownership

Checkpoint creation and replay decisions should remain part of orchestrated runtime behavior, but their state model and persistence semantics belong in shared control-plane aware components rather than ad hoc tool-local memory.

---

## 7. Control Plane and Execution Plane Ownership

### 7.1 Contracts

`packages/contracts` should own shared semantics for:

- retry-related result fields
- step-state classification types
- reason-code taxonomy
- artifact and timeline event shapes

### 7.2 Core

`packages/core` should own:

- policy interpretation for retry/replay safety
- session persistence semantics for checkpoints and action windows
- shared orchestration state rules that are not platform-specific

### 7.3 Adapter runtime

`packages/adapter-maestro` should own:

- pre/post evidence capture
- state delta construction
- target-resolution retry hooks
- replay and resume runtime behavior
- platform-specific readiness sampling

### 7.4 MCP server

`packages/mcp-server` should own:

- tool-facing parameter validation
- policy-guarded exposure
- structured result shaping where needed
- separation between raw runtime detail and AI-facing result envelope

---

## 8. Reason-Code and Artifact Expectations

### 8.1 Reason-code direction

This architecture implies stronger reason-code coverage around:

- retryable waiting
- retry exhausted without state change
- replay refused
- replay recommended
- resume refused due to incompatible state drift
- checkpoint unavailable

Reason codes should distinguish retryable and terminal classes explicitly enough that future orchestration can stop early for the right reason.

### 8.2 Artifact expectations

For each retry/replay decision, the system should preserve enough evidence to explain:

- why retry was allowed
- what changed between attempts
- why replay or stop was chosen instead
- which postcondition remained unmet

At minimum, this typically requires:

- pre/post state summary
- relevant hierarchy or target-resolution evidence
- action outcome record
- reason code
- timeline markers for retry / replay / stop decisions

---

## 9. Platform and Support Boundary

### Current baseline

Current baseline already includes evidence-rich action envelopes, interruption handling, and bounded recovery helpers.

Current baseline addition: action orchestration emits `retryDecisionTrace`, `postActionVerificationTrace`, and checkpoint decision markers; retry-exhausted-without-state-change is reason-coded and auditable in session timeline.

### Partial support

Retry quality is currently partial because many decisions are still action-local rather than task-state aware, and checkpoint/replay semantics remain conservative.

### Future

Future deeper investment includes:

- stronger shared step-state model
- richer checkpoint persistence
- broader replay-safe boundary handling
- more explicit retry reason codes and validation lanes

This document does not imply those deeper semantics are already fully shipped.

---

## 10. Validation Mapping

This architecture should eventually be proven through explicit scenarios such as:

- `slow-ready-but-recoverable`
- `no-state-change-retry-budget-exhausted`
- `interruption-resume-with-state-drift`
- `checkpoint-replay-recommended`
- `replay-refused-high-risk-boundary`

Validation should happen across:

- unit-level state classification helpers
- adapter runtime orchestration tests
- MCP/server-level tool result verification
- heavier real-run or showcase lanes where support boundaries are being upgraded

---

## 11. Code Mapping

Likely touch zones for future implementation include:

- `packages/contracts/src/types.ts`
- `packages/contracts/src/reason-codes.ts`
- `packages/core/src/session-store.ts`
- `packages/core/src/policy-engine.ts`
- `packages/adapter-maestro/src/action-orchestrator.ts`
- `packages/adapter-maestro/src/task-planner.ts`
- `packages/adapter-maestro/src/recovery-tools.ts`
- `packages/adapter-maestro/src/action-outcome.ts`
- `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`

This section is intentionally a code map, not a task list. Executable work sequencing belongs in the companion checklist.
