# Governance, Security, and Operations

## 1. Security Model

Define policy profiles:

- **Read-Only:** inspect tree, logs, screenshots only.
- **Interactive:** read + non-destructive UI actions.
- **Full-Control:** includes install/uninstall, permissions, data reset.

Each MCP tool declares required policy scope.

---

## 2. Access and Isolation

- Environment isolation: local-dev, CI, staging, pre-prod.
- Per-session credentials with TTL.
- Explicit device reservation and lock model.
- Secret redaction in logs and screenshots (PII handling).

---

## 3. Audit Requirements

Every action should log:

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
