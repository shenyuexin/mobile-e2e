# Governance, Security, and Operations

> This document describes governance and policy design direction.
> Current enforced behavior lives in `configs/policies/*.yaml` and `packages/mcp-server/src/tools/`.

## 1. Security Model

Define policy profiles:

- **Read-Only:** inspect tree, logs, screenshots only.
- **Interactive:** read + non-destructive UI actions.
- **Full-Control:** includes install/uninstall, permissions, data reset.

Each MCP tool declares required policy scope.

Current enforced baseline:

- access profiles are defined in `configs/policies/access-profiles.yaml`
- profile actions are coarse-grained but auditable
- unknown high-risk write actions are deny-by-default

Interruption orchestration governance scopes:

- `interrupt`: allows low-risk automatic interruption detection/classification/resolution.
- `interrupt-high-risk`: required for destructive interruption actions.
- Unknown/high-risk handling must remain auditable and policy-gated.

---

## 2. Access and Isolation

- Environment isolation: local-dev, CI, staging, pre-prod.
- Per-session credentials with TTL.
- Explicit device reservation and lock model.
- Secret redaction in logs and screenshots (PII handling).

Policy engine failure behavior should be fail-closed for destructive operations.

---

## 3. Audit Requirements

Every action logs:

- actor identity (agent/human)
- policy profile
- action input hash + normalized payload
- outcome + reason code
- artifact references
- timestamp and duration

---

## 4. Reliability SLOs

Suggested SLOs:

- Action success rate (deterministic path): >= 98%
- Median action latency: <= 1.2s (without OCR/CV)
- Failure packet completeness: >= 99%
- Session report generation: <= 5s post-run

---

## 5. Cost Controls

- Prefer on-device/local OCR before cloud OCR.
- Enable sampling for heavy artifacts in CI.
- Tiered retention: recent full artifacts, historical metadata.
- Parallelism quotas by environment and team.

---

## 6. Vision/OCR Usage Governance

Default behavior:

- Deterministic actions first.
- OCR/CV primarily for bounded fallback and diagnostics.

Policy requirements:

- Explicit permission scope to allow OCR-driven actioning.
- Confidence threshold and trace logging mandatory for OCR/CV actions.
- Automatic escalation/fail when confidence below threshold.

---

## 7. Model and Version Controls

- Pin OCR/CV model and configuration versions per environment.
- Record model/version in action telemetry and reports.
- Require approval workflow for model/config upgrades.

---

## 8. Artifact Retention and Redaction

- Define retention tiers by environment and data classification.
- Apply redaction policy for PII-sensitive screenshots/logs.
- Track retention exceptions with owner and expiry.

---

## 9. Human Handoff and Protected-Page Awareness

### Goal

Define a first-class harness capability for:

1. recognizing protected or low-observability screens
2. recording explicit human-operator handoff checkpoints inside the session/audit chain

### Use Cases

- OTP / verification screens
- Captcha / human-verification
- Consent / policy acknowledgements
- Secure input (passwords, biometrics)
- Commercial-app protected surfaces

### Detection

`StateSummary` carries:

- `protectedPage` — boolean flag
- `manualHandoff` — boolean flag

Derived from visible UI-tree semantics such as OTP text, captcha text, consent text, secure-input hints.

### Explicit MCP Tool

Tool: `request_manual_handoff`

Records a structured handoff event into the active session timeline and audit path.

### Correct Harness Behavior

1. detect that the current screen is an automation boundary
2. surface structured signals to the agent
3. request bounded human intervention when required
4. resume from the same session with auditability preserved

The goal is NOT to "defeat" protected pages. The goal is to tell the agent that it is at a protected boundary and should switch execution mode.

---

## 10. Scope Granularity Roadmap

To align with least-privilege best practices, evolve from coarse action scopes to finer controls:

- `record-screen`
- `diagnostics-export`
- `crash-export`
- `js-debug-read`
- `recovery-write`
- `ocr-action`
- `cv-action`

This roadmap should be reflected consistently in:

- tool-level scope mapping in server/tool docs
- policy regression tests
