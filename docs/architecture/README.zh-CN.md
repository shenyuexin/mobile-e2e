# Architecture 文档导航（zh-CN）

本文档是 `docs/architecture` 的统一入口，按"总览 -> 运行时 -> 平台/框架 -> 专题"组织。

## English Core Documents

For English readers, start with the numbered core documents:

1. [System Architecture (01)](./01-system-architecture.md) — topology, control plane, execution plane, contracts
2. [Platform Adapters (02)](./02-platform-adapters.md) — Android/iOS backends, framework profiles
3. [Capability Model (03)](./03-capability-model.md) — AI-first capability layers, maturity levels
4. [Runtime Architecture (04)](./04-runtime-architecture.md) — execution coordinator, fallback ladder, recovery
5. [Governance & Security (05)](./05-governance-security.md) — policy, audit, human handoff

---

## 1. 总览与原则

> 已合并到英文核心文档（见上方 English Core Documents）

## 2. 运行时架构（推荐优先阅读）

> 已合并到 [04-runtime-architecture.md](./04-runtime-architecture.md)。以下为补充/深度 zh-CN 原文：

- [session-orchestration-architecture.zh-CN.md](./session-orchestration-architecture.zh-CN.md) — Session 编排深度细节
- [policy-engine-runtime-architecture.zh-CN.md](./policy-engine-runtime-architecture.zh-CN.md) — 策略引擎运行时深度细节
- [interruption-orchestrator-v2.zh-CN.md](./interruption-orchestrator-v2.zh-CN.md) — 中断处理 V2 详细设计

## 3. 平台与框架

- [platform-implementation-matrix.zh-CN.md](./platform-implementation-matrix.zh-CN.md) — 跨平台实现矩阵

> 平台适配器详情已合并到 [02-platform-adapters.md](./02-platform-adapters.md)

## 4. 可靠性与治理专题

- [network-anomaly-runtime-architecture.md](./network-anomaly-runtime-architecture.md) — 网络异常处理运行时架构
- [adapter-code-placement.md](./adapter-code-placement.md) — 代码放置指南

> 其余专题已合并到 [04-runtime-architecture.md](./04-runtime-architecture.md)（执行协调、失败归因、证据时间线、OCR 回退、编排鲁棒性）
> 治理详情已合并到 [05-governance-security.md](./05-governance-security.md)

## 5. 竞争与演进

> 已移至 [`docs/strategy/`](../strategy/)

---

## 当前基线说明

- 文档中“Current baseline / Partial / Future”以仓库现状为准。
- 如文档与 schema/config 有冲突：优先参考 `packages/contracts/*.schema.json` 与 `configs/policies/*.yaml`。
