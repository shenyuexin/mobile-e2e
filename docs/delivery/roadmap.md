# Delivery Roadmap

## Delivery Assumptions

- Team baseline: 1 platform lead (Android), 1 platform lead (iOS), 1 platform/core engineer, 1 QA/automation engineer (part-time acceptable in early phase).
- Android and iOS adapter work can run in parallel only after Phase 0 contracts are approved.
- Sample apps must be available for native and at least one RN or Flutter target before Phase 3.
- Real-device access constraints can shift schedule ranges.

---

## Dependency Chain

- Phase 1 depends on Phase 0 contract baseline.
- Phase 2 depends on measurable Phase 1 reliability baseline.
- Phase 3 depends on framework instrumentation readiness and compatibility matrix instantiation.
- Phase 4 depends on policy and artifact architecture decisions.
- Phase 5 depends on stable telemetry and governance foundations from earlier phases.

## Phase 0: Foundation (1-2 weeks)

- Define MCP schemas and error contracts.
- Build session model and artifact model.
- Implement policy profiles (read-only, interactive, full-control).
- Establish local developer environment and CI baseline.

Exit criteria:

- Tool contracts versioned.
- Session start/end and action envelope stable.
- Owners assigned for each workstream and phase gate.
- ADR owners and due dates recorded for open architectural decisions.

---

## Phase 1: Deterministic MVP (3-5 weeks)

Scope:

- Android + iOS deterministic core flows only (native profile priority).
- Tree/screenshot/log retrieval.
- Essential assertions.
- Action timeline and report export.
- Minimal interruption handling for known system prompts in golden flows.

Exit criteria:

- Golden login flow pass rate >= 95% over 5 repeated runs per platform on the defined sample/demo app.
- Failure packet completeness >= 99% (screenshot + tree + logs + action timeline).
- OCR/CV action path usage remains bounded and reported.
- Known interruption prompts in target golden flow are detected and handled with explicit evidence.
- If the target app is more complex than the sample/demo app, increase the run count to 10+ based on risk and flow variability.

---

## Phase 2: Reliability and Fallback (4-6 weeks)

Scope:

- Retry strategy and reason-aware backoff.
- OCR/CV fallback module.
- Overlay/animation stabilization.
- Crash signal capture.
- Reusable interruption policy library and interruption telemetry/reporting.

Exit criteria:

- Flakiness reduced by agreed threshold versus Phase 1 baseline with explicit measurement method.
- Fallback usage telemetry and confidence traces present in all relevant action reports.
- Interruption auto-resolution success rate reaches agreed threshold for supported prompt classes.

Transition rule:

- Phase 2 can start once Phase 1 exit criteria are met on both iOS and Android for the agreed golden flow, and all known P0 blockers are either fixed or explicitly accepted with owner + follow-up plan.

---

## Phase 3: Framework Expansion (4-8 weeks)

Scope:

- RN debug adapter integration.
- Flutter-focused fallback and semantics guidance.
- Optional Appium/Maestro adapter bridges.

Exit criteria:

- Native and at least one framework profile (RN or Flutter) pass compatibility matrix acceptance targets.
- Framework onboarding checklist adopted for supported sample apps.

Transition rule:

- Phase 3 starts after Phase 2 stabilizes the execution core sufficiently that newly added framework support does not immediately collapse under unresolved interruption/fallback instability.

---

## Phase 4: Enterprise Controls (6-10 weeks)

Scope:

- RBAC, policy enforcement, approval workflows.
- Environment segmentation and secrets controls.
- Session handoff and audit exports.

Exit criteria:

- Policy profile enforcement validated in CI + staging environments.
- Retention/redaction and audit export checks approved by designated owner.

---

## Phase 5: Agentic Optimization (ongoing)

- Goal-to-flow planner.
- Self-healing suggestions (non-destructive by default).
- Historical failure pattern mining and prioritized stabilization recommendations.

---

## Phase Governance Requirements (All Phases)

For each phase define and maintain:

- Delivery owner
- Technical approver
- QA/release approver
- Security/governance approver (where applicable)
- Evidence links required for go/no-go review
