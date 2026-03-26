# Harness Deepening Strategy（Debug-first）

## 1. 目的

本文定义当前仓库下一阶段的深挖方向：不是继续扩工具数量，而是把现有能力收束成一个更强的 **mobile E2E harness**。

目标不是“多几个 action/tool”，而是让系统在真实移动端不稳定环境下，能够更稳定地完成以下闭环：

1. 执行动作
2. 判断是否真的推进状态
3. 解释失败原因
4. 选择 wait / retry / recover / replay / stop
5. 以结构化证据支撑下一步决策

---

## 2. 战略判断

### 2.1 当前阶段应优先做“深”，不是做“宽”

仓库已经具备明显的 harness 基础：

- session-oriented execution
- policy-aware tool surface
- deterministic-first + bounded fallback
- evidence-rich action outcome
- interruption detect/classify/resolve/resume
- failure attribution / remediation / replay helpers
- capability boundary modeling
- record/export/replay 基础链路

因此下一阶段的关键问题已经不是：

- “还缺不缺新 tool”
- “是否再补几个平台入口”

而是：

- 现有 execution/evidence/recovery 是否已经形成真正稳定的闭环
- debug/evidence 是否已经足够支撑 agent 做高质量下一步决策
- support boundary 是否能被真实验证支撑

### 2.2 Debug 应该成为主差异点，但必须是“决策型 debug”

下一阶段应把 debug 做成 **causal, decision-driving evidence**，而不是更多原始采集器。

不应只回答：

- 抓到了什么 log
- 有没有 crash
- 有没有 screenshot

而应回答：

- 这个 action 是否真的推进了 flow
- 如果没推进，最可能卡在哪一层
- 当前更适合 wait、retry、recover、replay 还是 stop
- 与上一次成功基线相比，差异发生在哪里
- 当前证据置信度是否足以继续自动化

---

## 3. 当前基线判断

### 3.1 已有优势

当前仓库已经具备真实 harness 特征，而不只是工具集合：

- `packages/contracts/src/types.ts`  
  已有结构化 tool/result/session/evidence contract
- `packages/core/src/policy-engine.ts` / `packages/mcp-server/src/policy-guard.ts`  
  已有 policy-aware 执行边界
- `packages/adapter-maestro/src/action-orchestrator.ts`  
  已有 evidence-driven action path
- `packages/adapter-maestro/src/action-outcome.ts`  
  已有 failure attribution / similar failure / baseline 辅助
- `packages/adapter-maestro/src/session-state.ts`  
  已有 session-level state summary
- `packages/adapter-maestro/src/diagnostics-tools.ts`  
  已有 debug evidence 聚合
- `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`  
  已有 bounded remediation / replay / recovery 初始闭环
- `packages/adapter-maestro/src/capability-model.ts`  
  已有平台支持边界诚实声明

### 3.2 当前主要短板

当前最明显的短板不是“没有 debug”，而是 **debug 还没有成为统一的 orchestration spine**：

1. **action outcome proof 还不够强**
   - 仍有较多 heuristic 成分
   - “transport success” 与 “goal achieved” 的边界还可继续收紧

2. **session memory 还偏轻量**
   - `failure-memory-store.ts` 当前还是轻量本地索引
   - 对 repeated failure / stable checkpoint / last-known-good 的利用仍偏浅

3. **recovery 仍偏 helper 集合**
   - 已有 bounded recovery，但还不是足够明确的状态机
   - retry / wait / replay / stop 的语义还可以更系统

4. **real-run validation 还不够厚**
   - `tests/README.md` 已明确当前 CI 仍偏 no-device / smoke
   - 如果没有更强 real-run lane，support maturity 不宜大幅升级

---

## 4. 核心方向：建立统一的 Harness Spine

下一阶段建议把以下链路收束为核心主脉络：

- `perform_action_with_evidence`
- `get_action_outcome`
- `get_session_state`
- `explain_last_failure`
- `recover_to_known_state`
- `replay_last_stable_path`

要求这条主脉络成为：

- 默认执行路径
- 默认失败解释路径
- 默认恢复决策路径
- 默认停止决策路径

也就是说，未来新增 robustness/debug/recovery 能力，优先增强这条链，而不是横向加更多独立 tool。

---

## 5. Phase 1：Debug-first 深化（最高优先级）

### 5.1 工作项 A：强化 Action Outcome Proof

#### 目标

让系统能更可信地判断“动作是否真的产生了预期推进”。

#### 要解决的问题

当前很多自动化系统最大的问题不是执行失败，而是：

- 动作执行了，但状态没推进
- 页面变了，但不是期望页面
- target 可见了，但不可交互
- 局部发生变化，但 flow 仍未闭合

#### 建议深化点

为 action outcome 增加更强的判断维度：

- postcondition status
- state-change category
- state-change confidence
- progress marker
- target-quality delta
- readiness delta
- fallback impact
- replay-safety note

#### 主要落点

- `packages/contracts/src/types.ts`
- `packages/adapter-maestro/src/action-orchestrator.ts`
- `packages/adapter-maestro/src/action-orchestrator-model.ts`
- `packages/adapter-maestro/src/action-outcome.ts`

#### 验收标准

系统在一次 action 后，必须能结构化回答：

- 是否推进了真实任务状态
- 推进程度是 full / partial / none / ambiguous
- 如果未推进，下一步更偏向 wait / retry / recover / stop 哪一类

