# 安装与接入指南

## 1. 文档目的

定义开源版 `mobile-e2e-mcp` 的标准安装、配置、启动、接入和首个样例执行流程。

本文档是未来 README 安装章节、Quickstart 和 CI 集成文档的母版。

## 2. 用户接入路径总览

开源版的标准接入路径应为：

1. 准备执行环境
2. 安装项目和依赖
3. 校验本机依赖是否满足要求
4. 配置设备、backend、policy、profile
5. 启动 MCP server
6. 在 Agent 客户端中注册 MCP
7. 运行第一个样例 session / flow

## 3. 先决条件

### 3.1 通用要求

用户至少需要：

- Git
- Node.js 和 `pnpm`
- Python，如果报告脚本仍有 Python 依赖
- 可执行 shell 环境

### 3.2 Android 运行要求

- Android SDK
- `adb`
- Android Emulator 或已连接真机
- 设备侧 `perfetto`
- 宿主机 `trace_processor`

### 3.3 iOS 运行要求

- macOS
- Xcode
- `xcrun simctl`
- `xcrun xctrace`
- iOS Simulator 或可用真机链路

### 3.4 首版 backend 要求

如果首版以 Maestro 为执行 backend，需额外准备：

- `maestro`

## 4. 推荐安装模型

### 4.1 源码安装

适合早期开源阶段，建议作为首选方式。

典型流程：

```bash
git clone <repo-url>
cd mobile-e2e-mcp
pnpm install
```

仓库当前使用 `pnpm workspace` 统一管理 `packages/*` 与 `examples/*` 下的 Node/TypeScript 包。

### 4.2 二进制/包安装

这可以作为后续增强能力，不必是首版要求。

例如未来可支持：

- `pnpm add -g mobile-e2e-mcp`
- `pnpm dlx mobile-e2e-mcp`
- Homebrew

但在第一阶段，源码安装更现实，也更利于贡献者理解结构。

## 5. 建议提供的基础命令

当前最小仓库级入口：

- `pnpm build`
- `pnpm typecheck`
- `pnpm validate:dry-run`
- `pnpm mcp:dev -- --platform android --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --list-devices --include-unavailable`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --doctor --include-unavailable`
- `pnpm mcp:stdio`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --install-app --platform android --runner-profile native_android --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --launch-app --platform android --runner-profile phase1 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --take-screenshot --platform android --runner-profile phase1 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --terminate-app --platform android --runner-profile phase1 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --inspect-ui --platform android --runner-profile phase1 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --query-ui --platform android --runner-profile phase1 --content-desc "View products" --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --query-ui --platform android --runner-profile phase1 --content-desc "Cart is empty" --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --query-ui --platform android --runner-profile phase1 --resource-id login_button --clickable true --query-limit 5 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --tap --platform android --runner-profile phase1 --x 900 --y 140 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --type-text --platform android --runner-profile phase1 --text hello --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --tap-element --platform android --runner-profile phase1 --content-desc "Back" --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --measure-android-performance --platform android --runner-profile phase1 --duration-ms 15000 --preset interaction --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --measure-ios-performance --platform ios --runner-profile phase1 --duration-ms 15000 --template time-profiler --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --record-screen --platform android --runner-profile phase1 --duration-ms 15000 --bitrate-mbps 4 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --record-screen --platform ios --runner-profile phase1 --duration-ms 15000 --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --reset-app-state --platform android --app-id com.example.demo --reset-strategy clear_data --dry-run`
- `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --reset-app-state --platform ios --app-id com.example.demo --reset-strategy keychain_reset --dry-run`

未来建议补齐：

- `mobile-e2e-mcp doctor`
- `mobile-e2e-mcp list-devices`
- `mobile-e2e-mcp server start`
- `mobile-e2e-mcp config validate`
- `mobile-e2e-mcp sample run`
- `mobile-e2e-mcp report generate`

如果首版 CLI 尚未完成，可先用等价脚本替代，但对外文档要说明这是过渡状态。

