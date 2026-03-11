# Phase 5 有边界自动恢复实施任务清单（中文版）

本清单是 `docs/phases/phase-5-bounded-auto-remediation.zh-CN.md` 的执行版，目标是把“设计原则”转换成可落地、可验收、可分配的实施任务。

建议执行原则：

- 先做最小闭环，再做扩展
- 先做门禁和停止条件，再做自动恢复动作
- 先在 sample / dry-run 场景验证，再扩大覆盖范围

---

## 0. 实施目标

本轮实施的唯一目标是落地一个最小可控闭环：

- 单次失败可触发一次有边界自动恢复
- 自动恢复仅限白名单场景
- 全程经过 policy / audit / retention / redaction 约束
- 失败时自动停止并降级到 suggestion-only

本轮明确不做：

- 自动修改代码
- 自动修改 flow / selector / policy
- 开放式多轮自愈循环
- 高业务副作用动作的自动 replay

---

## 1. 工作分解总览

### WS-1 恢复控制环编排

目标：把失败归因、门禁检查、恢复动作、停止条件串成一个统一执行路径。

### WS-2 治理与审计硬门禁

目标：确保自动恢复不能绕过 policy，也不能在 audit 失败时继续执行。

### WS-3 恢复动作白名单化

目标：只允许 `recover_to_known_state` 与 `replay_last_stable_path` 在受限场景内自动执行。

### WS-4 输出与可解释性标准化

目标：让每次自动恢复的触发原因、动作、结果、停止原因都可读可追踪。

### WS-5 验证与 rollout

目标：先在 sample 和 dry-run 路径完成验收，再决定是否扩展。

---

## 2. 任务清单

## WS-1 恢复控制环编排

### Task 1.1 定义自动恢复入口

- [ ] 确定自动恢复只挂在 `perform_action_with_evidence` 的 `failed` / `partial` 结果之后
- [ ] 明确自动恢复只处理带合法 `sessionId` 的动作
- [ ] 明确没有 action evidence window 时直接返回 suggestion-only

涉及模块：

- `packages/adapter-maestro/src/index.ts`
- `packages/mcp-server/src/index.ts`

验收标准：

- 成功动作不会触发自动恢复
- 无 `sessionId` 的失败动作不会触发自动恢复
- 无证据窗口时系统明确返回停止原因

### Task 1.2 定义恢复决策顺序

- [ ] 固化决策顺序：`explain_last_failure` -> `rank_failure_candidates`（可选）-> `suggest_known_remediation`（可选）
- [ ] 明确只有 `explain_last_failure` 命中白名单归因时才允许进入恢复执行
- [ ] 明确归因为 `unknown` 或证据弱时必须停止

涉及模块：

- `packages/adapter-maestro/src/index.ts`

验收标准：

- 弱归因场景不会进入恢复执行
- 白名单归因能进入下一步门禁判断

### Task 1.3 增加单次恢复限制

- [ ] 为单个失败动作增加“最多一次自动恢复”约束
- [ ] 为当前 session 增加恢复尝试记录
- [ ] 若同一动作已恢复过，则直接降级 suggestion-only

涉及模块：

- `packages/core/src/session-store.ts`
- `packages/adapter-maestro/src/index.ts`

验收标准：

- 同一动作不会出现多轮连续自动恢复
- 重复触发时能返回明确 stop reason

---

## WS-2 治理与审计硬门禁

### Task 2.1 复用现有 policy guard

- [ ] 确认自动恢复执行前必须复用 `packages/mcp-server/src/policy-guard.ts`
- [ ] 明确自动恢复绝不绕过现有 access profile
- [ ] 如需新增 profile / scope，只能先改治理配置，再开放恢复能力

涉及模块：

- `packages/mcp-server/src/policy-guard.ts`
- `packages/core/src/policy-engine.ts`
- `configs/policies/access-profiles.yaml`

验收标准：

- policy denied 时不会执行恢复动作
- denied 结果能返回明确 reason code / suggestion

### Task 2.2 把 audit 失败变成硬停止条件

- [ ] 确认自动恢复动作必须写入 session timeline
- [ ] 确认 `artifacts/audit/*.json` 同步失败时立即停止自动恢复
- [ ] 明确 audit failure 不得静默吞掉

涉及模块：

- `packages/core/src/session-store.ts`
- `packages/core/src/governance.ts`

验收标准：

- audit 写出失败时，恢复链路立刻停止
- 停止结果里包含 `why auto-remediation stopped`

### Task 2.3 审查 retention / redaction 边界

- [ ] 确认新增恢复链路不引入未治理 artifact 类型
- [ ] 确认恢复链路产物继续落入现有 retention profile
- [ ] 确认恢复链路输出继续走现有 redaction 逻辑

涉及模块：

- `packages/core/src/governance.ts`
- `configs/policies/artifact-retention.yaml`
- `configs/policies/session-audit-schema.yaml`

验收标准：

- 新增 artifact 可被现有分类逻辑覆盖
- 审计记录中的敏感字段仍会被脱敏

---

## WS-3 恢复动作白名单化

### Task 3.1 固化 allowlist 恢复类别

- [ ] 明确允许自动恢复的归因类别：`crash`、`error-state`、`waiting_network`、`waiting_ui`、`loading`
- [ ] 明确 `unknown`、高风险 interruption、业务副作用动作一律禁止自动恢复
- [ ] 把 allowlist 与 stop conditions 写成代码常量或集中配置，不散落在多个判断分支里

