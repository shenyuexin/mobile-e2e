# Performance MVP 方案

## 目标

为 `mobile-e2e-mcp` 提供一个 **AI 可调用、可自动分析、可逐步演进** 的最小 performance 能力。

第一版目标不是做成完整性能平台，而是让 AI 能回答：

1. 这次问题像不像性能问题？
2. 最可疑的是 CPU / jank / memory 哪一类？
3. 下一步最应该看哪个 artifact 或指标？

---

## 总体策略

- 先做 **Android + iOS 都有的最小 performance 能力**
- 第一阶段优先 **平台分离**，不要先做统一入口
- Android 主方案：**Perfetto + trace_processor**
- iOS 主方案：**xcrun xctrace + export + summary parser**
- 输出重点是 **summary / suspectAreas / diagnosisBriefing**，而不是只产出 trace 文件

---

## 为什么不是一开始就做成“大而全”的性能平台

第一版不追求：

- 全模板覆盖
- 全指标覆盖
- 完整 UI 可视化
- 企业级 profiling suite
- 全自动深度根因分析

第一版只解决最常见的问题：

- 这次操作是不是明显卡顿？
- FPS / frame time 是否异常？
- CPU 是否明显过高？
- memory 是否有明显异常增长？
- Android 是否存在明显 jank / long frame？
- iOS 是否存在明显 CPU hot path / hitch？

换句话说，第一版先回答：

> 这像不像性能问题？如果像，最值得先看什么？

---

## 能力边界

### Android 第一版做什么

做：

- 录一段 Perfetto trace
- 用 trace_processor 跑固定查询
- 提炼少量核心指标
- 输出 AI 友好的 summary

不做：

- 自定义复杂 trace config 编辑器
- 全量 SQL exploration
- Pretto 作为主能力入口
- 深度 flame graph 可视化集成

### iOS 第一版做什么

做：

- 用 `xcrun xctrace record` 录制
- 导出结果
- 提炼少量核心指标
- 输出 AI 友好的 summary

不做：

- 全 Instruments 模板支持
- 完整 trace XML / trace bundle 深解析
- 全量 flame graph / symbol 级深分析

---

## 能力拆分建议

### 方案 A：平台分离（推荐）

#### `measure_android_performance`

建议输入：

- `sessionId`
- `runnerProfile`
- `deviceId?`
- `appId?`
- `durationMs`
- `preset`
  - `general`
  - `startup`
  - `interaction`
  - `scroll`
- `outputPath?`
- `dryRun?`

建议输出：

- `tracePath`
- `summary`
  - `cpu`
  - `jank`
  - `frameTime`
  - `topHotSlices`
- `suspectAreas`
- `diagnosisBriefing`
- `nextSuggestions`

#### `measure_ios_performance`

建议输入：

- `sessionId`
- `runnerProfile`
- `deviceId?`
- `appId?`
- `durationMs`
- `template`
  - `time-profiler`
  - `animation-hitches`
  - `memory`
- `outputPath?`
- `dryRun?`

建议输出：

- `traceBundlePath`
- `exportPath`
- `summary`
  - `cpu`
  - `memory`
  - `frame/hitch`
- `suspectAreas`
- `diagnosisBriefing`
- `nextSuggestions`

### 方案 B：统一入口（后续）

后续可以再加：

- `measure_performance`

内部再按 `platform` 分流到 Android / iOS。

当前建议：

- 第一阶段只做平台分离
- 第二阶段再做统一入口

---

## Android 落地方案

### 工具选型

主链路：

- `perfetto`
- `trace_processor`

### 为什么不是 Pretto 作为主方案

Pretto 更适合人类查看 trace：

- UI 强
- 自动化弱
- AI 不适合直接消费

AI 更适合：

- SQL 结果
- JSON summary
- suspect sentence

因此 Android MCP 工具层建议围绕：

- Perfetto trace
- trace_processor 查询
- summary 生成

而不是围绕 Pretto 本身做自动化。

### Android MVP 采集方式

建议预置 2~3 个 config preset：

- `general`
  - sched
  - process stats
  - gfx/frame
  - android app slices
- `startup`
  - app launch / process / frame
