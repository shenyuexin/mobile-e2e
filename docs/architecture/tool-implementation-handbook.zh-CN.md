# MCP Tools 用户手册（mobile-e2e-mcp）

这份文档面向**使用者/AI Agent**，重点回答：

1. 每个工具是干嘛的；
2. 每个工具怎么调用（命令示例）。

> 说明：工具清单以 `packages/mcp-server/src/stdio-server.ts` 的 `buildToolList()` 为准（当前 46 个）。

---

## 1. 调用方式（先看）

### 1.1 MCP 工具调用（推荐默认写法）

```text
m2e_<tool_name>({ ...args })
```

也兼容以下写法（效果等价）：

```text
mobile-e2e-mcp_<tool_name>({ ...args })
<tool_name>({ ...args })
```

示例：

```text
m2e_launch_app({sessionId:"<sid>"})
```

### 1.2 OpenCode 文本调用

```bash
opencode run "Use mobile-e2e-mcp MCP to call <tool_name> with <args>." --agent dev
```

---

## 2. 使用前准备（强烈建议）

多数工具都是“会话型工具”，建议先启动会话：

```text
m2e_start_session({
  platform:"android",
  deviceId:"emulator-5554",
  appId:"org.wordpress.android.prealpha"
})
```

拿到 `sessionId` 后，后续工具优先传 `sessionId`。

如果你不传 `sessionId`：

- 当前仅有 1 个活动会话：工具会自动绑定该会话；
- 同时有多个活动会话：会返回歧义错误，提示你显式传 `sessionId`（或补充 platform/deviceId 缩小范围）。

### 2.1 并发 Session / 多设备能力（用户版说明）

当前项目的并发能力是：

- **同设备互斥**：同一个 `platform + deviceId` 同时只允许一个写会话持有租约；
- **多设备并发**：不同 `deviceId` 的会话可并行执行；
- **会话队列与可观测**：会有 queue wait / lease 相关事件和证据；
- **stale lease 回收**：异常中断后会尝试恢复租约状态。

你可以把它理解为“**单设备强一致、多设备可并行**”的运行模型。

> 说明：
>
> - “双设备 sync 编排”目前是**预留能力**（内部预留了 `coordinationKey` / `barrierId` 等字段），还不是对外稳定工具合同。
> - 也就是说：现在可以稳定地做“多设备并发会话”，但“跨设备编排器（barrier/sync workflow）”仍属于后续演进。

深入设计文档：

- `docs/architecture/session-orchestration-architecture.zh-CN.md`
- `docs/architecture/platform-implementation-matrix.zh-CN.md`

### 2.2 OCR 默认方案与外部接入（用户版说明）

当前 OCR 路径是**deterministic-first**：

1. 先走确定性定位（UI 树 / selector）
2. 再走语义解析
3. 最后才进入有界 OCR fallback

默认 OCR 提供方：

- **`MacVisionOcrProvider`（macOS 本地）**
- 不依赖外部 API Key，开箱即用（macOS 环境）

当前外部 OCR 接入状态：

- 已有统一接口：`OcrProvider`（`packages/adapter-vision/src/ocr/types.ts`）
- 已有服务注入点：`OcrService` 可注入 `provider`（`packages/adapter-vision/src/ocr/service/ocr-service.ts`）
- 但**尚未提供稳定的“配置化外部 provider 接入”用户入口**（例如通过 YAML/CLI 一键切换远程 MCP/HTTP OCR）

这意味着：

- 现在用户默认用的是内置 `MacVision`；
- 若你要接外部 OCR，需要按 `OcrProvider` 接口做代码级扩展并在运行链路注入。

深入设计文档：

- `docs/architecture/mobile-e2e-ocr-fallback-design.md`
- `docs/architecture/mobile-e2e-ocr-fallback-implementation-checklist.md`

---

## 3. 全量工具（46）逐项说明 + 命令示例

