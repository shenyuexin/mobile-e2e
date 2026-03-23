# Network Anomaly Runtime Architecture

This document deepens the network anomaly direction defined in:

- `docs/architecture/orchestration-robustness-strategy.md`
- `docs/architecture/failure-attribution-and-recovery-architecture.zh-CN.md`
- `docs/architecture/rn-debugger-sequence.md`

It defines how network-related instability should move from **observability clue** to **closed-loop, bounded runtime decision input** without overstating current support.

---

## 1. Purpose and Boundary

The purpose of this document is to define a network-aware runtime model for:

- readiness
- attribution
- bounded recovery
- early stop
- platform-boundary honesty

### In scope

- network-aware readiness states
- detection -> attribution -> recovery -> stop pipeline
- network-specific reason-code direction
- integration with current action, failure, and evidence architecture
- platform maturity framing

### Out of scope

- debugger-grade network tooling parity
- universal packet interception across all platforms
- dynamic fault injection as current baseline support
- generalized retry semantics that are not specific to network-driven instability

---

## 2. Problem Statement

The repo already contains several network-adjacent signals:

- `waiting_network` readiness semantics
- network-aware failure attribution
- JS network snapshot capture in supported Metro inspector contexts
- debug evidence aggregation that can include network summaries

What is still missing is a stronger runtime answer to these questions:

1. when is the app merely slow versus truly backend-failed?
2. when should the harness wait, retry, or stop?
3. how should network evidence influence task continuation rather than only post-failure explanation?

The architecture goal is to make network instability **actionable and bounded**, not merely visible.

---

## 3. Network-Aware Readiness Model

The runtime should treat network-driven states as first-class readiness inputs.

### 3.1 Required readiness classes

- `ready`
- `waiting_network`
- `degraded_success`
- `backend_failed_terminal`
- `offline_terminal`
- `unknown`

Implementation note (current baseline): runtime readiness now materializes these classes in session-state summaries and uses them for bounded retry/early-stop decisions in orchestration and remediation paths.

### 3.2 Semantics

#### `waiting_network`

The UI may be partially present, but business readiness is still gated by network completion or backend response propagation.

#### `degraded_success`

The app remains usable enough to continue safely, but evidence shows reduced quality or partial content caused by network behavior.

This state should be used carefully because continuing through degraded data may be unsafe in some flows.

#### `backend_failed_terminal`

The backend has returned or implied a failure state that should stop automation rather than trigger optimistic retries.

Examples:

- explicit server error page
- stable error toast/banner with no recoverable wait signal
- repeated terminal response class evidence

#### `offline_terminal`

The runtime has strong evidence that network connectivity is unavailable or unavailable enough that automatic continuation is no longer justified.

---

## 4. Detection → Attribution → Recovery → Stop Pipeline

### 4.1 Detection

Detection should combine multiple signal sources, including:

- screen summaries and readiness hints
- log/runtime deltas
- network capture when available
- app-visible error messages
- post-action progress absence under network-shaped signatures

Detection should remain deterministic-first. Network capture can strengthen the decision, but the system should not depend exclusively on debug-lane instrumentation.

### 4.2 Attribution

Attribution must separate network-driven instability from nearby lookalike failures.

The minimum distinction should be:

- selector failure
- UI readiness failure
- network-backed wait
- backend-induced degraded success
- backend-failed terminal

This distinction is essential because each branch leads to a different next action.

### 4.3 Recovery

If the state is retryable, the harness may choose bounded recovery actions such as:

- wait with reason-aware backoff
- re-sample readiness and postcondition state
- retry a safe action only after evidence improves
- fall back to stronger attribution gathering when the class remains ambiguous

### 4.4 Stop

The runtime should stop early when evidence indicates:

- offline or backend-failed terminal state
- no meaningful improvement across bounded waiting attempts
- replay or retry would add risk without a plausible success path

---

## 5. Signal Sources and Evidence Ranking

### 5.1 Signal tiers

#### Tier 1 — Direct app-visible state

- explicit loading state
- explicit backend error state
- explicit offline or retry banner
- explicit disabled/blocked UX tied to network wait

