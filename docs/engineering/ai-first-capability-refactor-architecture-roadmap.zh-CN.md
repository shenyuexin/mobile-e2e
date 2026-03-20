# AI-First Capability 渐进式重构架构设计文档

> 目标：参考 `08f382db` 中对 `docs/engineering/ai-first-capability-expansion-guideline.md` 与 `packages/adapter-maestro/src/recording-runtime-ios.ts` 相关改造方式，把当前 repo 中仍然存在的“巨型入口 + 平台分支散落 + contract 不收敛 + docs/support boundary 不同步”的区域，整理成一个**可以逐步推进**的重构方案。

---

## 1. 背景与判断基线

`08f382db` 的价值不在于“补了 iOS recording”，而在于它明确展示了本仓库扩 capability 的正确形态：

1. **先定义 capability 边界，再实现 runtime**。
2. **平台值可以保留为 contracts 枚举，但平台行为必须通过策略模块/PlatformHooks 承载**。
3. **shared pipeline 留在 orchestrator，平台细节拆到 `*-android.ts` / `*-ios.ts`**。
4. **contract / capability-model / docs / test 要联动更新，而不是只改 adapter**。

同时也要注意：当前 recording 的模式是**方向正确但还未完全收敛**。虽然已经抽出了 `recording-runtime-platform.ts`、`recording-runtime-android.ts`、`recording-runtime-ios.ts`，但 `recording-runtime.ts` 依然约 **1009 行**。因此本次要复制的不是“简单拆出两个平台文件”，而是更严格的目标：

- 平台 hooks
- 薄 orchestrator
- 清晰 contract ownership
- 同步的 policy/session/evidence/docs 链路

这与 `docs/engineering/ai-first-capability-expansion-guideline.md` 中以下规则完全一致：

- 规则 1：先定义 capability，再落实现
- 规则 2：控制面与执行面必须分层
- 规则 3：先定义 deterministic path，再定义 fallback path
- 规则 7：扩展应该沿模块边界生长，而不是继续长回巨型入口文件
- 规则 7.2：平台行为必须走策略模块，而不是散落在 orchestrator 的 `if/else`
- 规则 8：新增 capability 必须补齐扩展链路，而不是单点修改

---

## 2. 当前问题总结（按架构层归纳）

### 2.1 adapter-maestro 仍然存在“大编排器回流”

尽管 recording 已经开始模块化，但 `packages/adapter-maestro/src/index.ts` 仍然是当前最显著的架构压力点。

已确认现状：

- `packages/adapter-maestro/src/index.ts` 约 **8932 行**
- 文件中承载了 **40+ 个 `*WithMaestro` tool orchestration 函数**
- 同一文件中混合了：
  - 平台分支
  - dry-run envelope shaping
  - command building
  - runtime execution
  - evidence shaping
  - reasonCode / supportLevel 语义

典型证据：

- `typeTextWithMaestro()`：`index.ts:4621+`
- `resolveUiTargetWithMaestro()`：`index.ts:4685+`
- `tapWithMaestro()`：`index.ts:6251+`
- `inspectUiWithMaestro()`：`index.ts:6315+`
- `getLogsWithMaestro()`：`index.ts:7201+`
- `collectDiagnosticsWithMaestro()`：`index.ts:7519+`

这些函数大多仍保留如下模式：

```ts
if (platform === "ios") {
  // iOS command + idb check + result shaping
} else {
  // Android command + result shaping
}
```

这说明 recording 的拆分模式还没有扩展到 UI / device / diagnostics / lifecycle 等能力族。

### 2.2 UI 能力拆分只完成了一半

`docs/architecture/adapter-code-placement.md` 已经明确给出目标边界：

- `ui-model.ts`：纯语义/纯匹配
- `ui-runtime.ts`：UI capture / poll / adb/idb command
- `ui-tools.ts`：tool-level orchestration
- `index.ts`：薄导出层

但当前真实状态是：

- `ui-model.ts`：已承担纯语义工作，方向正确
- `ui-runtime.ts`：只有 capture command / snapshot 级能力，仍偏薄
- `ui-tools.ts`：只有 **37 行**，几乎还没承接 tool orchestration
- 大量 UI 工具实现仍在 `index.ts`

这意味着 UI 相关能力虽然已有模块名，但**架构迁移没有真正完成**。

