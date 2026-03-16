# mobile-e2e-mcp 全工具 MCP 调用检查清单（含调用方式）

## 1. 目的与范围

本清单用于两件事：

1. 记录 `mobile-e2e-mcp` 所有工具是否已调用、成功/失败状态与问题原因；
2. 作为可复用的**用户使用说明**（每个工具给出 MCP 调用方式示例）。

工具清单来源：`packages/mcp-server/src/stdio-server.ts` 的 `buildToolList()`（46 tools）。

---

## 2. 本轮测试环境

- Android 模拟器：`emulator-5554`
- iOS 模拟器：`iPhone 16 Plus (ADA078B9-3C6B-4875-8B85-A7789F368816)`
- 典型 App：
  - Android：`org.wordpress.android.prealpha`
  - iOS：`host.exp.exponent`
- MCP 调用入口：
  - OpenCode 用户视角：`opencode run "Use mobile-e2e-mcp MCP ..." --agent dev`
  - 直接工具视角：`mobile-e2e-mcp_<tool>`（MCP 工具调用，非仓库本地 `pnpm mcp:dev` 调试命令）

> 说明：同一工具在“无参数默认调用”与“显式传 session/platform/device/appId”时结果可能不同。

---

## 3. 调用方式模板（给其他用户直接复用）

## A. OpenCode（推荐）

```bash
opencode run "Use mobile-e2e-mcp MCP to call <tool_name> with args <json-like args>." --agent dev
```

示例：

```bash
opencode run "Use mobile-e2e-mcp MCP to call launch_app with {sessionId:'<sid>',platform:'android',deviceId:'emulator-5554',appId:'org.wordpress.android.prealpha'}" --agent dev
```

## B. MCP 工具名（会话内直接调用）

```text
mobile-e2e-mcp_<tool_name>({ ...args })
```

> 说明：本清单所有工具示例均按“用户/AI 通过 MCP 调用”的口径编写，不使用仓库内部 dev-cli 调试命令作为主示例。

---

## 4. 全工具检查清单（含调用方式 + 双平台结果）

状态说明（修复后口径）：
- ✅ 工具可稳定调用并返回**预期结构化响应**（含 `reasonCode=OK`，或在平台不适用/策略限制场景下返回预期 `UNSUPPORTED_OPERATION` / `POLICY_DENIED` / `INTERRUPTION_UNCLASSIFIED`）
- ⚠️ 仅用于“当前轮次证据不足、尚未复测”的临时状态（本次复测后已清零）
- ❌ 命令不可用或返回非预期错误（本次复测后已清零）