### 5.2 工作项 B：把 Debug Evidence 升级为 Causal Evidence

#### 目标

让 debug 信息直接服务于决策，而不是堆原始日志。

#### 要解决的问题

当前 debug 聚合已经有基础，但还可以更进一步形成“因果证据包”。

#### 建议深化点

统一输出以下结构：

- evidence summary
- strongest suspect layer
- strongest causal signal
- confidence
- recommended next probe
- recommended recovery
- escalation threshold

对每次 action 和每次失败，都尽量产出一个更稳定的 **diagnosis packet**。

#### 主要落点

- `packages/adapter-maestro/src/diagnostics-tools.ts`
- `packages/adapter-maestro/src/action-outcome.ts`
- `packages/adapter-maestro/src/session-state.ts`

#### 验收标准

对 agent 来说，不需要先读完整 logs 才知道下一步；系统应先给出：

- 当前最值得看的证据
- 最可能层级
- 为什么不是别的层级
- 什么时候需要升级到更重诊断

### 5.3 工作项 C：升级 Local Session Memory

#### 目标

让系统不只是“记住一个失败”，而是记住一段 flow 的因果上下文。

#### 建议深化点

把 memory 从轻量 failure index 升级为更有操作价值的本地因果索引，至少按以下维度组织：

- actionId
- sessionId
- screenId
- readiness transition
- interruption event
- recovery event
- fallback used
- evidence delta
- baseline relation
- checkpoint status

#### 主要落点

- `packages/core/src/failure-memory-store.ts`
- `packages/core/src/session-store.ts`
- `packages/adapter-maestro/src/action-outcome.ts`

#### 验收标准

系统能够回答：

- 这个失败和以前哪个失败最像
- 上次成功从哪个 checkpoint 之后开始分叉
- 当前是否值得 replay last stable path
- 当前失败更像 locator 问题、state drift、interruption，还是 backend/network

---

## 6. Phase 2：Flow-level Robustness 深化

### 6.1 工作项 D：把 Recovery 提升成显式状态机

#### 目标

从“有几个 recovery helper”升级为“有明确的 bounded recovery semantics”。

#### 需要的状态语义

建议沿现有架构文档继续收敛：

- `ready_to_execute`
- `recoverable_waiting`
- `partial_progress`
- `degraded_but_continue_safe`
- `checkpoint_candidate`
- `replay_recommended`
- `terminal_stop`

#### 主要落点

- `packages/adapter-maestro/src/recovery-tools.ts`
- `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`
- `docs/architecture/bounded-retry-and-state-change-evidence-architecture.md`

#### 验收标准

任何自动恢复行为都必须能明确说明：

- 为什么可以继续
- 为什么选择 wait/recover/replay
- 为什么不是 blind retry
- 在什么条件下必须 stop

### 6.2 工作项 E：强化 Baseline Diff

#### 目标

让 baseline 不只是“动作类型+screen 粗匹配”，而是更强的行为对照。

#### 建议比较维度

- pre/post screen summary
- readiness class
- target quality
- fallback path
- interruption presence
- evidence delta shape
- postcondition satisfaction

#### 主要落点

- `packages/adapter-maestro/src/action-outcome.ts`
- `packages/core/src/failure-memory-store.ts`

#### 验收标准

系统可以更有说服力地说明：

- “这次为什么偏离了以往成功路径”
- “是状态前提不一样，还是动作结果不一样”
- “是否还有 replay value”

### 6.3 工作项 F：建立更可信的 Real-run Validation Lanes

#### 目标

把 robustness/support claim 从文档叙述逐步升级到验证成熟度。

#### 优先验证场景

- interruption + resume with state drift
- waiting_network vs terminal network failure
- partial progress after action
- replay from last stable checkpoint
- selector success but no state change

#### 主要落点

- `.github/workflows/*`
- `tests/README.md`
- `docs/showcase/*`

#### 验收标准

support boundary 升级必须以 demo / reproducible flow / CI lane 为依据，而不是只靠实现存在。

---

## 7. 明确不优先做的事

下一阶段不建议优先投入：

### 7.1 不优先继续扩工具数量

原因：当前不是 surface 不够，而是主闭环不够强。

### 7.2 不优先做更重的人类调试界面

原因：当前最重要的是 machine-consumable diagnosis，不是更漂亮的 debug UI。

### 7.3 不优先做更大范围的平台广度宣传

原因：平台边界仍存在 partial support，应该先加深 robustness 和验证，再升级 support level。

### 7.4 不优先做复杂 fault injection / chaos

原因：在 retry / recovery / stop semantics 还未足够成熟前，过早引入会稀释主线。

---

## 8. 成功标准

如果下一阶段做对了，这个仓库会更明显地从“工具集合”变成“真正的 harness”。

至少应达到以下结果：

1. **每次 action 都有更可信的 outcome proof**
2. **每次 failure 都有更强的 causal evidence**
3. **每次 retry/recovery 都有明确 stop boundary**
4. **session memory 能支持更好的 baseline/replay/remediation**
5. **README / capability claims 与验证成熟度保持一致**

---

## 9. 一句话结论

下一阶段最值得做的，不是新增更多 action，而是把 **debug/evidence -> attribution -> recovery -> replay -> stop** 做成真正统一的 harness spine。

这会比继续扩 feature breadth 更能建立这个项目的长期护城河。
