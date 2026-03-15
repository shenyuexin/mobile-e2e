# Policy Engine Runtime 架构设计（Scope / Guard / Rule Matching）

本文档定义 `mobile-e2e-mcp` 的策略运行时架构，目标是将“策略配置”转化为“可执行门禁”，并与工具调用链、会话编排链保持一致。

---

## 1. 目标与非目标

### 1.1 目标

- 明确 `requiredPolicyScopesForTool()` 与工具能力之间的映射关系。
- 建立 access profile、interruption policy、fallback policy 的统一执行入口。
- 让 allow/deny 决策可审计、可解释、可回放。

### 1.2 非目标

- 不把 policy enforcement 下沉到 adapter 内部。
- 不做策略热更新的分布式一致性系统（当前以仓库配置为主）。

---

## 2. 现状与代码边界

核心边界：

- `packages/core/src/policy-engine.ts`（解析与匹配）
- `packages/mcp-server/src/policy-guard.ts`（工具入口门禁）

配置来源：

- `configs/policies/access-profiles.yaml`
- `configs/policies/interruption/ios.yaml`
- `configs/policies/interruption/android.yaml`
- `configs/policies/artifact-retention.yaml`

---

## 3. 设计原则

1. **Policy in core, enforcement in server**：解析在 core，执行拦截在 mcp-server。
2. **Default deny on unknown write scope**：未知高风险 scope 默认拒绝。
3. **Explainable decision**：每次拒绝都要输出 reasonCode 与建议。
4. **No silent fallback escalation**：fallback 升级必须被策略显式允许。

---

## 4. 目标架构

```text
Tool Request
   |
   +--> policy-guard.ts
           |
           +--> policy-engine.ts
                  +--> access profile resolution
                  +--> required scope check
                  +--> interruption/fallback rule check
           |
           +--> allow | deny (structured envelope)
```

---

## 5. 决策状态机

- `policy_unresolved`
- `policy_loaded`
- `scope_checked`
- `rule_matched`
- `allowed | denied | partial`

关键规则：

1. 工具先做 scope 校验，再做细粒度 rule match。
2. scope 未满足时立即 deny，不进入 adapter 执行。
3. fallback 相关动作需额外校验允许级别与置信阈值策略。

---

## 6. 策略分层模型

### 6.1 Access Profile

- Read-only / Interactive / Full-control。
- 映射工具最低 required scope。

### 6.2 Interruption Policy

- 平台维度规则（iOS / Android）。
- 高风险中断动作默认禁止自动执行。

### 6.3 Fallback Policy

- 允许 deterministic 失败后进入 OCR/CV 的场景、阈值、上限。

---

## 7. 平台实现方案

### Android

- 对 install/reset/permission 相关工具默认要求更高 scope。
- interruption 规则按系统弹窗与 OEM 差异分层。

### iOS

- SpringBoard/system alert 相关动作需单独门禁。
- 对 `idb` 写操作保持 scope 白名单。

### React Native

- debug lane（console/network capture）优先 read scope。
- `Runtime.evaluate` 类未来能力默认高风险，必须显式策略放行。

### Flutter

- 语义不足导致 fallback 频繁时，严格限制可自动点击动作集合。

---

## 8. 契约与返回结构

拒绝返回至少包含：

- `status: failed|partial`
- `reasonCode`（策略拒绝相关）
- `requiredScope`
- `currentProfile`
- `nextSuggestions`

---

## 9. 迁移策略

1. 所有工具统一走 `policy-guard.ts`。
2. 对历史直通工具补 `requiredPolicyScopesForTool`。
3. 增加策略回归测试：allow/deny/partial 三路径。

---

## 10. 验收指标

- 未授权写动作拦截率 100%。
- 策略拒绝响应结构化率 100%。
- 无绕过 policy 直达 adapter 的路径。

---

## 11. 风险与缓解

- **风险：** scope 设计过粗导致误拒绝。  
  **缓解：** 以工具能力分组做最小可用粒度拆分。

- **风险：** profile 与工具新增不同步。  
  **缓解：** 在 CI 增加 policy coverage 校验。
