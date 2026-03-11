# Phase 5 有边界自动恢复设计（中文版）

## 目标

把当前仓库已经具备的 failure analysis / recovery primitives 收敛成一个可审计、可停止、低副作用的自动恢复闭环，而不是直接走向开放式自动修复。

这个设计服务于两个现实约束：

- `docs/phases/phase-5-agentic-baseline.zh-CN.md` 已明确当前阶段应坚持“建议优先、自动修改靠后”
- `docs/phases/program-status.zh-CN.md` 已明确 Phase 4 / Phase 5 仍在等待更完整的运行时接入

因此，这里的目标不是构建“通用自治 agent”，而是构建“受限自动恢复器”。

---

## 当前仓库已经具备的基础

### 已有运行时原语

- `perform_action_with_evidence`：对单步动作采集 pre/post state、evidence delta、action record
- `explain_last_failure`：对最近一次失败动作做归因
- `rank_failure_candidates`：对失败层级给出候选排序
- `suggest_known_remediation`：基于本地 failure index / baseline index 给出恢复建议
- `recover_to_known_state`：在 crash / loading / waiting 状态下做有边界恢复
- `replay_last_stable_path`：回放当前 session 内最后一次稳定动作

这些能力当前主要落在：

- `packages/adapter-maestro/src/index.ts`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/policy-guard.ts`

### 已有治理骨架

- `configs/policies/access-profiles.yaml` 已经通过 `packages/mcp-server/src/policy-guard.ts` 接入工具调用门禁
- `configs/policies/artifact-retention.yaml` 与 `configs/policies/session-audit-schema.yaml` 已经通过 `packages/core/src/governance.ts` 被读取
- `packages/core/src/session-store.ts` 已能同步生成 `artifacts/audit/*.json`

这说明当前仓库不是“没有基础”，而是“缺少一个真正的自动恢复控制环”。

---

## 设计结论

当前项目值得做自动恢复能力，但只应做以下形态：

- 自动恢复，不做自动改代码
- 自动恢复，不做自动改 flow / selector / policy
- 单步恢复，不做开放式多轮试错
- 有证据才恢复，没有证据就退回建议模式
- 有审计才恢复，审计失败就停止恢复

一句话总结：

> Phase 5 的下一步不是 “agent 自己修一切”，而是 “系统在白名单场景内自动做一次低风险恢复，并把全过程写进审计”。

---

## 作用范围

### in scope

- 由 `perform_action_with_evidence` 产生的单步失败
- 当前 session 内可归因、可审计的恢复动作
- 仅调用现有恢复原语：`recover_to_known_state`、`replay_last_stable_path`
- 仅处理低副作用、可重复、可停止的中断或不稳定状态

### out of scope

- 自动修改代码、配置、测试、flow 文件、selector
- 自动接受高风险系统权限或安全告警
- 跨多个分支路径的自主搜索与试错
- 对支付、下单、删除、发送消息等业务副作用动作做自动重放

---

## 最小控制闭环

建议的最小闭环如下：

1. 执行 `perform_action_with_evidence`
2. 若结果为 `failed` 或 `partial`，进入恢复判断
3. 调用 `explain_last_failure`
4. 如归因不够稳定，可补充 `rank_failure_candidates` 与 `suggest_known_remediation`
5. 仅当归因命中白名单类别，且 policy profile 允许，才执行一次恢复动作
6. 恢复动作执行后重新采样状态
7. 若状态恢复到 `ready` 或明显稳定，则结束自动恢复
8. 若恢复失败、审计失败、归因不明确、超出白名单，则停止并退回 suggestion-only

可表达为：

```text
perform_action_with_evidence
  -> failed | partial
  -> explain_last_failure
  -> policy / audit / allowlist gate
  -> recover_to_known_state OR replay_last_stable_path
  -> resample state
  -> stop
```

这个闭环的核心原则不是“尽量修好”，而是“只做一次足够安全的恢复尝试”。

---

## 触发条件

只有同时满足以下条件，才能进入自动恢复：

1. 已存在合法 `sessionId`
2. 本次失败来自 `perform_action_with_evidence` 这样的有证据窗口动作
3. `explain_last_failure` 能给出可落入白名单的归因类别
4. `policy-guard` 对目标恢复工具放行
5. 当前恢复动作具备审计记录能力
6. 本次动作尚未触发过自动恢复

任何一个条件不满足，都应立即退回 suggestion-only。

---

## 白名单恢复类别

### 1. crash / error-state 恢复

适用场景：

- 点击后 app 崩溃
- 页面进入 error state
- runtime signal 明确指向 crash / ANR / fatal error

允许动作：

- `recover_to_known_state`

典型行为：

- 自动执行一次 relaunch
- 重新采样状态
- 若仍非 ready，则停止

### 2. waiting-network / waiting-ui / loading 恢复

适用场景：

- 页面卡在 loading
- 网络尚未稳定
- UI 还没进入可操作状态

允许动作：

- `recover_to_known_state`

典型行为：

- 做一次 bounded wait / re-sample
- 若状态仍未稳定，则停止

### 3. 本 session 内最后稳定动作回放

适用场景：

- 恢复完成后需要返回已知稳定页面
- 已存在成功 action baseline
- 重放动作本身没有业务副作用

允许动作：

- `replay_last_stable_path`

限制条件：

- 仅限当前 session
- 仅限单步
- 仅限一次
- 仅限低副作用动作

### 4. 已知失败签名映射到已有恢复模板

适用场景：

- 当前 failure signature 与本地历史高度相似
- `suggest_known_remediation` 给出的建议最终仍只落在白名单恢复动作上

允许动作：

- `recover_to_known_state`
- `replay_last_stable_path`

限制条件：

- remediation 不能扩展到代码、selector、flow、policy 修改

---

## 必须停止的情况

以下情况一律停止自动恢复：

- 没有 `sessionId`
- 没有 action evidence window
- `explain_last_failure` 归因为 `unknown` 或证据明显不足
- 审计记录未成功写出
- policy profile 不允许目标工具
- 本次动作已经自动恢复过一次
- 目标动作属于高业务副作用类别
- 恢复后状态仍不稳定

停止后系统应返回：

- failure attribution
- captured evidence
- known remediation suggestion
- why auto-remediation stopped

也就是说，停止不是“静默失败”，而是“降级到可解释建议模式”。

---

## 治理要求

### 1. policy gate

自动恢复前必须经过现有 `policy-guard`。

原则上，自动恢复不应绕过现有 profile，而应复用已有 access profile 机制。后续如果要扩大能力，也应先新增 profile / scope，再开放动作。

### 2. audit gate

自动恢复必须保证以下内容可追踪：

- 原始失败动作
- 失败归因
- 恢复动作类型
- 恢复前后状态摘要
- 停止原因

如果 audit record 无法生成或同步失败，自动恢复应立即停止。

### 3. retention / redaction gate

恢复过程中产生的 artifact 继续受以下约束：

- 走当前 retention profile
- 走当前 redaction 规则
- 不引入额外未治理的 artifact 类型

这意味着 Phase 5 的自动恢复不应先扩大 artifact 面，再回头补治理。

---

## 不应自动化的场景

以下场景当前应保持 suggestion-only：

- 自动修改代码、测试、配置、flow、selector
- 自动处理支付、下单、删除、发送消息等不可逆业务动作
- 自动确认系统权限、证书、隐私、安全告警
- 开放式多轮搜索式“自愈”
- 证据不足但模型猜测很强的情况

这些场景不是“永远不能做”，而是“在当前 Phase 4 / 5 成熟度下不该做”。

---

## 示例

### 示例 1：登录后崩溃

```text
tap login button
-> perform_action_with_evidence = failed
-> explain_last_failure = crash
-> policy allows recover_to_known_state
-> relaunch app once
-> resample state
-> ready => stop
```

### 示例 2：页面一直 loading

```text
submit form
-> perform_action_with_evidence = partial
-> explain_last_failure = waiting_network
-> recover_to_known_state performs bounded wait
-> state becomes ready => stop
```

### 示例 3：恢复后回到已知稳定页面

```text
recover_to_known_state succeeded
-> replay_last_stable_path (same session, one step only)
-> state stable => stop
```

### 示例 4：高风险动作不自动恢复

```text
submit payment
-> action failed
-> even if replay is technically possible
-> stop and return suggestion-only
```

---

## 推荐落地顺序

### Step 1

先把“单次自动恢复门禁”做出来：

- 只接受 `failed` / `partial`
- 只允许一次自动恢复
- 只允许白名单恢复动作

### Step 2

把审计失败变成硬停止条件：

- audit record 写不出来就不继续恢复

### Step 3

把恢复结果标准化输出：

- recovered / not recovered
- stop reason
- evidence references

### Step 4

在更多 sample 上验证：

- crash 恢复
- loading 恢复
- interruption 恢复
- session 内稳定动作回放

### Step 5

只有在 Phase 4 运行时治理更完整之后，再考虑扩大到更多 allowlist 场景。

---

## 验收标准

达到以下条件，才算这个最小设计落地成功：

- 自动恢复只发生在 allowlist 场景
- 每次失败最多自动恢复一次
- policy denied 时不会越权执行
- audit 失败时会停止恢复
- 恢复后会输出明确 stop / success reason
- 高副作用动作不会被自动 replay
- 相关 sample 能稳定复现并验证上述边界

---

## 最终判断

当前项目确实需要自动恢复能力，但它应该被定义为：

- 一个受治理约束的运行时恢复闭环
- 一个对白名单失败类型做有限恢复的机制
- 一个以证据、审计、停止条件为先的保守系统

而不应该被定义为：

- 自动修改代码的 agent
- 自动探索任意修复路径的自治系统
- 在治理尚未闭环前就大规模放开的 self-healing 框架

---

## 配套执行清单

如需直接进入实施，可继续参考：

- `docs/phases/phase-5-bounded-auto-remediation-checklist.zh-CN.md`
