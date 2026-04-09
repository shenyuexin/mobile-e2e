# iOS Tool Probe Checklist

> 用于 `scripts/dev/ios-tool-probe.ts` 的默认 checklist 源。定位是 probe-only，不替代正式 acceptance。

## 设备与会话

- 默认真机: `yx’s iPhone12` (`00008101-000D482C1E78001E`)
- 平台: iOS physical device
- 会话: 每次探针执行使用新 `sessionId`

## 目标

验证 iOS 真机 MCP 工具面是否可调用、返回结构是否完整、reasonCode 是否可解释、证据与报告是否稳定落盘。

## Core Probe Scope（默认跑）

这些工具构成 iOS 真机 probe 的默认集合，优先覆盖真机可调用主路径与诊断链路，不等于全量工具穷举。

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

## Conditional Probe Scope（按前置条件启用）

### 需要 Metro / JS debug target

- list_js_debug_targets
- capture_js_console_logs
- capture_js_network_events

### 需要录制上下文或可导出流数据

- start_record_session
- get_record_session_status
- end_record_session
- cancel_record_session
- export_session_flow
- record_task_flow

### 需要真机 WDA / hierarchy / entitlement 稳定前置

- inspect_ui
- query_ui
- tap
- type_text
- scroll_and_tap_element
- get_screen_summary
- get_session_state
- take_screenshot
- record_screen
- collect_diagnostics
- collect_debug_evidence
- get_logs
- get_crash_signals
- detect_interruption
- classify_interruption
- resolve_interruption
- measure_ios_performance
- probe_network_readiness

### 需要 baseline / failure / conditional environment

- get_action_outcome
- suggest_known_remediation
- capture_element_screenshot
- compare_visual_baseline

## Out-of-scope for iOS Probe（不纳入 iOS probe 默认验收）

### 非 iOS 平台或平台不适用

- measure_android_performance

### 更适合 sample acceptance lane 或设备准备流程的能力

- install_app
- terminate_app
- reset_app_state
- validate_flow
- request_manual_handoff
- replay_checkpoint_chain
- describe_capabilities
- list_devices

## 默认设置

- runnerProfile: `native_ios`
- appId: `com.apple.Preferences`
- flowPath: `flows/samples/ci/ios-settings-smoke.yaml`

## 脚本入口

- 正式入口: `pnpm validate:ios-tool-probe`
