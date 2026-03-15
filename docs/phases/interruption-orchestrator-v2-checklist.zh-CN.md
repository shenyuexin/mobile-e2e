# Interruption Orchestrator V2 改造清单（执行完成版）

本清单对应 `docs/architecture/interruption-orchestrator-v2.zh-CN.md`。  
本轮状态：**已按清单完成实现、验证并回填证据**。

---

## 0. 改造目标（Done Definition）

- [x] 形成 `detect -> classify -> resolve -> resume` 统一中断闭环。
- [x] iOS/Android 支持系统弹窗 + 自定义弹窗结构化处理（保留 v1 兼容入口）。
- [x] unknown interruption 进入证据化路径。
- [x] 中断恢复遵守 bounded retry（单次恢复 + 漂移检测）。
- [x] policy/audit/session 约束全程生效。

---

## 1. 工作流总览

### WS-1 合同与错误语义升级（contracts）
- [x] 完成

### WS-2 核心策略与会话编排（core）
- [x] 完成

### WS-3 平台执行引擎改造（adapter-maestro）
- [x] 完成

### WS-4 MCP 工具与治理接入（mcp-server）
- [x] 完成

### WS-5 配置与 flow 迁移（configs/flows）
- [x] 完成（v2 签名规则 + v1 兼容 flow 保留）

### WS-6 测试、验收与文档回写
- [x] 完成

### WS-7 P0/P1 通用编排强化（hard guard + strategy hardening）
- [x] 完成

---

## 2. 任务清单

## WS-1 合同与错误语义升级（contracts）

### Task 1.1 扩展 interruption v2 类型
- [x] `packages/contracts/src/types.ts` 新增 interruption v2 类型：
  - `InterruptionType`
  - `InterruptionSignal`
  - `InterruptionEvent`
  - `ResumeCheckpoint`
  - `InterruptionPolicyRuleV2`
  - `DetectInterruption* / ClassifyInterruption* / ResolveInterruption* / ResumeInterruptedAction*`

### Task 1.2 补齐 reason code
- [x] `packages/contracts/src/reason-codes.ts` 新增：
  - `INTERRUPTION_UNCLASSIFIED`
  - `INTERRUPTION_RESOLUTION_FAILED`
  - `INTERRUPTION_RECOVERY_STATE_DRIFT`

### Task 1.3 导出统一入口
- [x] `packages/contracts/src/index.ts` 导出 interruption v2 新类型。

---

## WS-2 核心策略与会话编排（core）

### Task 2.1 policy-engine 增加 v2 匹配能力
- [x] `packages/core/src/policy-engine.ts` 增加 interruption v2 policy 加载与匹配。
- [x] 增加 `loadInterruptionPolicyConfig(...)`。
- [x] 增加 `resolveInterruptionPlan(...)`。
- [x] 新增 interruption 相关 tool scope：`interrupt`。

### Task 2.2 session-store 增加中断事件持久化
- [x] `packages/core/src/session-store.ts` 增加中断事件/checkpoint 持久化字段。
- [x] 新增 `persistInterruptionEvent(...)`。

### Task 2.3 governance 接入高风险动作门禁
- [x] `packages/core/src/governance.ts` 增加高风险 interruption 规则判断。
- [x] 增加 `interrupt-high-risk` 约束检查函数。

---

## WS-3 平台执行引擎改造（adapter-maestro）

### Task 3.1 新增中断检测模块
- [x] 新增 `packages/adapter-maestro/src/interruption-detector.ts`。

### Task 3.2 新增中断分类模块
- [x] 新增 `packages/adapter-maestro/src/interruption-classifier.ts`。

### Task 3.3 新增策略处置模块
- [x] 新增 `packages/adapter-maestro/src/interruption-resolver.ts`。

### Task 3.4 新增 orchestrator 并接入 action 前后守卫
- [x] 新增 `packages/adapter-maestro/src/interruption-orchestrator.ts`。
- [x] 在 `packages/adapter-maestro/src/index.ts` 的 `performActionWithEvidenceWithMaestro` 注入 pre/post interruption guard 调用。

### Task 3.5 恢复逻辑有界化
- [x] 增加 `resumeInterruptedActionWithMaestro(...)`。
- [x] 增加状态漂移检测，并返回 `INTERRUPTION_RECOVERY_STATE_DRIFT`。

---

## WS-4 MCP 工具与治理接入（mcp-server）

### Task 4.1 新增 interruption 工具
- [x] 新增工具文件：
  - `packages/mcp-server/src/tools/detect-interruption.ts`
  - `packages/mcp-server/src/tools/classify-interruption.ts`
  - `packages/mcp-server/src/tools/resolve-interruption.ts`
  - `packages/mcp-server/src/tools/resume-interrupted-action.ts`

### Task 4.2 注册工具与路由
- [x] `packages/mcp-server/src/index.ts` 注册工具 handler。
- [x] `packages/mcp-server/src/server.ts` 更新 registry/listTools/invoke。
- [x] `packages/mcp-server/src/stdio-server.ts` 更新 tool list。

### Task 4.3 policy-guard 接入新 scope
- [x] `packages/core/src/policy-engine.ts` 增加 interruption scope 映射。
- [x] `packages/mcp-server/src/policy-guard.ts` 增加 interruption deny 提示。

---

## WS-5 配置与 flow 迁移（configs/flows）

