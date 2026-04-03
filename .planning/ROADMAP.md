# Roadmap: Mobile E2E MCP

## Overview

This roadmap turns the repository's broad capability story into a smaller set of support boundaries that are actually reproducible, documented, and evidence-backed. The sequence starts by hardening tracked config and capability truth, then proves one framework lane alongside the native baseline, and finally locks support-boundary sync into docs and release checks.

This roadmap is an internal planning artifact. It is intended to coordinate execution and sequencing, not to replace the public delivery docs under `docs/**`.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions if needed later

- [x] **Phase 1: Capability Baseline Productization** - Canonicalize tracked config and align capability claims with live behavior.
- [ ] **Phase 2: Framework Acceptance Lane** - Operationalize one framework lane with reproducible acceptance evidence and clean-clone readiness.
- [x] **Phase 3: Capability Truth Guardrails** - Keep docs, release gates, and capability reporting in sync.
- [x] **Phase 4: Structured Replay Step Orchestration** - Upgrade `run_flow` into a step-aware replay preview path with replay progress, evidence binding, and bounded scope.
- [x] **Phase 5: Release Acceptance for 0.1.10** - Validate the candidate npm release against packaged runtime behavior, regression evidence, and semver fit before any tag/publish action.
- [x] **Phase 6: Developer-Facing Skill Roadmap** - Define the roadmap, naming taxonomy, and first backlog for developer-facing skills that improve app readiness, debugging, and remediation.
- [ ] **Phase 7: iOS Parity Hardening** - Stage the runtime, evidence, and acceptance work needed to move iOS toward the Android execution baseline without overclaiming support.

## Phase Details

### Phase 1: Capability Baseline Productization
**Goal**: Remove config drift and establish a trustworthy source of truth for current support boundaries.
**Depends on**: Nothing (first phase)
**Requirements**: [CAP-01, CFG-01, CFG-02, DOC-01]
**Success Criteria** (what must be TRUE):
  1. Clean-clone validation uses tracked harness and matrix inputs instead of silent local-only defaults.
  2. Capability docs and `describe_capabilities` agree on current support levels for baseline Android and iOS paths.
  3. The repo defines the acceptance evidence contract for native and the first framework lane.
**Plans**: 3 plans

Plans:
- [x] 01-01: Canonicalize tracked harness and framework-matrix inputs
- [x] 01-02: Align capability reporting and docs with live runtime boundaries
- [x] 01-03: Define acceptance evidence contract for native and first framework lane

### Phase 2: Framework Acceptance Lane
**Goal**: Operationalize one framework profile end-to-end with reproducible acceptance evidence from the baseline established in Phase 1.
Reproducible acceptance evidence is the acceptance bar for this phase.
**Depends on**: Phase 1
**Requirements**: [CAP-02, CFG-03, EVA-01, EVA-02]
**Success Criteria** (what must be TRUE):
  1. At least one framework lane can be run from documented prerequisites and checked-in config.
  2. Native smoke validation stays separate from framework acceptance evidence, and both remain clearly labeled.
  3. The chosen framework lane has a reusable sample flow, documented prerequisites, and acceptance artifacts suitable for PR/release review.
  4. React Native Android is the default first lane unless repo truth later proves Flutter Android is lower risk.
**Plans**: 3 plans

Plans:
- [x] 02-01: Choose and harden the first framework lane
- [ ] 02-02: Wire reproducible acceptance commands and evidence outputs
- [ ] 02-03: Promote the lane into documented support guidance

### Phase 3: Capability Truth Guardrails
**Goal**: Prevent future drift between docs, release messaging, and live support boundaries.
**Depends on**: Phase 2
**Requirements**: [CAP-03, DOC-02]
**Success Criteria** (what must be TRUE):
  1. Support-boundary changes trigger explicit PR/release doc-sync review.
  2. Docs and registry wording no longer imply unsupported target-state capabilities are already shipped.
  3. The repo has a repeatable review path for future capability-claim changes.
**Plans**: 2 plans

Plans:
- [x] 03-01: Strengthen doc-sync and release gating for capability changes
- [x] 03-02: Audit and trim overclaimed support language across key docs

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Capability Baseline Productization | 3/3 | Completed | 2026-03-27 |
| 2. Framework Acceptance Lane | 1/3 | Executing | 2026-03-27 (02-01) |
| 3. Capability Truth Guardrails | 2/2 | Completed | 2026-03-27 |
| 4. Structured Replay Step Orchestration | 1/1 | Completed | 2026-03-27 |
| 5. Release Acceptance for 0.1.10 | 1/1 | Completed | 2026-03-28 |
| 6. Developer-Facing Skill Roadmap | 15/15 | Completed | 2026-03-28 |
| 7. iOS Parity Hardening | 6/6 | Completed | 2026-04-03 |