- `interaction`
  - frame / input / main thread / render thread

建议把 preset config 放在仓库里：

- `configs/perf/android/general.pbtx`
- `configs/perf/android/startup.pbtx`
- `configs/perf/android/interaction.pbtx`

### Android MVP 分析方式

采集后跑固定 SQL，例如：

- jank frame count
- frames > 16ms / > 32ms
- top long-running slices
- main thread hotspots
- render thread hotspots
- process CPU usage summary

建议输出：

- `jankSeverity`
- `avgFrameTimeMs`
- `worstFrameTimeMs`
- `topBlockingSlices`
- `diagnosisBriefing`

### Android artifact 设计

建议输出到：

- `artifacts/performance/<sessionId>/android-<runnerProfile>.perfetto-trace`
- `artifacts/performance/<sessionId>/android-<runnerProfile>.summary.json`
- `artifacts/performance/<sessionId>/android-<runnerProfile>.md`

---

## iOS 落地方案

### 工具选型

主链路：

- `xcrun xctrace record`
- `xcrun xctrace export`

### iOS MVP 模板建议

第一版建议先做 1~2 个模板：

- `Time Profiler`
- `Animation Hitches`

如果想再保守一点，先只做：

- `Time Profiler`

### iOS MVP 输出策略

由于 xctrace 原始输出对 AI 不够友好，第一版重点不是深解析，而是：

- 录制
- 导出
- 从导出结果提炼少数关键值

例如：

- top CPU-heavy symbol / process
- hitch count / long frame indicator
- rough memory growth signal

### iOS artifact 设计

建议输出到：

- `artifacts/performance/<sessionId>/ios-<runnerProfile>.trace`
- `artifacts/performance/<sessionId>/ios-<runnerProfile>.export.xml`
- `artifacts/performance/<sessionId>/ios-<runnerProfile>.summary.json`
- `artifacts/performance/<sessionId>/ios-<runnerProfile>.md`

---

## 仓库内落点建议

### Contracts

在 `packages/contracts/src/types.ts` 增加：

- `MeasureAndroidPerformanceInput`
- `MeasureAndroidPerformanceData`
- `MeasureIosPerformanceInput`
- `MeasureIosPerformanceData`
- 共用 summary types

例如：

- `PerformanceMetricSummary`
- `PerformanceSuspect`
- `PerformanceDiagnosis`

### Adapter

按当前 adapter 放置规范，先不要默认把逻辑直接堆到 `packages/adapter-maestro/src/index.ts`。优先参考：

- `docs/architecture/adapter-code-placement.md`

建议先放在独立模块中，例如：

- `measureAndroidPerformanceWithMaestro`
- `measureIosPerformanceWithMaestro`

如果本阶段只做最小 MVP，可以先让 `index.ts` 做薄编排；真正的 trace/runtime 逻辑应尽量直接落到：

- `src/performance/android.ts`
- `src/performance/ios.ts`

### MCP Server

新增 tools：

- `packages/mcp-server/src/tools/measure-android-performance.ts`
- `packages/mcp-server/src/tools/measure-ios-performance.ts`

并接到：

- `server.ts`
- `index.ts`
- `dev-cli.ts`
- `stdio-server.ts`

### Docs

补到：

- `docs/product/03-installation-and-integration.zh-CN.md`
- `docs/phases/minimal-ts-mcp-loop.zh-CN.md`

---

## AI 友好的输出示例

### Android 示例

```json
{
  "status": "success",
  "reasonCode": "OK",
  "data": {
    "tracePath": "artifacts/performance/s1/android-phase1.perfetto-trace",
    "summary": {
      "avgFrameTimeMs": 19.4,
      "worstFrameTimeMs": 62.1,
      "jankFrameCount": 18,
      "topHotSlices": [
        "Choreographer#doFrame",
        "RenderThread",
        "RecyclerView#onLayout"
      ]
    },
    "suspectAreas": [
      "Performance suspect: repeated frame overruns above 16ms.",
      "Performance suspect: UI thread layout work dominates the sampled interaction."
    ],
    "diagnosisBriefing": [
      "Captured Android performance trace for the sampled interaction.",
      "Jank risk is elevated: 18 slow frames detected.",
      "Top suspect is main-thread layout / frame work."
    ]
  }
}
```

