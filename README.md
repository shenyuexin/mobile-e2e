# Mobile E2E MCP Blueprint (2026)

This repository contains a comprehensive technical blueprint for building a large-scale, extensible Mobile End-to-End (E2E) MCP platform for Android, iOS, React Native, and Flutter.

## Documentation Index

- `README.zh-CN.md` — 中文能力介绍与阶段说明
- `13-phase-validation-strategy.zh-CN.md` — 中文分阶段验收与验证策略
- `14-phase1-start-checklist.zh-CN.md` — Phase 1 启动清单（含可执行命令）
- `15-no-app-bootstrap.zh-CN.md` — 无业务 App 时的登录样例启动方案
- `16-discovery-driven-execution.zh-CN.md` — 发现新问题后如何系统补回方案与验收
- `17-phase-transition-rules.zh-CN.md` — 阶段完成与切换规则
- `18-phase-1-closeout.zh-CN.md` — Phase 1 收尾记录
- `19-phase-2-minimal-scope.zh-CN.md` — Phase 2 最小范围定义
- `20-sample-harness-contract.zh-CN.md` — Sample harness 执行合同
- `00-overview.md` — goals, scope, and principles
- `01-capability-map.md` — complete capability taxonomy and maturity model
- `02-architecture.md` — reference architecture (control plane + execution plane)
- `03-adapters-android.md` — Android adapter design (ADB/UIAutomator/Espresso/Appium/Maestro)
- `04-adapters-ios.md` — iOS adapter design (simctl/XCUITest/WDA/idb)
- `05-framework-coverage.md` — Native/RN/Flutter capability fit and strategy
- `06-delivery-roadmap.md` — phased implementation plan (MVP → enterprise)
- `07-governance-security.md` — security, observability, and governance model
- `08-review-log.md` — research synthesis and review decisions
- `09-implementation-playbook.md` — execution-level workstream playbook
- `10-ecosystem-landscape-2026.md` — ecosystem comparison and opportunity map
- `11-differentiation-strategy.md` — practical differentiators and moat strategy
- `12-delivery-execution-index.md` — execution control center for phase/workstream tracking
- `templates/adr-template.md` — architecture decision record template
- `templates/phase-review-checklist.md` — per-phase quality/governance checklist
- `templates/phase-charter-template.md` — phase charter template
- `templates/workstream-status-template.md` — workstream tracking template
- `templates/acceptance-evidence-template.md` — acceptance evidence template
- `templates/dependency-decision-register.md` — blockers and decision register
- `templates/sample-app-matrix-template.md` — compatibility sample matrix template
- `examples/rn-login-demo/App.tsx.template` — 最小登录样例页面模板（Expo RN）

## Positioning

The platform should not be "another test framework." It should be a universal AI-facing orchestration layer that can route actions to multiple backends with deterministic-first execution, visual fallback, and strict governance.
