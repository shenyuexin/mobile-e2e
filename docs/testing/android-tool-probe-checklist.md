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

## 待持续探针验证（UI/前置依赖敏感）

1. wait_for_ui
2. resolve_ui_target
3. scroll_and_resolve_ui_target
4. type_into_element
5. execute_intent (真实 UI)
6. perform_action_with_evidence
7. complete_task
8. recover_to_known_state
9. replay_last_stable_path
10. run_flow
11. explain_last_failure
12. find_similar_failures
13. rank_failure_candidates
14. compare_against_baseline
15. resume_interrupted_action
16. capture_js_console_logs (需 Metro)
17. capture_js_network_events (需 Metro)

## 脚本入口

- 正式入口: `pnpm validate:android-tool-probe`
- 兼容入口: `pnpm exec tsx tmp-tool-verification.ts`
