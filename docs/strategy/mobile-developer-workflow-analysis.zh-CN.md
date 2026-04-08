# 移动端开发者工作流分析与 MCP 优化差距

> 从移动端开发者视角出发，将日常工作映射到 6 条核心工作流，展示当前每条链路上 MCP 工具的提效方式，并逐链路识别具体的优化空间。

---

## 1. 应用生命周期管理

**开发者日常：** 发现设备 → 安装构建产物 → 启动 → 清除状态 → 终止卡死进程。

### 当前 MCP 链路

| 环节 | MCP 工具 | 实现层 |
|------|----------|--------|
| 发现设备 | `list_devices` | `device-runtime.ts` → `adb devices` / `simctl list` |
| 健康检查 | `doctor` | `doctor-runtime.ts` — 连通性 + 后端探针 |
| 安装构建 | `install_app` | `device-runtime-android.ts` (`adb install`) / `device-runtime-ios.ts` (`devicectl install`) |
| 启动应用 | `launch_app` | `app-lifecycle-tools.ts` — monkey intent (Android) / devicectl process launch (iOS) |
| 重置状态 | `reset_app_state` | 策略：`clear_data` / `uninstall_reinstall` / `keychain_reset` |
| 终止进程 | `terminate_app` | `am force-stop` (Android) / `devicectl process kill` (iOS) |

### 优化空间

| 差距 | 优先级 | 说明 |
|-----|--------|------|
| **缺少热启动 / 冷启动性能画像** | 中 | `launch_app` 当前只管启动，不测量首帧渲染时间，也不检测冷启动崩溃循环。增加一个 `warmup_app` 工具：启动后等待首个稳定帧，上报 TTI（可交互时间），可以在正式测试前捕获启动回归。 |
| **Deep-link 入口未验证** | 中 | `launch_app` 接受 `launchUrl` 参数，但不验证 deeplink 是否真的路由到了预期页面。启动后对比 `get_screen_summary` 的 `screenId` 与预期值可以闭环。 |
| **不支持多应用场景** | 中低 | 真实工作流常跨越宿主应用 + 辅助应用（如浏览器 OAuth、支付 SDK）。当前链路假设单一 `appId`。增加 `switch_app_context` 工具，支持会话级应用栈切换，可以实现跨应用流程测试。 |
| **安装签名验证缺失** | 低 | iOS 真机安装在签名不匹配时静默失败。适配器在启动证据层能捕获这个问题，但 `install_app` 本身应在推送二进制前执行 `codesign --verify` 预检。 |

---

## 2. UI 检查与定位

**开发者日常：** 导出 UI 树 → 查找元素 → 验证渲染正确 → 获取坐标。

### 当前 MCP 链路

| 环节 | MCP 工具 | 实现层 |
|------|----------|--------|
| 导出 UI 树 | `inspect_ui` | `ui-inspection-tools.ts` → `uiautomator dump` / `axe describe-ui` / WDA `/source` |
| 按选择器查询 | `query_ui` | 同上 — 按文本、角色、resourceId、contentDesc 过滤，支持分页 |
| 定位目标 | `resolve_ui_target` | `ui-tool-shared.ts` — 消歧，返回坐标 + 置信度 |
| 滚动 + 定位 | `scroll_and_resolve_ui_target` | `ui-runtime-platform.ts` — 滚动容器，重试定位 |
| 等待出现 | `wait_for_ui` | 轮询层级结构，直到选择器匹配或超时 |

### 优化空间

