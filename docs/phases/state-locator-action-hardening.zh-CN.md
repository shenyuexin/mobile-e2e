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

---

## 后续已完成（Iteration 5 - Overlap / Leaf Bias）

- `InspectUiNode` 增加：
  - `depth`
- `InspectUiMatch` 增加：
  - `obscuredByHigherRanked`
  - `overlapPercentWithHigherRanked`
- `queryUiNodes` 现在会：
  - 对被高优先级候选显著遮挡的节点降权
  - 对更深层（更像叶子节点）的候选加分
- 新增测试覆盖：
  - overlap / obscured penalty
  - leaf-node bias

### Iteration 5 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（107 tests）
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
- 让 score-aware selector suggestion 直接进入 `nextSuggestions`

### 5. Stale-state（下一轮）

- 增加节点级 staleness snapshot / checksum
- 在 tap/type 之前做轻量 stale 检查
- 当 post-action 无变化时尝试刷新目标并重新判定 stale-state

### 6. Action precondition（下一轮）

- 让 action precondition 更直接消费 locator 质量（off-screen / obscured / low target quality）
- 在 `perform_action_with_evidence` 里更早区分 “应先滚动 / 应先等待 / 应先缩窄 selector”

## 后续已完成（Iteration 6 - Suggestion / Precondition）

- `buildResolutionNextSuggestions` 现在开始输出更细粒度的 score-aware 建议：
  - ambiguous 时包含 top differing fields
  - ambiguous 时返回建议 narrowing selector
  - off-screen 时返回 top candidate resourceId
- `perform_action_with_evidence` 的 failureCategory 现在开始更直接消费 locator resolution：
  - `off_screen` -> 更靠近 selector/state 前置问题
  - `disabled_match` -> 更靠近 blocked 前置问题

### Iteration 6 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（108 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 7 - Post-action Refresh）

- `PerformActionWithEvidenceData` 增加：
  - `postActionRefreshAttempted`
- `perform_action_with_evidence` 现在会在以下场景做一次轻量 post-action refresh：
  - `no_state_change`
  - `transport`
  - 未明确分类但 `stateChanged=false`
- refresh 结果现在会写入：
  - `actionabilityReview`
  - `postActionRefreshAttempted`
- dry-run / unsupported 场景保持诚实，不会强行声明 refresh 已执行

### Iteration 7 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（108 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 8 - Overlap-aware Action Preconditions）

- `perform_action_with_evidence` 现在开始直接消费 overlap / obscured 信号：
  - `failureCategory`
  - `actionabilityReview`
- 当底层 resolution 暗示目标被高优先级候选遮挡时，会更靠近 `blocked` 前置问题，而不是只停留在泛化 selector 失败
- 新增测试覆盖：
  - overlap-aware actionability review hint

### Iteration 8 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（109 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 9 - Ambiguity Score Diff）

- `AmbiguityDiff` 增加：
  - `scoreDelta`
- `buildResolutionNextSuggestions` 现在会在 ambiguous 场景里输出：
  - top differing fields
  - top score delta
  - 建议 narrowing selector
- 这让上层 agent 不只知道“有歧义”，还能知道“为什么 top candidate 更优”

### Iteration 9 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（109 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 10 - Suggestion Expansion）

- `resolve_ui_target` 现在开始把 score-aware resolution guidance 直接写入 `nextSuggestions`
- `tap_element` / `type_into_element` 现在也会携带带 resolution 上下文的建议，而不是只返回通用提示
- `perform_action_with_evidence` 在 no-op / refresh 相关场景下会返回更分层的 retry recommendation

### Iteration 10 验证

- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 11 - Retry Recommendation Tiers）

- `perform_action_with_evidence` 现在会按场景给出更分层的 retry recommendation：
  - selector refinement
  - wait / stabilize first
  - stale-state refresh candidate
  - do not retry blindly
- retry guidance 现在会更直接参考：
  - `failureCategory`
  - `actionabilityReview`
  - `postActionRefreshAttempted`

### Iteration 11 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（109 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 12 - Transport Suggestion Expansion）

- `resolve_ui_target` 的 transport 输出现在会携带更完整的 score-aware suggestion
- `tap_element` / `type_into_element` 的 selector guidance 已在 transport 层保持一致
- `server` / `CLI` / `stdio` 路径对 `perform_action_with_evidence` 的 retry-tier 相关输出已保持一致

### Iteration 12 验证

- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 13 - Retry Tier Transport Surface）

- `PerformActionWithEvidenceData` 的 `retryRecommendationTier` 现在已在 transport 层可见：
  - `server`
  - `CLI`
  - `stdio`
- 上层消费方不再需要仅靠自然语言 `nextSuggestions` 猜测“下一步建议”类别

### Iteration 13 验证

- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 14 - Visibility Heuristics）

- locator ranking 现在开始记录更细的 `visibilityHeuristics`
- 已加入：
  - heavy overlap
  - low viewport visibility
  - occluder score delta
  - occluded by clickable candidate
- 这让 overlap / obscured 信号更接近真实界面可见性，而不是只看单一重叠比例

### Iteration 14 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（110 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 15 - Narrative / Explanation Wiring）

- `get_action_outcome` 现在开始暴露 `retryRecommendationTier`
- `explain_last_failure` 现在开始暴露 `retryRecommendationTier`
- `buildDiagnosisBriefing` 现在开始输出 `Recommended next-action tier`
- 这使得 explanation / narrative 层不再只靠自然语言猜测下一步策略

