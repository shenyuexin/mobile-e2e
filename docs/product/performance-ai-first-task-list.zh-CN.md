# Performance AI-First 任务清单

## 目标

本清单用于回答两个问题：

1. 当前 `mobile-e2e-mcp` 的 performance 能力在 AI-first 要求下已经做到哪里。
2. 还有哪些是必要的、哪些还不够好、哪些可以留到后续阶段。

AI-first 的核心标准不是“能不能录到 trace”，而是：

- AI 能否判断这像不像性能问题
- AI 能否判断更像 CPU / jank / memory 哪一类
- AI 能否得到下一步该看哪个 artifact / 指标的明确建议
- 工具在失败时能否给出诚实、可行动的 reasonCode 和 nextSuggestions

---

## 当前已完成

### 1. Android performance MVP 已可真实运行

- 工具：`measure_android_performance`
- 主链路：`Perfetto + trace_processor`
- 已完成：
  - time-window capture
  - dry-run
  - real device validation
  - Android 版本分流（`/data/misc/perfetto-*` / stdin config / exec-out）
  - host `trace_processor` 自动发现
  - doctor 环境检查与 readiness 展示
  - AI-friendly 输出：`summary` / `suspectAreas` / `diagnosisBriefing` / `nextSuggestions`

### 2. Android summary 已从“只会录”升级到“可初步推理”

- 已支持：
  - CPU：`sched` + `thread_state` fallback
  - jank：`actual_frame_timeline_slice` + frame-like `slice` fallback
  - memory：`process_counter_track` + `counter_track` fallback
- 已支持 heuristic honesty：
  - fallback 路径会在 note 中明确标识为 heuristic
- 已修复：
  - `trace_processor` fixed-width 输出解析
  - footer / 分隔线污染 summary
  - hotspot 名称被错误拆分

### 3. iOS performance 已从 dry-run MVP 升级到部分 real-path 可用

- 工具：`measure_ios_performance`
- 主链路：`xcrun xctrace record + export + summary parser`
- 当前模板状态：
  - `time-profiler`：real validated
  - `memory`：real validated（通过 attach-to-app）
  - `animation-hitches`：dry-run + parser 已有，但当前 simulator/runtime 真实录制不支持

### 4. iOS parser 已不再只有 token 计数

- `time-profiler`
  - `topProcesses`
  - `topHotspots`
- `animation-hitches`
  - `slowFrameCount`
  - `avgFrameTimeMs`
  - `worstFrameTimeMs`
- `memory`
  - allocation-heavy row signals
  - largest parsed allocation summary

### 5. iOS failure semantics 已更诚实

- 缺少 `xcrun` / spawn 失败 -> `CONFIGURATION_ERROR`
- template 不支持当前平台 -> `DEVICE_UNAVAILABLE`
- `memory` 模板在 simulator 上不再强制 `--all-processes`
  - 若传入 `appId`，会尝试 launch app 并 attach 到 pid

### 6. 测试覆盖已显著增强

- adapter tests：
  - Android parser / error semantics / strategy
  - iOS dry-run
  - iOS `time-profiler` / `animation-hitches` / `memory` parser
  - iOS missing `xcrun` failure semantics
  - iOS attach-target command planning
- transport tests：
  - server / CLI / stdio dry-run coverage for performance tools
  - additional iOS template dry-run coverage
- validation：
  - `pnpm build`
  - `pnpm test:unit`
  - `pnpm typecheck`
  - `pnpm run validate:dry-run`

---

## 当前必要但还没做好的点

### P0 - 必要收口

#### 1. iOS capability matrix 已显式化

当前已明确：

- `time-profiler`：real validated on simulator
- `memory`：real validated via attach-to-app / pid attach
- `animation-hitches`：parser 已有，但当前 simulator/runtime 真实录制受平台支持限制，device-preferred

这些信息现在已进入：

- capability narrative
- doctor 输出
- 本文档

### P1 - 很值得继续做

#### 2. iOS memory parser 仍然偏浅

当前已经能：

- 抓 allocation-heavy rows
- 给出 largest allocation summary

但还不够：

- 没有更稳定的 process/category aggregation
- 没有更明确的 “可能是内存增长 / 分配尖峰 / 持续累积” 区分

为什么值得做：

- AI-first 里 memory 问题很常见，当前 summary 仍然偏保守

#### 3. iOS time-profiler 仍缺 process filtering / symbol cleanup

当前 real run 里仍可能看到：

- `<unknown>`
- 地址类 symbol
- top process 过于粗糙

为什么值得做：

- 这直接影响 AI 能否给出高质量 diagnosisBriefing

#### 4. Android summary 仍需继续 app-centric 打磨

当前已做：

- target app process 会优先出现在 CPU summary 中
- CPU note 会同时区分 target app 与 overall highest process
- memory note 会优先使用 app-scoped 结果，fallback 才退到 heuristic / broader counters

但还可以继续做：

- 把 topHotspots 也更强地和 target app 线程关联
- 更好地区分系统噪声与 app-level suspect

为什么值得做：

- AI-first 更关心“用户当前 app 是否是主要嫌疑对象”

### P2 - 后续增强

#### 5. flow 包裹模式

当前仍是 time-window mode。

后续可以做：

- start capture
- run flow
- stop capture
- summarize

为什么重要：

- 这才是最适合 AI 自动化与 CI 的性能闭环

#### 6. 并入 `collect_debug_evidence`

当前 performance 还是独立工具。

后续更理想：

- logs
- crash
- js runtime
- network
- performance

统一进一个 debug packet。

为什么重要：

- AI 一次调用就能获得更完整的 first-pass diagnosis 包

---

## 当前不建议马上做

- unified `measure_performance` 统一入口
- 全 Instruments / 全 Perfetto 模板覆盖
- flame graph / symbol 深分析平台化
- app SDK / signpost / custom markers 作为前置依赖
- Windows 环境友好性

这些都可以做，但不是当前 AI-first 必要项。

---

## AI-First 完成度判断

### 已满足

- Android：可以真实跑、真实产出、真实判断方向
- iOS：至少 `time-profiler` 与 `memory` 已进入真实可运行状态
- 输出结构已适合 AI 消费
- failure semantics 已明显更诚实

### 仍需继续打磨

- iOS template 之间成熟度仍不均衡，但矩阵和限制现在已显式可见
- Android / iOS summary 还可以进一步更 app-centric
- iOS memory 现在更结构化，但仍不是深度 heap analysis

---

## 建议的下一步顺序

1. 继续提升 iOS `memory` summary 的结构化程度
2. 继续提升 Android CPU / hotspot summary 对目标 app 的优先展示
3. 增加更真实的 iOS template fixtures 与 simulator/device regression
4. 再考虑 flow 包裹模式

---

## 一句话结论

> 当前 performance 已从“有 MVP”推进到“Android 可真实使用、iOS 部分模板可真实使用、并且 AI 能拿到可推理 summary”的阶段；接下来最必要的不是盲目加更多模板，而是把现有 Android / iOS summary 做得更 app-centric、更诚实、更稳定。