### 2.3 Device / diagnostics / screenshot / crash / log 仍未采用 PlatformHooks 模式

`packages/adapter-maestro/src/device-runtime.ts` 目前集中处理：

- device discovery
- logs capture plan
- crash signals capture plan
- diagnostics capture plan
- doctor 相关 harness checks

它已经比 `index.ts` 更聚合，但仍然是一个**混合式跨平台 planner 文件**。例如：

- `buildGetLogsCapture()` 内直接按 `input.platform` 分支
- `buildGetCrashSignalsCapture()` 内直接按 `input.platform` 分支
- `buildCollectDiagnosticsCapture()` 内直接按 `input.platform` 分支
- `collectHarnessChecks()` 同时承载 platform config reading、environment probing、adb reverse 检查

结论：这里适合沿 recording 的方式继续拆成：

- `device-runtime-platform.ts`
- `device-runtime-android.ts`
- `device-runtime-ios.ts`

让 shared orchestration 保留在 `device-runtime.ts` 或更高层工具模块。

### 2.4 Performance / executable probing 存在重复能力与边界漂移

当前至少有两类问题：

1. **host executable path probing 重复实现**
   - `ui-runtime.ts`：`resolveExecutableFromPath()`、`resolveConfiguredExecutable()`、`resolveIdbCliPath()`、`resolveIdbCompanionPath()`
   - `performance-runtime.ts`：再次实现 `resolveExecutableFromPath()` 与 trace processor path 选择逻辑

2. **capability declaration 混入 host-specific runtime 判断**
   - `capability-model.ts` 中直接使用 `process.platform === "darwin"`

这会导致 capability 文本与 runtime readiness 的职责混在一起：

- capability-model 本应表达“支持边界”
- host probing 更适合进入 runtime readiness / doctor / environment capability 层

### 2.4.1 `runtime-shared.ts` 需要守住 shared runtime 边界

`packages/adapter-maestro/src/runtime-shared.ts` 是当前 runtime 家族的共享底座，负责：

- command execution
- shell escaping
- 通用 failure reason 提取

它的位置是合理的，但后续拆分 UI / device / diagnostics hooks 时要避免把以下内容继续塞进去：

- tool-specific evidence shaping
- platform-specific preflight
- capability-level support note
- policy 判断

建议把 `runtime-shared.ts` 限定为“共享执行原语层”，即：

- 命令执行
- 超时/退出码归一化
- 最通用的 stderr/reasonCode 辅助

而不要让它再次成长为一个新的“隐形 orchestrator”。

### 2.5 contracts 还没有成为 capability 的唯一 source of truth

已确认的 contract seam：

1. **OCR 类型重复定义**
   - `packages/contracts/src/types.ts`
   - `packages/adapter-vision/src/ocr/types.ts`

2. **adapter-maestro 内部仍定义多个本应放到 contracts 的 `*Data` 类型**
   - `TypeTextData`
   - `TapData`
   - `ScreenshotData`
   - `TerminateAppData`
   - `LaunchAppData`
   - `InstallAppData`
   - 等

3. **recording platform 层返回结构仍是 adapter-local 类型**
   - `RecordingCaptureStartResult`
   - `RecordingContextSnapshotResult`

4. **core 中若干结果类型没有清楚定义为“contracts 公共类型”还是“core 内部类型”**
   - `session-store.ts` 中存在 10+ 个 `Persist*Result` / `TimelineQueryResult` / `Persisted*` 类型

5. **mcp-server 的 registry typing 仍有若干 `Promise<ToolResult>` 未参数化**
   - `packages/mcp-server/src/server.ts`

这会带来三个问题：

- tool surface 与 adapter result 之间没有完全闭环
- server typing 不能完整表达 MCP output
- 新 capability 容易先在 adapter 落结构，再倒逼 contracts 跟进，违反 guideline 的顺序要求

### 2.6 core/session-store 已经成为 persistence 聚合体

`packages/core/src/session-store.ts` 约 **1023 行**，同时承载：

- session record persistence
- action record persistence
- record session persistence
- raw recorded events
- recorded steps
- failure index
- baseline index
- session audit access
- timeline query

它的职责跨度已经从“session store”扩大到了“所有 execution memory & evidence persistence 的汇总站”。

如果继续在这里叠加新能力，未来会出现与 `recording-runtime.ts` 相同的问题：