## 5.1 新增工具：`record_screen` 与 `reset_app_state`

### A) `record_screen`（录屏）

用途：生成可回放证据，补齐“截图只能看瞬时”的问题。

- Android 基础方案：`adb shell screenrecord`（录制后自动拉取）
- iOS simulator 基础方案：`xcrun simctl io <UDID> recordVideo`

CLI 示例：

```bash
# Android: 录制 15s，4Mbps
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --record-screen --platform android --runner-profile phase1 \
  --duration-ms 15000 --bitrate-mbps 4 --dry-run

# iOS Simulator: 录制 15s
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --record-screen --platform ios --runner-profile phase1 \
  --duration-ms 15000 --dry-run
```

参数建议：

- `duration-ms`：建议 10s~30s，足够覆盖失败窗口，避免 artifact 过大。
- `bitrate-mbps`（Android）：建议 4~8；默认 4 更稳，CI 体积更可控。
- `output-path`：建议按 `artifacts/screen-recordings/<sessionId>/...` 归档。

注意事项：

- Android `screenrecord` 单次硬上限 180s；如需更长录制，建议分段。
- iOS 当前基线针对 Simulator；真机录屏是后续增强项。

### B) `reset_app_state`（应用状态重置）

用途：在关键 flow 前恢复“干净状态”，降低登录态、缓存、权限残留导致的 flake。

支持策略：

- `clear_data`
- `uninstall_reinstall`
- `keychain_reset`（iOS simulator）

CLI 示例：

```bash
# Android: 清理应用数据
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --reset-app-state --platform android --app-id com.example.demo \
  --reset-strategy clear_data --dry-run

# Android: 卸载后重装（需提供 artifact）
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --reset-app-state --platform android --app-id com.example.demo \
  --reset-strategy uninstall_reinstall --artifact-path /abs/path/app.apk --dry-run

# iOS Simulator: Keychain reset
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --reset-app-state --platform ios --app-id com.example.demo \
  --reset-strategy keychain_reset --dry-run
```

参数建议：

- 高频 smoke：优先 `clear_data`（成本低、速度快）。
- 需要彻底清理安装态冲突：使用 `uninstall_reinstall`。
- iOS 登录凭据干扰明显时：先尝试 `keychain_reset`。

## 5.2 故障排查示例（`record_screen` / `reset_app_state`）

### A) `record_screen` 常见问题

#### 1) Android 录屏失败，提示设备不可用 / 未连接

现象：返回 `DEVICE_UNAVAILABLE` 或 stderr 包含 `adb: device ... not found`。

排查：

```bash
adb devices
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --doctor --include-unavailable
```

处理建议：

- 确认目标设备是 `device` 状态（不是 `offline` / `unauthorized`）。
- 若是 CI，优先在任务开始时执行一次设备就绪检查，再跑录屏。

#### 2) Android 返回成功但没有视频文件

现象：record 步骤通过，但 artifact 未落地。

排查：

```bash
# 先用 dry-run 看 outputPath 和 command
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --record-screen --platform android --duration-ms 10000 --dry-run
```

处理建议：

- 确认 `output-path` 所在目录有写权限。
- 保持录制时长在合理范围（建议 10s~30s）。
- Android 单次上限 180s，超长录制请分段。

#### 3) iOS simulator 录屏失败，提示 simctl 相关错误

现象：stderr 包含 `simctl` / `recordVideo` 错误。

排查：

```bash
xcrun simctl list devices
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --doctor --include-unavailable
```

处理建议：

- 先确认目标 simulator 已 boot。
- 优先使用 `--platform ios --dry-run` 检查命令拼装与输出路径。

### B) `reset_app_state` 常见问题

#### 1) `clear_data` 失败，提示 appId 缺失

现象：返回 `CONFIGURATION_ERROR`，提示需要 appId。

处理建议：

- 显式传入 `--app-id`，或在 harness 配置中补 `app_id`。

