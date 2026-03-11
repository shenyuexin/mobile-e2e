# Mobile E2E MCP Blueprint (2026)

This repository contains a comprehensive technical blueprint for building a large-scale, extensible Mobile End-to-End (E2E) MCP platform for Android, iOS, React Native, and Flutter.

## Documentation Index

- `README.zh-CN.md` — 中文能力介绍与阶段说明
- `docs/phases/phase-validation-strategy.zh-CN.md` — 中文分阶段验收与验证策略
- `docs/phases/phase1-start-checklist.zh-CN.md` — Phase 1 启动清单（含可执行命令）
- `docs/phases/no-app-bootstrap.zh-CN.md` — 无业务 App 时的登录样例启动方案
- `docs/phases/discovery-driven-execution.zh-CN.md` — 发现新问题后如何系统补回方案与验收
- `docs/phases/phase-transition-rules.zh-CN.md` — 阶段完成与切换规则
- `docs/phases/phase-1-closeout.zh-CN.md` — Phase 1 收尾记录
- `docs/phases/phase-2-minimal-scope.zh-CN.md` — Phase 2 最小范围定义
- `docs/phases/sample-harness-contract.zh-CN.md` — Sample harness 执行合同
- `docs/phases/phase-2-closeout.zh-CN.md` — Phase 2 收尾记录
- `docs/phases/phase-3-framework-profiles.zh-CN.md` — Phase 3 框架 profile 基线
- `docs/phases/phase-4-governance-baseline.zh-CN.md` — Phase 4 治理基线
- `docs/phases/phase-5-agentic-baseline.zh-CN.md` — Phase 5 agentic 基线
- `docs/phases/phase-5-bounded-auto-remediation.zh-CN.md` — Phase 5 有边界自动恢复设计
- `docs/phases/phase-5-bounded-auto-remediation-checklist.zh-CN.md` — Phase 5 有边界自动恢复实施任务清单
- `docs/phases/program-status.zh-CN.md` — 当前项目阶段状态与剩余工作
- `docs/phases/native-onboarding-mobitru.zh-CN.md` — Mobitru native onboarding 计划
- `docs/phases/native-onboarding-results.zh-CN.md` — Mobitru native onboarding 结果
- `docs/phases/native-harness-progress.zh-CN.md` — native harness 当前进展与下一步
- `docs/phases/flutter-onboarding-plan.zh-CN.md` — Flutter onboarding 计划与当前阻塞
- `docs/phases/flutter-onboarding-results.zh-CN.md` — Flutter onboarding 结果
- `flows/samples/native/*.yaml` — native harness flow baselines for Mobitru
- `flows/samples/flutter/*.yaml` — Flutter harness flow skeletons for Mobitru
- `docs/architecture/overview.md` — goals, scope, and principles
- `docs/architecture/capability-map.md` — complete capability taxonomy and maturity model
- `docs/architecture/architecture.md` — reference architecture (control plane + execution plane)
- `docs/architecture/diagrams/mobile-e2e-overall-architecture.md` — Excalidraw overall architecture link
  - Source: `docs/architecture/diagrams/mobile-e2e-overall-architecture.excalidraw`  
  - SVG: `docs/architecture/diagrams/mobile-e2e-overall-architecture.svg`  
  - PNG preview: `docs/architecture/diagrams/mobile-e2e-overall-architecture.png`

[![Mobile E2E MCP Overall Architecture](docs/architecture/diagrams/mobile-e2e-overall-architecture.png)](docs/architecture/diagrams/mobile-e2e-overall-architecture.excalidraw)
- `docs/architecture/adapters-android.md` — Android adapter design (ADB/UIAutomator/Espresso/Appium/Maestro)
- `docs/architecture/adapters-ios.md` — iOS adapter design (simctl/XCUITest/WDA/idb)
- [`docs/architecture/adapter-code-placement.md`](docs/architecture/adapter-code-placement.md) — where new adapter code should live as the repo grows
- `docs/architecture/framework-coverage.md` — Native/RN/Flutter capability fit and strategy
- `docs/delivery/roadmap.md` — phased implementation plan (MVP → enterprise)
- `docs/architecture/governance-security.md` — security, observability, and governance model
- `docs/delivery/review-log.md` — research synthesis and review decisions
- `docs/delivery/implementation-playbook.md` — execution-level workstream playbook
- `docs/architecture/ecosystem-landscape-2026.md` — ecosystem comparison and opportunity map
- `docs/architecture/differentiation-strategy.md` — practical differentiators and moat strategy
- `docs/delivery/execution-index.md` — execution control center for phase/workstream tracking
- `docs/templates/adr-template.md` — architecture decision record template
- `docs/templates/phase-review-checklist.md` — per-phase quality/governance checklist
- `docs/templates/phase-charter-template.md` — phase charter template
- `docs/templates/workstream-status-template.md` — workstream tracking template
- `docs/templates/acceptance-evidence-template.md` — acceptance evidence template
- `docs/templates/dependency-decision-register.md` — blockers and decision register
- `docs/templates/sample-app-matrix-template.md` — compatibility sample matrix template
- `docs/templates/bug-packet-template.md` — bug packet template
- `configs/profiles/*.yaml` — framework profile contracts
- `configs/policies/**/*.yaml` — interruption/governance policy baselines
- `scripts/dev/*.sh` / `scripts/report/*.py` — sample harness runners and reporting tools
- `examples/rn-login-demo/App.tsx.template` — 最小登录样例页面模板（Expo RN）
- `docs/product/README.zh-CN.md` — 开源产品文档索引（部署模型、接入方式、开源边界）

## Positioning

The platform should not be "another test framework." It should be a universal AI-facing orchestration layer that can route actions to multiple backends with deterministic-first execution, visual fallback, and strict governance.
