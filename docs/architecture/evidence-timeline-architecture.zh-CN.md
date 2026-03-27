# Evidence 与 Timeline 架构设计

本文档定义会话证据与时间线的数据模型，确保“执行可解释、失败可复盘、治理可审计”。

---

## 1. 目标

- 建立统一 evidence packet 与 timeline event 模型。
- 规范 artifact 分类、命名、索引与 retention 关系。
- 支持 interruption/fallback/failure attribution 的因果追踪。

---

## 2. 代码与配置边界

- `packages/core/src/session-store.ts`
- `packages/core/src/governance.ts`
- `packages/contracts/session.schema.json`
- `packages/contracts/tool-result.schema.json`
- `configs/policies/session-audit-schema.yaml`
- `configs/policies/artifact-retention.yaml`

---

## 3. 数据模型

### 3.1 Timeline Event

最小字段：

- `sessionId`
- `eventType`
- `timestamp`
- `actionId`（可选）
- `reasonCode`
- `policyProfile`
- `artifactRefs[]`

当前契约说明：

- `packages/contracts/session.schema.json` 当前仅强约束 `timeline` 为对象数组，未强约束 event 子字段。
- 本文档中的事件字段视为**目标标准模型**，用于指导实现与后续 schema 收敛。
- 当前 Phase 4 已落地的最小 replay 事件为：`replay_started`、`replay_step_started`、`replay_step_completed`、`replay_step_failed`、`replay_stopped`、`replay_completed`。

### 3.2 Evidence Packet

建议字段：

- `actionIntent`
- `preStateSummary`
- `postStateSummary`
- `fallbackUsed`
- `confidence`
- 对 replay preview，evidence 目前先以 `stepOutcomes[].artifacts/evidence` 与 timeline 引用为主，尚未形成完整独立 replay evidence packet。
- `logs/crash/network snippets`

当前落点建议：

- 将 evidence packet 作为 `tool-result.data` 的结构化子字段（例如 `data.evidence[]`）。
- 与 `artifacts[]` 做“索引 + 引用”关系，而非重复存放大体积原文。

### 3.3 Artifact Taxonomy

- screenshots
- ui trees
- logs
- crash signals
- diagnostics bundles
- performance traces
- interruption evidence bundles

---

## 4. 平台实现方案

### Android

- 证据来源：`adb` 路径（截图、logcat、性能 trace）。
- 建议按 `platform/sessionId/actionId` 分层目录。

### iOS

- 证据来源：`idb/simctl` 路径（hierarchy、截图、日志）。
- 对 partial 能力输出必须附能力说明与证据引用。

### React Native

- JS inspector snapshot 作为补充证据层。
- 需与 native logs/time events 合并为统一时间线。

### Flutter

- 对语义不足导致的 fallback 事件，单独输出 fallback evidence 节点。

---

## 5. 审计与治理

- Action 结果必须可映射到 audit record。
- 敏感数据遵循 redaction 与 retention tier。
- 审计导出时保留 hash/reference，避免泄漏原始敏感 payload。

`configs/policies/session-audit-schema.yaml` 目前为最小必填集合（session/phase/platform/result/time/artifacts/interruption）。
建议后续增量扩展字段时遵循“向后兼容 + 分阶段启用”原则。

---

## 6. 验收指标

- 关键动作 evidence 完整率 >= 99%。
- fallback/interruption 事件 timeline 可追踪率 100%。
- 审计记录与会话记录对齐率 100%。