示例：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --reset-app-state --platform android --app-id com.example.demo \
  --reset-strategy clear_data --dry-run
```

#### 2) `uninstall_reinstall` 失败，提示 artifactPath 无效

现象：返回 `CONFIGURATION_ERROR`，提示找不到安装包。

处理建议：

- 传入存在的 `--artifact-path`。
- 路径建议使用绝对路径，减少 CI 工作目录差异问题。

示例：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --reset-app-state --platform android --app-id com.example.demo \
  --reset-strategy uninstall_reinstall \
  --artifact-path /abs/path/app.apk --dry-run
```

#### 3) Android 使用 `keychain_reset` 返回 unsupported

现象：返回 `UNSUPPORTED_OPERATION`。

说明与建议：

- 这是预期行为：`keychain_reset` 当前仅针对 iOS simulator。
- Android 建议使用 `clear_data` 或 `uninstall_reinstall`。

#### 4) iOS `keychain_reset` 失败

排查：

```bash
xcrun simctl list devices
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --reset-app-state --platform ios --app-id com.example.demo \
  --reset-strategy keychain_reset --dry-run
```

处理建议：

- 确认目标 simulator 可用且已 boot。
- 若仍失败，先退回 `uninstall_reinstall` 路径保障流程可继续。

## 6. 环境校验

建议在首版提供 `doctor` 命令，用于检查：

- Node.js 版本
- `adb` 是否可用
- `xcrun` 是否可用
- `maestro` 是否可用
- Android 设备是否在线
- iOS Simulator 是否可用
- 关键配置文件是否存在
- Expo dev server / launch URL 是否可达
- Android `adb reverse` 映射是否到位
- 安装包 artifact 是否存在
- 已安装 app 与安装冲突信号（如 downgrade / 签名不兼容）

理想输出应告诉用户：

- 哪些依赖已经满足
- 哪些依赖缺失
- 下一步应该执行什么

## 7. 配置模型

### 7.1 推荐配置分类

建议至少拆成以下配置类型：

- server config
- adapter config
- profile config
- policy config
- harness/sample config

### 7.2 推荐的最小配置项

首版至少应支持：

- 默认平台
- 设备标识
- App ID
- backend 类型
- artifact 输出目录
- policy profile
- profile 类型

### 7.3 配置原则

- 所有路径优先使用相对路径或环境变量注入
- 不应在仓库中写死作者个人机器绝对路径
- 设备 ID 可以来自配置，但不应强依赖单一固定值

## 8. MCP server 启动

### 8.1 本地模式

推荐启动方式：

```bash
pnpm mcp:dev -- --platform android --dry-run
```

或直接进入包目录使用：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server dev -- --platform android --dry-run
```

扩展 profile 示例：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server dev -- --platform ios --runner-profile native_ios --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server dev -- --platform android --runner-profile flutter_android --dry-run
```

### 8.2 传输模式

开源首版建议优先支持：

- `stdio`

当前最小 stdio 入口：

```bash
pnpm mcp:stdio
```

协议暂为最小行分隔 JSON，请求示例：

```json
{"id":1,"method":"initialize"}
{"id":2,"method":"list_tools"}
{"id":3,"method":"invoke","params":{"tool":"doctor","input":{"includeUnavailable":false}}}
```

后续可扩展：

- 本地 HTTP
- SSE

## 9. Agent 集成模型

### 9.1 通用原则

用户应能在任何支持 MCP 的 Agent 客户端中，把 `mobile-e2e-mcp` 注册成一个本地 server。

### 9.2 集成信息应包含

未来文档至少需要给出：

- server 启动命令
- 所需环境变量
- 工作目录要求
- config 文件路径

### 9.3 对用户的期望

用户只需要：

- 在自己的 Agent 配置中添加一个 MCP server 定义
- 指向本地启动命令
- 确保运行该命令的环境能访问设备和 backend

## 10. 第一个样例执行

