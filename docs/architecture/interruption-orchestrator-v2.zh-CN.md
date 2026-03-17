# Interruption Orchestrator V2 架构设计（iOS/Android）

本文档给出系统弹窗 / Action Sheet / Bottom Sheet / 自定义弹窗的统一中断处理方案，目标是在不破坏项目现有 deterministic-first 原则的前提下，把中断处理从“文案点击脚本”升级为“结构化检测 + 分类 + 策略处置 + 恢复闭环”。

---

## 1. 目标与非目标

## 1.1 目标

- 在 iOS / Android 上统一中断处理链路：`detect -> classify -> resolve -> resume`。
- 优先使用结构化信号（UI tree、节点拓扑、系统归属、交互阻塞证据），降低对单一文案匹配的依赖。
- 保持有界执行：bounded retry、可审计、可回放、可解释。
- 与现有会话/治理/证据模型兼容：`session + policy + timeline + artifacts`。

## 1.2 非目标

- 不把 OCR/CV 变成默认第一路径。
- 不做无边界自动重试和“静默吞错”。
- 不在本轮实现全自动规则自修改（可生成建议，但默认人工审查后入库）。

---

## 2. 当前基线与缺口

当前仓库已有能力（可复用）：

- 中断策略基线：
  - `configs/policies/interruption/android.yaml`
  - `configs/policies/interruption/ios.yaml`
- 共享中断 flow：
  - `flows/shared/handle-interruptions-android.yaml`
  - `flows/shared/handle-interruptions-ios.yaml`
- 执行与治理骨架：
  - `packages/core/src/policy-engine.ts`
  - `packages/mcp-server/src/policy-guard.ts`
  - `packages/core/src/session-store.ts`
- UI 抓取/查询基础：
  - `packages/adapter-maestro/src/ui-runtime.ts`
  - `packages/adapter-maestro/src/ui-model.ts`

主要缺口：

- 中断识别仍偏向文案/已知规则，缺少统一“分类器 + 结构签名”抽象。
- action 级 pre/post 中断守卫未形成统一编排器。
- 未知中断的“候选规则生成”未标准化。

---

## 3. 设计原则

1. **Deterministic-first**：优先 tree 与结构特征；OCR/CV 仅为 bounded fallback。
2. **Policy-driven**：处置动作必须可被 policy profile 约束，不允许绕过治理。
3. **Evidence-first failure**：未知中断必须产出 screenshot/tree/log/timeline。
4. **Bounded recovery**：每次中断恢复必须有次数上限与停止条件。
5. **Platform-aware, contract-unified**：平台实现可差异化，结果契约必须统一。

---

## 4. 目标架构

```text
Action Executor
   |
   +--> preActionGuard
   |      |
   |      +--> detectInterruption
   |      +--> classifyInterruption
   |      +--> resolveInterruptionWithPolicy
   |
   +--> executeAction
   |
   +--> postActionGuard
          |
          +--> detectInterruption
          +--> classifyInterruption
          +--> resolveInterruptionWithPolicy
          +--> resumeInterruptedAction (bounded)

All stages emit timeline + artifacts + reasonCode
```

核心模块：

- `interruption-detector`：多信号检测（结构变化、系统归属、遮挡/阻塞证据）。
- `interruption-classifier`：中断类型分类与置信度计算。
- `interruption-resolver`：按策略执行 dismiss / continue / deny / cancel 等动作。
- `interruption-orchestrator`：串联 pre/post guard、恢复与审计事件。

---

## 5. 中断处理状态机

统一状态：

- `none`
- `detected`
- `classified`
- `resolved`
- `resumed`
- `escalated`

标准流转：

1. `none -> detected`：发现疑似阻断层。
2. `detected -> classified`：分类为 `system_alert | action_sheet | permission_prompt | app_modal | overlay | unknown`。
3. `classified -> resolved`：命中 policy 并完成处置。
4. `resolved -> resumed`：对被打断动作进行一次有界恢复。
5. 任一步失败：`-> escalated`，输出结构化失败与证据。

禁止流转：

- 未分类直接执行高风险 dismiss。
- 无状态变化证据的无限循环恢复。

---

## 6. 检测与分类策略

## 6.1 检测信号（按优先级）

1. **结构信号**：root/top-layer 节点突变、模态容器出现、可交互区域收缩。
2. **归属信号**：系统组件归属（iOS SpringBoard / Android permission controller 等）。
3. **行为信号**：动作后目标无变化 + 阻塞节点存在。
4. **视觉信号（补充）**：遮罩层、底部弹层几何模式（仅结构不足时启用）。

