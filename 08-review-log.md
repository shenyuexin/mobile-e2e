# Research and Review Log

## 1. Prior Findings Incorporated

### RN Debug MCP Baseline

- `twodoorsdev/react-native-debugger-mcp` is a narrow observability adapter.
- Implemented capabilities focus on app discovery via Metro inspector and console log retrieval.
- Not a complete E2E automation backend.

### iOS Automation Evidence

- idb command model includes app lifecycle, UI interaction (`tap`, `text`), and accessibility describe APIs.
- WDA remains a core iOS automation backend and WebDriver-compatible execution layer.

### Android Automation Evidence

- ADB remains essential for lifecycle, shell actions, screenshots, and logs.
- Robust E2E requires tree-capable backends in addition to coordinate-only shell input.

### OCR/CV Strategy

- Deterministic-first ladder strongly recommended: tree-first, OCR/CV fallback.
- OCR-first design increases flakiness and latency.

---

## 2. Strategic Verdict (2026)

Building a comprehensive mobile E2E MCP in 2026 is feasible and strategically sound if the platform focuses on:

1. Unified orchestration and session intelligence.
2. Governance and safety controls.
3. Reliability/fallback orchestration.

It should not focus on re-implementing every automation driver internals.

---

## 3. Open Decisions (To Resolve During Implementation)

1. Primary iOS backend choice for MVP: idb-first vs WDA-first vs hybrid.
2. Whether Appium/Maestro integration is first-class in MVP or Phase 3.
3. VLM provider strategy for advanced visual reasoning (local vs cloud).
4. Artifact storage architecture (local filesystem vs object storage).

For each open decision, create ADR entry with:

- decision owner
- due date
- blocking impact
- review trigger for revisit

---

## 4. Review Workflow

- Architecture draft → Oracle review (feasibility and tradeoffs).
- Plan clarity and execution review → Momus.
- Incremental revision per phase with explicit ADRs.

---

## 5. ADR Tracking Table (Template)

| ADR ID | Decision | Owner | Due Date | Status | Blocking Phase | Revisit Trigger |
|---|---|---|---|---|---|---|
| ADR-0001 | iOS backend strategy | TBD | TBD | Proposed | Phase 1 | Failure rate above threshold |
