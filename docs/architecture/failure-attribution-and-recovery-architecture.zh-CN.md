# Failure Attribution 与 Recovery 架构设计

本文档定义“失败归因 -> 候选排序 -> 恢复动作 -> 再验证”的统一闭环，支撑 AI-first 诊断与自愈能力。

---

## 1. 目标

- 将失败从“日志字符串”升级为“结构化候选根因”。
- 把恢复动作标准化并纳入 policy 与会话审计。
- 保证恢复动作有界、可解释、可回滚。

---

## 2. 工具与代码边界

- `packages/mcp-server/src/tools/explain-last-failure.ts`
- `packages/mcp-server/src/tools/rank-failure-candidates.ts`
- `packages/mcp-server/src/tools/recover-to-known-state.ts`
- `packages/mcp-server/src/tools/replay-last-stable-path.ts`
- `packages/mcp-server/src/tools/suggest-known-remediation.ts`
- `packages/core/src/session-store.ts`

---

## 3. 失败归因层

候选分类建议：

- selector / ui ambiguity
- interruption
- app state drift
- network/backend
- crash/native exception
- performance timeout
- environment/config/policy

每个候选应包含：

- `category`
- `confidence`
- `evidenceRefs`
- `reasoningSummary`
- `nextProbe`

---

## 4. 恢复动作层

标准恢复原语：

- recover to known screen
- replay last stable path
- relaunch app
- reset app state
- bounded retry with backoff

恢复前置条件：

1. 会话仍有效。
2. policy scope 允许。
3. 有足够 evidence 支撑恢复决策。

---

## 5. 平台实现方案

### Android

- 常见恢复动作：重启 app、回主页面、重新解析目标。
- 对系统权限/覆盖层问题优先调用 interruption policy。

### iOS

- 常见恢复动作：重启 app、重建 hierarchy、处理中断后 resume。
- 对 SpringBoard 干扰必须落审计事件。

### React Native

- 归因需融合 JS runtime 事件与 native logs。
- 恢复时避免误用 debug lane 作为执行 lane。

### Flutter

- 语义缺失引发失败时，先提升定位策略后再决定 fallback。
- 对低置信度视觉恢复默认不自动执行高风险动作。

---

## 6. 事件与审计

新增/强化事件：

- `failure_attributed`
- `recovery_attempted`
- `recovery_succeeded`
- `recovery_failed`

每个事件至少包含 `sessionId`、`actionId`、`reasonCode`、`artifactRefs`。

---

## 7. 验收指标

- 失败归因候选可用率 100%。
- 恢复动作有界执行率 100%。
- 恢复后二次验证覆盖率 100%。
