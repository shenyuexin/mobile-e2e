# Implementation Playbook (Execution-Level)

## 1. Workstream Breakdown

## WS-A: Protocol and Session Core

- Define MCP tool schemas and versioning strategy.
- Implement session lifecycle and action envelope.
- Implement artifact metadata model.
- Add reason-code taxonomy and error normalization.

Acceptance:

- Any tool call produces structured envelope with reasonCode and artifacts.

Depends on: none (foundational)

Owner roles:

- Delivery owner
- Technical approver
- QA verifier

## WS-B: Android Adapter

- Implement device discovery and selection.
- Implement app lifecycle commands.
- Implement tree retrieval + action primitives.
- Implement screenshot/log/crash packet hooks.

Acceptance:

- Android login flow with reproducible evidence output.

Depends on: WS-A

Owner roles:

- Android platform lead
- QA verifier

## WS-C: iOS Adapter

- Implement simulator target management.
- Implement app lifecycle.
- Implement deterministic interaction backend (idb/WDA lane).
- Implement screenshot/log/crash pipeline.
- Implement known iOS interruption handling for golden flows.

Acceptance:

- iOS login flow with reproducible evidence output.

Depends on: WS-A

Owner roles:

- iOS platform lead
- QA verifier

## WS-D: Fallback Perception Engine

- Integrate screenshot preprocessing.
- Integrate on-device OCR backend and text-region matcher.
- Integrate CV template matching fallback for icon-only cases.
- Implement fallback trace in action timeline.

Acceptance:

- Fallback path success with explicit confidence and traceability.

Depends on: WS-A, WS-B, WS-C

Owner roles:

- Perception module owner
- QA verifier

## WS-E: Governance & Reporting

- Implement policy profiles and authorization checks.
- Implement audit trail and session export.
- Implement failure packet and run summary report.

Acceptance:

- Policy violations blocked and logged.

Depends on: WS-A, WS-B, WS-C, WS-D

Owner roles:

- Governance owner
- Security approver

---

## 2. Suggested Repo Structure

```text
mobile-e2e-mcp/
  docs/
  packages/
    core/
    adapter-android/
    adapter-ios/
    adapter-rn-debug/
    adapter-vision/
    policy-engine/
    cli/
  examples/
    native-android-sample/
    native-ios-sample/
    rn-sample/
    flutter-sample/
```

---

## 3. Quality Gates Per Phase

1. Determinism gate: no coordinate-only default path for standard actions.
2. Artifact gate: failure must include tree + screenshot + logs.
3. Security gate: tool scope enforcement by profile.
4. Performance gate: median action latency within SLO threshold.
5. Regression gate: golden login and core navigation paths pass.

---

## 4. App Onboarding Checklist

- Stable IDs/accessibility identifiers for critical flows
- Deep link or deterministic entry hook for target screens
- Reset/seed-data strategy documented
- Loading/ready-state behavior documented
- Framework instrumentation profile selected and reviewed

---

## 5. Environment Determinism Checklist

- Locale/timezone pinned
- Permission state controlled
- Network condition profile pinned
- Notification/overlay handling configured
- Keyboard and input behavior normalized
- Session cleanup/reset verified

---

## 6. Interruption Handling Checklist

- Known system prompts enumerated per platform and app profile
- Supported interruption rules defined with priority and action policy
- Unknown interruption prompts captured with screenshot + tree + logs
- Interrupted action resume policy defined with bounded retry
- Interruption telemetry included in session report

---

## 7. Failure Taxonomy and Retry Rules

Standard categories:

- locator_failure
- state_mismatch
- environment_drift
- adapter_error
- unsupported_flow
- interruption_blocking
- interruption_unknown

Retry policy:

- Bounded retries only.
- Retry requires evidence of state progress or state refresh.
- Do not retry unsupported_flow without operator-approved path change.

---

## 8. Fallback Triage Rules

- Prefer deterministic path for actioning.
- OCR/CV actioning allowed only if policy scope permits and confidence threshold passes.
- If confidence threshold fails, emit fail with escalation guidance and artifacts.

---

## 9. Discovery-Driven Update Workflow

When acceptance uncovers a previously undocumented behavior (for example: system save-password prompt, permission alert, or unexpected bottom sheet), always execute the following loop:

1. Capture evidence (screenshot, tree, logs, action timeline)
2. Classify the gap (capability / adapter / environment / policy / test-data)
3. Update the authoritative docs:
   - capability map
   - architecture or adapter doc
   - roadmap/phase scope if ownership changes
   - validation doc if acceptance criteria change
4. Add or revise the corresponding rule/flow/test
5. Re-run the affected acceptance path from the beginning
6. Record the outcome in review log / execution index


---

## 10. Architecture Decision Records (ADR) Required

Minimum ADR topics:

- iOS backend strategy (idb-first vs WDA-first)
- Appium/Maestro integration strategy
- OCR engine selection (on-device first)
- Artifact storage architecture
- Policy granularity model
