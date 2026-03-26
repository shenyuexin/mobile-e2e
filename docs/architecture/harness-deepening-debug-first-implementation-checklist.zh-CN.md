# Harness Deepening Debug-first Implementation Checklist

本清单是以下文档的执行配套：

- `docs/architecture/harness-deepening-debug-first-strategy.zh-CN.md`
- `docs/architecture/orchestration-robustness-strategy.md`
- `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md`

用途：把 “debug/evidence -> attribution -> recovery -> replay -> stop” 的 harness spine 深化方向，拆成可分 milestone 落地、可验证、可回滚的执行项。

---

## 0) 目标与完成定义

### In scope

- 强化 action outcome proof，避免把 transport success 误判为 flow success
- 建立更稳定的 diagnosis packet，让 debug 直接服务于下一步决策
- 升级本地 session memory / baseline hooks，增强 repeated failure、checkpoint、replay 判断质量
- 为后续 recovery state-machine 深化打下 contracts / evidence / session 基线
- 建立与上述行为对应的验证场景和 doc-sync 规则

### Out of scope

- 新增大批工具或扩展新的工具家族
- debugger-grade 人类 UI 或大规模可视化调试面板
- 动态网络 fault injection / chaos 作为当前阶段主线
- 扩大平台宣传边界而不补足验证成熟度
- unbounded self-healing

### Done when all are true

- [ ] `perform_action_with_evidence` 相关结果能区分 transport success 与真实 flow progress。
- [ ] 失败后能输出结构化 diagnosis packet，而不依赖先读完整原始日志。
- [ ] session memory / baseline hooks 能支持更可信的 similar failure、checkpoint 分叉、replay value 判断。
- [ ] recovery follow-on 改动已有稳定 contract/evidence 基线，不需要再返工 outcome/debug/memory 语义。
- [ ] 文档、support boundary、验证链保持与真实实现一致。

### Required evidence artifacts

- [ ] 新增或扩展后的 contract 字段
- [ ] reason code / trace / evidence packet 语义
- [ ] 对应测试或场景覆盖
- [ ] 验证命令输出记录

---

## 1) Milestone Order

### M1. Outcome-proof contract baseline

#### Tasks
- [ ] 先为 outcome-proof 相关语义补 failing tests。
- [ ] 明确 action outcome 中哪些字段负责表达真实推进，而不是仅表达执行成功。
- [ ] 为 outcome proof 增加最小必要 contract 字段，例如 postcondition status、state-change category、state-change confidence、progress marker。
- [ ] 如有必要，补充 reason codes 或 trace 字段，保证 stop / retry / recover 判断能被结构化解释。
- [ ] 保持 deterministic-first 语义，不通过新增模糊 fallback 来掩盖 outcome proof 不足。

#### Target files
- [ ] `packages/contracts/src/types.ts`
- [ ] `packages/contracts/src/reason-codes.ts`
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
- [ ] `packages/adapter-maestro/src/action-orchestrator-model.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`

#### First scenarios
- [ ] `transport-success-but-no-progress`
- [ ] `partial-progress-without-postcondition`
- [ ] `target-visible-but-not-actionable`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`

#### Evidence
- [ ] 新字段能区分 full / partial / none / ambiguous progress
- [ ] tool result 中可见 progress / postcondition 相关语义

---

### M2. Diagnosis packet baseline

#### Tasks
- [ ] 先为 diagnosis packet 输出补 failing tests。
- [ ] 把当前 debug evidence 聚合收敛为更稳定的 diagnosis packet。
- [ ] 明确最强 suspect layer、最强 causal signal、confidence、recommended next probe、recommended recovery、escalation threshold 的字段边界。
- [ ] 确保 diagnosis packet 以 machine-consumable 形式输出，而不是 prose-only。
- [ ] 保持原始 artifacts 可追溯，但不要求 agent 先阅读全量原始内容。

#### Target files
- [ ] `packages/contracts/src/types.ts`
- [ ] `packages/adapter-maestro/src/diagnostics-tools.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`
- [ ] `packages/adapter-maestro/src/session-state.ts`

#### First scenarios
- [ ] `native-log-dominant-failure`
- [ ] `js-exception-dominant-failure`
- [ ] `network-suspect-but-not-terminal`
- [ ] `ambiguous-signals-require-escalation`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`

#### Evidence
- [ ] diagnosis packet 字段存在且稳定
- [ ] strongest suspect / confidence / next probe 可在结果中直接读取
- [ ] escalation 条件能解释何时升级到更重 diagnostics

---

### M3. Session memory and baseline hooks

#### Tasks
- [ ] 先为 repeated failure / checkpoint 分叉相关行为补 failing tests。
- [ ] 将轻量 failure index 升级为更有操作价值的本地 causal index。
- [ ] 至少记录 actionId、screenId、readiness transition、interruption/recovery event、fallback used、evidence delta、baseline relation、checkpoint status。
- [ ] 明确 baseline compare 不再只依赖 action type + screen 粗粒度组合。
- [ ] 确保本地持久化仍保持 file-based、可审计、可回滚。

#### Target files
- [ ] `packages/core/src/failure-memory-store.ts`
- [ ] `packages/core/src/session-store.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`

