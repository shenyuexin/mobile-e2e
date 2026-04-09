# Android Tool Probe Checklist

> 从临时路径 `/tmp/TOOL-VERIFICATION-TEMP-CHECKLIST.md` 迁移到仓库内，作为 `scripts/dev/android-tool-probe.ts` 的默认 checklist 源。

## 设备与会话

- 设备: Vivo V2405A (`10AEA40Z3Y000R5`), Android 16
- 会话: 每次探针执行使用新 `sessionId`

## 已验证能力（历史）

| 工具 | 状态 | 备注 |
|------|------|------|
| tap_element (Wi-Fi) | ✅ success | exitCode: 0 |
| inspect_ui | ✅ success | 110 nodes, 24 clickable |
| get_screen_summary | ✅ success | appPhase 不再误判 crashed |
| execute_intent (修复前问题) | ✅ 修复后可用 | ANR 过滤生效 |
| describe_capabilities | ✅ success | conditional 字段完整 |
| list_devices | ✅ success | |
| start_session / end_session | ✅ success | |
| get_logs | ✅ success | |
| take_screenshot | ✅ success | |
| tap (坐标) | ✅ success | |
| type_text | ✅ success | |
| record_screen | ✅ success | |
| start_record_session | ✅ success | |
| end_record_session | ✅ success | |
| cancel_record_session | ✅ success | |
| doctor | ✅ partial | 设备检查完整 |
| detect_interruption | ✅ partial | 无中断=正确 |
| measure_android_performance | ✅ success | Perfetto |
| export_session_flow | ✅ 正确失败 | 无数据场景 |
| record_task_flow | ✅ 正确失败 | 无数据场景 |
| get_action_outcome | ✅ 正确行为 | 无 actionId 时 found:false |
| suggest_known_remediation | ✅ 正确行为 | 无失败上下文 |
| list_js_debug_targets | ✅ 正确行为 | 无 Metro 时 targetCount:0 |
| install_app (dryRun) | ✅ partial | 无 APK 时正确 |
| terminate_app | ✅ success | |
| reset_app_state | ✅ 正确行为 | 系统 app clear_data 失败=预期 |

## Core Probe Scope（默认跑）

这些工具构成 Android probe 的默认集合，目标是覆盖真机工具面主路径，而不是穷举所有 60+ 工具。

### Session / lifecycle

- start_session
- launch_app
- end_session

### UI inspect / action / orchestration

- wait_for_ui
- resolve_ui_target
- scroll_and_resolve_ui_target
- tap_element
- type_into_element
- execute_intent
- perform_action_with_evidence
- complete_task

### Recovery / diagnosis

- recover_to_known_state
- replay_last_stable_path
- explain_last_failure
- find_similar_failures
- rank_failure_candidates
- compare_against_baseline
- resume_interrupted_action

### Flow / integration

- run_flow

### 最新 Vivo 真机结果（run: `android-tool-probe-1775700510315`）

证据：

- `artifacts/android-tool-probe/android-tool-probe-1775700510315/report.json`
- `artifacts/android-tool-probe/android-tool-probe-1775700510315/summary.md`
- `reports/android-tool-probe.json`

汇总：`success=7 / partial=4 / failed=11`

| Tool | Result | Reason | Notes |
|---|---|---|---|
| start_session | ✅ success | OK | 通过 |
| launch_app | ❌ failed | ADAPTER_ERROR | Settings 启动链路仍不稳 |
| wait_for_ui | ⚠️ partial | TIMEOUT | Wi-Fi 文案等待超时 |
| resolve_ui_target | ⚠️ partial | NO_MATCH | 蓝牙文本未命中 |
| scroll_and_resolve_ui_target | ❌ failed | ADAPTER_ERROR | 滚动 + UI dump 失败 |
| tap_element | ❌ failed | ADAPTER_ERROR | 搜索入口解析失败 |
| type_into_element | ❌ failed | ADAPTER_ERROR | 输入框解析失败 |
| execute_intent | ❌ failed | OCR_NO_MATCH | OCR fallback 未命中 |
| perform_action_with_evidence | ❌ failed | OCR_AMBIGUOUS_TARGET | OCR 命中不唯一 |
| complete_task | ❌ failed | OCR_NO_MATCH | 多步任务失败 |
| recover_to_known_state | ✅ success | OK | 通过 |
| replay_last_stable_path | ❌ failed | CHECKPOINT_UNAVAILABLE | 无可重放 checkpoint |
| explain_last_failure | ✅ success | OK | 通过 |
| find_similar_failures | ✅ success | OK | 通过 |
| rank_failure_candidates | ✅ success | OK | 通过 |
| compare_against_baseline | ✅ success | OK | 本轮已通过 |
| resume_interrupted_action | ⚠️ partial | TIMEOUT | 恢复后未稳定 |
| run_flow | ⚠️ partial | UNSUPPORTED_OPERATION | `phase1` profile 仍受限 |

### 当前核心阻塞归类

1. **OEM / Settings UI 不稳定**
   - `wait_for_ui`, `resolve_ui_target`, `tap_element`, `type_into_element`
2. **UI dump / adapter 侧不稳定**
   - `launch_app`, `scroll_and_resolve_ui_target`
3. **OCR fallback 不足以支撑真实 UI intent 链**
   - `execute_intent`, `perform_action_with_evidence`, `complete_task`
4. **历史依赖未满足**
   - `replay_last_stable_path`
5. **runnerProfile 约束**
   - `run_flow`

## Conditional Probe Scope（按前置条件启用）

### 需要 Metro / JS debug target

- list_js_debug_targets
- capture_js_console_logs
- capture_js_network_events

### 需要录制上下文或有效流数据

- start_record_session
- get_record_session_status
- end_record_session
- cancel_record_session
- export_session_flow
- record_task_flow

### 需要明确 failure / action history / baseline 前置

- get_action_outcome
- suggest_known_remediation

### 需要特定环境或设备能力

- doctor
- detect_interruption
- classify_interruption
- resolve_interruption
- measure_android_performance
- collect_diagnostics
- collect_debug_evidence
- get_logs
- get_crash_signals
- record_screen
- take_screenshot
- probe_network_readiness

## Out-of-scope for Android Probe（不纳入 Android probe 默认验收）

### 非 Android 平台或平台不适用

- measure_ios_performance

### 更适合 sample acceptance lane 的能力

- inspect_ui
- query_ui
- scroll_and_tap_element
- tap
- type_text
- install_app
- terminate_app
- reset_app_state
- validate_flow
- request_manual_handoff
- replay_checkpoint_chain
- describe_capabilities
- list_devices
- get_screen_summary
- get_session_state
- capture_element_screenshot
- compare_visual_baseline

## 脚本入口

- 正式入口: `pnpm validate:android-tool-probe`
- 兼容入口: `pnpm exec tsx tmp-tool-verification.ts`
