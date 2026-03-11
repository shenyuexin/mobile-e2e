# Phase 5 有边界自动恢复验收记录（中文版）

## 本轮落地范围

本轮实现的是一个最小可控闭环：

- `perform_action_with_evidence` 支持显式 `autoRemediate`
- 自动恢复只做一次
- 只在白名单归因下进入恢复执行
- 恢复前后继续走 policy / audit / retention / redaction 边界
- 不做代码、flow、selector、policy 自动修改

---

## 已实现的控制点

### 1. 入口与单次限制

- 自动恢复只挂在 `perform_action_with_evidence` 之后
- 默认不开启，必须显式传入 `autoRemediate`
- 同一 `actionId` 若已出现 `auto_remediation_*` timeline 事件，不会再次进入恢复

### 2. 治理硬门禁

- 没有 session record 时直接停止
- 没有审计文件时直接停止
- 自动恢复触发事件写不进 audit 时直接停止
- 恢复动作仍复用现有 tool policy gate，因此 `policy denied` 会阻断恢复

### 3. 白名单恢复

- allowlist：`crash`、`waiting_network`、`waiting_ui`、`loading` / `error_state`
- 恢复动作仍限定为现有原语：`recover_to_known_state` 与受限 `replay_last_stable_path`
- 高业务副作用 replay（如支付/下单/删除/发送等关键词命中）会被阻断

### 4. 结构化输出与 timeline

- `PerformActionWithEvidenceData.autoRemediation` 现在会返回：
  - trigger reason
  - selected recovery
  - recovered
  - stop reason / stop detail
  - state before / after
  - artifact refs
  - attribution / remediation suggestions
- session timeline 新增：
  - `auto_remediation_triggered`
  - `auto_remediation_succeeded`
  - `auto_remediation_stopped`

---

## 已完成的验证

### 单元 / 集成测试

- allowlisted crash 可触发一次 bounded recovery
- action 已成功时不会触发自动恢复
- recovery 被 policy deny 时会停止
- audit 缺失时会停止
- 高风险 replay suggestion 会停止
- 直接工具调用和 CLI / stdio 路径都能返回结构化 auto-remediation 结果

### dry-run 验证

- `scripts/validate-dry-run.ts` 已加入 auto-remediation case

---

## 当前仍未扩展的范围

- 还没有开放式多轮自愈循环
- 还没有自动修改代码 / flow / selector / policy
- 还没有把自动恢复扩大到真实业务高副作用路径
- 还没有把 Phase 5 扩展成完整 agentic integration

---

## 结论

当前仓库已经具备：

- 一个受治理约束的最小自动恢复闭环
- 一组可复现的停止条件
- 一套可审计、可解释、可回归的 dry-run/sample 验证面

这意味着 Phase 5 不再只是“原语齐了”，而是已经进入 **bounded auto-remediation baseline landed** 的状态。
