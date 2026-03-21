# adapter-maestro/index.ts 渐进式拆分实施手册（完整执行版）

> 适用对象：维护 `packages/adapter-maestro`、`packages/mcp-server`、`packages/core` 的贡献者。
>
> 目标：把 `packages/adapter-maestro/src/index.ts` 从巨型编排入口稳定收敛为薄 facade，避免后续 capability 扩展再次劣化为“大文件回流”。

---

## 1. 成功标准（先定义 Done）

当且仅当以下条件全部满足，才算本轮拆分完成：

1. `index.ts` 仅保留 facade 职责（导出/轻组装/薄协调），不再新增平台命令、selector 算法、policy 判定。
2. 核心能力簇落入目标模块边界（session-state / action-orchestrator / interruption-tools / task-planner / action-outcome / doctor-runtime）。
3. 依赖方向保持单向：
   - `runtime/helper` -> `session-state` -> `orchestrator/interruption` -> `planner/outcome/recovery`
   - 任一子模块禁止反向 import `index.ts`。
4. 每个阶段都有独立 commit，且通过最小验证链：
   - `pnpm build`
   - `pnpm typecheck`
   - `pnpm test`
5. 文档与支持边界同步更新（至少更新本手册引用位点 + placement/guideline 对应规则）。

---

## 2. 当前基线（用于对比回归）

建议在每个阶段开始前记录一次文件体量（`wc -l`），作为回归证据。当前关注点：

- `packages/adapter-maestro/src/index.ts`（当前最大热点）
- `packages/adapter-maestro/src/ui-tools.ts`
- `packages/adapter-maestro/src/device-runtime.ts`
- `packages/adapter-maestro/src/recording-runtime.ts`

说明：本手册不强行规定单次 PR 的“绝对行数目标”，而要求**趋势必须持续下降**，禁止“拆分后回流”。

### 2.1 本轮执行基线（2026-03-21）

> 本基线用于 Phase A 的冻结证据，后续每个阶段结束都需要更新对比（至少记录 `index.ts` 的下降趋势）。

| 文件 | 行数基线 |
|---|---:|
| `packages/adapter-maestro/src/index.ts` | 6110 |
| `packages/adapter-maestro/src/ui-tools.ts` | 2197 |
| `packages/adapter-maestro/src/device-runtime.ts` | 929 |
| `packages/adapter-maestro/src/recording-runtime.ts` | 1008 |

### 2.2 本轮冻结约束（Phase A）

在本轮拆分完成前，`packages/adapter-maestro/src/index.ts` 执行以下强约束：

1. 只允许**删减或迁移**低层逻辑，不允许新增平台命令构建、selector 算法、policy 判定、YAML 解析等 helper。
2. 允许的改动仅限 facade 级薄组装：re-export、依赖注入入口、薄协调调用。
3. 任何触达 `index.ts`/`ui-tools.ts`/`device-runtime.ts`/`recording-runtime.ts` 的阶段提交，都必须在 commit 说明中给出“是否发生回流”的明确结论。

---

## 3. 目标模块边界（拆分落点）

### 3.1 `session-state.ts`（基础层）

放置：状态摘要、日志/崩溃信号归纳、session state 生成相关逻辑。

典型函数（按现状映射）：

- `buildLogSummary`
- `buildStateSummaryFromSignals`
- `getScreenSummaryWithMaestro`
- `getSessionStateWithMaestro`
- state-summary 辅助函数（blocking/page hints/confidence/delta 等）

### 3.2 `action-orchestrator.ts`（执行编排核心）

放置：`performActionWithEvidenceWithMaestro`、OCR fallback、执行前后证据编排。

注意：这是高耦合枢纽，建议后置迁移。

### 3.3 `interruption-tools.ts`（中断能力簇）

放置：detect/classify/resolve/resume interruption 的 tool-level orchestration。

约束：依赖 `session-state` 和底层 action dispatch，避免依赖 `task-planner`。

### 3.4 `task-planner.ts`（任务规划层）

放置：`completeTaskWithMaestro`、`executeIntentPlanWithMaestro` 等计划编排。

约束：保持“薄计划层”，不持有低层执行内核。

### 3.5 `action-outcome.ts` + `recovery-tools.ts`（结果分析与恢复分离）

建议拆成两块：

- `action-outcome.ts`：explain/rank/find-similar/compare/suggest 等分析型能力。
- `recovery-tools.ts`：`recoverToKnownState`、`replayLastStablePath` 等主动恢复能力。

原因：分析层与主动执行层混放会放大循环依赖风险。

### 3.6 `doctor-runtime.ts`（环境健康与探测）

放置：doctor checks、runtime preflight、环境探测整合。

约束：与业务编排层解耦，只复用共享执行原语。

---

## 4. 逐步实施计划（按阶段执行，阶段间必须可回滚）

## Phase A：依赖面清点 + 冻结回流

### 目标

在动代码前先锁住“不能新增到 `index.ts` 的内容类型”。

### 步骤

1. 在当前分支记录 4 个关键文件行数基线。
2. 明确本轮拆分范围（只迁移，不改变外部行为语义）。
3. 在 PR 描述中声明：`index.ts` 仅允许删减，不允许新增低层 helper。