| 差距 | 优先级 | 说明 |
|-----|--------|------|
| **无元素截图 / 视觉对比** | 高 | `query_ui` 返回结构匹配结果，但没有视觉基线对比。增加 `capture_element_screenshot`（按元素边界裁剪），可以实现像素级回归对比和 AI 视觉验证。目前开发者只能手动对比全屏截图。 |
| **选择器优先级扁平，无学习排序** | 中 | `resolve_ui_target` 返回所有匹配项并打分，但不会从过去的成功解析中学习。一个简单的会话级"选择器效果缓存"（曾经有效的 resourceId → 提高优先级）可以减少重复运行时的歧义。 |
| **无障碍审计缺失** | 中 | `inspect_ui` 返回原始树，但不标记缺失的无障碍标签、零尺寸触摸区域或对比度问题。增加 `audit_accessibility` 工具扫描树中常见的无障碍违规，同时可以作为开发者生产力功能。 |
| **WebView 内容盲区** | 中高 | WebView 树往往不完整，或者与原生树合并不佳。当前适配器不区分 WebView 节点，导致 `query_ui` 在混合屏幕上不可靠。缺少 `detect_webview` + `switch_to_webview_context` 通道（通过 Chrome DevTools Protocol on Android、Safari inspector on iOS）。 |
| **滚动启发式过于通用** | 低中 | `scroll_and_resolve_ui_target` 滚动容器但不知道动作意图中的滚动方向提示。从调用方传入 `scrollDirection` 和 `maxScrollAttempts` 可以减少已知布局下的过度滚动。 |

---

## 3. UI 交互操作

**开发者日常：** 点击按钮 → 输入文字 → 滑动列表 → 验证结果。

### 当前 MCP 链路

| 环节 | MCP 工具 | 实现层 |
|------|----------|--------|
| 点击元素 | `tap_element` | `ui-action-tools.ts` → `tapResolvedTarget` — 定位 + 点击，仅限无歧义匹配 |
| 坐标点击 | `tap` | 直接坐标点击：`adb shell input tap` / `axe tap` / WDA `wda/tap` |
| 滚动 + 点击 | `scroll_and_tap_element` | 滚动容器，定位，然后点击 |
| 输入文字 | `type_text` | `adb shell input text` / `axe type` / WDA `wda/keys` |
| 在输入框中输入 | `type_into_element` | 定位输入框 + 输入，一次调用完成 |

### 优化空间

| 差距 | 优先级 | 说明 |
|-----|--------|------|
| **不支持手势组合** | 高 | 真实交互包括长按、拖拽、捏合缩放、多指滑动。当前链路只暴露 `tap`、`type` 和适配器内部的 `swipe`。将 `long_press`、`drag`、`multi_swipe` 作为一等 MCP 工具暴露，可以覆盖 80%+ 缺失的手势场景。 |
| **无键盘状态感知** | 中 | `type_into_element` 不检查软键盘是否已弹出就输入。在 Android 上会导致双键盘重叠和坐标偏移。在输入前增加 `keyboard_state` 探针（可见/隐藏/IME 类型）可以避免这个问题。 |
| **无原子多操作编排** | 中高 | 某些交互需要原子序列（如下拉刷新 = 向下滑 + 按住 + 释放）。当前每个操作是独立的 MCP 调用，中间会做完整的 pre/post 状态捕获。增加 `compose_actions` 工具，原子执行 N 个操作（一次前置快照 + 一次后置快照），对复杂手势序列更快更准确。 |
| **iOS 真机动作流生成不透明** | 中 | `buildIosPhysicalActionFlowPaths` 为真机生成 Maestro YAML 流程，但生成的流程没有返回给调用方。在工具结果中返回生成的 YAML 路径可以让开发者检查和复用。 |
| **缺少触觉/音频反馈验证** | 低 | 某些界面交互后依赖触觉或音频反馈。当前没有工具捕获这些信号。对 E2E 正确性不关键，但对 UX 回归有价值。 |

---

## 4. 诊断与调试

**开发者日常：** 查看日志 → 排查崩溃 → 截图 → 分析根因。

### 当前 MCP 链路