| Tool | MCP 调用方式示例（简写） | Android | iOS | 问题/说明 |
|---|---|---|---|---|
| capture_js_console_logs | `mobile-e2e-mcp_capture_js_console_logs({targetId})` | ✅ | ✅ | 需先 `list_js_debug_targets` 获取 targetId |
| capture_js_network_events | `mobile-e2e-mcp_capture_js_network_events({targetId})` | ✅ | ✅ | 无网络事件时 collectedCount 可为 0 |
| compare_against_baseline | `mobile-e2e-mcp_compare_against_baseline({sessionId})` | ✅ | ✅ | 按前置链路（先产出 outcome/baseline）复测通过 |
| collect_debug_evidence | `mobile-e2e-mcp_collect_debug_evidence({sessionId,appId?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 3）；业务过滤参数保持显式 |
| collect_diagnostics | `mobile-e2e-mcp_collect_diagnostics({sessionId})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 2） |
| detect_interruption | `mobile-e2e-mcp_detect_interruption({sessionId})` | ✅ | ✅ | 先 start_session 后调用，返回结构化结果 |
| classify_interruption | `mobile-e2e-mcp_classify_interruption({sessionId,signals?})` | ✅ | ✅ | 省略 platform 时需 active session；空 signals 返回 `INTERRUPTION_UNCLASSIFIED` |
| describe_capabilities | `mobile-e2e-mcp_describe_capabilities({platform})` | ✅ | ✅ | 可稳定返回工具能力画像 |
| doctor | `mobile-e2e-mcp_doctor()` | ✅ | ✅ | 当检测到 IDB 缺失时会返回可执行安装指引（`pipx install fb-idb`、`brew install idb-companion`、`IDB_*_PATH` 配置） |
| explain_last_failure | `mobile-e2e-mcp_explain_last_failure({sessionId})` | ✅ | ✅ | 先执行失败动作后复测通过 |
| find_similar_failures | `mobile-e2e-mcp_find_similar_failures({sessionId})` | ✅ | ✅ | 先沉淀 failure signature 后复测通过 |
| get_action_outcome | `mobile-e2e-mcp_get_action_outcome({actionId})` | ✅ | ✅ | 先 perform_action_with_evidence 取 actionId 后复测通过 |
| get_crash_signals | `mobile-e2e-mcp_get_crash_signals({sessionId,appId?,lines?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 2） |
| get_logs | `mobile-e2e-mcp_get_logs({sessionId,lines?,query?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 2） |
| get_screen_summary | `mobile-e2e-mcp_get_screen_summary({sessionId,includeDebugSignals?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 3） |
| get_session_state | `mobile-e2e-mcp_get_session_state({sessionId})` | ✅ | ✅ | 需可解析到 active session 上下文；否则返回 `CONFIGURATION_ERROR` |
| inspect_ui | `mobile-e2e-mcp_inspect_ui({sessionId})` | ✅ | ✅ | 传 `sessionId` 时可从活动会话继承 platform/deviceId/runnerProfile（Wave 1A） |
| query_ui | `mobile-e2e-mcp_query_ui({sessionId,selector/...})` | ✅ | ✅ | 查询条件保持显式；运行上下文由 session 继承（Wave 1A） |
| resolve_ui_target | `mobile-e2e-mcp_resolve_ui_target({sessionId,contentDesc})` | ✅ | ✅ | 查询条件保持显式；运行上下文由 session 继承（Wave 1A） |
| scroll_and_resolve_ui_target | `mobile-e2e-mcp_scroll_and_resolve_ui_target({sessionId,selector})` | ✅ | ✅ | 查询条件保持显式；运行上下文由 session 继承（Wave 1B） |
| scroll_and_tap_element | `mobile-e2e-mcp_scroll_and_tap_element({sessionId,selector})` | ✅ | ✅ | 查询条件保持显式；运行上下文由 session 继承（Wave 1B） |
| install_app | `mobile-e2e-mcp_install_app({sessionId,artifactPath})` | ✅ | ✅ | 传 `sessionId` 时可从活动会话继承 platform/deviceId/runnerProfile（MCP 层下沉） |
| list_js_debug_targets | `mobile-e2e-mcp_list_js_debug_targets()` | ✅ | ✅ | 能稳定返回 Metro target 列表 |
| launch_app | `mobile-e2e-mcp_launch_app({sessionId})` | ✅ | ✅ | 传 `sessionId` 时可从活动会话继承 platform/deviceId/appId/runnerProfile（MCP 层下沉） |
| list_devices | `mobile-e2e-mcp_list_devices()` | ✅ | ✅ | 能返回 Android+iOS 设备清单 |
| measure_android_performance | `mobile-e2e-mcp_measure_android_performance({sessionId,deviceId,appId,durationMs})` | ✅ | ✅ | 非目标平台返回预期语义；目标平台测量链路通过 |
| measure_ios_performance | `mobile-e2e-mcp_measure_ios_performance({sessionId,deviceId,appId,durationMs})` | ✅ | ✅ | dry-run（含 time-profiler/animation-hitches）复测通过 |
| perform_action_with_evidence | `mobile-e2e-mcp_perform_action_with_evidence({sessionId,action,autoRemediate?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 4）；action 保持显式 |
| rank_failure_candidates | `mobile-e2e-mcp_rank_failure_candidates({sessionId})` | ✅ | ✅ | 先生成失败窗口后复测通过 |
| record_screen | `mobile-e2e-mcp_record_screen({sessionId,durationMs?,outputPath?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 2） |
| recover_to_known_state | `mobile-e2e-mcp_recover_to_known_state({sessionId})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 4） |
| resolve_interruption | `mobile-e2e-mcp_resolve_interruption({sessionId,signals/classification?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 4） |
| resume_interrupted_action | `mobile-e2e-mcp_resume_interrupted_action({sessionId,checkpoint?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 4） |
| replay_last_stable_path | `mobile-e2e-mcp_replay_last_stable_path({sessionId})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 4） |
| reset_app_state | `mobile-e2e-mcp_reset_app_state({sessionId,strategy})` | ✅ | ✅ | 传 `sessionId` 时可从活动会话继承 platform/deviceId/appId/runnerProfile |
| take_screenshot | `mobile-e2e-mcp_take_screenshot({sessionId,outputPath?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 2） |
| tap | `mobile-e2e-mcp_tap({sessionId,x,y})` | ✅ | ✅ | 坐标保持显式；运行上下文由 session 继承（Wave 2） |
| tap_element | `mobile-e2e-mcp_tap_element({sessionId,contentDesc/...})` | ✅ | ✅ | 查询条件保持显式；运行上下文由 session 继承（Wave 1B） |
| type_text | `mobile-e2e-mcp_type_text({sessionId,text})` | ✅ | ✅ | 输入文本保持显式；运行上下文由 session 继承（Wave 2） |
| type_into_element | `mobile-e2e-mcp_type_into_element({sessionId,selector,value})` | ✅ | ✅ | 查询条件与输入值保持显式；运行上下文由 session 继承（Wave 1B） |
| terminate_app | `mobile-e2e-mcp_terminate_app({sessionId})` | ✅ | ✅ | 传 `sessionId` 时可从活动会话继承 platform/deviceId/appId/runnerProfile；iOS 仍需正确 appId（来自会话） |
| wait_for_ui | `mobile-e2e-mcp_wait_for_ui({sessionId,selector,timeoutMs})` | ✅ | ✅ | 查询条件保持显式；运行上下文由 session 继承（Wave 1A） |
| start_session | `mobile-e2e-mcp_start_session({platform,deviceId,appId?})` | ✅ | ✅ | 显式 platform/deviceId 时稳定 |
| run_flow | `mobile-e2e-mcp_run_flow({sessionId,flowPath?,runCount?})` | ✅ | ✅ | 运行上下文由 session 继承（Wave 4） |
| suggest_known_remediation | `mobile-e2e-mcp_suggest_known_remediation({sessionId})` | ✅ | ✅ | 常见返回 `found:false`（库未命中） |
| end_session | `mobile-e2e-mcp_end_session({sessionId})` | ✅ | ✅ | 双平台结束会话稳定 |

---

## 5. 关键证据路径

- Android 截图：`reports/cli-toolcheck-screenshot.png`、`reports/mcp-alltools-shot.png`
- iOS 截图：`reports/ios-mcp-check-shot.png`
- Android 录屏：`reports/cli-toolcheck-record.mp4`
- iOS 录屏（修复后）：`reports/ios-record-fixed.mp4`
- iOS terminate 修复验证：`reports/ios-terminate-fixed.json`
- 先前执行记录：`docs/delivery/cli-mcp-validation-execution-2026-03-16.zh-CN.md`
- 运行报告：`reports/phase-sample-report.json`、`reports/acceptance-evidence.json`

---

## 6. 本轮已修复并复测通过的命令

1. `record_screen`（iOS）
   - 修复：`packages/adapter-maestro/src/index.ts` 中 iOS `recordVideo` shell 片段改为换行拼接，避免 `&;` 语法错误。
   - 复测命令：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --record-screen --platform ios --runner-profile phase1 \
  --device-id ADA078B9-3C6B-4875-8B85-A7789F368816 \
  --session-id ios-record-fix-20260316 --duration-ms 3000 \
  --output-path reports/ios-record-fixed.mp4
```

   - 结果：`reasonCode=OK`

2. `terminate_app`（iOS）
   - 修复：调用时 appId 使用正确大小写 `host.exp.Exponent`。
   - 复测命令：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --launch-app --platform ios --runner-profile phase1 \
  --device-id ADA078B9-3C6B-4875-8B85-A7789F368816 \
  --app-id host.exp.Exponent --session-id ios-terminate-fix-20260316 \
  --output-path reports/ios-launch-fixed-case.json && \
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --terminate-app --platform ios --runner-profile phase1 \
  --device-id ADA078B9-3C6B-4875-8B85-A7789F368816 \
  --app-id host.exp.Exponent --session-id ios-terminate-fix-20260316 \
  --output-path reports/ios-terminate-fixed.json
```

   - 结果：`reasonCode=OK`

---

## 7. 平台覆盖结论（本轮复测后）

- Android/iOS 两端已完成“全工具调用可用性”复测，清单中工具状态已收敛为 ✅。
- 关键前提：
  1. 使用显式 `platform/deviceId/sessionId` 参数；
  2. failure-analysis 类工具先执行前置动作（产出 action outcome / failure signature / baseline）；
  3. 对平台不适用路径，接受并记录预期语义返回（如 `UNSUPPORTED_OPERATION` / `POLICY_DENIED`）。

后续建议：

1. 将本清单示例命令固化进自动化回归脚本（避免人工 prompt 漂移）；
2. 每次发布前固定执行 `scripts/validate-dry-run.ts` + `@mobile-e2e-mcp/mcp-server` test 套件；
3. 将 real-run 证据与 dry-run 一起沉淀，持续维护双平台 capability 基线。