## Maintenance Rules

- Keep phase goals short and outcome-based.
- When a phase finishes, add plan summaries under `phases/<phase>/` and update `STATE.md` in the same session.
- If a roadmap item becomes stable public guidance, move that guidance to the appropriate formal docs and keep only the planning summary here.
- Update roadmap counts/status only when a plan summary materially changes completion state.

### Phase 4: Structured Replay Step Orchestration

**Goal**: Upgrade `run_flow` from a run-level wrapper into a step-aware replay orchestrator with structured progress, per-step outcomes, bounded recovery, and evidence binding.
**Requirements**: [RPL-01, RPL-02, EVA-03]
**Depends on:** Phase 3
**Plans**: 1 plan

Plans:
- [x] 04-01: Define and land the target-state structured replay step orchestration plan

### Phase 5: Release Acceptance for 0.1.10

**Goal**: Decide whether commit range `7db6eceb..abd01e05` is safe and semver-appropriate for npm release `0.1.10`, using packaged runtime validation rather than repo-only confidence.
**Requirements**: [REL-01, REL-02]
**Depends on:** Phase 4
**Success Criteria** (what must be TRUE):
  1. The candidate package proves its npm-packed runtime path works without relying on repo-only files.
  2. The relevant regression and release checks produce evidence strong enough to support a publish/no-publish decision.
  3. The final decision clearly states whether `0.1.10` is acceptable as a patch release or must be deferred/re-scoped.
**Plans**: 1 plan

Plans:
- [x] 05-01: Validate packaged runtime, regressions, and semver fit for the 0.1.10 release candidate

### Phase 6: Developer-Facing Skill Roadmap

**Goal**: Define a product-aligned roadmap for developer-facing skills that help app teams improve E2E readiness, debugging, and remediation without diluting the harness into a generic mobile UI copilot.
**Requirements**: [DEV-01, DEV-02, DEV-03]
**Depends on:** Phase 5
**Success Criteria** (what must be TRUE):
  1. The planning workspace records a durable naming strategy that uses platform-level skill anchors and framework-specific overlays only where needed.
  2. The first backlog distinguishes a cross-platform readiness baseline from Android/iOS platform lanes, React Native/Flutter overlays, and failure-to-remediation helpers.
  3. A future session can refine the roadmap into concrete skill specs without recovering hidden chat context.
**Plans**: 15 plans

Plans:
- [x] 06-01: Define the developer-facing skill roadmap and naming taxonomy
- [x] 06-02: Define the shared mobile E2E readiness baseline before platform-specific skills
- [x] 06-03: Refine Android readiness from the shared baseline
- [x] 06-04: Refine iOS readiness from the shared baseline
- [x] 06-05: Pressure-test draft readiness skills before real skill publication
- [x] 06-06: Plan publication of validated readiness drafts into canonical real-skill sources
- [x] 06-07: Create the first canonical real skill source for the shared baseline
- [x] 06-08: Create the next canonical real skill source for Android readiness
- [x] 06-09: Create the next canonical real skill source for iOS readiness
- [x] 06-10: Add the first-wave skill selection and index layer
- [x] 06-11: Add the installation and export layer for canonical skill sources
- [x] 06-12: Polish first-wave skills for stronger diagnosis-to-action usefulness
- [x] 06-13: Validate first-wave skills against repo-derived real-workflow prompts
- [x] 06-14: Validate installed skill discoverability in the local OpenCode runtime
- [x] 06-15: Integrate skill-guided routing into the default remediation chain

### Phase 7: iOS Parity Hardening

**Goal**: Close the current iOS-vs-Android capability gap by deepening the iOS adapter/runtime, record/replay, evidence, and proof lanes before promoting support claims.
**Depends on:** Phase 3
**Success Criteria** (what must be TRUE):
  1. iOS selector-driven UI actions are backed by a stronger execution path than the current bounded idb baseline, with fallback semantics still explicit.
  2. iOS record/replay, diagnostics, and performance evidence are materially stronger and can be validated separately for simulator and real-device contexts.
  3. `describe_capabilities`, capability-model notes, and support-facing docs promote iOS only when runtime behavior and reproducible evidence justify it.
**Plans**: 6 plans

Plans:
- [x] 07-01: Define and stage iOS capability parity work against the Android baseline
- [x] 07-02: Define the deeper iOS UI execution backend path
- [x] 07-03: Harden iOS selector and action fidelity
- [x] 07-04: Harden iOS recording and replay fidelity
- [x] 07-05: Strengthen iOS observability, diagnostics, and performance evidence
- [x] 07-06: Promote iOS support only after parity proof lanes exist