## 3.1 会话与应用生命周期

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `start_session` | 创建自动化会话，上下文锚点 | `m2e_start_session({platform:"ios",deviceId:"<udid>",appId:"host.exp.Exponent"})` |
| `end_session` | 结束会话并回收上下文 | `m2e_end_session({sessionId:"<sid>"})` |
| `launch_app` | 启动目标 App / Expo URL | `m2e_launch_app({sessionId:"<sid>"})` |
| `terminate_app` | 终止目标 App 进程 | `m2e_terminate_app({sessionId:"<sid>"})` |
| `install_app` | 安装 apk/ipa/app 包 | `m2e_install_app({sessionId:"<sid>",artifactPath:"/path/to/app.apk"})` |
| `reset_app_state` | 重置应用状态（清数据/重装/钥匙串） | `m2e_reset_app_state({sessionId:"<sid>",strategy:"clear_data"})` |
| `run_flow` | 执行 Maestro 流程文件 | `m2e_run_flow({sessionId:"<sid>",flowPath:"flows/samples/login.yaml"})` |

## 3.2 设备与环境

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `list_devices` | 列出 Android 设备与 iOS 模拟器 | `m2e_list_devices({})` |
| `doctor` | 检查本机依赖与设备可用性 | `m2e_doctor({})` |
| `describe_capabilities` | 查看当前平台能力边界 | `m2e_describe_capabilities({platform:"android"})` |

## 3.3 UI 读取与定位

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `inspect_ui` | 获取当前 UI 树快照 | `m2e_inspect_ui({sessionId:"<sid>"})` |
| `query_ui` | 按条件在 UI 树里查询元素 | `m2e_query_ui({sessionId:"<sid>",contentDesc:"Login"})` |
| `resolve_ui_target` | 把 selector 解析成唯一可操作目标 | `m2e_resolve_ui_target({sessionId:"<sid>",contentDesc:"Login"})` |
| `scroll_and_resolve_ui_target` | 边滚动边定位目标元素 | `m2e_scroll_and_resolve_ui_target({sessionId:"<sid>",text:"Submit"})` |
| `wait_for_ui` | 轮询直到目标元素出现 | `m2e_wait_for_ui({sessionId:"<sid>",text:"Home",timeoutMs:8000})` |
| `get_screen_summary` | 获取当前屏幕摘要（可操作目标/阻塞信号） | `m2e_get_screen_summary({sessionId:"<sid>",includeDebugSignals:true})` |
| `get_session_state` | 获取会话当前状态摘要 | `m2e_get_session_state({sessionId:"<sid>"})` |

## 3.4 UI 动作执行

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `tap` | 按坐标点击 | `m2e_tap({sessionId:"<sid>",x:200,y:420})` |
| `tap_element` | 按 selector 点击（推荐） | `m2e_tap_element({sessionId:"<sid>",contentDesc:"Login"})` |
| `scroll_and_tap_element` | 滚动后点击目标元素 | `m2e_scroll_and_tap_element({sessionId:"<sid>",text:"Continue"})` |
| `type_text` | 向当前焦点输入文本 | `m2e_type_text({sessionId:"<sid>",text:"hello"})` |
| `type_into_element` | 先定位元素再输入文本 | `m2e_type_into_element({sessionId:"<sid>",contentDesc:"Email",value:"a@b.com"})` |

## 3.5 截图、录屏、日志、诊断

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `take_screenshot` | 采集截图证据 | `m2e_take_screenshot({sessionId:"<sid>",outputPath:"reports/shot.png"})` |
| `record_screen` | 录制屏幕视频证据 | `m2e_record_screen({sessionId:"<sid>",durationMs:3000,outputPath:"reports/run.mp4"})` |
| `get_logs` | 拉取 logcat / iOS simulator logs | `m2e_get_logs({sessionId:"<sid>",lines:300,query:"Error"})` |
| `get_crash_signals` | 获取 crash/ANR 信号 | `m2e_get_crash_signals({sessionId:"<sid>"})` |
| `collect_diagnostics` | 采集 Android bugreport / iOS diagnostics | `m2e_collect_diagnostics({sessionId:"<sid>"})` |
| `collect_debug_evidence` | 聚合 AI 可读调试证据包 | `m2e_collect_debug_evidence({sessionId:"<sid>"})` |
| `measure_android_performance` | Android 性能采样（Perfetto） | `m2e_measure_android_performance({sessionId:"<sid>",durationMs:5000})` |
| `measure_ios_performance` | iOS 性能采样（xctrace） | `m2e_measure_ios_performance({sessionId:"<sid>",durationMs:5000})` |