| 环节 | MCP 工具 | 实现层 |
|------|----------|--------|
| 获取日志 | `get_logs` | `device-runtime.ts` → `adb logcat` / simctl 日志 / devicectl 日志 |
| 崩溃信号 | `get_crash_signals` | `diagnostics-pull.ts` — ANR trace / `devicectl info crashes` |
| 完整诊断 | `collect_diagnostics` | Android bugreport / iOS 诊断包 |
| 调试证据 | `collect_debug_evidence` | `diagnostics-tools.ts` — 合并日志 + 崩溃 + JS 控制台 + JS 网络 + iOS 启动证据为结构化包 |
| 屏幕摘要 | `get_screen_summary` | `session-state.ts` — 从 UI 树 + 日志信号 + 崩溃信号构建 `StateSummary` |
| 会话状态 | `get_session_state` | 同上 + 持久化到会话时间线 + 返回能力画像 |
| JS 控制台 (RN) | `capture_js_console_logs` | `js-debug.ts` — Metro inspector WebSocket |
| JS 网络 (RN) | `capture_js_network_events` | 同上 — 网络失败快照 |
| 性能分析 | `measure_android_performance` / `measure_ios_performance` | `performance-tools.ts` — Perfetto / xctrace trace 窗口 |

### 优化空间

| 差距 | 优先级 | 说明 |
|-----|--------|------|
| **JS 调试通道仅支持 RN，不支持 Flutter** | 高 | `js-debug.ts` 针对 Metro inspector。Flutter 的 DevTools 使用不同协议（Dart VM Service）。缺少等价的 `capture_flutter_devtools_events`。增加 Flutter 调试通道（通过 `flutter attach` 或 DDS WebSocket）可以让 MCP 真正跨框架。 |
| **网络证据是被动捕获，非主动拦截** | 中高 | `capture_js_network_events` 从 Metro inspector 捕获失败，但不能拦截所有流量、注入延迟或 mock 响应。集成代理层（如 Android 的 mitmproxy、iOS 模拟器的本地 HTTP 代理）可以实现主动网络测试：延迟注入、错误模拟、响应 mock。 |
| **无日志流模式** | 中 | `get_logs` 是一次性操作：捕获 N 行或最近 T 秒的日志。对于流程执行中的实时调试，`tail_logs` 流模式（WebSocket 或 SSE）可以让开发者在执行动作时实时观察日志。 |
| **崩溃归因是信号级，非堆栈级** | 中 | `get_crash_signals` 返回顶层信号和样本，但不解析原生堆栈跟踪。增加 `parse_crash_stack` 步骤将原生地址映射到符号化堆栈帧（Android 通过 `ndk-stack`，iOS 通过 `atos`），可以将信号摘要转化为可操作的堆栈跟踪。 |
| **性能 trace 需要手动指定窗口** | 低中 | `measure_android_performance` 和 `measure_ios_performance` 捕获时间窗口，但调用方需要知道起止时间。增加 `benchmark_action_performance` 工具，包装单个 `perform_action_with_evidence` 调用，自动开始/结束 Perfetto/xctrace，可以让性能测试一行命令搞定。 |
| **无视觉回归基线** | 中 | 截图被捕获但从未与基线对比。增加 `compare_screenshot_baseline` 工具（可配置阈值的像素 diff，存储在 `baselines/{screenId}.png`），可以为诊断工具包添加视觉回归能力。 |

---

## 5. 失败分析与恢复

**开发者日常：** 检测失败 → 归因 → 恢复状态 → 重试 → 验证。

### 当前 MCP 链路

| 环节 | MCP 工具 | 实现层 |
|------|----------|--------|
| 检测中断 | `detect_interruption` | `interruption-detector.ts` — 结构变化、系统所有权、阻塞信号 |
| 分类中断 | `classify_interruption` | `interruption-classifier.ts` — 类型 + 置信度打分 |
| 解决中断 | `resolve_interruption` | `interruption-resolver.ts` — 策略驱动的关闭/继续/拒绝 |
| 恢复动作 | `resume_interrupted_action` | `interruption-orchestrator.ts` — 从检查点重放，带漂移检测 |
| 执行 + 证据 | `perform_action_with_evidence` | `action-orchestrator.ts` — 前置状态 → 执行 → 后置状态 → OCR 回退 → 重试循环 |
| 解释失败 | `explain_last_failure` | `action-orchestrator-model.ts` — `classifyActionFailureCategory` + reason 映射 |
| 排序候选 | `rank_failure_candidates` | 多层归因（网络 → 应用 → UI → 平台 → 策略） |
| 查找相似 | `find_similar_failures` | 本地模式匹配，比对历史失败签名 |
| 修复建议 | `suggest_known_remediation` | 内置就绪度技能路由 + 本地基线匹配 |
| 状态恢复 | `recover_to_known_state` | `recovery-tools.ts` — 重启 / 等待 / 清除数据策略 |
| 重放稳定路径 | `replay_last_stable_path` | 同上 — 从会话历史重放最后一个成功的动作 |

