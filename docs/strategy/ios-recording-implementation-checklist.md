# iOS 录制实现拆解清单（落地版）

> 目标：在现有 MCP 前门下补齐 iOS 的 `start_record_session -> end_record_session -> 导出 flow -> 回放` 闭环能力，并确保产物可审计、可回放、可测试。

## 0. 目标与验收口径

### 0.1 目标能力
- 支持 iOS（优先 Simulator）录制会话启动、状态查询、结束导出。
- 支持 iOS 事件到语义步骤映射（tap/type/swipe/back/home-like 导航信号）。
- 导出 iOS 可回放的 Maestro flow YAML。
- 在 MCP `run_flow` 上完成一次从录制到回放的端到端验证。

### 0.2 验收标准（Done）
- `start_record_session(platform=ios)` 返回 running，会话可持续采样。
- `end_record_session` 产出：
  - `artifacts/record-events/*.jsonl`
  - `artifacts/recorded-steps/*.json`
  - `flows/samples/generated/*.yaml`
- 导出的 YAML 在 iOS Simulator 至少 1 条主流程回放通过。
- 关键测试通过：adapter mapper/runtime、mcp-server 生命周期用例。

---

## 1. 分阶段实施清单

## M1：iOS 录制 runtime 骨架

### 任务
- [ ] 在 `packages/adapter-maestro/src/recording-runtime.ts` 为 `platform === "ios"` 添加分支，不再直接 `unsupportedOperation`。
- [ ] 复用现有会话持久化模型，保证 `PersistedRecordSession` iOS 字段可兼容。
- [ ] 维持 Android 现有行为不回归（分支隔离）。

### 验收
- [ ] iOS start/status/end 路径可执行（即使 early partial）。
- [ ] Android 路径行为不变。

---

## M2：iOS 原始事件采集通道

### 任务
- [ ] 优先接入 Simulator 可用事件源（键盘输入 + 触摸事件代理）。
- [ ] 建立统一 `RawRecordedEvent` 归一化输出（与 Android 对齐字段）。
- [ ] 支持事件时间戳与 session startedAt 对齐。

### 验收
- [ ] 录制会话结束后 `record-events/*.jsonl` 存在并包含 iOS 事件。
- [ ] 至少包含 tap/type 两类事件。

---

## M3：iOS UI 快照与 selector 解析

### 任务
- [ ] 增加 iOS UI 快照抓取（优先 Simulator + idb 能力；失败时给结构化 warning）。
- [ ] 为 iOS 节点建立 selector 提取（identifier/label/value）。
- [ ] 实现事件点位到快照节点映射（最小包围节点优先）。

### 验收
- [ ] `resolvedSelector` 在常见输入框/按钮上可解析。
- [ ] 不允许把 snapshot 路径写入 selector/text（沿用 Android guardrail）。

---

## M4：iOS 语义映射与导出

### 任务
- [ ] 扩展 `recording-mapper.ts` 的 iOS selector 兜底策略。
- [ ] 导出 iOS 可回放步骤：`tapOn(id/text)`、`inputText`、`swipe`、`assertVisible`。
- [ ] 低置信度步骤标注 warning，保持可审计。

### 验收
- [ ] 导出 YAML 不包含无效 selector/path。
- [ ] mapper 单测覆盖 iOS selector 命中与降级场景。

---

## M5：MCP 工具前门与诊断能力

### 任务
- [ ] 在 `doctor/describe_capabilities` 明确 iOS record 支持级别。
- [ ] 在 `start/end/get/cancel_record_session` 返回中补齐 iOS nextSuggestions。
- [ ] 补充 iOS 失败归因（配置缺失、设备不可用、快照失败、回放失败）。

### 验收
- [ ] 工具返回 reasonCode 与 nextSuggestions 可直接指导修复。
- [ ] iOS 失败日志可定位到单步原因。

---

## M6：端到端验证（iOS Simulator）

### 任务
- [ ] 录制登录主路径（邮箱、密码、登录）。
- [ ] 导出 flow 并执行 `run_flow` 回放。
- [ ] 采集成功与失败工件，形成对比报告。

### 验收
- [ ] 1 条 E2E 主流程回放通过。
- [ ] 失败时有稳定复现与归因证据。

---

## M7：文档与样例固化

### 任务
- [ ] 更新 `docs/guides/flow-generation.md`（加入 iOS 录制/回放步骤）。
- [ ] 增加 iOS showcase 文档与最小示例 flow。
- [ ] 标注限制项（例如真机权限、idb 依赖、特定手势边界）。

### 验收
- [ ] 新同学可按文档独立跑通 iOS 录制+回放。

---

## 2. 文件级改动清单（实施时按此落地）

- `packages/adapter-maestro/src/recording-runtime.ts`
  - iOS 分支 runtime、事件采集、快照采集、事件-快照关联。
- `packages/adapter-maestro/src/recording-mapper.ts`
  - iOS selector 映射、导出策略、低置信度降级。
- `packages/adapter-maestro/src/ui-model.ts`
  - iOS UI 节点模型解析（必要时拆分 ios-ui-model.ts）。
- `packages/contracts/src/types.ts`
  - iOS 录制扩展字段（必要时补充 RawRecordedEvent/ActionIntent）。
- `packages/mcp-server/src/tools/start-record-session.ts`
- `packages/mcp-server/src/tools/end-record-session.ts`
- `packages/mcp-server/src/tools/get-record-session-status.ts`
- `packages/mcp-server/src/tools/cancel-record-session.ts`
  - iOS 支持状态与提示。
- `packages/adapter-maestro/test/recording-runtime.test.ts`
- `packages/adapter-maestro/test/recording-mapper.test.ts`
- `packages/mcp-server/test/server.test.ts`
  - 回归测试与生命周期测试。

---

## 3. 风险与兜底

- iOS 事件采集粒度不足：
  - 兜底为“关键动作优先”（tap/type），复杂手势后续迭代。
- iOS 快照解析不稳定：
  - 兜底降级为坐标 tap + warning，不阻断导出。
- 真机权限/证书导致不稳定：
  - 首先以 Simulator 验证闭环，再逐步扩展真机策略。

---

## 4. 执行顺序建议

1. M1-M3（runtime+快照）
2. M4（mapper+导出）
3. M5（MCP 前门与诊断）
4. M6（E2E 验证）
5. M7（文档固化）

> 建议每个 Milestone 独立 commit，保证可回滚与可审查。