- 一个文件承载多条 capability 链路
- 修改一个能力时必须理解多个 persistence 语义
- contracts / core / adapter 的边界被文件组织反向牵引

### 2.7 mcp-server 的 policy / registry / session wrapping 还可继续收敛

当前 `packages/mcp-server/src/index.ts` 已经有：

- `withPolicy()`
- `withPolicyAndAudit()`
- `withSessionExecution()`

这是正确方向。

但仍有两个不够统一的点：

1. `start-session.ts` 仍直接加载 access profile 并处理部分 policy gate，而不是完全由统一 policy/session entry wrapper 承载。
2. `server.ts` 仍然维护一份很长的 `MobileE2EMcpToolRegistry` 与 overload 列表，tool metadata 与 registry typing 没有走 descriptor 化收敛。

这会让“新增一个 tool”仍然偏向“到处接线”，而不是“声明式注册 + 统一包装”。

---

## 3. 重构目标（不是一次性重写）

本次建议的目标不是“把所有代码都拆碎”，而是建立一个**可持续扩 capability 的骨架**。

### 3.1 目标态原则

1. **contracts 先于 adapter 变化**
2. **platform enum 留在 contracts，platform behavior 收敛到 hooks/adapter modules**
3. **`index.ts` 只保留薄导出 + 最终拼装，不继续承载低层执行细节**
4. **core 以 capability family 拆 persistence，不再按历史堆积在单文件**
5. **mcp-server 用统一 wrapper / descriptor 描述 policy、session、audit、registry metadata**
6. **README / capability-model / docs 的支持边界与 live contracts/tool registry 同步**

### 3.2 非目标

以下内容不建议在本轮作为主目标：

- 立即追求 Android / iOS / Flutter / RN 完全统一抽象
- 为了“视觉统一”牺牲平台差异表达
- 为了拆文件而拆文件，不解决 contracts/source-of-truth 问题
- 重写所有已稳定的 tool 行为

---

## 4. 推荐推进顺序（逐步实施）

## Phase 0：建立重构护栏与清单（1 个小迭代）

### 目标

把后续重构从“印象式拆分”变成“可验证迁移”。

### 需要做的事

1. 建立 capability family inventory：
   - UI
   - device/app lifecycle
   - diagnostics/evidence
   - performance
   - recording/replay
   - interruption/recovery

2. 为每个 family 明确：
   - contracts owner
   - adapter runtime owner
   - mcp-server wrapper owner
   - docs/support boundary owner

3. 为 `adapter-maestro/src/index.ts` 定义“只减不增”规则：
   - 新 platform command builder 禁止再进 `index.ts`
   - 新 selector/query 逻辑禁止再进 `index.ts`
   - 新 policy 判定禁止再进 `adapter-maestro`

### 交付物

- 本文档
- 后续 PR checklist（可在 engineering guideline 或 template 中引用）

### 验收标准

- 团队对“什么该拆到 runtime / contracts / core / server”有统一答案

---

## Phase 1：Contracts-First 收敛（最高优先级）

### 为什么先做

如果不先收敛 contracts，后面的 runtime 拆分只会把分散结构复制到更多文件里。

### 重点改造对象

#### A. OCR / vision contract 去重

- `packages/contracts/src/types.ts`
- `packages/adapter-vision/src/ocr/types.ts`

目标：

- 只保留一份 canonical `OcrEvidence` / `ResolveTextTargetResult`
- adapter-vision 改为 import/re-export canonical types

#### B. 把 adapter-maestro 的 tool result data 类型上收至 contracts

优先上收：

- `TypeTextData`
- `TapData`
- `ScreenshotData`
- `LaunchAppData`
- `TerminateAppData`
- `InstallAppData`
- `InspectUiData`
- 其他当前仍由 adapter 本地声明、但 server 对外暴露的 `*Data`

#### C. 明确 recording platform result 哪些属于公共 contract

建议原则：

- **tool-facing** 结构进入 contracts
- **adapter internal hook** 中间态可保留 adapter local，但命名应明确 internal only

#### D. 统一 `ToolResult<T>` 参数化

修正 `packages/mcp-server/src/server.ts` 中未参数化的 tool 返回类型。

### 验收标准

- `mcp-server` 不再暴露裸 `ToolResult`
- adapter-maestro 内部本地 `*Data` 类型明显减少
- OCR / vision 不再有重复公共类型定义