### 产出

- 基线数据（PR 描述或变更说明）
- 本阶段 commit（文档/约束类）

### 验收

- 团队对“禁止回流项”有一致口径。

---

## Phase B：先拆低耦合簇（doctor-runtime）

### 目标

优先迁移低耦合、可独立验证模块，降低后续冲突。

### 步骤

1. 从 `index.ts` 提取 doctor/check 相关函数到 `doctor-runtime.ts`。
2. 保持导出签名不变（外部调用路径不改）。
3. `index.ts` 仅保留薄调用与 re-export。

### 验收

- 行为回归测试通过；`index.ts` 体量下降。

---

## Phase C：建立基础层（session-state）

### 目标

先抽“被多个工具复用的状态基础能力”，为后续中断/编排/恢复提供稳定依赖。

### 步骤

1. 提取 state/log/crash summary 纯函数到 `session-state.ts`。
2. 再迁移 `getScreenSummaryWithMaestro`、`getSessionStateWithMaestro`。
3. 保持 `ToolResult` 与 artifacts/nextSuggestions 语义不变。

### 验收

- 上层工具依赖可编译；状态摘要行为无回归。

---

## Phase D：中断能力簇独立（interruption-tools）

### 目标

将 detect/classify/resolve/resume 形成独立能力簇，避免散落在 `index.ts`。

### 步骤

1. 迁移 interruption 工具编排函数到 `interruption-tools.ts`。
2. 中断动作调用统一走低层 dispatch，不从 planner 层绕路。
3. 保持 policy/session/evidence 行为一致。

### 验收

- interruption 流程测试通过；无新增循环依赖。

---

## Phase E：核心编排迁移（action-orchestrator）

### 目标

迁移最高耦合核心 `performActionWithEvidenceWithMaestro` 及 OCR fallback。

### 步骤

1. 将 `performActionWithEvidenceWithMaestro` 与关联 helper 收敛到 `action-orchestrator.ts`。
2. OCR fallback 与测试 hooks 一并迁移，避免跨文件双向依赖。
3. 保持 deterministic-first 与 fallback 显式语义（`fallbackUsed`/reason/confidence）。

### 验收

- action evidence、OCR fallback、interruption guard 回归通过。

---

## Phase F：task-planner 与 outcome/recovery 分层

### 目标

把上层规划、结果分析、主动恢复三类职责彻底分开。

### 步骤

1. 迁移 `completeTaskWithMaestro` / `executeIntentPlanWithMaestro` 到 `task-planner.ts`。
2. 迁移 explain/rank/find-similar/compare/suggest 到 `action-outcome.ts`。
3. 迁移 recover/replay 到 `recovery-tools.ts`（或等价分层文件）。

### 验收

- planner 不依赖低层细节；analysis 与 recovery 无混层。

---

## Phase G：收尾与门禁固化

### 目标

让 `index.ts` 变为稳定 facade，并把防劣化规则写入长期文档入口。

### 步骤

1. 清理 `index.ts` 残留低层 helper，仅保留 exports/薄拼装。
2. 更新 placement/guideline 的反劣化规则（见第 6 节）。
3. 完成最终验证链与阶段总结。

### 验收

- `index.ts` 不再是主要实现承载文件。
- 规则有明确归档位置，后续 PR 可执行。

---

## 5. 每阶段固定验证清单（不可跳过）

每个阶段完成后至少执行：

```bash
pnpm build
pnpm typecheck
pnpm test
```

并补充：

- 受影响 tool 的手工调用验证（至少 1 条成功路径 + 1 条失败/边界路径）
- `index.ts` 与关键文件行数对比

---

## 6. 防劣化治理：规则应写到哪里

结论：**要写两层，不建议只写一个地方。**

1. **仓库级长期原则**：写入
   - `docs/engineering/ai-first-capability-expansion-guideline.md`
   - 目的：定义“为什么不能回流成巨型 orchestrator”的通用规则。

2. **adapter-maestro 专项执行规则**：写入
   - `docs/architecture/adapter-code-placement.md`
   - 目的：给出“放哪里、怎么拆、依赖方向、PR 检查点”的可执行细则。

3. **评审执行入口**：写入
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - 目的：把规则变成每个 PR 的显式检查项，降低文档无人执行的风险。

---

## 7. 推荐 PR 粒度（避免大爆炸）

建议采用“单簇/单阶段一 PR”策略：

- PR-1：doctor-runtime 抽离
- PR-2：session-state 抽离
- PR-3：interruption-tools 抽离
- PR-4：action-orchestrator 抽离
- PR-5：task-planner + outcome/recovery 分层
- PR-6：facade 收尾 + 文档门禁固化

每个 PR 都应满足：

- 行为不变（除明确声明的修复项）
- 验证链全绿
- 文件体量趋势向下

---

## 8. 失败回滚策略

若某阶段出现不可控回归：

1. 回退到上一阶段 commit。
2. 缩小迁移粒度（按函数组而非整簇迁移）。
3. 优先保留“边界正确 + 可验证”的结构，再继续推进。

原则：宁可多几个小 PR，也不要一次性跨多簇导致不可验证。