### 优化空间

| 差距 | 优先级 | 说明 |
|-----|--------|------|
| **无网络感知编排** | 高 | 代码库已有 `network-anomaly-runtime-architecture.md` 设计文档，但当前 `action-orchestrator.ts` 只将 `waiting_network`、`offline_terminal`、`backend_failed_terminal` 分类为就绪状态。不会主动探测网络健康、根据网络类型调整重试退避、或建议网络专属恢复（如开关飞行模式、切换 WiFi/蜂窝）。网络异常运行时有设计但未完全实现。 |
| **无多步检查点链** | 高 | `replay_last_stable_path` 只重放*最后一个*成功动作。真实失败往往发生在流程中间，前面已有 N 步成功。增加 `replay_checkpoint_chain` 工具，识别最后一个稳定检查点并重放后续所有低风险动作，可以闭合 `04-runtime-architecture.md` §7.3 中记录的多步健壮性差距。 |
| **历史失败记忆仅限会话内** | 中 | `find_similar_failures` 仅在当前会话的本地记录中匹配。跨会话、跨构建的历史失败模式未被持久化。增加 `failure_pattern_index`（例如存在 `.mcp/failures/` 下），跨运行累积失败签名，就能检测"这个点击在 Android 14 上每次都失败"的模式。 |
| **恢复策略太浅** | 中 | `recover_to_known_state` 目前支持：重启应用、等待就绪、遇到终态则停止。缺少：`clear_app_data` 作为有界恢复（高权限写操作）、`navigate_back` 逃离错误页面、`force_permission_grant` 处理卡住的权限弹窗。 |
| **无波动性评分** | 中 | 没有机制跟踪"这个动作 30% 的概率失败"。为每个动作类型 + 选择器组合计算 `flakiness_score`，可以帮助开发者区分"坏了"和"不稳定"。 |
| **OCR 回退不学习失败** | 低中 | `action-orchestrator-ocr.ts` 执行 OCR 回退并检查置信度，但不记录哪些 OCR 区域匹配/未匹配。将 OCR 解析结果反馈到"区域效果缓存"可以改善未来的 OCR 定位。 |
| **修复建议基于模板** | 中 | `suggest_known_remediation` 使用内置路由逻辑和本地基线匹配，不会利用 LLM 生成修复建议。增加可选的 `--ai-remediate` 标志，将失败包发送给 LLM 获取结构化修复建议，可以闭合 L4（Agentic）成熟度差距。 |

---

## 6. 会话与流程管理

**开发者日常：** 规划测试场景 → 录制手动流程 → 导出到 CI → 回归重放。

### 当前 MCP 链路

| 环节 | MCP 工具 | 实现层 |
|------|----------|--------|
| 启动会话 | `start_session` | 创建会话记录，带策略画像、平台、设备、应用 |
| 录制流程 | `start_record_session` → `end_record_session` | `recording-runtime.ts` — 将平台事件映射为可重放动作 |
| 导出到 Maestro | `export_session_flow` | `recording-mapper.ts` — 将会话动作转换为 Maestro YAML |
| 运行流程 | `run_flow` | `flow-runtime.ts` — 通过适配器执行 Maestro 流程 |
| 任务执行 | `execute_intent` / `complete_task` | `task-planner.ts` — 高层意图 → 有界多步动作 |
| 结束会话 | `end_session` | 关闭会话，输出最终元数据 |

### 优化空间