---

## Phase 1.5：Host / runtime preflight 收敛（小但必须前置）

### 为什么要插在 UI / device 拆分之前

如果把 `idb`、`PATH`、host platform 判断、可执行文件探测等逻辑继续留在现状中，接下来拆 `ui-runtime-*` / `device-runtime-*` 时，很容易把重复逻辑复制到更多文件。

### 重点改造对象

- `packages/adapter-maestro/src/ui-runtime.ts`
- `packages/adapter-maestro/src/performance-runtime.ts`
- `packages/adapter-maestro/src/capability-model.ts`
- `packages/adapter-maestro/src/doctor-guidance.ts`

### 目标

新增统一 host/toolchain 抽象，例如：

- `host-runtime.ts`
- `toolchain-runtime.ts`

统一承载：

- executable resolve
- configured env override
- preferred install path fallback
- host readiness summary
- runtime preflight helper

### 验收标准

- `resolveExecutableFromPath()` 不再在多个 runtime 文件重复实现
- `capability-model.ts` 不再直接承担 host probing 职责
- 后续 Phase 2/3 拆 runtime 时无需重复复制 preflight 逻辑

---

## Phase 2：UI 能力族完成拆层（最高收益、低风险）

### 为什么优先做 UI

`adapter-code-placement.md` 已经给出了明确目标结构，而且 UI 是 `index.ts` 中最肥的一簇能力，最适合复制 recording 的成功模式。

### 当前问题

以下函数仍大量留在 `index.ts`：

- `tapWithMaestro`
- `typeTextWithMaestro`
- `inspectUiWithMaestro`
- `queryUiWithMaestro`
- `resolveUiTargetWithMaestro`
- `waitForUiWithMaestro`
- `tapElementWithMaestro`
- `typeIntoElementWithMaestro`
- `scrollAndResolveUiTargetWithMaestro`
- `scrollAndTapElementWithMaestro`

### 目标结构

建议形成：

- `ui-model.ts`
  - 纯解析/匹配/排序/selector 归一化
- `ui-runtime-platform.ts`
  - `UiPlatformHooks`
- `ui-runtime-android.ts`
  - Android hierarchy capture / poll / swipe/tap/type primitives
- `ui-runtime-ios.ts`
  - iOS idb-backed capture / poll / swipe/tap/type primitives
- `ui-runtime.ts`
  - shared runtime pipeline（选择 hooks、统一错误映射）
- `ui-tools.ts`
  - tap/type/inspect/query/resolve/wait/scroll 工具编排

### 迁移顺序

1. 先抽 `inspect/query/resolve/wait`，因为它们都依赖 hierarchy capture
2. 再把 `tap/type_text` 这类底层 UI 交互原语移入 UI family
3. 再抽 `tap_element/type_into_element`，让它们依赖统一 resolution result
4. 最后抽 `scroll_and_*`，因为它们依赖 polling + action replay

### 验收标准

- `index.ts` 中 UI 相关逻辑大幅缩减
- 平台分支集中在 `ui-runtime-android.ts` / `ui-runtime-ios.ts`
- `ui-tools.ts` 成为 UI tool orchestration 主入口

---

## Phase 3：Device / lifecycle / diagnostics 能力族走 PlatformHooks

### 重点改造对象

- `packages/adapter-maestro/src/device-runtime.ts`
- `packages/adapter-maestro/src/runtime-shared.ts`
- `index.ts` 中以下能力：
  - `terminateAppWithMaestro`
  - `takeScreenshotWithMaestro`
  - `recordScreenWithMaestro`
  - `getLogsWithMaestro`
  - `getCrashSignalsWithMaestro`
  - `collectDiagnosticsWithMaestro`

### 当前问题

这些函数虽然业务不同，但内部结构高度相似：

1. resolve session/harness/device
2. choose platform command
3. do dry-run shaping
4. do runtime preflight（如 idb/adb）
5. execute command
6. shape ToolResult + evidence

这正是最适合做 platform hook registry 的形态。

### 目标结构

- `device-runtime-platform.ts`
  - `DevicePlatformHooks`
- `device-runtime-android.ts`
  - logs/crash/diagnostics/screenshot/screenrecord/app lifecycle Android 细节
- `device-runtime-ios.ts`
  - logs/crash/diagnostics/screenshot/screenrecord/app lifecycle iOS 细节