#### Tier 2 — Runtime and log evidence

- native logs indicating timeout, connection, DNS, HTTP failure
- JS runtime/network snapshot summaries in supported contexts
- repeated timeout-like state summaries

#### Tier 3 — Inferred orchestration behavior

- action has transport success but postcondition stays unmet
- hierarchy remains structurally stable while business readiness does not improve
- target exists but workflow progression does not advance after bounded wait

### 5.2 Ranking rule

The runtime should prefer higher-confidence app-visible or strongly correlated evidence over looser heuristics.

When the evidence remains ambiguous, the system should stop short of aggressive retry and preserve stronger artifacts for later attribution.

---

## 6. Reason-Code Model Direction

Network anomaly handling should eventually distinguish at least these classes:

- retryable network wait
- retry exhausted while network wait persisted
- backend terminal failure
- offline terminal failure
- network-induced degraded success
- network ambiguity unresolved

Current baseline addition: terminal backend/offline and retry-exhausted network waiting reason codes are now emitted through action/remediation flows and covered in server/runtime tests.

These codes should help future orchestration decide whether:

- bounded wait is justified
- retry is justified
- replay is irrelevant
- stop is mandatory

---

## 7. Runtime Integration Points

### 7.1 Failure attribution and recovery architecture

This doc extends the broader failure/recovery model by turning `network/backend` from a category label into a more actionable runtime decision class.

### 7.2 Action orchestration

`perform_action_with_evidence` and related orchestration paths should eventually incorporate stronger network-aware stop and retry conditions rather than treating network mostly as a post hoc clue.

### 7.3 Interruption interaction

Network instability and interruption handling may overlap.

Examples:

- a modal is resolved, but the underlying screen is still blocked by network wait
- an apparent interruption-driven retry is actually stalled by backend state

The runtime should avoid collapsing these into a single failure class when the evidence supports a more specific split.

### 7.4 RN debug boundary

React Native debug-lane network capture remains useful but partial.

It should be treated as a strengthening signal where available, not as the sole foundation of the project’s network story.

---

## 8. Platform Boundary Table

| Platform / runtime | Current maturity | Notes |
|---|---|---|
| Android native | Partial | Can infer network instability through state/log evidence, but does not yet imply universal deep interception or mature network-aware remediation. |
| iOS | Partial | Similar boundary to Android: some evidence and readiness inference exist, but the closed-loop network runtime remains incomplete. |
| React Native | Partial+ | Metro inspector network capture provides an extra signal path, but only in supported debug contexts. |
| Flutter | Partial | Should rely on shared readiness/evidence semantics; no claim of equal runtime capture depth today. |

This table is intentionally conservative. The goal is to preserve support-boundary honesty while the runtime matures.

---

## 9. Validation Lanes

The architecture should eventually be proven through explicit scenarios such as:

- `network-degraded-retryable`
- `network-terminal-stop-early`
- `partial-render-before-business-readiness`
- `offline-terminal-stop`
- `network-ambiguity-escalate-with-artifacts`

For each lane, validation should prove:

- the detected readiness class
- the chosen retry or stop action
- the resulting reason code
- the preserved artifacts and timeline entries

---

## 10. Non-Goals and Anti-Claims

This architecture must not be interpreted as claiming:

- full debugger-grade network inspection
- uniform deep capture across all platforms
- dynamic network fault injection as current baseline support
- CI-verified mature network resilience on all supported runtime paths

Dynamic network fault injection remains a future differentiation area, not a current baseline capability.

---

## 11. Code Mapping

Likely touch zones for future implementation include:

- `packages/contracts/src/types.ts`
- `packages/contracts/src/reason-codes.ts`
- `packages/adapter-maestro/src/session-state.ts`
- `packages/adapter-maestro/src/action-outcome.ts`
- `packages/adapter-maestro/src/diagnostics-tools.ts`
- `packages/adapter-maestro/src/js-debug.ts`
- `packages/adapter-maestro/src/recovery-tools.ts`
- `packages/adapter-maestro/src/action-orchestrator.ts`
- `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`

This section is a code-map aid only. Milestone sequencing and verification belong in the implementation checklist.