### Task 5.1 升级 interruption policy 结构
- [x] `configs/policies/interruption/android.yaml` 升级为 v2 结构（保留 v1 兼容字段）。
- [x] `configs/policies/interruption/ios.yaml` 升级为 v2 结构（保留 v1 兼容字段）。
- [x] 新增 `configs/policies/interruption/signature-catalog.yaml`。

### Task 5.2 升级 shared interruption flow
- [x] `flows/shared/handle-interruptions-android.yaml` 补全兜底按钮并保持可选处理。
- [x] `flows/shared/handle-interruptions-ios.yaml` 补全 action sheet cancel 兜底。
- [x] 服务端已接管结构化 detect/classify/resolve/resume 流程，flow 保持兼容入口。

---

## WS-6 测试、验收与文档回写

### Task 6.1 单元测试补齐
- [x] 新增：
  - `packages/adapter-maestro/test/interruption-detector.test.ts`
  - `packages/adapter-maestro/test/interruption-classifier.test.ts`
  - `packages/adapter-maestro/test/interruption-orchestrator.test.ts`
  - `packages/adapter-maestro/test/interruption-resolver.test.ts`
  - `packages/mcp-server/test/interruption-tools.test.ts`

### Task 6.2 fixture 扩展
- [x] 新增 Android fixtures：
  - `tests/fixtures/ui/android-permission-dialog.xml`
  - `tests/fixtures/ui/android-bottom-sheet.xml`
- [x] 新增 iOS fixtures：
  - `tests/fixtures/ui/ios-system-alert.json`
  - `tests/fixtures/ui/ios-action-sheet.json`

### Task 6.3 回归与构建验证
- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 通过（unit + smoke）
- [x] `pnpm build` 通过（由 test/smoke 路径重复覆盖）

### Task 6.4 文档回写
- [x] `docs/architecture/architecture.md`
- [x] `docs/architecture/capability-map.md`
- [x] `docs/architecture/governance-security.md`
- [x] `docs/delivery/roadmap.md`

---

## WS-7 P0/P1 通用编排强化（hard guard + strategy hardening）

### Task 7.1 P0：pre/post interruption guard 升级为硬门禁
- [x] `packages/adapter-maestro/src/index.ts`
  - pre-guard 未通过（非 `resolved/not_needed`）时阻断主 action，不再继续执行 `executeIntentWithMaestro(...)`。
  - post-guard 失败时覆盖最终结果为 failed，并回写 action record（避免“先成功后失败”的语义分叉）。
  - post-guard 成功且已 resolved 时触发 `resumeInterruptedActionWithMaestro(...)`。

### Task 7.2 P0：interruption 自动处置动作的 policy 一致性校验
- [x] `packages/adapter-maestro/src/index.ts`
  - 当中断规则策略需要 tap 能力（`tap_selector`/`choose_slot`/`coordinate_tap`）时，显式校验 access profile 对 `tap_element` 的许可。
  - 被拒绝时返回 `POLICY_DENIED`，并写入 interruption escalated 事件。

### Task 7.3 P0：status 语义收敛（含 partial）
- [x] `packages/adapter-maestro/src/index.ts`
  - resolve 阶段不再将 `partial` 隐式视作成功。
  - 无可执行 tap 输入时显式失败（`INTERRUPTION_RESOLUTION_FAILED`）。

### Task 7.4 P1：retry.maxAttempts 真正生效 + resolve 后验证
- [x] `packages/adapter-maestro/src/index.ts`
  - 消费 `matchedRule.retry.maxAttempts`，执行 bounded retry（内部上限保护）。
  - 每次处置后重跑 detect，确认 interruption 已清除才标记 resolved。
- [x] `packages/contracts/src/types.ts`
  - `ResolveInterruptionData` 新增 `resolutionAttempts`、`verifiedCleared` 字段用于可观测性与审计。

### Task 7.5 P1：classification 主导规则匹配（authoritative）
- [x] `packages/core/src/policy-engine.ts`
  - `resolveInterruptionPlan(...)` 新增 `expectedType` 过滤。
- [x] `packages/adapter-maestro/src/interruption-resolver.ts`
  - 调用 resolve plan 时传入 `classification.type`，避免跨类型误命中。
  - 增加 `selectedSlot` 与 `classification.buttonSlots` 一致性校验。

### Task 7.6 P1：测试补齐
- [x] `packages/core/test/interruption-policy.test.ts`（新增）
  - 覆盖 expectedType 过滤行为。
- [x] `packages/adapter-maestro/test/interruption-resolver.test.ts`（扩展）
  - 覆盖 slot 可用性校验。
  - 覆盖 classification type 主导匹配。

---

## 3. 每项任务完成记录（本轮摘要）

- 完成记录：
  - PR: N/A（本地工作区）
  - Verify:
    - `pnpm --filter @mobile-e2e-mcp/core test`
    - `pnpm --filter @mobile-e2e-mcp/adapter-maestro test`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`
  - Artifacts:
    - `artifacts/sessions/*.json`
    - `artifacts/audit/*.json`
    - `tests/fixtures/ui/*`
  - Notes:
    - interruption v2 与 v1 规则保持兼容，避免中断既有 sample harness。
    - 本轮新增 P0/P1 强化后，中断处理从“可观测调用”升级为“流程硬门禁 + 有界验证闭环”。

---

## 4. 阶段验收门槛（Go/No-Go）

- [x] interruption v2 工具链可用并通过回归。
- [x] unknown interruption 进入结构化证据路径。
- [x] 无 unbounded retry（恢复路径受限）。
- [x] interruption scope 已进入 policy enforcement。
- [x] iOS + Android sample 验证链路通过。
