# Orchestration Robustness Strategy

Priority deepening areas for high-frequency automation-flow failures.

---

## 1. Purpose and Non-Goals

This document explains **where this repository should go deeper next** when the goal is better reliability in high-frequency real-world automation scenarios.

It is intentionally focused on the gap between:

- a tool surface that can already observe, attribute, and partially recover from failures, and
- a stronger orchestration layer that can keep multi-step flows moving with bounded, policy-safe, evidence-rich behavior.

This document is for maintainers, contributors, reviewers, and AI coding agents who need a durable reference for priority-setting.

### Non-goals

- It is **not** a replacement for `docs/delivery/roadmap.md`.
- It is **not** a feature announcement claiming broader shipped support than current code and tests prove.
- It is **not** a low-level implementation spec for interruption handling, fallback ladders, or failure attribution internals.

Those implementation details remain in the surrounding runtime architecture documents.

---

## 2. Relationship to Current Baseline and Roadmap

The current baseline is defined by live contracts, tool registry, policy/config files, and runnable validation layers.

This strategy document complements the roadmap in a different way:

- `docs/delivery/roadmap.md` answers **when reliability/fallback work should happen by phase**.
- this document answers **why orchestration robustness is the next deepening priority**, and what “deeper” should mean in architecture terms.

The repository already has meaningful foundations:

- structured tool contracts and reason-coded results
- session-oriented execution and auditability
- interruption detection / classification / resolution / resume
- failure attribution and bounded recovery helpers
- JS console / JS network / native log / crash evidence aggregation

However, the strongest current maturity is still **single-action evidence + bounded recovery**, not **closed-loop multi-step robustness**.

That distinction matters. A repo can be rich in diagnostics while still being shallow in sustained task execution.

---

## 3. Priority Order for Deeper Investment

### Priority 1 — Automation-flow robustness

The highest-value next investment is to make multi-step automation more resilient under common failure patterns such as slow rendering, state drift, stale targets, transient interruption, and partial post-action progress.

Why this is first:

- Most user pain is flow-level, not tool-level.
- Existing evidence and recovery primitives already create a strong base to build on.
- Better orchestration improves several failure classes at once instead of optimizing one narrow symptom.

### Priority 2 — Network anomaly handling inside robustness work

Network anomalies should become a first-class part of the robustness strategy, but not as an isolated diagnostics-only branch.

Why this is second and nested inside Priority 1:

- network-related UX instability is one of the most frequent real-device/mobile failure sources
- the repo already has observability clues for network-backed waits and failures
- but current support is still closer to **capture + inference** than **closed-loop network-aware orchestration**

### Priority 3 — Recovery state machine depth

Recovery should evolve from a small set of bounded helpers into a richer, policy-safe state machine with clearer checkpoints, replay scope, and stop conditions.

### Priority 4 — Historical failure memory and baselines

Failure memory should move from lightweight matching into more operationally useful baseline and remediation guidance for repeated instability classes.

### Priority 5 — Repeatable real-run reliability validation

The project needs more repeatable real-run validation lanes for flaky-flow and network-stress scenarios before support claims around robustness can be upgraded materially.

---

## 4. Current Baseline

Current baseline capabilities already visible in the repo include:

### 4.1 Evidence-rich action and recovery surface

- `perform_action_with_evidence`
- `get_action_outcome`
- `explain_last_failure`
- `rank_failure_candidates`
- `recover_to_known_state`
- `replay_last_stable_path`
- `resume_interrupted_action`
- `suggest_known_remediation`

These tools establish an AI-first structure where actions and failures are machine-consumable rather than plain command output.

Implementation note (current baseline): bounded retry decisions now persist explicit retry decision traces, checkpoint decision traces, and terminal network stop markers in action/session evidence packets.

### 4.2 Interruption and recovery architecture already exists

The current architecture docs and codebase already define and implement a bounded interruption closure around:

- detect
- classify
- resolve
- resume

See:

- `docs/architecture/interruption-orchestrator-v2.zh-CN.md`
- `docs/architecture/failure-attribution-and-recovery-architecture.zh-CN.md`

### 4.3 Network signals already exist, but are not yet a closed-loop control path

The repo already includes:

- `capture_js_network_events`
- `waiting_network` readiness semantics
- `AffectedLayer.network`
- JS network summaries inside debug evidence

This is a meaningful foundation, but it does **not** yet equal mature network-aware remediation across Android, iOS, React Native, and Flutter runtime paths.

Current baseline addition: orchestration now distinguishes retryable network waiting vs terminal backend/offline states for bounded stop behavior in remediation paths.

### 4.4 Validation reality must stay explicit

`tests/README.md` makes the current validation boundary clear: the baseline CI stack remains weighted toward unit/smoke/no-device validation, while heavier real-device or platform-specific lanes are still more limited.

This means current baseline reliability claims must remain honest and evidence-backed.

---

## 5. High-Frequency Scenario Taxonomy