涉及模块：

- `packages/adapter-maestro/src/index.ts`

验收标准：

- 允许类别能进入恢复
- 禁止类别会立即停止并返回原因

### Task 3.2 限制 `recover_to_known_state`

- [ ] 明确 `recover_to_known_state` 只承担 bounded relaunch / bounded wait / re-sample
- [ ] 明确不在该动作内追加开放式后续搜索
- [ ] 恢复后必须重新采样状态并给出 recovered / not recovered

涉及模块：

- `packages/adapter-maestro/src/index.ts`

验收标准：

- crash / loading 场景可单次恢复
- 恢复后结果可明确判断是否 ready

### Task 3.3 限制 `replay_last_stable_path`

- [ ] 明确只允许 replay 当前 session 内最后稳定动作
- [ ] 明确 replay 仅限单步、一次、低副作用动作
- [ ] 明确支付、下单、删除、发送消息等场景禁止 replay

涉及模块：

- `packages/adapter-maestro/src/index.ts`
- `packages/contracts/src/types.ts`

验收标准：

- 可安全 replay 的 sample 能执行一次回放
- 高风险动作不会被自动 replay

---

## WS-4 输出与可解释性标准化

### Task 4.1 统一自动恢复结果结构

- [ ] 定义自动恢复结果最少包含：trigger reason、selected recovery、state before、state after、recovered、stop reason、artifact refs
- [ ] 确保 suggestion-only 路径也返回 stop reason
- [ ] 确保结果可直接进入 bug packet / review prompt

涉及模块：

- `packages/contracts/src/types.ts`
- `packages/adapter-maestro/src/index.ts`
- `docs/templates/bug-packet-template.md`
- `prompts/self-healing-review.md`

验收标准：

- 恢复成功和恢复停止两种路径都能输出结构化结果
- 结果字段足够支撑人工复盘

### Task 4.2 标准化 timeline / audit 事件

- [ ] 为自动恢复增加统一 timeline event 命名
- [ ] 区分“恢复已触发”“恢复成功”“恢复停止”三类事件
- [ ] 确保事件能关联原始 actionId

涉及模块：

- `packages/core/src/session-store.ts`
- `packages/adapter-maestro/src/index.ts`

验收标准：

- session timeline 中能完整还原一次自动恢复过程
- 审计记录与 timeline 可互相对齐

---

## WS-5 验证与 rollout

### Task 5.1 增加 dry-run / unit coverage

- [ ] 为 crash 恢复增加测试
- [ ] 为 loading / waiting_ui 恢复增加测试
- [ ] 为 policy denied 停止增加测试
- [ ] 为 audit failure 停止增加测试
- [ ] 为高风险 replay 禁止增加测试

涉及模块：

- `packages/mcp-server/test/server.test.ts`
- `packages/mcp-server/test/stdio-server.test.ts`
- `packages/mcp-server/test/session-persistence.test.ts`
- `scripts/validate-dry-run.ts`

验收标准：

- 至少覆盖 success / stop / denied / audit failure 四类路径

### Task 5.2 在 sample 路径做场景验收

- [ ] 准备一个 crash 恢复样例
- [ ] 准备一个 loading 恢复样例
- [ ] 准备一个 interruption 但不应自动恢复的样例
- [ ] 准备一个 replay allowed 与 replay blocked 的对照样例

涉及文档：

- `docs/phases/phase-validation-strategy.zh-CN.md`
- `docs/phases/discovery-driven-execution.zh-CN.md`

验收标准：

- 每个样例都有 evidence、timeline、audit、stop/success reason

### Task 5.3 rollout 规则

- [ ] 第一步只在 sample harness / dry-run 体系内启用
- [ ] 第二步只对白名单 profile 启用
- [ ] 第三步只在完成 Phase 4 更完整运行时治理后考虑扩大范围

验收标准：

- rollout 每一步都有显式 enable boundary
- 没有出现“默认全开”的自动恢复路径

---

## 3. 建议实施顺序

建议按以下顺序推进：

1. 先做 WS-1.1 / WS-1.2 / WS-1.3，形成最小控制环
2. 再做 WS-2.1 / WS-2.2，先把治理硬门禁立住
3. 再做 WS-3.1 / WS-3.2 / WS-3.3，把恢复动作白名单化
4. 再做 WS-4.1 / WS-4.2，把输出和审计标准化
5. 最后做 WS-5.1 / WS-5.2 / WS-5.3，完成验证与 rollout

换句话说：

- 先控制风险
- 再开放动作
- 最后验证放量

---

## 4. Done 定义

只有同时满足以下条件，才算这一轮实施完成：

- 自动恢复只发生在 allowlist 场景
- 每次失败最多自动恢复一次
- policy denied 会阻断恢复
- audit failure 会阻断恢复
- 高业务副作用动作不会被自动 replay
- 恢复结果能输出结构化 stop / success reason
- 对应测试与 sample 验证通过

---

## 5. 推荐交付物

建议本轮最终至少产出：

- 自动恢复控制环实现
- 对应 contracts / timeline / audit 字段更新
- 单元测试与 dry-run 验证
- 一份更新后的 phase 状态说明
- 一份场景验收记录

如果后续需要继续扩展，应先回到：

- `docs/phases/phase-5-bounded-auto-remediation.zh-CN.md`
- `docs/phases/program-status.zh-CN.md`
- `docs/phases/phase-4-governance-baseline.zh-CN.md`

先确认治理边界，再扩大自动恢复范围。
