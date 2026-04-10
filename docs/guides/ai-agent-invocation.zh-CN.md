# AI Agent Invocation Guide（mobile-e2e-mcp）

这份文档是 **AI Agent / MCP client 集成方的调用真相源**。

它只回答一类问题：

1. 什么时候先调用哪个工具；
2. 默认应该如何串联 session / action / evidence / recovery；
3. 出现失败、中断、歧义时如何分流；
4. 哪些调用方式应该优先，哪些属于 fallback 或反模式。

> 这不是完整工具目录，也不是架构总览。
>
> - 工具注册与签名真相源：`packages/mcp-server/src/server.ts`
> - 契约与类型真相源：`packages/contracts/src/*`
> - 首跑前门闭环：[`golden-path.md`](./golden-path.md)
> - 录制 / 导出 / 回放专题：[`flow-generation.md`](./flow-generation.md)

## 1. 默认调用原则

### 1.1 Deterministic-first

默认优先级始终是：

1. 稳定 selector / UI 树定位
2. 结构化 session 上下文
3. 有边界 action + evidence
4. 失败归因 / 恢复
5. 更重的 diagnostics

不要把 OCR / CV / 坐标点击 / 全量诊断当作默认入口。

### 1.2 Session-first for write actions

凡是会改动设备、应用或 UI 状态的工具，优先放在同一个 `sessionId` 下执行。

最低推荐顺序：

`doctor -> describe_capabilities -> start_session -> action tools -> failure/recovery tools -> end_session`

### 1.3 Outcome-first, not transport-first

对 AI Agent 来说，**命令发出** 不等于 **目标达成**。

优先使用能返回结构化 outcome、`reasonCode`、`artifacts`、`nextSuggestions` 的链路，而不是只看某个底层命令有没有发出去。

## 2. 默认决策阶梯

### Step 1：确认环境与平台边界

优先工具：

- `doctor`
- `describe_capabilities`
- `list_devices`（需要枚举目标设备时）

### Step 2：建立会话上下文

优先工具：

- `start_session`
- `get_session_state`（已有 session 时）

### Step 3：优先走确定性 UI 感知与定位

优先工具：

- `get_screen_summary`
- `inspect_ui`
- `query_ui`
- `resolve_ui_target`
- `wait_for_ui`

建议顺序：先确认当前页面是否 ready / blocked，再定位目标元素，最后执行动作。

### Step 4：执行有边界动作

优先工具：

- `tap_element`
- `type_into_element`
- `scroll_and_tap_element`
- `perform_action_with_evidence`
- `execute_intent`
- `complete_task`

默认建议：

- 单个关键动作、需要前后证据时，优先 `perform_action_with_evidence`
- 高层 goal 明确、希望让系统规划 bounded action 时，优先 `execute_intent`
- 多步但边界清楚的任务，优先 `complete_task`
- 仅执行一个低层确定性动作时，再直接用 `tap_element` / `type_into_element`

### Step 5：失败后先归因，再恢复，再升级诊断

优先顺序：

1. `explain_last_failure`
2. `rank_failure_candidates`
3. `suggest_known_remediation`
4. `recover_to_known_state` / `resolve_interruption` / `resume_interrupted_action`
5. `collect_debug_evidence`
6. `get_logs` / `get_crash_signals`
7. `collect_diagnostics`

原则：先拿 **AI 可消费摘要**，再拿更重原始证据。

补充：`suggest_known_remediation` 现在会在本地 failure memory / baseline 之外，默认给出一层 **readiness-skill 路由式建议**，包括：

- `route`：推荐先走 baseline / Android / iOS 哪条 readiness 诊断链
- `mostLikelyGap`：当前最可能的 contract / readiness 缺口
- `askForNext`：下一步最值得补的证据
- `firstFix`：先改哪一层，而不是先加 retry
- `handoffSkill`：当 contract gap 已明确时，应该切到哪个实现型 skill

## 3. 常见意图 → 推荐工具链

### 3.1 确认环境是否可跑

`doctor -> describe_capabilities -> list_devices`

### 3.2 启动一次可审计执行

`start_session -> launch_app -> get_screen_summary`

### 3.3 找元素并点击

`wait_for_ui -> resolve_ui_target -> tap_element`

如果目标可能在滚动容器中：

`scroll_only -> wait_for_ui -> resolve_ui_target`

如果你已经确认"滚动直到目标出现并立即点击"更适合当前场景：

- **Android**: `scroll_and_resolve_ui_target` / `scroll_and_tap_element`
- **iOS**: 不支持 `scroll_and_resolve_ui_target` / `scroll_and_tap_element`。请使用 `scroll_only → wait_for_ui → resolve_ui_target → tap_element` 分步组合。

### 3.4 对表单或输入框填值

`wait_for_ui -> type_into_element`

仅当焦点已明确、且没有更好的 selector 时，才考虑 `type_text`。

### 3.5 执行关键动作并拿到可解释证据

`perform_action_with_evidence`

### 3.6 让系统帮你规划高层目标

- `execute_intent`：单个高层意图
- `complete_task`：多步有限任务

### 3.7 处理失败或 flaky 行为

