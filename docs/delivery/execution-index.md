# Delivery Execution Index

## 1. Current Program State

- Current phase: Phase 3 real-run expansion + Phase 4/5 runtime hardening (in progress)
- Target completion date: TBD
- Next review checkpoint: self-hosted real-run review after GitHub runner evidence is collected for iOS / RN or the next supported sample

## 2. Owners and DRIs

| Area | DRI | Approver | Backup |
|---|---|---|---|
| Phase Delivery | TBD | TBD | TBD |
| Android Adapter | TBD | TBD | TBD |
| iOS Adapter | TBD | TBD | TBD |
| Core Protocol | TBD | TBD | TBD |
| Governance/Security | TBD | TBD | TBD |

## 3. Blocking Decisions

| ADR | Decision | Owner | Due Date | Impacted Phase | Status |
|---|---|---|---|---|---|
| ADR-0001 | iOS backend choice | TBD | TBD | Phase 1 | Proposed |

## 4. Workstream Status

| Workstream | Status | Owner | Dependency | Evidence | Next Milestone |
|---|---|---|---|---|---|
| WS-A | phase2_done | TBD | None | docs/phases/phase-2-closeout.zh-CN.md | Phase 3 onboarding contracts |
| WS-B | phase2_done | TBD | WS-A | artifacts/phase1-android/ | Native/Flutter adapter onboarding |
| WS-C | phase2_done | TBD | WS-A | artifacts/phase1-ios/ | Native/Flutter adapter onboarding |
| WS-D | phase2_done | TBD | WS-A/B/C | configs/policies/interruption/ | Framework-specific interruption expansion |
| WS-E | runtime_baseline_landed | TBD | WS-A/B/C/D | docs/phases/phase-4-governance-baseline.zh-CN.md, artifacts/audit/ | Broader redaction/retention enforcement |

## 5. Evidence Links

- Phase review packet: docs/phases/phase-1-closeout.zh-CN.md, docs/phases/phase-2-closeout.zh-CN.md
- CI baseline: .github/workflows/phase3-real-run.yml, reports/phase-sample-report.json, reports/acceptance-evidence.json
- Real-app pilot runbook: docs/delivery/real-app-pilot-checklist-and-acceptance.zh-CN.md
- OpenCode CLI MCP validation plan: docs/delivery/cli-mcp-tool-validation-plan.zh-CN.md
- OpenCode CLI MCP validation execution (2026-03-16): docs/delivery/cli-mcp-validation-execution-2026-03-16.zh-CN.md
- OpenCode CLI MCP full tool checklist (2026-03-16): docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md
- Pilot execution snapshot (2026-03-15): docs/delivery/pilot-execution-2026-03-15.zh-CN.md
- Flakiness baseline: artifacts/phase1-ios/ and artifacts/phase1-android/
- Security checklist report: TBD

## 6. Next Actions

1. Validate the next sample and the remaining iOS / React Native lanes against the Phase 3 real-run contract.
2. Broaden runtime governance enforcement beyond the current evidence-producing tools, including finer-grained redaction and retention execution.
3. Keep Phase 5 on bounded auto-remediation while designing the next controlled agentic integration step.
4. Use `docs/delivery/ai-first-implementation-plan.md` as the execution baseline for the next AI-first capability workstream.