- `device-runtime.ts`
  - shared planner / result normalization
- `device-tools.ts`（可选）
  - tool-level orchestration

### 注意点

不要把所有动作都塞回一个新的 `device-runtime.ts` 巨型文件；应按 capability cluster 控制边界。

同时要守住 shared runtime 边界：

- `runtime-shared.ts` 只保留跨平台共享执行原语
- 设备平台 preflight / command builder / result note 回到 `device-runtime-*`
- evidence narrative 与 tool-facing summary 回到 tool orchestration 层

如果拆分后仍然过大，可继续分为：

- `device-lifecycle-runtime-*`
- `device-diagnostics-runtime-*`
- `device-artifacts-runtime-*`

### 验收标准

- `tap/type/screenshot/logs/crash/diagnostics` 不再在 `index.ts` 中各自手写平台分支
- iOS preflight（例如 idb probe）集中，不在多个 tool 中重复出现

---

## Phase 4：Performance 与 host-toolchain probing 统一

### 当前问题

#### A. host executable probing 重复

- `ui-runtime.ts`
- `performance-runtime.ts`

#### B. capability declaration 与 host readiness 混层

- `capability-model.ts` 中直接依赖 `process.platform`

### 建议方案

新增一层共享 host runtime/toolchain 模块，例如：

- `host-runtime.ts`
- `toolchain-runtime.ts`

统一承载：

- executable resolve
- preferred paths
- configured env override
- host platform readiness summary

然后让：

- `ui-runtime.ts`
- `performance-runtime.ts`
- `doctor-guidance.ts`
- `capability-model.ts`

改为依赖统一抽象，而不是各自判定。

### 同步建议

把 capability-model 调整为：

- 表达 support boundary / maturity
- 不直接做 host probing

把 host probing 放到：

- `doctor`
- runtime preflight
- environment capability summary

### 验收标准

- 可执行文件探测不再重复实现
- capability-model 更像“声明”，不再像“运行时探测器”

---

## Phase 5：core/session-store 按能力族拆分

### 当前问题

`session-store.ts` 已经是 persistence 聚合体，不再只是 session store。

### 目标结构

建议拆为：

- `session-record-store.ts`
  - session start/end/state/timeline/audit
- `action-record-store.ts`
  - action outcome / retry / evidence delta
- `recording-store.ts`
  - record session / raw events / recorded steps
- `failure-memory-store.ts`
  - failure index / baseline index
- `session-store.ts`
  - 仅作为 facade/export surface（过渡期）

### 拆分原则

1. 先按数据域拆，不先按“函数数量均匀”拆
2. 对外 export surface 可以暂时兼容，内部模块先迁移
3. 优先保持路径 builder 与 persistence 操作同域归档

### 验收标准

- `session-store.ts` 不再继续增长
- 新 capability 的持久化逻辑能落到对应能力域，而不是默认加回 `session-store.ts`

---

## Phase 6：mcp-server 的 descriptor 化与统一包装

### 当前问题

虽然 `packages/mcp-server/src/index.ts` 已有统一 wrapper 思路，但仍然存在：

- `start-session.ts` 的 policy gate 逻辑不够统一
- `server.ts` 的 registry typing / overload 过长
- tool metadata、policy scope、session requirement、audit behavior 没有集中描述

### 建议方案

引入 tool descriptor registry，统一描述：

- toolName
- handler
- input schema/type
- output type
- required policy scopes
- whether requires session
- whether persists evidence
- whether requires exclusive execution

使以下逻辑从手写 wiring 变成声明式组合：

- policy enforcement
- session context resolution
- audit persistence（包括 `persist-session-evidence.ts` 这类 evidence timeline 写入）
- stale lease recovery
- telemetry / tracing（未来）

同时把 `policy-guard.ts` 明确成**唯一 MCP policy enforcement 入口**，避免 tool 文件各自再写 policy gate 变体。

### 验收标准

- 新增 tool 时不再需要在多个位置重复声明同样信息
- policy/session/audit wrapper 逻辑更统一
- `server.ts` 复杂度下降

---

## Phase 7：README / capability-model / docs / support boundary 联动清理

### 为什么必须单独列 phase

这个仓库最容易发生的不是“代码错”，而是**文档领先或落后于 live behavior**。

### 需要同步的面