建议首版始终提供一个最小 sample，例如 RN 登录 demo。

标准示例路径建议如下：

1. 启动 sample app
2. 启动 MCP server
3. 调用 `start_session`
4. 调用 `run_flow`
5. 调用 `end_session`

## 11. 首批 MCP 工具建议

建议首版优先暴露以下工具：

- `start_session`
- `run_flow`
- `end_session`

首版最小目标是先打通 `TS server -> TS adapter -> 现有 shell runner` 的执行闭环，再逐步补齐更细粒度工具。


当前 `inspect_ui` 在 Android 上除了原始 XML，还会返回结构化摘要，包括节点总数、可点击节点数量、带 content-desc/text 的 sample nodes，作为后续元素级交互的基础输入。

当前新增的 `query_ui` 会复用同一份 Android hierarchy 解析结果，提供最小查询层：

- 查询条件：`resourceId` / `contentDesc` / `text` / `className` / `clickable`
- 查询结果：原始 node、`matchedBy`、`score`、`result.totalMatches`
- 返回语义：命中多个候选时不会偷偷裁成单个元素，默认返回候选列表；若设置 `query-limit`，只限制回传条数，不改变 `totalMatches`
- CLI 最小入口：`--query-ui` 配合 `--content-desc` / `--resource-id` / `--class-name` / `--clickable`，或在 `--query-ui` 下直接使用 `--text`
- 当前 demo Android 页面更常把可见文案暴露在 `content-desc`，所以对 `Cart is empty`、`View products` 这类字符串，优先使用 `--content-desc` 更符合当前样例实际 hierarchy

这层能力的目标是让后续 `tap` / `type_text` 可以基于查询结果升级为元素级交互，而不是继续长期依赖人工坐标。

当前仓库也新增了一个最小只读证据工具 `get_logs`：

- Android 走 `adb -s <device> logcat -d -t <N>`，适合抓取最近若干行 logcat
- iOS simulator 走 `xcrun simctl spawn <UDID> log show --style compact --last <Ns>`，适合抓取最近时间窗口日志
- 返回会包含 `outputPath`、底层 `command`、`lineCount`、`sinceSeconds`、原始 `content`，以及 AI 友好的 `summary`
- 这条链路当前定位为“诊断/取证”，不是更高层的 crash 归因或 app 级过滤系统

当前仓库还新增了两条最小 performance MVP 工具：

- `measure_android_performance`：Android 时间窗口模式，走 `Perfetto + trace_processor`
- `measure_ios_performance`：iOS 时间窗口模式，走 `xcrun xctrace + export + summary parser`
- 两条工具都会返回统一 `ToolResult`，并附带 `artifactPaths`、`summary`、`suspectAreas`、`diagnosisBriefing`、`nextSuggestions`
- Android 当前支持 level 为 `full`，但真实执行依赖宿主机已安装 `trace_processor`
- iOS 当前支持 level 为 `partial`，当前 parser 只做轻量摘要，不伪装成完整 Instruments 深分析
- iOS 当前即使接收 `appId`，也只是用于结果标注；MVP 采集范围仍是所选时间窗口内的全进程 trace，不承诺 app 级精确隔离
- iOS capability matrix 现在需要这样理解：
  - `time-profiler`：当前已 real validated，适合先判断 CPU / hot path
  - `memory`：当前已 real validated，但在 simulator 上更依赖 attach-to-app / pid attach，而不是无差别 `--all-processes`
  - `animation-hitches`：当前 parser 和 dry-run 已有，但在现有 simulator/runtime 上真实录制可能受平台限制，device-preferred