#### First scenarios
- [ ] `repeat-failure-same-signature-different-state`
- [ ] `last-known-good-checkpoint-divergence`
- [ ] `baseline-match-low-replay-value`
- [ ] `baseline-mismatch-high-drift-signal`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`

#### Evidence
- [ ] similar failure 判断不再只基于浅层签名
- [ ] baseline compare 能解释“为什么偏离成功路径”
- [ ] replay value / checkpoint divergence 有结构化输出

---

### M4. Recovery state-machine follow-on

#### Tasks
- [ ] 基于 M1-M3 的 contract/evidence 基线，再推进 recovery state-machine。
- [ ] 明确 `ready_to_execute`、`recoverable_waiting`、`partial_progress`、`checkpoint_candidate`、`replay_recommended`、`terminal_stop` 等状态在运行时如何进入与退出。
- [ ] 将 wait / retry / recover / replay / stop 选择建立在 outcome proof + diagnosis packet + memory/baseline hooks 之上。
- [ ] 保持 recovery 有界、可解释、policy-safe，拒绝 blind retry。

#### Target files
- [ ] `packages/adapter-maestro/src/recovery-tools.ts`
- [ ] `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
- [ ] `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md`（仅在行为真正落地后同步）

#### First scenarios
- [ ] `retry-allowed-with-strong-state-change-evidence`
- [ ] `retry-refused-no-meaningful-state-change`
- [ ] `replay-recommended-after-checkpoint-divergence`
- [ ] `terminal-stop-after-bounded-recovery-exhausted`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`

#### Evidence
- [ ] recovery decision 可解释且有 trace
- [ ] stop boundary 明确且可审计
- [ ] replay / retry 选择不再依赖单点 heuristic

---

### M5. Validation lanes and doc-sync

#### Tasks
- [ ] 为 outcome proof / diagnosis packet / memory / recovery 建立最小但可信的验证覆盖。
- [ ] 对高频真实场景补 showcase 或 reproducible validation，仅在行为成熟后升级 support wording。
- [ ] 保持 README / docs / capability boundary 只描述已实现且已验证的能力。

#### Target files
- [ ] 相关 adapter/server test files
- [ ] `tests/README.md`（如验证边界描述变化）
- [ ] `docs/showcase/*`（仅在新增可复现实证时）
- [ ] `docs/architecture/harness-deepening-debug-first-strategy.zh-CN.md`（仅在 strategy 需要同步状态时）

#### First scenarios
- [ ] `success-after-bounded-recovery`
- [ ] `safe-stop-after-no-progress`
- [ ] `interruption-resolved-but-state-drifted`
- [ ] `network-wait-vs-terminal-stop`

#### Verification
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:smoke`
- [ ] `pnpm test:ci`

#### Evidence
- [ ] support-boundary 文案未超前
- [ ] showcase / tests / docs 三者保持一致

---

## 2) File-Level Change Map

### Contracts
- [ ] `packages/contracts/src/types.ts`
- [ ] `packages/contracts/src/reason-codes.ts`

### Core
- [ ] `packages/core/src/failure-memory-store.ts`
- [ ] `packages/core/src/session-store.ts`

### Adapter runtime
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
- [ ] `packages/adapter-maestro/src/action-orchestrator-model.ts`
- [ ] `packages/adapter-maestro/src/action-outcome.ts`
- [ ] `packages/adapter-maestro/src/diagnostics-tools.ts`
- [ ] `packages/adapter-maestro/src/session-state.ts`
- [ ] `packages/adapter-maestro/src/recovery-tools.ts`

### MCP server
- [ ] `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`
- [ ] 仅在 tool result shaping 变化时补充相关 wrapper

### Tests
- [ ] adapter tests
- [ ] server/tool tests
- [ ] smoke/CI layers where support boundaries are affected

### Docs
- [ ] `docs/architecture/harness-deepening-debug-first-strategy.zh-CN.md`
- [ ] `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md`
- [ ] `docs/README.md` 或其他导航文档（仅在导航变化时）

---

## 3) 风险与回滚

### Main risks

- [ ] 在 M1-M3 未稳定前过早推进 recovery state-machine，导致 contracts/core/adapter/server 同时发散。
- [ ] diagnosis packet 退化成 prose summary，而不是 machine-consumable 结构。
- [ ] session memory 变重，但没有带来 baseline / replay / remediation 质量提升。
- [ ] support boundary 文案先于验证成熟度升级。

### Rollback rule

- [ ] 每个 milestone 必须可以单独回滚。
- [ ] 如果当前 milestone 未通过验证，不得叠加后续 milestone 逻辑“顺便修”。
- [ ] 保持 deterministic-first、policy-safe、auditable 为不可回退底线。

---

## 4) Execution Order

- [ ] M1 是后续工作的 contract baseline。
- [ ] M2 依赖 M1 outcome-proof 语义稳定。
- [ ] M3 依赖 M1/M2 提供足够稳定的 evidence 字段。
- [ ] M4 必须建立在 M1-M3 已落地且验证通过的前提上。
- [ ] M5 在实际行为成熟后进行验证扩展与 doc-sync。

每个 milestone 应足够小，能拆成独立 reviewable PR，而不是一次跨越 contracts/core/adapter/server 的大波次改动。

---

## Exit Criteria

- [ ] 仓库可以更清晰地区分 action executed 与 flow progressed。
- [ ] failure packet 能直接支持下一步决策，而不是只做事后阅读材料。
- [ ] repeated failure / baseline drift / replay value 判断更可信。
- [ ] recovery follow-on 具备更稳定的 contract/evidence 基线。
- [ ] debug-first harness deepening 不会被误解为“又新增一批工具”。