## 6.2 分类器

- 第一层：规则分类（高精度、可解释）。
- 第二层：加权评分（同一类型多信号融合）。
- 置信度低于阈值：归为 `unknown`，不做激进自动操作。

---

## 7. 处置策略（Resolution Policy）

从“文案点击”升级为“语义槽位动作”：

- `primary`
- `secondary`
- `cancel`
- `destructive`

策略样例（概念）：

```yaml
- id: ios_permission_camera
  match:
    platform: ios
    type: permission_prompt
    signature:
      ownerBundle: com.apple.springboard
      containerRole: alert
      buttonSlots: [primary, secondary]
  action:
    strategy: choose_slot
    slot: secondary
  retry:
    maxAttempts: 1
```

高风险动作（destructive/业务副作用）默认禁用自动处置，必须返回建议并升级人工决策。

---

## 8. iOS / Android 平台特异方案

## 8.1 iOS

- 结构锚点：`XCUIElementTypeAlert`、`Sheet`、按钮槽位布局、SpringBoard 归属。
- 已知 Save Password 规则保留，但降级为“签名库中的一种”。
- Action Sheet 优先策略：默认 `cancel`（低风险），仅在 policy 明确允许时选择其他槽位。

## 8.2 Android

- 结构锚点：`Dialog/BottomSheet` 形态、系统包归属、标准按钮资源位。
- 区分系统权限弹窗 vs 应用自定义弹窗：`owner package + 结构签名`。
- OEM 差异通过 `vendor profile` 分层管理规则。

---

## 9. 会话、治理与证据

必须新增或强化以下审计事件：

- `interruption_detected`
- `interruption_classified`
- `interruption_resolved`
- `interrupted_action_resumed`
- `interruption_escalated`

每个事件最少包含：

- `sessionId`
- `actionId`
- `interruptionType`
- `confidence`
- `policyRuleId`
- `result`
- `artifactRefs`

unknown 中断必须保留完整证据包：

- screenshot
- ui tree
- action timeline window
- logs/crash signals

---

## 10. 与现有代码边界的映射

建议新增模块（`packages/adapter-maestro/src/`）：

- `interruption-detector.ts`
- `interruption-classifier.ts`
- `interruption-resolver.ts`
- `interruption-orchestrator.ts`

建议扩展模块：

- `packages/contracts/src/types.ts`（新增 interruption v2 契约）
- `packages/contracts/src/reason-codes.ts`（新增 reasonCode）
- `packages/core/src/policy-engine.ts`（v2 policy 解析与匹配）
- `packages/core/src/session-store.ts`（中断事件持久化）
- `packages/mcp-server/src/server.ts`（注册 detect/classify/resolve/resume 工具）
- `packages/mcp-server/src/policy-guard.ts`（新增 scope 门禁）

---

## 11. 兼容与迁移策略

1. 保留现有 `flows/shared/handle-interruptions-*.yaml` 作为兼容入口。
2. 内部先接入 orchestrator，再逐步把文案规则迁移为结构签名规则。
3. 提供双栈阶段：`policy v1(text)` 与 `policy v2(signature)` 并行，默认优先 v2。
4. 当某平台 v2 规则覆盖率达标后，再下线对应 v1 冗余规则。

---

## 12. 验收指标

- 已知中断自动处置成功率 ≥ 95%。
- unknown 中断证据完整率 = 100%。
- 因中断导致主流程失败率显著下降（阶段目标可按周追踪）。
- 恢复动作无 unbounded retry 违规。
- 关键会话中断事件可在 timeline 全量追踪。

---

## 13. 风险与缓解

- **风险：** 规则过度激进导致误点关键按钮。  
  **缓解：** 高风险动作默认禁止自动执行，必须 policy 显式放行。

- **风险：** 平台/OEM 差异导致规则碎片化。  
  **缓解：** 引入 signature catalog + vendor profile 分层。

- **风险：** 检测链路变重影响执行时延。  
  **缓解：** pre/post guard 仅在关键动作启用，非关键动作走轻量检测。

---

## 14. 参考与关联文档

- `docs/architecture/architecture.md`
- `docs/architecture/capability-map.md`
- `docs/architecture/governance-security.md`
- `docs/delivery/roadmap.md`
- `configs/policies/interruption/android.yaml`
- `configs/policies/interruption/ios.yaml`
- `flows/shared/handle-interruptions-android.yaml`
- `flows/shared/handle-interruptions-ios.yaml`