- 对 AI 和开源用户都应显式接受这一点：iOS 三个模板并不是同等成熟，当前最稳的是 `time-profiler`，其次是 `memory`，`animation-hitches` 需要把平台支持作为前提条件
- Android 的 Perfetto 目录不是“所有手机永远都一样”：当前实现按 Android 版本分流，Android 12+ 优先使用 `/data/misc/perfetto-configs` 与 `/data/misc/perfetto-traces`；较老的非 root 设备会改走 stdin 传 config；更老的 Android 版本在 trace 拉取上也可能需要 `adb exec-out cat` 风格的兼容路径
- 因此不应把 `/data/misc/...` 视为所有设备的唯一真理；对开源用户，更重要的是让工具在可探测到 Android SDK 时推导策略，在探测失败时退回现代默认策略，并让 `doctor` 清楚展示“当前推导/假设的路径”
- `trace_processor` 也不存在统一安装目录；当前实现会优先读取 `TRACE_PROCESSOR_PATH`，否则先查 `PATH`，再尝试常见 fallback（如 `~/.local/bin/trace_processor`、`/opt/homebrew/bin/trace_processor`、`/usr/local/bin/trace_processor`）
- `doctor` 现在会明确展示：host 侧最终使用的 `trace_processor` 路径、Android 设备是否暴露 `perfetto`、以及按当前 Android SDK 推导出的 Perfetto config/trace 传输策略；若 SDK 无法探测，则会显示这是“默认现代策略假设”，不是已验证结论
- Android 侧摘要已比首版更积极：除了 `sched` / `actual_frame_timeline_slice` / `process_counter_track`，现在也会尝试 `thread_state`、通用 `slice` 命名特征、以及更宽松的 `counter_track` 内存轨道来提高 CPU / jank / memory 分类命中率；如果这些 fallback 仍不足，结果依然会诚实返回 `unknown`
- iOS `Time Profiler` 解析已从纯 token 计数提升为轻量结构化提取：会尝试从 export XML 中聚合 top processes 与 top hotspots；但它仍然是 all-process 视角下的 MVP 摘要，不承诺等价于完整 Instruments 人工分析
- `doctor` 现在不仅会显示 Android performance strategy，还会尝试验证当前策略下的 config 可写性 / trace 传输 readiness；这些检查能提高可用性判断，但依然不是对所有 OEM 权限模型的绝对保证

当前仓库还新增了一个最小 crash/ANR 证据工具 `get_crash_signals`：

- Android 会同时读取 `adb logcat -d -b crash -t <N>` 与 `/data/anr` 目录，用于抓取近期 crash buffer 与 ANR 文件名
- iOS simulator 会通过 `xcrun simctl getenv <UDID> HOME` 定位 simulator data root，并输出 `Library/Logs/CrashReporter` 树下的 manifest
- 返回会包含 `outputPath`、底层 `commands`、`signalCount`、`entries`、原始 `content`，以及 AI 友好的 `summary`
- 这条链路当前定位仍是“证据采集”，不是完整的 crash 归因、`.ips` 解析器或 app 级过滤系统

当前仓库还新增了一个最小一键诊断包工具 `collect_diagnostics`：

- Android 走 `adb bugreport`，输出完整 `bugreport.zip`
- iOS simulator 走非交互 `simctl diagnose --no-archive`，输出 simulator 诊断目录
- 返回会包含 `outputPath`、底层 `commands` 与收集到的 `artifacts`
- 这条链路适合一次性取证，不适合作为高频步骤；当前也不做额外压缩、脱敏或内容裁剪

在这三条原始取证链路之上，当前仓库还新增了一个面向 AI 调试器的 `collect_debug_evidence`：

- 默认复用 `get_logs` + `get_crash_signals`，返回一份压缩后的 `narrative`、`interestingSignals`、`logSummary`、`crashSummary`
- 现在也会尽量合并 `capture_js_console_logs` 与 `capture_js_network_events` 的快照结果，让同一份 packet 同时覆盖 native + JS 两层证据
- 可以通过 `--text <keyword>` 先做关键词聚焦，减少 AI 在无关日志上的 token 消耗
- 可以通过 `--include-diagnostics true` 在摘要仍不够时再升级到重型 diagnostics 包
- 如果 Metro inspector 不可达，工具会诚实返回 partial，并在 `narrative` 里说明 JS 证据层缺失，而不是假装已经覆盖 JS runtime
- 这条链路的目标就是让 AI 先看“高价值摘要”，只有在摘要不够时再回头读原始 artifact

