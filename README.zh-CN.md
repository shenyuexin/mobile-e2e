# Mobile E2E MCP（中文版）

> 面向 AI Agent 的移动端 E2E 编排层，覆盖 Android / iOS / React Native / Flutter，强调确定性优先、有边界视觉兜底与治理约束。

本仓库是一个 pnpm monorepo，组合了 MCP 工具层、执行适配层与架构文档，用于构建可扩展的移动端 E2E 平台。

## 这个仓库“本质上”是什么

本仓库同时包含两层内容：

1. **可执行实现**（MCP server、adapters、contracts、core 编排能力）
2. **架构与交付知识库**（设计原则、能力模型、阶段规划文档）

如果只记住一句话：它是一个**给 AI Agent 用的移动端编排层**，不是单一框架的测试 runner。

## 快速开始

前置要求：

- Node.js 20+
- pnpm `10.30.3`（见 `packageManager`）

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test

# MCP 运行模式
pnpm mcp:dev
pnpm mcp:stdio
```

## AI Agent 从这里开始

建议 AI / 代码分析统一按以下顺序：

1. **先读 `repomix-output.xml`**，快速建立全局架构与关键代码路径。
2. **再核对实时仓库文件**（`git ls-files` + 定向读取）。
3. 将 `repomix-output.xml` 作为**第一入口**，但不要当作唯一事实来源。

原因：打包上下文可能遗漏部分文件（如二进制、忽略路径等），最终结论必须由真实仓库文件校验。

## Monorepo 结构速览

- `packages/contracts` — 工具、会话、结果结构的共享契约/类型
- `packages/core` — policy engine、session store/scheduler、治理能力
- `packages/adapter-maestro` — 确定性执行适配器、UI 模型/查询/动作路径
- `packages/adapter-vision` — OCR/视觉兜底能力
- `packages/mcp-server` — MCP 工具注册、stdio/dev CLI 入口
- `packages/cli` — CLI 包边界
- `configs/profiles` — framework profile 合同
- `configs/policies` — 治理/权限策略基线
- `flows/samples` — 示例 flow 基线

高层依赖方向：

`contracts -> core -> adapters -> mcp-server -> CLI/stdio/dev runtime`

## 端到端执行原理（How It Works）

典型执行路径：

1. Agent/客户端通过 stdio 或 dev CLI 调用 MCP 工具。
2. MCP server 完成输入校验并执行策略检查。
3. 解析（或创建）会话上下文，并套用租约/调度约束。
4. 适配层优先选择确定性执行路径。
5. 返回结构化结果包（而不是裸文本）。
6. 附加证据（截图、日志、状态摘要、时间线）用于审计与排障。
7. 若确定性路径失败且策略允许，才进入有边界 OCR/CV 兜底。

所以该项目重点不仅是“点点点”，而是 **session + policy + evidence** 的可控执行。

## 高层架构

核心分层：

- **控制平面（Control Plane）**：工具契约、策略校验、会话编排、审计与证据索引
- **执行平面（Execution Plane）**：平台动作执行、UI 解析、重试/中断处理、视觉兜底

架构图：

- [整体架构（Excalidraw）](docs/architecture/diagrams/mobile-e2e-overall-architecture.excalidraw)
- PNG 预览：`docs/architecture/diagrams/mobile-e2e-overall-architecture.png`

[![Mobile E2E MCP Overall Architecture](docs/architecture/diagrams/mobile-e2e-overall-architecture.png)](docs/architecture/diagrams/mobile-e2e-overall-architecture.excalidraw)

## 能力地图（当前范围）

- **设备与环境控制**：设备发现、租约隔离、环境约束
- **应用生命周期**：安装/启动/终止/重置/深链入口
- **页面感知与交互**：UI inspect/query、tap/type/wait、flow 执行
- **诊断与证据**：日志、崩溃信号、性能、截图/时间线证据
- **可靠性与恢复**：原因码失败、有限重试、恢复建议工具

工具注册与签名入口：`packages/mcp-server/src/server.ts` 与 `packages/mcp-server/src/tools/*`。

当前已实现的代表性工具（示例）包括：

- 会话/生命周期：`start_session`、`end_session`、`run_flow`、`reset_app_state`
- 设备/应用：`list_devices`、`install_app`、`launch_app`、`terminate_app`
- UI 动作：`tap`、`type_text`、`wait_for_ui`、`tap_element`、`type_into_element`
- UI 感知：`inspect_ui`、`query_ui`、`resolve_ui_target`、`scroll_and_resolve_ui_target`、`scroll_and_tap_element`
- 可观测性：`take_screenshot`、`record_screen`、`get_logs`、`get_crash_signals`、`collect_diagnostics`
- 智能恢复：`perform_action_with_evidence`、`explain_last_failure`、`rank_failure_candidates`、`recover_to_known_state`、`replay_last_stable_path`、`suggest_known_remediation`

精确签名与输入输出以 `packages/mcp-server/src/server.ts` 为准。

## 确定性阶梯与兜底策略

动作解析顺序是强约束：

1. 稳定 ID/resource-id/testID/可访问性标识
2. UI 树语义匹配（text/label/role）
3. OCR 文字区域兜底（有边界）
4. CV/template 兜底（有边界）
5. 失败并返回原因码 + 证据

禁止行为：

- 默认 OCR/CV 先行
- 无状态变化证据的无限重试
- 从确定性静默降级到概率路径

## 仓库级实现原则（全局）

- **Deterministic-first**：优先使用稳定 ID/UI 树/原生能力；OCR/CV 只作有边界兜底。
- **结构化工具结果**：返回机器可消费的结果包（`status`、`reasonCode`、artifacts）。
- **会话化执行**：所有动作在可审计会话内执行，并绑定策略 profile。
- **证据优先失败模型**：失败要携带足够上下文，支持解释/回放/恢复。

## 会话、策略与治理模型

- 会话是可审计执行单元，包含时间线与证据引用。
- 策略 profile 可限制工具类别（如 read-only / interactive / full-control）。
- 租约与调度约束用于避免同目标的不安全并发执行。
- 治理/脱敏流程用于在保留证据价值的同时控制敏感信息暴露。

关键策略配置路径：

- `configs/policies/*.yaml`
- `configs/profiles/*.yaml`

## 当前测试与验证模型

回归层刻意区分了无设备验证与更重的执行链路：

- 跨 core/adapters/server 的单元层（`pnpm test:unit`）
- 根目录 smoke 校验（`pnpm test:smoke`）
- 可选 OCR smoke（`pnpm test:ocr-smoke`）

面向 CI 的主命令：

```bash
pnpm test:ci
```

测试细节与 fixture 策略见：`tests/README.md`。

## 非目标（避免误解）

- 不是为了替代所有移动测试框架的内部实现。
- 不是 OCR-first 自动化框架。
- 不是一开始就覆盖 native/RN/Flutter 全部边界场景。
- 不是试图抹平所有平台差异的“单一万能抽象”。

## 贡献与开发最小流程

提交 PR 前建议至少执行：

```bash
pnpm build
pnpm typecheck
pnpm test:unit
pnpm test:smoke
```

AI 协作导航与约束见 [AGENTS.md](AGENTS.md)。

## 推荐阅读路径（人类 + AI）

想快速进入有效工作状态，建议按这个顺序读：

1. 本 README（心智模型 + 命令 + 边界）
2. `AGENTS.md`（仓库导航与不变量）
3. `docs/architecture/architecture.md`（控制平面 vs 执行平面）
4. `packages/mcp-server/src/server.ts`（实际工具注册与调用面）
5. `tests/README.md`（当前真实验证范围）

## 精选文档入口

- [README.md](README.md) — English overview
- [docs/architecture/overview.md](docs/architecture/overview.md) — 目标/范围/原则
- [docs/architecture/architecture.md](docs/architecture/architecture.md) — 参考架构
- [docs/architecture/capability-map.md](docs/architecture/capability-map.md) — 能力域与成熟度
- [docs/architecture/governance-security.md](docs/architecture/governance-security.md) — 治理与安全
- [docs/delivery/roadmap.md](docs/delivery/roadmap.md) — 分阶段交付路线
- [docs/product/README.zh-CN.md](docs/product/README.zh-CN.md) — 产品/部署边界
- [tests/README.md](tests/README.md) — 测试层与 CI 范围

## 路线图快照（简版）

- 近期：增强确定性会话/动作可靠性与证据模型。
- 中期：扩展 framework/profile 成熟度与真实运行覆盖。
- 远期：强化 agentic 恢复治理与企业级控制能力。

详细任务分解仍在 `docs/delivery/*` 与 `docs/phases/*`。

## 项目定位

这不是一个孤立的测试框架，而是一个面向 AI 的移动端编排层：在多后端间路由 E2E 动作，并以确定性优先与治理边界确保可控执行。