| 差距 | 优先级 | 说明 |
|-----|--------|------|
| **导出前无流程验证** | 高 | `export_session_flow` 将录制的动作转为 Maestro YAML，但不针对当前应用状态验证生成的流程。增加 `validate_flow` 空跑模式，执行生成流程的每一步并报告哪些步骤在当前构建上会失败，可以在 CI 前捕获偏移。 |
| **录制的流程无条件分支** | 中 | 录制的流程是线性序列。真实测试场景需要条件逻辑："如果元素 X 可见，执行 Y，否则执行 Z"。`task-planner.ts` 有意图到动作的映射但没有条件逻辑编码。在流程格式中增加 `if_visible`、`if_network_ok` 分支可以让导出的流程更健壮。 |
| **无并行设备执行** | 中 | `run_flow` 在单个设备/会话上执行。回归测试受益于在多个设备（Android 模拟器 + iOS 模拟器 + 真机）上并行运行相同流程。增加 `run_flow_parallel` 工具，扇出到多个会话并聚合结果，可以成倍提高吞吐量。 |
| **无流程版本管理 / 对比** | 低中 | 导出的流程写入磁盘但不做版本管理。增加 `diff_flow` 工具对比两个版本的流程 YAML，报告新增/删除/修改的步骤，可以帮助团队理解自动化套件的变化。 |
| **无数据驱动流程参数化** | 中 | 录制的流程使用具体值（特定搜索文本、特定商品）。增加 `parameterize_flow` 工具，识别可变输入并替换为占位符 + 数据文件引用，可以实现数据驱动测试（如用 10 组不同凭据登录）。 |
| **无 CI/CD 流水线集成** | 中 | 流程导出为 Maestro YAML 但没有内置的 CI 集成。增加 `generate_ci_config` 工具生成 GitHub Actions / GitLab CI / Jenkins 流水线配置，可以闭合交付环节。 |

---

## 7. 跨链路优化机会

这些差距跨越多条工作流链路，代表对 MCP 平台本身的结构性改进。

| 差距 | 影响链路 | 说明 |
|-----|----------|------|
| **结构化状态 schema 演进** | 所有链路 | `session-state.ts` 中的 `StateSummary` 是从信号推断的（UI 树上的文本匹配）。能工作但脆弱。更健壮的方法是使用平台原生状态 API（如 Android 的 `AccessibilityService.getState()`、iOS 的 `XCUIElementQuery` 状态）作为主要状态源，信号推断作为回退。 |
| **工具编排 / 流水线 DSL** | 所有链路 | 当前每个工具是独立调用。增加 `pipeline` 工具，链式调用 N 个工具并支持条件分支（如 `if inspect_ui shows alert → resolve_interruption → tap_element`），可以降低调用方的编排负担。`execute_intent` 和 `complete_task` 是这个方向的一步，但还不是通用的编排面。 |
| **跨会话确定性重放** | 会话、恢复 | 会话记录持久化在 `.mcp/sessions/` 下，但重放仅限于 `replay_last_stable_path`（单步动作）。完整的会话重放（start → 所有动作 → end），带逐步验证，可以实现"在不同设备上精确重现这个会话"的工作流。 |
| **策略画像管理体验** | 所有链路 | 策略画像（只读 / 交互 / 完全控制）定义在 `configs/policies/*.yaml` 中，但没有 MCP 工具可以预览、测试或修改它们。增加 `policy_preview` + `policy_test` 工具，让开发者在遇到拒绝前了解当前画像允许哪些权限。 |
| **真机设备场集成** | 生命周期、会话 | 当前模型假设本地设备/模拟器。云端设备场（Firebase Test Lab、BrowserStack、Sauce Labs）未作为执行目标支持。增加 `farm_adapter`，将动作路由到远程设备，同时保持相同的 MCP 接口，可以实现规模化测试。 |
| **框架画像成熟度：Flutter** | 检查、交互 | Flutter 的语义树质量高度依赖应用插桩。当前适配器对 Flutter 表面和原生一视同仁，导致更高的回退率。增加专用的 `flutter_semantic_coverage` 审计工具，报告哪些 Flutter 组件有语义标签、哪些没有，可以帮助 Flutter 团队为更好的自动化插桩他们的应用。 |