参考 `react-native-debugger-mcp` 的工作流，当前仓库还新增了两条 RN/Expo inspector 入口：

- `list_js_debug_targets`：读取 Metro 的 `/json/list`，让 AI 先发现当前有哪些可调试 JS target
- `capture_js_console_logs`：通过 inspector WebSocket 做一次性 `Runtime.consoleAPICalled` / `Runtime.exceptionThrown` snapshot
- `capture_js_console_logs` 现在会把 JS exception 结构化到 `exceptionType`、`sourceUrl`、`lineNumber`、`columnNumber`、`stackFrames`
- `capture_js_network_events`：通过 inspector WebSocket 做一次性 `Network.*` snapshot，优先提取失败请求和错误状态
- 这三条能力当前是“发现 + 快照”层，不替代 native logs；更适合解决 JS 逻辑错误、console 输出、unhandled exception、请求失败这类问题
- 当前环境下如果 Metro 没启动，会快速返回 `configurationError`，避免 AI 长时间卡在不可达的 debug 通道上

当前仓库也已经补了一个最小动作桥接层 `tap_element`：

- 输入仍复用 `resourceId` / `contentDesc` / `text` / `className` / `clickable`
- Android 上会先走 `resolve_ui_target`，只有在 `resolved` 状态下才继续执行点击
- 返回会包含 `matchCount`、`resolution`、`matchedNode`、`resolvedBounds`、`resolvedX`、`resolvedY`
- 这仍不是完整元素动作系统；它只是从“查询层”过渡到后续元素级 `tap` / `type_text` 的桥接能力

当前还新增了两条最小动作链路：

- `resolve_ui_target`：显式返回 `resolved` / `no_match` / `ambiguous` / `missing_bounds` / `unsupported`；若是 Android dry-run / preview 这类“本次未实际解析 live hierarchy”的路径，会额外返回 `not_executed`
- `type_into_element`：Android 上先聚焦解析后的节点，再输入 `--value`
- `wait_for_ui`：Android 上按 selector 轮询 hierarchy，支持 `visible` / `gone` / `unique`；若 hierarchy 连续两次抓取或读取失败，会直接返回真实失败而不是继续等到超时
- `scroll_and_resolve_ui_target`：Android 上在滚动容器内执行“抓 tree -> resolve -> swipe -> retry”


当前 iOS `inspect_ui` 不再是假定 simctl 能导出 tree，而是明确依赖 `idb ui describe-all --json --nested`。若环境未安装 `idb-companion` / `fb-idb`，工具会返回配置型 partial/failed 结果并提示安装。

当前 iOS `inspect_ui` 即使成功抓到 hierarchy，也会在 data 中标记 `supportLevel: partial`，明确说明它解决的是“tree capture”，不是 Android 等价的全链路查询/动作支持。

当前 iOS `query_ui` 也遵循同样的诚实原则：

- 若未安装 `idb`，返回 configuration-style partial 结果
- 若能成功抓取 hierarchy，也只返回 raw artifact + partial/unsupported 语义
- 不会伪装 iOS 已具备 Android 等价的结构化查询能力

当前 iOS `tap` / `type_text` / `tap_element` 也保持同样的边界：

- 会明确返回 partial / unsupported 风格语义
- 文案会直接说明“当前仓库尚未把这些动作接到 iOS 执行后端”
- 不会因为底层理论上有 `idb ui tap` / `idb ui text` 能力，就假装仓库里已经完整接好

当前 iOS `resolve_ui_target` / `type_into_element` / `wait_for_ui` 也遵循同样原则：

- 返回 partial / unsupported 风格语义
- 不伪装 iOS 已具备 Android 等价的目标解析、等待与元素输入能力