- `packages/adapter-maestro/src/capability-model.ts`
- `packages/mcp-server/src/server.ts`
- `configs/profiles/*`
- `configs/policies/*`
- `README.md` / `README.zh-CN.md`
- `docs/architecture/*`
- `docs/guides/*`
- sample flows / showcase docs（当支持边界变化时）

### 建议规则

每一波 capability family 重构完成后，必须同步更新：

1. support level
2. caveat
3. maturity（contract-ready / experimental / reproducible-demo / ci-verified）
4. deterministic path / fallback path 说明
5. profile / policy config 中与当前 shipped behavior 对应的 source-of-truth

### 验收标准

- README 宣称不超前于实际验证成熟度
- capability-model 与 docs/support text 一致

---

## 5. 优先级总表

| 优先级 | 工作流 | 原因 | 风险 | 预期收益 |
|---|---|---|---|---|
| P0 | Phase 1 Contracts-first | 不先收敛 contracts，后面会重复扩散 | 低 | 高 |
| P0 | Phase 2 UI family split | `index.ts` 最大热点之一，且目标边界已清楚 | 中 | 高 |
| P1 | Phase 3 Device/diagnostics hooks | 与 recording 模式最相似，重复平台分支最多 | 中 | 高 |
| P1 | Phase 5 session-store split | 为后续 recovery/recording/failure memory 扩展清障 | 中 | 中高 |
| P2 | Phase 4 host runtime unification | 重复逻辑已出现，但可滞后于主链路 | 低 | 中 |
| P2 | Phase 6 mcp-server descriptorization | 架构价值高，但涉及注册层与 typing | 中 | 中高 |
| 持续进行 | Phase 7 docs/support sync | 每波都要做，不能攒到最后 | 低 | 高 |

---

## 6. 推荐执行节奏

建议按以下节奏推进，而不是并行大爆炸：

### Wave A（最小可见收益）

1. Contracts-first 收敛
2. UI inspect/query/resolve/wait 抽离

### Wave B（复制 recording 成功模式）

1. device/logs/crash/diagnostics hooks
2. tap/type/screenshot/record-screen 从 `index.ts` 剥离

### Wave C（清基础设施债务）

1. session-store 拆域
2. host runtime/toolchain 统一

### Wave D（把扩 capability 的入口真正标准化）

1. mcp-server descriptor registry
2. support boundary / docs / capability-model 全链同步

### Wave E（可选延后，但应显式登记）

1. debug / failure-intelligence orchestration 收敛
   - 重点关注 `collectDebugEvidenceWithMaestro()` 这类多工具编排入口
2. 若前面几波已显著瘦身 `index.ts`，再评估是否将该能力族单独抽成 debug/failure tool module

---

## 7. 每个阶段都必须执行的验证链

为了符合 AI-first capability guideline，每一波迁移至少要跑：

1. **contracts 层验证**
   - export surface 可用
   - schema/type 引用闭环

2. **adapter 层验证**
   - 相关 package tests
   - dry-run envelopes 未回归
   - deterministic path / fallback path 未被隐式改变

3. **server 层验证**
   - tool registry typing 正确
   - policy/session/audit wrapper 仍工作

4. **docs/support 验证**
   - support level 与当前实现一致
   - 未把 roadmap 目标写成当前已支持

建议最小命令集：

```bash
pnpm build
pnpm typecheck
pnpm test
```

如涉及特定 family，再补对应 package/server tests。

---

## 8. 最终结论

参考 `08f382db`，当前项目最值得继续按同一模式推进的，不是再去做一个新的单点 feature，而是把以下 4 条主线逐步补齐：

1. **contracts 先收敛**，避免 capability 语义继续分裂。
2. **把 `adapter-maestro/src/index.ts` 中仍然庞杂的 UI / device / diagnostics 平台分支继续抽成 PlatformHooks 模式**。
3. **把 `core/session-store.ts` 从“所有持久化都往里加”的形态拆成能力域 store**。
4. **把 `mcp-server` 的 tool 接入从“到处接线”推进到“descriptor + 统一 wrapper”模式**。

如果按这个顺序推进，仓库会逐步从“功能越来越多，但入口越来越肥”的状态，转成“capability family 清晰、contracts 稳定、平台扩展可持续”的结构；这也是让 AI-first mobile E2E harness 长期可维护的关键路径。
