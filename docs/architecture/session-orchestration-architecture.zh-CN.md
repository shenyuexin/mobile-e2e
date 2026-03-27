# Session Orchestration 架构设计（租约 / 调度 / 并发隔离）

本文档定义 `mobile-e2e-mcp` 的会话编排运行时，实现目标是把“会话生命周期 + 设备租约 + 串行执行 + 审计时间线”统一为可验证的控制面能力。

---

## 1. 目标与非目标

### 1.1 目标

- 统一 `start_session -> run_flow/actions -> end_session` 的会话状态机。
- 明确设备互斥模型（lease/lock），避免同设备并发写操作冲突。
- 建立队列调度与执行编排边界（scheduler/coordinator）。
- 保证会话级证据和事件可追踪（timeline + artifacts + audit）。

### 1.2 非目标

- 不实现跨机房分布式锁（当前为单仓/单运行域基线）。
- 不将 adapter 内部执行细节塞入 core 编排层。
- 不绕过 policy 直接执行高风险动作。

---

## 2. 现状与代码边界

核心实现文件：

- `packages/core/src/session-store.ts`
- `packages/core/src/session-scheduler.ts`
- `packages/core/src/device-lease-store.ts`
- `packages/core/src/execution-coordinator.ts`
- `packages/mcp-server/src/tools/start-session.ts`
- `packages/mcp-server/src/tools/end-session.ts`
- `packages/mcp-server/src/tools/get-session-state.ts`

配置与治理关联：

- `configs/policies/access-profiles.yaml`
- `configs/policies/session-audit-schema.yaml`
- `configs/policies/artifact-retention.yaml`

---

## 3. 设计原则

1. **Single owner per device**：同一时刻一个设备只允许一个写会话持有 lease。
2. **Bounded queueing**：排队与等待有上限，超时可解释失败。
3. **Session-first evidence**：所有执行都挂载到 session 语义并写入 timeline。
4. **Policy-gated execution**：会话可执行能力由 policy profile 决定。
5. **Recoverable state**：异常中断后可恢复 idle/leased 一致状态。

---

## 4. 目标架构

```text
MCP Tool Call
   |
   +--> Policy Guard (scope)
   |
   +--> Session Scheduler (queue)
   |      |
   |      +--> Device Lease Store (acquire/renew/release)
   |
   +--> Execution Coordinator (runExclusive)
   |      |
   |      +--> Adapter Router / Adapter Execution
   |
   +--> Session Store (timeline, artifacts, audit refs)
```

---

## 5. 会话状态机

建议统一状态：

- `created`
- `queued`
- `running`
- `interrupted`
- `completed`
- `failed`
- `terminated`

关键流转：

1. `created -> queued`：进入 scheduler。
2. `queued -> running`：成功 acquire lease。
3. `running -> interrupted`：检测到中断并进入处置流程。
4. `running -> completed|failed`：动作/flow 结束。
5. 任意执行态 `-> terminated`：显式 end session 或强制回收。

禁止流转：

- 未持有 lease 即进入 `running`。
- `terminated` 后继续写 action timeline。

---

## 6. 租约与调度模型

### 6.1 Device Lease

- Lease 维度：`platform + deviceId`。
- Lease 字段：`sessionId`、`owner`、`acquiredAt`、`heartbeatAt`、`ttl`。
- 支持 stale lease 检测与回收，防止僵尸会话长期占用设备。

### 6.2 Session Scheduler

- 按设备粒度排队（避免全局大锁）。
- 输出 `queue_wait_started / queue_wait_ended` 事件。
- 可配置最大等待时长，超时返回结构化 `reasonCode`。

### 6.3 Execution Coordinator

- 负责 `runExclusive()` 语义。
- 在执行前后维护 busy/idle 标记，确保异常也能释放资源。

---

## 7. 与各平台实现衔接

### Android

- 设备标识：ADB serial。
- 典型争用点：`adb shell` 并发、install/launch 冲突。
- 要求：执行入口必须经过 scheduler + lease，禁止直接并发打到 adapter。

### iOS

- 设备标识：simulator UDID / real device ID。
- 典型争用点：`idb` 会话冲突、simctl 并发控制。
- 要求：长动作需要 heartbeat 续约，避免被误回收。

### React Native

- 在平台 lease 外，调试 lane（Metro inspector）需与执行 lane 进行会话归并。
- 调试抓取默认只读，不得破坏主执行 lease 一致性。

### Flutter

- 语义弱场景下 fallback 更频繁，但租约模型不变。
- 可在 profile 中提高等待与重试阈值，仍需受 bounded policy 限制。

---

## 8. 事件与审计字段

最小事件字段：

- `sessionId`
- `actionId`（可选）
- `eventType`
- `timestamp`
- `deviceRef`
- `policyProfile`
- `reasonCode`
- `artifactRefs`

当前 Phase 4 已开始写入的 replay 事件类型：

- `replay_started`
- `replay_step_started`
- `replay_step_completed`
- `replay_step_failed`
- `replay_stopped`
- `replay_completed`

这些事件当前首先服务于 step-aware replay preview，不代表所有 replay 路径都已完全迁移到该事件模型。

审计 schema 与 retention 以 `configs/policies/session-audit-schema.yaml`、`artifact-retention.yaml` 为准。

---

## 9. 迁移与落地顺序

1. 统一 `start_session/end_session/get_session_state` 的状态语义。
2. 在所有写类工具入口强制走 `runExclusive()`。
3. 增加 stale lease recovery 与 queue telemetry。
4. 回填测试：并发争用、异常回收、重复 end session 幂等性。

---

## 10. 验收指标

- 同设备并发写冲突率降为 0（由 lease 拦截）。
- 队列等待可观测率 100%。
- 异常路径资源释放成功率 100%。
- 会话关闭后不可再写 timeline（强一致约束）。

---

## 11. 风险与缓解

- **风险：** stale lease 误判导致有效会话被抢占。  
  **缓解：** heartbeat + 双重确认 + 安全回收窗口。

- **风险：** 只读调试 lane 影响执行 lane 时序。  
  **缓解：** 调试 lane 默认只读 scope，禁止写动作复用同一通道。