### Iteration 15 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（110 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 16 - Suggestion Prioritization）

- `explain_last_failure` 的 `nextSuggestions` 现在会做去重并按优先级输出：
  - retry tier
  - recommended recovery
  - recommended next probe
- `rank_failure_candidates` 现在会沿用同一套优先级建议，而不是简单转发
- `suggest_known_remediation` 的 `nextSuggestions` 现在会对 remediation 提示做去重保序

### Iteration 16 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（111 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 17 - Structured Retry Taxonomy）

- `retryRecommendationTier` 之外，新增结构化 `retryRecommendation`：
  - `tier`
  - `reason`
  - `suggestedAction`
- `get_action_outcome` / `explain_last_failure` / diagnosis briefing 现在开始直接消费这份结构化 recommendation
- narrative 层不再只暴露 tier 字符串，而是带原因和建议动作

### Iteration 17 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（111 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）
- `pnpm test:ci` 通过

---

## 后续已完成（Iteration 18 - Action Packet Signal Wiring）

- `perform_action_with_evidence` 的 `actionabilityReview` 现在直接吸收更细粒度的 locator 信号：
  - `target_score_delta:*`
  - `target_suggested_selector:*`
  - `target_visibility:*`
- no-op / stale-state refresh 现在会写入更明确的 packet-level code：
  - `refresh_signal:noop`
  - `retry_tier_code:refresh_context_noop`
  - `retry_tier_code:refresh_context_stale_state`
- `explain_last_failure` 的 `nextSuggestions` 现在会同时消费：
  - `retryRecommendation.suggestedAction`
  - action packet 中的 selector/visibility/refresh code（用于 narrative/explanation）

### Iteration 18 验证

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` 通过（111 tests）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` 通过（138 tests）

---

## Action Packet 信号码（新增）

以下信号码会进入 `actionabilityReview`，供 `perform_action_with_auto_remediation`、`explain_last_failure`、`rank_failure_candidates` 等上层消费：

- Selector / ranking：
  - `target_score_delta:<number>`
  - `target_suggested_selector:<json>`
- Visibility：
  - `target_visibility:<heuristic1,heuristic2,...>`
- Refresh taxonomy：
  - `refresh_signal:noop`
  - `retry_tier_code:refresh_context_noop`
  - `retry_tier_code:refresh_context_stale_state`

说明：`retryRecommendationTier` 仍保持兼容（`refresh_context`），新增 code 用于在 narrative/explanation 层表达更细分语义，而不破坏既有 transport contract。

---

## 示例（perform_action_with_evidence / explain_last_failure）

### 示例 1：selector ambiguous + score-aware guidance

```json
{
  "retryRecommendationTier": "refine_selector",
  "actionabilityReview": [
    "target_resolution:ambiguous",
    "target_match_count:2",
    "target_score_delta:2",
    "target_suggested_selector:{\"resourceId\":\"primary_cta\"}",
    "target_visibility:heavy_overlap:0.85,occluded_by_clickable_candidate"
  ],
  "retryRecommendation": {
    "tier": "refine_selector",
    "reason": "Multiple candidates matched the selector with no clear winner.",
    "suggestedAction": "Narrow the selector using resourceId/contentDesc or the top candidate diff before retrying. Candidate selector: {\"resourceId\":\"primary_cta\"}. Top score delta: 2. Visibility signals: heavy_overlap:0.85,occluded_by_clickable_candidate."
  }
}
```

### 示例 2：post-refresh no-op + packet-level retry tier code

```json
{
  "retryRecommendationTier": "refresh_context",
  "actionabilityReview": [
    "retry_tier_code:refresh_context_noop",
    "refresh_signal:noop",
    "post_action_refresh_no_additional_change",
    "post_state_unchanged"
  ],
  "retryRecommendation": {
    "tier": "refresh_context",
    "reason": "A follow-up refresh produced no additional state change, so blind retry is likely to repeat a no-op.",
    "suggestedAction": "Reacquire selector context, verify expected side effect, then retry only with a stronger target signal."
  }
}
```

### 示例 3：explain_last_failure 输出包含 packet 信号

```json
{
  "nextSuggestions": [
    "Retry tier suggests: refresh_context.",
    "Reacquire selector context, verify expected side effect, then retry only with a stronger target signal.",
    "Action packet refresh retry code: refresh_context_noop.",
    "Action packet selector score delta: 2."
  ]
}
```

---

## 下一轮最值得继续做的任务（更新）

- 把 score-aware selector suggestion 扩展到更多 transport 输出（CLI / stdio / action review narrative）
- 给 no-op / stale-state refresh 增加结构化 retry tier code / taxonomy
- 让 explain/rank/remediation 三者的建议去重并按优先级分层
- 让 action review narrative 继续直接吸收 selector / visibility / refresh 信号
- 让 action review narrative / explain flows 直接吸收 score-aware selector guidance
- 为 no-op / stale-state refresh 增加更结构化的 retry tier code / taxonomy

---

## 建议推进顺序

1. State iteration 2
2. Locator iteration 2
3. Action + auto-remediation iteration 2

当前判断：这条主链已经从“可用 baseline”进入了 **structured hardening in progress** 阶段。