当前 iOS `scroll_and_resolve_ui_target` 也遵循同样原则：

- 返回 partial / unsupported 风格语义
- 不伪装 iOS 已具备 Android 等价的滚动解析闭环


当前仓库默认会优先从用户目录解析 `idb` CLI 与 companion 路径，用于 iOS `inspect_ui`。在当前环境中，成功路径依赖：

- `~/Library/Python/3.9/bin/idb`
- `~/.local/share/idb-companion.universal/bin/idb_companion`

若路径缺失，`doctor` 与 `inspect_ui` 都会返回明确的配置诊断，而不会伪装成已支持。

## 测试与 fixture

当前仓库新增了最小回归测试入口：

- `pnpm test:unit`

当前 fixture 位于：

- `tests/fixtures/ui/android-cart.xml`
- `tests/fixtures/ui/ios-sample.json`
- `tests/fixtures/ocr/*.svg` / `*.png` / `*.observations.json`

这些 fixture 主要用于回归验证：

- Android hierarchy XML 解析与 summary
- 查询条件组合过滤和 `query-limit`
- bounds 结构化与动作桥接解析
- resolution 的 `ambiguous` / `resolved` 语义
- `wait_for_ui` 的 `visible` / `gone` / `unique` 判断语义
- 滚动手势坐标推导
- iOS hierarchy JSON 到 summary 的最小归一化

此外，当前 `pnpm test:unit` 还会覆盖两层无设备 smoke test：

- `packages/adapter-maestro`：验证 `resolve_ui_target` / `tap_element` / `type_into_element` / `wait_for_ui` / `scroll_and_resolve_ui_target` 的配置错误、Android dry-run、iOS partial envelope 语义
- `packages/mcp-server`：验证 `createServer`、stdio `handleRequest`、dev CLI `parseCliArgs` / `main()` 对新 UI 工具入口的关键 dispatch 和 transport 语义

顶层 `pnpm run validate:dry-run` 现已不再只是串联命令退出码，而是通过 `scripts/validate-dry-run.ts` 真实调用 dev CLI dry-run，并断言返回 JSON 的关键语义字段（如 `status`、`reasonCode`、`supportLevel` 与部分 tool-specific data）。

OCR fixture 维护现在也有两层入口：

- `pnpm validate:ocr-fixtures`：跨平台校验 OCR fixture triad 的 text inventory、SVG/PNG hash 与 PNG 尺寸
- `pnpm fixtures:ocr:sync [fixture-name...]`：仅在 macOS 上运行，使用真实 Vision provider 重新生成 `.png` 与 `.observations.json`

另外新增了一个独立的 macOS smoke workflow：`.github/workflows/ocr-smoke.yml`。它只在 OCR 相关路径变更时自动触发，也可以手动触发；默认 Ubuntu CI 仍然只承担无设备回归，不会被真实 OCR host 依赖拖慢或拖脆弱。

当前还新增了一个 capability discovery 入口：`describe_capabilities`。它会返回当前 `platform` / `runnerProfile` 下的 tool capability matrix；同时 `start_session` 和 `list_devices` 的返回结果也会附带 capability profile，方便调用方在动作前先判断 Android full support 与 iOS partial/unsupported 的边界。

在编排层方面，当前还新增了一个最小组合动作：`scroll_and_tap_element`。它会先复用现有的 `scroll_and_resolve_ui_target` 做滚动查找，再在目标明确后执行点击，避免调用方自己手动分两次请求完成同一个“滚动后点击”的意图。

在证据模型方面，artifact-heavy 工具现在开始输出统一的 `evidence[]` 条目。每条 evidence 会标出 `kind`、`path`、`supportLevel`、`description`，用于把 UI dump、screenshot、logs、crash signals、diagnostics bundle 与 debug summary 放进一个更稳定的消费模型里；同时原有的 `artifacts[]` 路径数组仍然保留，用于兼容旧调用方。