---

## 8. 优先级矩阵

基于 影响 × 实现成本，推荐排序如下：

| 优先级 | 差距 | 影响 | 成本 | 目标链路 |
|--------|------|------|------|----------|
| P0 | 网络感知编排 | 高 | 中 | 失败分析 |
| P0 | 多步检查点链 | 高 | 中 | 失败分析 |
| P0 | 导出前流程验证 | 高 | 低 | 会话与流程 |
| P0 | 元素截图 / 视觉对比 | 高 | 低 | UI 检查 |
| P1 | 手势组合 | 高 | 中 | UI 交互 |
| P1 | JS 调试通道：Flutter 支持 | 高 | 中 | 诊断 |
| P1 | 历史失败记忆（跨会话） | 中 | 中 | 失败分析 |
| P1 | WebView 上下文检测 | 中高 | 中 | UI 检查 |
| P2 | 波动性评分 | 中 | 低 | 失败分析 |
| P2 | 视觉回归基线 | 中 | 中 | 诊断 |
| P2 | 工具编排 / 流水线 DSL | 高 | 高 | 跨链路 |
| P2 | 并行设备执行 | 中 | 中 | 会话与流程 |
| P3 | 无障碍审计 | 中 | 低 | UI 检查 |
| P3 | 日志流模式 | 中 | 低 | 诊断 |
| P3 | 策略画像管理体验 | 中 | 低 | 跨链路 |

---

## 9. 成熟度路线图对齐

对照 `03-capability-model.md` 中的能力成熟度等级：

| 成熟度等级 | 当前状态 | 待闭合差距 |
|-----------|----------|-----------|
| **L1 (MVP)** ✅ | 设备选择、应用生命周期、截图、UI 树、点击/输入、基础中断处理 | 已完成 |
| **L2 (稳定性)** 🔄 | 部分完成 — 波动控制、重试、原因码已有，但网络感知编排和多步重放缺失 | 上述 P0 差距 |
| **L3 (规模化)** ❌ | 未启动 — 多设备编排、并行会话、云设备场集成 | 并行执行、设备场适配器 |
| **L4 (智能体级)** ❌ | 未启动 — 目标到流程规划、自愈、自动 bug 包生成 | AI 修复建议、流水线 DSL、任务规划器成熟度 |
| **L5 (企业级)** ❌ | 未启动 — RBAC、合规导出、审批工作流 | 策略画像体验、审计跟踪导出 |

---

## 附录 A：文件索引

| 组件 | 主文件 |
|------|--------|
| MCP 工具注册表 | `packages/mcp-server/src/server.ts` |
| MCP 工具封装 | `packages/mcp-server/src/tools/*.ts` |
| 动作编排器 | `packages/adapter-maestro/src/action-orchestrator.ts` |
| 动作编排模型 | `packages/adapter-maestro/src/action-orchestrator-model.ts` |
| OCR 回退 | `packages/adapter-maestro/src/action-orchestrator-ocr.ts` |
| 会话状态 | `packages/adapter-maestro/src/session-state.ts` |
| 恢复工具 | `packages/adapter-maestro/src/recovery-tools.ts` |
| 诊断工具 | `packages/adapter-maestro/src/diagnostics-tools.ts` |
| 中断编排器 | `packages/adapter-maestro/src/interruption-orchestrator.ts` |
| JS 调试 | `packages/adapter-maestro/src/js-debug.ts` |
| 录制运行时 | `packages/adapter-maestro/src/recording-runtime.ts` |
| 任务规划器 | `packages/adapter-maestro/src/task-planner.ts` |
| UI 检查 | `packages/adapter-maestro/src/ui-inspection-tools.ts` |
| UI 动作工具 | `packages/adapter-maestro/src/ui-action-tools.ts` |
| 性能工具 | `packages/adapter-maestro/src/performance-tools.ts` |
| 契约 | `packages/contracts/src/types.ts` |
| 策略引擎 | `packages/core/src/policy-engine.ts` |
| 治理 | `packages/core/src/governance.ts` |