`explain_last_failure -> rank_failure_candidates -> suggest_known_remediation`

推荐理解：

- `explain_last_failure` = 先看失败归因
- `rank_failure_candidates` = 再看最可疑层
- `suggest_known_remediation` = 默认给出 **skill-guided 下一步动作**，把问题分流到 baseline / Android / iOS readiness 逻辑，再决定是否切到实现型 skill

如果怀疑是重复模式：

- `find_similar_failures`
- `compare_against_baseline`

### 3.8 处理中断

`detect_interruption -> classify_interruption -> resolve_interruption -> resume_interrupted_action`

如果只是想回到可继续执行状态：

- `recover_to_known_state`

### 3.9 处理 OTP / 验证码 / 受保护页面

`get_screen_summary -> get_session_state -> request_manual_handoff`

建议分流：

- 当 `screenSummary.manualHandoff.required=true` 时，不要继续假装全自动完成；
- 如果是通过 `perform_action_with_evidence` 触达到 OTP / 验证码页，结果现在会显式返回：
  - `reasonCode=MANUAL_HANDOFF_REQUIRED`
  - `retryRecommendationTier=handoff_required`
  - 开启 `autoRemediate` 时，`autoRemediation.stopReason=manual_handoff_required`
- 对 OTP / 验证码 / 人机挑战，调用 `request_manual_handoff` 把人工接管点写入 session timeline；
- 人工完成后，再重新调用 `get_screen_summary` 或 `get_session_state` 确认页面是否已退出受保护边界。

### 3.10 录制、导出与回放

这条链路只在专题文档维护：[`flow-generation.md`](./flow-generation.md)

当前迁移状态：

- `run_flow` 已支持对导出的 recorded flow 执行 **step-aware dry-run preview**
- 该 preview 会返回 `executionMode`、`replayProgress`、`stepOutcomes`
- 其余 replay 路径当前仍以 `runner_compat` 为主，不应被描述成已全部迁移完成

### 3.11 抓 React Native / Expo JS 调试信号

`list_js_debug_targets -> capture_js_console_logs` 或 `capture_js_network_events`

## 4. 推荐工具 vs fallback 工具

### 4.1 交互类

优先：

- `tap_element`
- `type_into_element`

滚动辅助（Android only）：

- `scroll_and_resolve_ui_target` — Android-only
- `scroll_and_tap_element` — Android-only
- iOS 回退：`scroll_only → wait_for_ui → resolve_ui_target → tap_element`

后备：

- `tap`
- `type_text`

### 4.2 感知类

优先：

- `get_screen_summary`
- `query_ui`
- `resolve_ui_target`
- `wait_for_ui`

后备：重度日志与诊断工具。

### 4.3 调试类

优先：

- `perform_action_with_evidence`
- `explain_last_failure`
- `collect_debug_evidence`

后备：`collect_diagnostics`

## 5. Session 规则

### 5.1 什么时候必须显式传 `sessionId`

以下情况建议显式传：

- 已经存在多个活动会话
- 执行 write / diagnostics / recovery 类工具
- 想确保动作绑定到特定设备 / app / profile

### 5.2 不传 `sessionId` 会发生什么

当前仓库支持一定程度的隐式会话解析，但它不是推荐默认路径：

- 只有一个活动会话时，工具可能自动绑定该会话
- 同时有多个活动会话时，可能返回歧义错误

所以对 AI Agent 来说，**显式 `sessionId` 比猜测更可靠**。

### 5.3 同设备互斥，多设备可并发

执行模型可以理解为：

- 同一个 `platform + deviceId` 的写操作互斥
- 不同设备可并行

## 6. 常见失败分流

### 6.1 目标元素找不到

`get_screen_summary -> wait_for_ui -> query_ui -> resolve_ui_target`

### 6.2 目标元素不唯一 / 存在歧义

`query_ui -> resolve_ui_target`

不要在歧义未消除时直接点击。

### 6.3 动作执行了，但目标状态没变化

`perform_action_with_evidence -> explain_last_failure`

### 6.4 怀疑是中断或系统弹窗

`detect_interruption -> classify_interruption -> resolve_interruption`

### 6.5 怀疑 app 崩溃 / ANR / runtime 级异常

`get_crash_signals -> collect_debug_evidence -> get_logs`

必要时再升级到 `collect_diagnostics`。

## 7. 反模式

- 不要默认坐标点击；`tap` 是低层 fallback
- 不要默认焦点输入；优先 `type_into_element`
- 不要跳过 session 做长链路任务
- 不要一失败就抓最重 diagnostics
- 不要把 transport success 当成 business success
- 不要假设 Android / iOS / simulator / real device 完全对称

## 8. 与其它文档的关系

- 想快速首跑闭环：看 [`golden-path.md`](./golden-path.md)
- 想做录制、导出、回放：看 [`flow-generation.md`](./flow-generation.md)
- 想看 demo 证据与复现素材：看 `docs/showcase/README.md`
- 想确认架构边界与支持范围：看 `README.md`、`docs/architecture/*`

如果你只记住一句话：

> 先确认 readiness 与 capability，再建立 session；优先确定性定位与结构化 evidence，失败后先归因和恢复，最后才升级重诊断。
