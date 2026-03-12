# State + Locator + Action 主链路加固计划（中文版）

## 背景

在当前项目中，最高频、最值得持续优化的一条主链路是：

1. `get_screen_summary` / `get_session_state`
2. `query_ui` / `resolve_ui_target` / `scroll_and_resolve_ui_target`
3. `perform_action_with_evidence`

这条链路决定了 AI 在移动端 E2E 场景下能否：

- 正确理解当前页面状态
- 稳定定位目标元素
- 解释动作失败原因并做有边界的恢复

---

## 本轮已完成（Iteration 1）

### State

- `StateSummary` 增加：
  - `stateConfidence`
  - `pageHints`
  - `derivedSignals`
- `AppPhase` 增加更细语义：
  - `authentication`
  - `catalog`
  - `detail`
  - `empty`
- `buildStateSummaryFromSignals` 现在会结合：
  - UI 可见文本 / action 候选
  - log / crash 线索
  - interruption / network / empty-state 信号

### Locator

- `InspectUiMatch` 增加：
  - `matchQuality`
  - `scoreBreakdown`
- `queryUiNodes` 增加更细的打分与排序：
  - exact / prefix / substring 匹配
  - disabled penalty
  - clickable / readable bonus
- `UiTargetResolution` 增加：
  - `bestCandidate`
  - `ambiguityReason`
  - `disabled_match` 状态

### Action

- `ActionOutcomeSummary` 增加：
  - `targetQuality`
  - `failureCategory`
- `PerformActionWithEvidenceData` 增加：
  - `actionabilityReview`
- `performActionWithEvidenceWithMaestro` 现在能更明确区分：
  - `unsupported`
  - `selector_missing`
  - `selector_ambiguous`
  - `blocked`
  - `waiting`
  - `no_state_change`
  - `transport`

---

## 本轮验证结果

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（99 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（134 tests）
- `pnpm test:ci` 通过
- `pnpm run validate:phase3-samples` 通过

---

## 后续已完成（Iteration 2 - Action/Remediation）

- `perform_action_with_auto_remediation` 开始直接消费：
  - `failureCategory`
  - `targetQuality`
  - `actionabilityReview`
- 对以下高频失败场景新增 metadata-driven stop / shortcut：
  - `selector_missing`
  - `selector_ambiguous`
  - `blocked_by_state`
  - `low_target_quality`
- `waiting` 类型失败现在会直接走受限 `recover_to_known_state` 快捷路径，不再总是先 explain/rank 一轮
- `packages/mcp-server/test/auto-remediation.test.ts` 已补：
  - selector missing short-circuit
  - selector ambiguous short-circuit
  - waiting-state direct recovery

### Iteration 2 验证

- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（137 tests）

---

## 后续已完成（Iteration 3 - Locator/State）

- `queryUiNodes` 增加 viewport-aware ranking：
  - `isOffScreen`
  - `viewportOverlapPercent`
  - `distanceToViewportCenter`
- `buildUiTargetResolution` 增加：
  - `off_screen` 状态
  - `ambiguityDiff`
- `diffAmbiguousCandidates` 现在会返回候选差异和建议 selector
- `get_session_state` 现在会返回：
  - `latestKnownStateDelta`
- `perform_action_with_evidence` 的 `actionabilityReview` 现在会纳入：
  - `stale_state_candidate:*`

## 后续已完成（Iteration 4 - Scroll-aware Locator）

- `scroll_and_resolve_ui_target` 现在开始真正消费 `off_screen` 状态：
  - 不再把 off-screen 直接当作终态 partial 返回
  - 会继续滚动，直到目标进入视口或触达 `maxSwipes`
- 当 `maxSwipes` 用尽且目标始终在视口外时，会返回更明确的 off-screen 定向建议
- 新增测试覆盖：
  - `buildResolutionNextSuggestions("off_screen")`

### Iteration 4 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（105 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

### Iteration 3 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（104 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 下一轮最值得继续做的任务

### 1. State（下一轮）

- 让 `get_screen_summary` 对 loading / error / interruption 的分类更少依赖关键词，更依赖结构化 UI 模式
- 增加 route / screen kind 识别
- 让状态分类和 bounded remediation stop reason 更直接联动

### 2. Locator（下一轮）

- 为 ambiguity 返回更明确的“为什么这些候选打平”
- 区分 off-screen candidate 与 truly missing target
- 把 scroll 后的候选演化过程结构化输出
- 引入更强的 text/content-desc/resource-id 优先级策略

### 3. Action（下一轮）

- 明确 no-op 的不同成因（wrong selector / blocked / app ignored action）
- 在 action precondition 里更主动利用 state 信息
- 继续把 `actionabilityReview` 扩成更稳定的 stop taxonomy
- 让 explain/rank/remediation 结果和新的 `failureCategory / targetQuality` 进一步对齐

### 4. Locator（下一轮补充）

- 在 ambiguity diff 上增加更结构化的 score / selector建议输出
- 引入 overlap / obscured / leaf-node bias

### 5. Stale-state（下一轮）

- 增加节点级 staleness snapshot / checksum
- 在 tap/type 之前做轻量 stale 检查
- 当 post-action 无变化时尝试刷新目标并重新判定 stale-state

---

## 建议推进顺序

1. State iteration 2
2. Locator iteration 2
3. Action + auto-remediation iteration 2

当前判断：这条主链已经从“可用 baseline”进入了 **structured hardening in progress** 阶段。
