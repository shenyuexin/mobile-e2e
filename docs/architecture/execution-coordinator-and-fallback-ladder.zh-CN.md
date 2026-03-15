# Execution Coordinator 与 Fallback Ladder 架构设计

本文档定义执行协调层如何把 deterministic-first、bounded fallback、post-verification 串成统一动作流水线。

---

## 1. 目标

- 统一动作执行状态机：resolve -> execute -> verify -> fallback -> fail/success。
- 固化 fallback 触发条件与停止条件，防止无边界重试。
- 在每个阶段输出结构化证据（reasonCode/timeline/artifacts）。

---

## 2. 代码映射

- `packages/core/src/execution-coordinator.ts`
- `packages/adapter-maestro/src/ui-model.ts`
- `packages/adapter-maestro/src/ui-runtime.ts`
- `packages/adapter-maestro/src/ui-tools.ts`
- `packages/mcp-server/src/tools/perform-action-with-evidence.ts`
- `docs/architecture/mobile-e2e-ocr-fallback-design.md`

---

## 3. 标准执行状态机

```text
pending
  -> resolving_target
  -> executing_action
  -> verifying_post_condition
  -> success

failure branch:
  -> check_fallback_eligibility
  -> fallback_executing (bounded)
  -> fallback_verifying
  -> success | failed
```

禁止行为：

- 未执行 post-condition 就报告 success。
- 无状态变化证据时持续重试。
- 未经 policy 放行就进入 OCR/CV。

---

## 4. Fallback Ladder

顺序必须为：

1. 稳定标识符（id/resource-id/testID/accessibility id）
2. 语义树匹配（text/label/role）
3. OCR fallback（有界）
4. CV/template fallback（有界）
5. fail + escalation guidance

每一层都需要：

- 触发原因
- 置信度
- 重试次数
- 是否允许进入下一层

---

## 5. 平台实现方案

### Android

- 首选 UI tree + selector 路径。
- 坐标点击仅在 target resolution 成功且 policy 允许时执行。

### iOS

- 使用 `idb` hierarchy 作为当前基线树能力。
- 选择器能力有限时，必须显式标记 `partial/unsupported`，不可伪装 deterministic 成功。

### React Native

- 自动化 lane 走平台执行路径；debug lane 提供附加证据。
- 不允许用 debug snapshot 替代 post-condition 验证。

### Flutter

- profile 中预期更高 fallback 频率。
- 对低置信度 OCR/CV 结果默认 fail-fast 并保留证据。

---

## 6. 证据输出合同

每个关键动作输出：

- `status`
- `reasonCode`
- `resolutionStrategy`
- `fallbackUsed`
- `confidence`
- `attempts`
- `artifacts[]`

---

## 7. 验收指标

- deterministic 成功路径可观测率 100%。
- fallback trace 缺失率 0。
- 无 unbounded retry 违规。