### iOS 示例

```json
{
  "status": "success",
  "reasonCode": "OK",
  "data": {
    "traceBundlePath": "artifacts/performance/s1/ios-phase1.trace",
    "summary": {
      "topCpuSymbol": "swiftUI body update",
      "hitchCount": 7
    },
    "suspectAreas": [
      "Performance suspect: repeated animation hitches during sampled window."
    ],
    "diagnosisBriefing": [
      "Captured iOS performance trace.",
      "Animation hitching appears non-trivial in the sampled interval."
    ]
  }
}
```

---

## 优先级建议

### Phase 1

- `measure_android_performance`
- preset configs
- trace_processor summary
- docs + dry-run + real validation

### Phase 2

- `measure_ios_performance`
- minimal xctrace integration
- summary export
- docs + dry-run + real validation

### Phase 3

- `measure_performance` 统一入口
- 接入 `collect_debug_evidence`
- 让 debug packet 可选附带 perf summary

---

## 是否现在就做

建议：**可以做，但不要作为当前唯一主线。**

当前 repo 更大的能力缺口仍然包括：

- iOS UI parity
- governance runtime
- core/shared execution layer

因此 performance 更适合作为：

- 近中期新增能力
- 先做 Android MVP
- 不要一下铺太大

---

## 最终建议

一句话版：

> 先做 Android Perfetto MVP，再做 iOS xctrace MVP；重点不是“采集很多 trace”，而是“让 AI 得到一个可直接推理的 performance summary”。

---

## 从用户 / AI 视角的 MCP 调用链

本项目现有 MCP 调用链已经比较稳定，performance 工具应直接复用这套模式：

1. **入口层**
   - stdio：`packages/mcp-server/src/stdio-server.ts`
   - CLI：`packages/mcp-server/src/dev-cli.ts`
2. **路由层**
   - `packages/mcp-server/src/server.ts`
   - 统一 `invoke(toolName, input)`
3. **tool handler 层**
   - `packages/mcp-server/src/tools/*.ts`
   - 一般只做薄封装，把请求转发给 adapter
4. **adapter 执行层**
   - `packages/adapter-maestro/src/index.ts` 负责 tool 级编排与统一结果封装
   - 真正调用 adb / xcrun / perfetto / trace_processor / xctrace 的实现，优先放到独立 runtime 模块
5. **artifact + summary 输出**
   - 返回统一 `ToolResult`
   - 包含 `status` / `reasonCode` / `artifacts` / `data` / `nextSuggestions`

也就是说，未来 performance tool 的接入方式应该与现有：

- `run_flow`
- `collect_debug_evidence`
- `get_logs`
- `get_crash_signals`

完全一致，不需要另起一套系统。

---

## 用户 / AI 的两种推荐使用模式

### 模式 A：时间窗口模式（建议先实现）

这是最容易落地、也最容易被用户理解的模式。

### 使用方式

用户 / AI 调用：

- `measure_android_performance`
- 或 `measure_ios_performance`

并传入：

- `durationMs`
- `preset` / `template`
- `appId`
- `deviceId`

### 内部执行流程

1. 工具检查环境依赖
2. 开始采集 trace
3. 等待一个时间窗口
4. 用户手动操作 app，或 AI 在这个窗口里调用其他动作工具
5. 停止采集
6. 自动分析 trace
7. 输出：
   - trace artifact
   - summary json
   - diagnosis briefing
   - suspect areas

### 适合的场景

- 手动跑一个登录流程
- 人工触发一次复杂交互
- 想快速判断“这次是不是性能问题”

### 优点

- 最容易实现
- 不强耦合 flow runner
- 用户心智简单

### 不足

- 采集窗口和真实操作未必完全对齐
- 更适合作为 MVP，而不是最终闭环

---

### 模式 B：flow 包裹模式（后续重点）

这是更适合 AI 自动化的模式。

### 使用方式

用户 / AI 调用：

- `measure_android_performance`
- 或 `measure_ios_performance`

并额外传入：

- `flowPath`
- 或 `sessionId` + `runnerProfile`