This strategy is concerned with the failures that happen often enough to materially shape user trust.

### 5.1 Slow-ready or unstable-ready flows

Examples:

- loading states that outlive the default wait budget
- UI that becomes visible before it becomes actionable
- stale hierarchy snapshots around transition boundaries

### 5.2 State drift across multi-step tasks

Examples:

- a previous step partially succeeded but did not produce the expected postcondition
- the flow is no longer on the intended screen even though no explicit error was raised
- cached state, auth state, or persisted view state changes the path silently

### 5.3 Interruption plus drift combined

Examples:

- a system prompt appears and is handled, but resume lands on a changed UI state
- an overlay or keyboard is cleared, but the original target is no longer the best next action

### 5.4 Backend/network-triggered UX instability

Examples:

- timeouts, 429/5xx responses, offline transitions, captive-network behavior
- partial content rendering caused by backend delay
- UI reads as “present” while business readiness is still waiting on network completion

### 5.5 Attribution ambiguity under partial evidence

Examples:

- UI timeout that is actually network-induced
- apparent selector failure that is really state drift
- repeated retries without enough proof that the state changed between attempts

This taxonomy is important because the goal is not merely to add more diagnostics. The goal is to improve **bounded next-action quality** in these frequent scenarios.

---

## 6. Deepening Area #1: Automation-Flow Robustness

Automation-flow robustness is the primary deepening area because the repo already has many of the necessary primitives, but they are not yet composed into a stronger high-frequency orchestration layer.

### 6.1 Desired outcome

The harness should become better at continuing or safely stopping multi-step work when the environment is noisy but still recoverable.

The target behavior is:

1. detect whether the task is still on a recoverable path
2. distinguish blocked, degraded, partial, and terminal states
3. choose one bounded next action using evidence and policy
4. verify whether the chosen action improved the state
5. either continue, escalate, or stop with structured reasons

### 6.2 Architectural deepening themes

#### A. Stronger step state model

Move beyond “success / failed / partial” as the only practical orchestration signal.

Multi-step execution should reason more explicitly about:

- expected postconditions
- partial progress markers
- recoverable waiting states
- degraded-but-continue-safe states
- checkpoint-worthy states

#### B. Bounded retry with state-change evidence

Retry should not mean “repeat the same action blindly.”

Retry should mean:

- bounded attempts
- explicit stop conditions
- backoff rules tied to failure class
- proof that a meaningful state change happened or did not happen

This is the most important missing bridge between current evidence collection and true robustness.

#### C. Interruption-aware multi-step orchestration

The interruption stack already exists. The next depth layer is to make the task planner and multi-step executor consume those results as part of flow continuation, not just action-local recovery.

That means the system should reason about:

- whether a resumed action still makes sense in the current screen context
- whether the plan should be replayed from a checkpoint rather than resumed from a single action
- whether the interruption revealed a broader readiness problem instead of an isolated modal problem

#### D. Better checkpoint and replay semantics

Current replay and recovery helpers are useful but still conservative.

Deeper orchestration needs stronger semantics for:

- stable checkpoints
- last-known-good multi-action segments
- rollback-safe resume boundaries
- conditions under which replay should be refused

#### E. Post-action verification quality

The harness should become more opinionated about proving that an action actually changed the state in the intended way.

For example, a tap that sends a command but leaves the task semantically blocked should not be treated as a strong progression signal.

### 6.3 What this should not become

- unbounded self-healing loops
- opaque planner behavior that cannot explain why it retried or stopped
- aggressive automation that bypasses policy boundaries or risk controls

The repo should stay deterministic-first, bounded, and auditable.

---

## 7. Deepening Area #2: Network Anomaly Handling

Network anomaly handling is the second priority because it is one of the highest-frequency causes of mobile automation instability, but the current implementation is still closer to observability than control.

### 7.1 Current baseline

Current baseline network-related capability includes:

- one-shot JS network snapshot capture through Metro inspector when available
- failure-oriented network summaries in debug evidence
- `waiting_network` readiness semantics inferred from available signals
- network as a failure attribution layer

This baseline is useful for diagnosis, triage, and partial recovery decisions.

### 7.2 What is still shallow today

The shallow parts are not about whether the repo can see network hints. The shallow parts are about what happens **after** those hints appear.

Key gaps include:

- no strong network-specific remediation path across the broader orchestration layer
- limited correlation between UI waiting states and concrete request/response behavior
- partial, React-Native-debug-dependent capture path for JS network evidence
- incomplete network-specific reason-code and stop-condition semantics for repeated mobile failures

### 7.3 Target direction

Network handling should deepen along four layers:

#### A. Detection

The harness should detect network-driven waiting and degradation more explicitly, not only through generic timeout or log heuristics.

#### B. Attribution

The system should be better at separating:

- selector failure
- UI readiness failure
- network-backed wait
- backend-induced degraded success

#### C. Recovery

The harness should support bounded, policy-safe next actions for network instability, such as:

- waiting with reason-aware backoff
- re-checking postconditions after network stabilization
- retrying only when the failure class and state transition make retry defensible
- stopping early when the app is clearly in a backend-failed or offline state

#### D. Capability expansion across platform boundaries

The network story must not remain RN-debug-lane-only if the project wants broader mobile robustness credibility.

The long-term direction should consider how network-backed readiness and failure semantics are represented across:

- native Android
- iOS
- React Native
- Flutter

That does **not** require pretending all platforms already have equal interception depth today.

### 7.4 Boundary statement

Dynamic network fault injection remains a future differentiation area, not a current baseline capability.

This repo may eventually deepen into stronger fault simulation and richer network replay, but the near-term robustness priority is more basic and more valuable:

- correctly detecting network-driven instability
- attributing it clearly
- applying bounded recovery and stop logic
- proving behavior through repeatable real-run evidence

---

## 8. Capability Boundaries

This section is intentionally explicit so that future contributors do not overstate current support.

### 8.1 Current baseline

Current baseline means the capability has visible code paths, tool exposure, and validation support sufficient to describe it as present today.

Examples relevant to this strategy:

- evidence-rich single-action execution
- bounded interruption handling
- failure attribution and recovery helpers
- partial JS network evidence capture in supported debug contexts

### 8.2 Partial support

Partial support means the repo exposes a meaningful path, but the support is limited by platform, runtime mode, or validation depth.

Network capture through Metro inspector is an example of partial support rather than general mobile network observability.

### 8.3 Future

Future means the repo may deliberately invest in the area, but should not advertise it as shipped or CI-verified today.

Examples:

- richer network-aware remediation loops across more platforms
- stronger multi-step checkpoint replay and task-state reasoning
- broader real-run stress lanes for flaky-flow and network-instability scenarios
- dynamic network fault injection and debugger-grade network workflows

### 8.4 Documentation rule

When this strategy influences future PRs or docs, each new claim should distinguish among:

- Current baseline
- Partial support
- Future deeper investment

That distinction should remain consistent with `packages/contracts/*.schema.json`, `packages/mcp-server/src/server.ts`, `configs/policies/*.yaml`, and the current validation model described in `tests/README.md`.

---

## 9. Validation Strategy

This strategy should be validated in layers, not by architecture prose alone.

### 9.1 Documentation acceptance checks

At minimum, a strategy update should be verifiable through:

- presence in architecture navigation
- explicit current-vs-future boundary language
- clear references to surrounding runtime architecture docs

### 9.2 Code and runtime validation direction

As the repo implements this strategy, validation should increasingly prove:

- repeated-run flow stability improvements
- reason-aware retry behavior remains bounded
- network-driven waiting states are attributed more accurately
- recovery outcomes are auditable and reproducible

### 9.3 Real-run evidence requirement

For robustness claims to move upward in maturity, the repo should add repeatable validation lanes for:

- flaky multi-step flows
- interruption + resume + drift scenarios
- network-degraded but recoverable scenarios
- network-terminal scenarios that should stop early with strong evidence

This is especially important because current CI and showcase layers do not yet justify broad claims of fully mature robustness under repeated high-frequency failure pressure.

---

## 10. Delivery Hooks and Follow-On Docs

This document should act as the architecture-level rationale for future robustness work.

### 10.1 Related canonical docs

- `docs/architecture/execution-coordinator-and-fallback-ladder.zh-CN.md`
- `docs/architecture/failure-attribution-and-recovery-architecture.zh-CN.md`
- `docs/architecture/interruption-orchestrator-v2.zh-CN.md`
- `docs/architecture/rn-debugger-sequence.md`
- `docs/delivery/roadmap.md`
- `tests/README.md`

### 10.2 Expected follow-on refinement areas

The strategy should later be refined by more detailed documents or implementation-facing plans around:

- bounded retry and backoff semantics
- checkpoint and replay architecture
- network-aware reason codes and readiness modeling
- robustness validation lanes and acceptance thresholds

Current follow-on documents:

- `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md`
- `docs/architecture/network-anomaly-runtime-architecture.md`
- `docs/architecture/orchestration-robustness-implementation-checklist.md`

### 10.3 Practical reading rule

If the question is:

- **what should be deepened next?** — start here
- **how is recovery structured today?** — read failure/recovery architecture
- **how are interruptions handled today?** — read interruption orchestrator v2
- **what is the current RN debug/network boundary?** — read RN debugger sequence
- **when should each body of work happen?** — read the delivery roadmap

---

## 11. Summary

The next meaningful depth for this repository is not a wider tool catalog. It is a thicker reliability layer for the failures that happen most often.

The priority order is:

1. automation-flow robustness
2. network anomaly handling within that robustness effort
3. deeper recovery state-machine behavior
4. stronger historical failure memory and baselines
5. repeatable real-run reliability validation

The core architectural principle remains unchanged:

> make the next action more reliable, more bounded, and more explainable under real mobile instability.
