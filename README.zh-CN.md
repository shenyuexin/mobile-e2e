# Mobile E2E MCP（中文版）

[![CI（build + typecheck + unit + smoke）](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)
[![Platform Smoke（iOS 模拟器 + Android 模拟器）](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml)
[![Real Device Acceptance（self-hosted）](https://img.shields.io/badge/Real%20Device%20Acceptance-self--hosted%20manual-0A66C2)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml)

> 面向 AI Agent 的移动端 E2E 编排层，覆盖 Android / iOS / React Native / Flutter，强调确定性优先、有边界视觉兜底与治理约束。

本仓库是一个 pnpm monorepo，组合了 MCP 工具层、执行适配层与架构文档，用于构建可扩展的移动端 E2E 平台。

## 能力展示

如果你想先快速了解能力，再深入看架构细节，先看这部分：

- Happy Path 录屏（登录 -> 滚动 -> 加购 -> Orders -> Cart）：
  - `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4`
- 可见中断与恢复录屏（HOME 中断 -> recover_to_known_state -> 继续动作）：
  - `docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4`
- 一键复现脚本：
  - `bash scripts/dev/record-demo-happy-path-android.sh`
  - `bash scripts/dev/record-demo-interruption-home-recovery-android.sh`
  - `bash scripts/dev/publish-showcase-assets-android.sh`（录制 + 归档视频 + 刷新截图/GIF）
- 演示说明与证据索引：
  - [docs/showcase/README.md](docs/showcase/README.md)
  - [docs/showcase/demo-playbook.zh-CN.md](docs/showcase/demo-playbook.zh-CN.md)
- AI 调用与任务指南：
  - [docs/guides/ai-agent-invocation.zh-CN.md](docs/guides/ai-agent-invocation.zh-CN.md)
  - [docs/guides/golden-path.md](docs/guides/golden-path.md)
  - [docs/guides/flow-generation.md](docs/guides/flow-generation.md)
- CI 证据与边界说明：
  - [docs/showcase/ci-evidence.md](docs/showcase/ci-evidence.md)
  - [CI 工作流运行记录](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)
  - [Platform Smoke 工作流运行记录](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml)
  - [Real Device Acceptance 工作流运行记录](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml)

### GIF 快速预览

| Happy Path GIF | 中断恢复 GIF |
|---|---|
| ![Happy Path 预览](docs/showcase/assets/happy-preview.gif) | ![中断恢复预览](docs/showcase/assets/interruption-preview.gif) |

## Mobile E2E Harness 定位

这个项目可以理解为一个 **AI mobile E2E harness（面向 AI 的移动端执行编排层）**：
它不是单纯执行动作，而是提供策略约束、会话治理、确定性优先执行路径与结构化证据输出。

如果你在搜索这些关键词：**mobile test harness / Android test harness / AI automation harness / mobile CI harness**，本仓库就是为这类需求设计的。

### 为什么团队会用这个 harness

- **Deterministic-first harness**：优先稳定定位与可解释重试，再进入 OCR/CV 兜底
- **Failure-intelligence harness**：失败有原因码、证据产物、候选根因与修复建议
- **Governance-aware harness**：策略 profile、可审计 session、受控工具面
- **Real-device demo harness**：有真实可复现脚本与录屏，不是纸面架构

## Appium / Maestro 与本 Harness 的关系

| 维度 | Appium / Maestro | Mobile E2E MCP Harness |
|---|---|---|
| 核心角色 | 自动化框架 / flow runner | 面向 AI 的编排 harness |
| 执行策略 | 以动作执行为中心 | 确定性优先 + policy/session 治理 |
| 失败处理 | 命令或断言失败信息 | 结构化诊断 + 候选根因排序 + 修复建议 |
| AI 适配 | 可接入，但非一等抽象 | 原生面向 AI Agent 设计 |
| 证据模型 | 依赖外部拼装 | 内建证据优先 action outcome |
| Helper app 依赖 | iOS/Android 回放都需要 | Android: owned-adb 主路径（常用命令不需要 helper app）；iOS 模拟器: axe CLI；iOS 真机: WDA（一次性配置） |

## FAQ

### 什么是面向 AI Agent 的 mobile E2E harness？

它是一个执行编排层，让 AI Agent 能在可控边界内稳定执行移动端动作，并拿到可机器消费的结果与证据，而不只是“命令成功/失败”。

### 这个 harness 能跑 Android 真机吗？

可以。仓库提供了真机脚本与演示资产，见 `scripts/dev/*` 与 `docs/showcase/*`（包含 happy path 与中断恢复）。

### 这个 harness 怎么处理中断恢复？

它会检测中断信号、分类中断类型，并执行有边界恢复动作（例如 `recover_to_known_state`），然后继续后续流程。

### 它是要替代 Appium / Maestro 吗？

不一定。更准确说法是：它是更上层的 orchestration harness，可与既有执行生态共存，同时补足 AI 场景下的治理与诊断能力。

### 哪些场景最适合这个 harness？

发布门禁回归（release-gate）、脆弱流程排障、AI 驱动探索式检查、以及需要审计证据的真机 CI 场景。

## 这个仓库“本质上”是什么

本仓库同时包含两层内容：

1. **可执行实现**（MCP server、adapters、contracts、core 编排能力）
2. **架构与交付知识库**（设计原则、能力模型、阶段规划文档）

如果只记住一句话：它是一个**给 AI Agent 用的移动端编排层**，不是单一框架的测试 runner。

## 快速开始

```json
{
  "mcpServers": {
    "mobile-e2e-mcp": {
      "command": "npx",
      "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest"]
    }
  }
}
```

## AI Agent 从这里开始

建议 AI / 代码分析统一按以下顺序：

1. **先读 `repomix-output.xml`**，快速建立全局架构与关键代码路径。
2. **如果改动涉及 tools、contracts、adapter、policy/session/evidence 流程或支持边界文案，先读 `docs/engineering/ai-first-capability-expansion-guideline.md`。**
3. **再核对实时仓库文件**（`git ls-files` + 定向读取）。
4. 将 `repomix-output.xml` 作为**第一入口**，但不要当作唯一事实来源。

如果你是要在安装后实际调用 MCP 工具，请优先阅读：

- [`docs/guides/ai-agent-invocation.zh-CN.md`](docs/guides/ai-agent-invocation.zh-CN.md) —— AI 调用真相源
- [`docs/guides/golden-path.md`](docs/guides/golden-path.md) —— 首跑闭环前门
- [`docs/guides/flow-generation.md`](docs/guides/flow-generation.md) —— 录制 / 导出 / 回放专题

原因：打包上下文可能遗漏部分文件（如二进制、忽略路径等），最终结论必须由真实仓库文件校验。

额外 guardrail：如果你做的是 capability 扩展，而不是单点小修，不要凭上一轮 session 的记忆直接开改。请在当前 session 重新阅读工程规范，并按 contracts / core / adapter / MCP / docs / tests 的链路检查变更是否完整。

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

架构参考：

- [系统架构总览（Mermaid，仓库内）](docs/architecture/system-architecture-overview.md)
- [参考架构详细版](docs/architecture/architecture.md)

## 能力地图（当前范围）

- **设备与环境控制**：设备发现、租约隔离、环境约束
- **应用生命周期**：安装/启动/终止/重置/深链入口
- **页面感知与交互**：UI inspect/query、tap/type/wait、flow 执行
- **诊断与证据**：日志、崩溃信号、性能、截图/时间线证据
- **可靠性与恢复**：原因码失败、有限重试、恢复建议工具

工具注册与签名入口：`packages/mcp-server/src/server.ts` 与 `packages/mcp-server/src/tools/*`。

## 完整 MCP 工具目录（当前）

当前服务共暴露 **55 个工具**。对于 AI Agent，这是最快建立“可做什么”的入口。

### 1）会话与生命周期

`start_session`、`request_manual_handoff`、`end_session`、`run_flow`、`reset_app_state`

### 2）任务编排与流程采集

`execute_intent`、`complete_task`、`start_record_session`、`get_record_session_status`、`end_record_session`、`cancel_record_session`、`export_session_flow`、`record_task_flow`

### 3）设备与应用控制

`list_devices`、`install_app`、`launch_app`、`terminate_app`、`describe_capabilities`、`doctor`

### 4）UI 感知、定位与交互

`inspect_ui`、`query_ui`、`resolve_ui_target`、`scroll_and_resolve_ui_target`、`wait_for_ui`、`tap`、`tap_element`、`scroll_and_tap_element`、`type_text`、`type_into_element`

### 5）证据、可观测与诊断

`take_screenshot`、`record_screen`、`get_logs`、`get_crash_signals`、`collect_diagnostics`、`collect_debug_evidence`、`get_screen_summary`、`get_session_state`、`capture_js_console_logs`、`capture_js_network_events`、`list_js_debug_targets`

### 6）中断处理

`detect_interruption`、`classify_interruption`、`resolve_interruption`、`resume_interrupted_action`

### 7）失败分析、恢复与修复建议

`perform_action_with_evidence`、`get_action_outcome`、`explain_last_failure`、`rank_failure_candidates`、`find_similar_failures`、`compare_against_baseline`、`recover_to_known_state`、`replay_last_stable_path`、`suggest_known_remediation`

### 8）性能分析

`measure_android_performance`、`measure_ios_performance`

精确签名与输入输出以 `packages/mcp-server/src/server.ts`（工具注册源）为准。

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

## 推荐阅读路径（人类 + AI）

想快速进入有效工作状态，建议按这个顺序读：

1. 本 README（心智模型 + 命令 + 边界）
2. `AGENTS.md`（仓库导航与不变量）
3. `docs/architecture/architecture.md`（控制平面 vs 执行平面）
4. `packages/mcp-server/src/server.ts`（实际工具注册与调用面）
5. `tests/README.md`（当前真实验证范围）

## 精选文档入口

- [README.md](README.md) — English overview
- [docs/README.md](docs/README.md) — 对外文档总索引与公开边界
- [docs/guides/ai-agent-invocation.zh-CN.md](docs/guides/ai-agent-invocation.zh-CN.md) — AI Agent 调用真相源与默认工具链
- [docs/architecture/overview.md](docs/architecture/overview.md) — 目标/范围/原则
- [docs/architecture/architecture.md](docs/architecture/architecture.md) — 参考架构
- [docs/architecture/capability-map.md](docs/architecture/capability-map.md) — 能力域与成熟度
- [docs/architecture/governance-security.md](docs/architecture/governance-security.md) — 治理与安全
- [docs/delivery/roadmap.md](docs/delivery/roadmap.md) — 分阶段交付路线
- [docs/delivery/npm-release-and-git-tagging.zh-CN.md](docs/delivery/npm-release-and-git-tagging.zh-CN.md) — npm 发版与 Git tag 一体化规范（含 PR/pre-tag/tag 分层 doc-sync 规则）
- [docs/showcase/README.md](docs/showcase/README.md) — 真机 Demo 证据与复现脚本
- [tests/README.md](tests/README.md) — 测试层与 CI 范围

## 路线图快照（简版）

- 近期：增强确定性会话/动作可靠性与证据模型。
- 中期：扩展 framework/profile 成熟度与真实运行覆盖。
- 远期：强化 agentic 恢复治理与企业级控制能力。

公开的路线与范围以 `docs/delivery/roadmap.md` 与 `docs/architecture/*` 为准。

## 项目定位

这不是一个孤立的测试框架，而是一个面向 AI 的移动端编排层：在多后端间路由 E2E 动作，并以确定性优先与治理边界确保可控执行。

## 支持这个项目

如果这个项目对你有帮助，你可以通过以下方式支持：

1. 给仓库点 Star 并分享
2. 提交带证据的 Issue / PR
3. 通过赞助支持项目持续维护

捐赠说明：

- [![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://paypal.me/shenyuexin) [paypal.me/shenyuexin](https://paypal.me/shenyuexin)