### 内部执行流程

1. start capture
2. 内部调用 `run_flow`
3. flow 执行完成
4. stop capture
5. 自动分析
6. 输出 summary + artifacts

### 适合的场景

- AI 自动跑完整流程
- regression / CI
- before / after 性能对比

### 优点

- 真正闭环
- 最适合 AI 自动化
- 最容易后续接入 `collect_debug_evidence`

### 不足

- 比时间窗口模式更复杂
- 要与当前 `run_flow` 集成得更紧密

---

## 从开源用户视角看，这个方案是否方便？

如果实现得当，我认为是方便的。

关键不在于底层工具多强，而在于：

- 用户不用自己拼 adb / perfetto / xctrace 命令
- 用户不用自己导出 trace
- 用户不用自己解析 trace
- AI 不需要自己从原始 trace 猜测先看哪个指标

performance 工具应该像现有 `collect_debug_evidence` 一样，直接返回：

- `summary`
- `suspectAreas`
- `diagnosisBriefing`
- `nextSuggestions`

而不是只给：

- `.perfetto-trace`
- `.trace`
- `.xml`

否则对 AI 和普通用户都不够友好。

---

## 第一版是否需要 App 代码依赖？

### 结论：原则上不需要

第一版应优先走：

- **外部采集**
- **外部分析**

而不是要求业务 App 先接 SDK 或埋点。

### Android 第一版所需依赖

- `adb`
- `perfetto`
- `trace_processor`

### iOS 第一版所需依赖

- `xcrun xctrace`
- Xcode / Command Line Tools 环境

### 可选增强（不是 MVP 前置）

后续如果要提升分析精度，可以增加可选 instrumentation：

- Android：自定义 trace markers
- iOS：`os_signpost`
- RN：screen transition / JS markers

但这些都应作为增强项，而不是第一版前置条件。

---

## Android / iOS 的工具定位

### Android

建议主方案：

- **Perfetto + trace_processor**

不建议把 Pretto 作为 MCP 主能力入口，因为：

- Pretto 更适合人类可视化查看
- AI 更适合消费 SQL / JSON / summary

### iOS

建议主方案：

- **xcrun xctrace + export + summary parser**

第一版不要求完整 Instruments 平台化，只要求：

- 能录
- 能导
- 能出 summary
- 能让 AI 判断方向

---

## 推荐的开源用户使用体验

### Android 时间窗口示例

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --measure-android-performance \
  --platform android \
  --runner-profile phase1 \
  --app-id com.example.app \
  --duration-ms 15000 \
  --preset interaction
```

然后用户手动操作 app，MCP 在窗口结束后输出：

- trace artifact
- summary json
- md diagnosis report

### Android flow 包裹示例（后续）

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --measure-android-performance \
  --platform android \
  --runner-profile phase1 \
  --flow-path flows/login.yaml \
  --preset startup
```

### iOS 时间窗口示例

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts \
  --measure-ios-performance \
  --platform ios \
  --runner-profile phase1 \
  --app-id com.example.app \
  --duration-ms 15000 \
  --template time-profiler
```

---

## 与现有 debug packet 的关系

长期看，performance 不应只是独立工具。

更理想的路线是：

1. 先做独立 performance 工具
2. 让它输出 AI 可用 summary
3. 后续再把它并入 `collect_debug_evidence`

届时统一 debug packet 可以覆盖：

- logs
- crash
- JS runtime
- network
- performance

这样 AI 一次调用就能拿到更完整的 first-pass diagnosis 包。

---

## 建议的实际实施顺序

### 第一阶段

- Android `measure_android_performance`
- 先做时间窗口模式
- 产出 trace + summary + diagnosis

### 第二阶段

- iOS `measure_ios_performance`
- 同样先做时间窗口模式

### 第三阶段

- flow 包裹模式
- 接入 `run_flow`

### 第四阶段

- 并入 `collect_debug_evidence`

---

## 一句话总结

> 这个 performance 方案完全可以走现有 MCP 调用链，而且第一版不需要 App 代码依赖。最好的落地方式是先做“时间窗口模式”的 Android Perfetto MVP，再逐步扩展到 iOS 和 flow 包裹模式。
