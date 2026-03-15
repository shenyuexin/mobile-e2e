# Architecture 文档导航（zh-CN）

本文档是 `docs/architecture` 的统一入口，按“总览 -> 运行时 -> 平台/框架 -> 专题”组织。

---

## 1. 总览与原则

- [overview.md](./overview.md) — 目标、非目标、设计原则
- [architecture.md](./architecture.md) — 参考架构（控制平面/执行平面）
- [system-architecture-overview.md](./system-architecture-overview.md) — 系统架构图（Mermaid）

## 2. 运行时架构（推荐优先阅读）

- [session-orchestration-architecture.zh-CN.md](./session-orchestration-architecture.zh-CN.md)
- [policy-engine-runtime-architecture.zh-CN.md](./policy-engine-runtime-architecture.zh-CN.md)
- [execution-coordinator-and-fallback-ladder.zh-CN.md](./execution-coordinator-and-fallback-ladder.zh-CN.md)
- [evidence-timeline-architecture.zh-CN.md](./evidence-timeline-architecture.zh-CN.md)
- [failure-attribution-and-recovery-architecture.zh-CN.md](./failure-attribution-and-recovery-architecture.zh-CN.md)

## 3. 平台与框架

- [adapters-android.md](./adapters-android.md)
- [adapters-ios.md](./adapters-ios.md)
- [adapters-react-native.md](./adapters-react-native.md)
- [adapters-flutter.md](./adapters-flutter.md)
- [framework-coverage.md](./framework-coverage.md)
- [platform-implementation-matrix.zh-CN.md](./platform-implementation-matrix.zh-CN.md)

## 4. 可靠性与治理专题

- [interruption-orchestrator-v2.zh-CN.md](./interruption-orchestrator-v2.zh-CN.md)
- [mobile-e2e-ocr-fallback-design.md](./mobile-e2e-ocr-fallback-design.md)
- [mobile-e2e-ocr-fallback-implementation-checklist.md](./mobile-e2e-ocr-fallback-implementation-checklist.md)
- [governance-security.md](./governance-security.md)
- [capability-map.md](./capability-map.md)
- [ai-first-capability-model.md](./ai-first-capability-model.md)

## 5. 竞争与演进

- [differentiation-strategy.md](./differentiation-strategy.md)
- [ecosystem-landscape-2026.md](./ecosystem-landscape-2026.md)

---

## 当前基线说明

- 文档中“Current baseline / Partial / Future”以仓库现状为准。
- 如文档与 schema/config 有冲突：优先参考 `packages/contracts/*.schema.json` 与 `configs/policies/*.yaml`。