## 3.6 React Native / Expo JS 调试

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `list_js_debug_targets` | 列出 Metro 可调试目标 | `m2e_list_js_debug_targets({})` |
| `capture_js_console_logs` | 抓取一次 JS console 事件 | `m2e_capture_js_console_logs({targetId:"<target-id>"})` |
| `capture_js_network_events` | 抓取一次 JS 网络事件 | `m2e_capture_js_network_events({targetId:"<target-id>"})` |

## 3.7 动作证据、失败归因、恢复

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `perform_action_with_evidence` | 执行动作并自动采集前后证据 | `m2e_perform_action_with_evidence({sessionId:"<sid>",action:{type:"tap",contentDesc:"Login"},autoRemediate:true})` |
| `get_action_outcome` | 按 actionId 读取动作结果 | `m2e_get_action_outcome({actionId:"<action-id>"})` |
| `explain_last_failure` | 解释最近一次失败原因 | `m2e_explain_last_failure({sessionId:"<sid>"})` |
| `rank_failure_candidates` | 对失败层做候选排序 | `m2e_rank_failure_candidates({sessionId:"<sid>"})` |
| `find_similar_failures` | 查找历史相似失败 | `m2e_find_similar_failures({sessionId:"<sid>"})` |
| `compare_against_baseline` | 与成功基线做对比 | `m2e_compare_against_baseline({sessionId:"<sid>"})` |
| `suggest_known_remediation` | 输出已知修复建议 | `m2e_suggest_known_remediation({sessionId:"<sid>"})` |
| `recover_to_known_state` | 恢复到可继续执行的状态 | `m2e_recover_to_known_state({sessionId:"<sid>"})` |
| `replay_last_stable_path` | 回放最近稳定路径 | `m2e_replay_last_stable_path({sessionId:"<sid>"})` |

## 3.8 中断检测与恢复链路

| 工具 | 用途（给使用者） | 命令示例 |
|---|---|---|
| `detect_interruption` | 检测是否出现中断（弹窗/系统提示等） | `m2e_detect_interruption({sessionId:"<sid>"})` |
| `classify_interruption` | 对中断类型做分类 | `m2e_classify_interruption({sessionId:"<sid>"})` |
| `resolve_interruption` | 执行中断处置策略 | `m2e_resolve_interruption({sessionId:"<sid>"})` |
| `resume_interrupted_action` | 从中断点恢复动作执行 | `m2e_resume_interrupted_action({sessionId:"<sid>"})` |

---

## 4. 推荐调用顺序（给 AI/人都适用）

1. `doctor` -> `list_devices`
2. `start_session`
3. `launch_app`
4. `get_screen_summary` / `inspect_ui`
5. 执行动作（`tap_element` / `type_into_element` / `wait_for_ui`）
6. 出错时走：
   - `perform_action_with_evidence`
   - `explain_last_failure`
   - `rank_failure_candidates`
   - `suggest_known_remediation`
   - `recover_to_known_state` / `replay_last_stable_path`
7. 完成后 `end_session`

---

## 5. 常见坑（使用者视角）

- `sessionId` 缺失或会话已关闭：会话型工具会返回 `CONFIGURATION_ERROR`。
- `targetId` 未先获取：`capture_js_console_logs` / `capture_js_network_events` 先调用 `list_js_debug_targets`。
- iOS 的 `appId` 大小写错误：`terminate_app` / `launch_app` 常见失败原因之一。
- failure-analysis 工具链需有前置失败样本（例如先执行一次失败动作）。

---

## 6. 更完整示例索引

如果你需要工具签名与契约的完整视图，请以以下来源为准：

- `packages/mcp-server/src/server.ts`
- `packages/contracts/src/index.ts`
