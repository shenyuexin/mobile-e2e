# AI-First Capability Expansion Guideline

> 目的：在这个仓库里新增功能时，确保扩展出来的是 **AI-first mobile E2E harness capability**，而不是只能短期可用的局部脚本能力。

## 适用场景

当改动涉及以下任一类扩展时，必须参考本文件：

- 新增 MCP tool
- 扩展现有 tool 的输入/输出 contract
- 新增 adapter runtime 能力或 fallback 路径
- 新增 policy / session / evidence / recovery 相关能力
- 扩展 Android / iOS / React Native / Flutter 任一平台支持边界
- 新增 capability 宣传、README 能力描述、support matrix

---

## 核心判断：你是在加“能力”，还是只是在加“代码”

在这个仓库里，一个合格的新功能不只是“命令能跑通”。

它至少要同时回答以下问题：

1. **AI 为什么需要它**：它改善的是 state understanding、bounded action、evidence、diagnosis 还是 recovery。
2. **它属于哪个层**：contracts、core、adapter、mcp-server、CLI/docs，分别承担什么责任。
3. **它的确定性边界是什么**：deterministic path 是什么，fallback 是否显式、有界、可审计。
4. **它如何进入 session / policy / evidence 链路**：能否被审计、限制、复盘，而不是一次性 side effect。
5. **它的支持边界如何对外表达**：平台差异、限制条件、能力级别是否被清楚说明。

如果这些问题答不出来，就说明当前改动更像“局部实现”，还不是“产品级 capability”。

---

## 规则 1：先定义 capability，再落实现

新增功能时，先从“能力定义”出发，而不是直接往 `adapter-maestro` 或 `mcp-server` 里堆逻辑。

最少先定义清楚：

- tool / capability 名称
- 输入输出 contract
- reason code / artifact / summary 结构
- policy scope
- session 归属与 timeline/evidence 挂载点
- 平台支持级别与 caveat

推荐顺序：

```text
Step 1: define the user-visible capability boundary
Step 2: define/extend contracts and exports
Step 3: decide control-plane vs execution-plane ownership
Step 4: implement runtime path with deterministic-first behavior
Step 5: wire MCP/tool exposure and policy enforcement
Step 6: attach evidence/reasonCode/summary semantics
Step 7: update capability docs and support boundary text
Step 8: run verification across affected layers
```

禁止顺序：

```text
1. 先把命令塞进 adapter 里跑通
2. 再临时补 server wiring
3. 最后再想 contract、policy、evidence 应该长什么样
```

这种顺序通常会导致：

- tool surface 和真实能力边界不一致
- 返回结果只有“执行成功/失败”，没有 AI 可用的解释信息
- fallback 被隐式引入，后续难以审计
- policy / session 变成事后补丁

---

## 规则 1.5：先检查 AUT readiness，再扩 capability

这个仓库不是在真空里扩展能力。

如果某个新能力依赖 app-under-test 提供稳定入口或稳定语义，那么在扩展之前必须先检查执行前提是否成立。

至少确认：

- 关键元素是否有稳定 ID / accessibility identifier / testID
- 是否存在 deterministic entry（deep link、test hook、固定起始页）
- 是否存在明确 reset semantics（clear data、seed data、session restore、环境重置）
- 是否存在 ready-state 约定，避免把 loading / blocked / interrupted 状态误判成正常页面

如果这些前提不存在，应该先把问题归类为：

- AUT contract 缺失
- environment readiness 缺失
- capability 只能处于 partial / experimental support

而不是直接把不稳定行为包装成“已支持能力”。

---

## 规则 2：控制面与执行面必须分层

这个仓库的长期价值不在于某个平台命令能不能调起来，而在于它是一个 **AI-facing orchestration harness**。

因此新增功能时必须先判断归属：

- **contracts**：共享输入输出、reason code、artifact、session/timeline 数据模型
- **core**：policy engine、governance、session store/scheduler、execution coordination
- **adapter**：平台/框架相关执行、查询、runtime side effects
- **mcp-server**：tool registry、entrypoint wiring、policy enforcement、tool-facing shaping
- **docs / capability text**：对外表达支持边界、限制条件、可验证使用方式

### 归属判断口诀

- 描述结构化数据语义 -> `packages/contracts`
- 描述治理、租约、策略、调度 -> `packages/core`
- 描述平台命令、UI/runtime 交互 -> `packages/adapter-*`
- 描述 MCP 暴露、入参校验、policy guard -> `packages/mcp-server`
- 描述支持边界、可见能力、扩展准则 -> `docs/*`

### 禁止

- 在 adapter 内复制 policy allow/deny 逻辑
- 在 tool handler 内直接发散成大量平台细节
- 在 contracts 未稳定前把不确定字段随意传播到多个消费方
- 把平台差异“藏起来”伪装成完全统一能力

---

## 规则 2.5：当前行为的 source of truth 必须明确

本仓库的 architecture 文档既描述当前基线，也描述目标状态。

因此在扩展 capability 或更新对外描述时，必须区分：

- **当前已交付行为**：以 live tool registry、`packages/contracts/*.schema.json`、`packages/contracts/src/*`、`configs/policies/*.yaml`、`configs/profiles/*.yaml` 为准
- **目标态 / 路线图描述**：以 `docs/architecture/*`、`docs/delivery/*` 为方向性参考

### 经验规则

如果 README、architecture prose、capability model 与 live registry 的能力状态不一致：

1. 先以 registry / contracts / config 的当前实现为准
2. 再修正文档表述
3. 不要把 roadmap-style 目标误写成“当前已支持”

这条规则尤其重要，因为 AI-first 能力在持续演进，文档漂移比代码漂移更容易误导外部贡献者。

---

## 规则 3：deterministic-first 不是口号，是扩展前提

所有新增 capability 都必须先说明 deterministic path，再说明 fallback path。

必须明确：

1. 首选确定性输入是什么（ID、accessibility identifier、semantic tree、native state）
2. 什么时候允许退化到 semantic / OCR / CV / heuristic
3. 退化是否被显式记录到结果中
4. 当确定性不足时，系统是应该继续、重试、恢复，还是明确失败

### 禁止

- 默认用 OCR/CV 当第一路径
- fallback 发生了但结果里没有体现
- 无上限重试且没有 state-change evidence
- transport success 当成 outcome success

对 AI agent 来说，`command sent` 不等于 `goal achieved`。

---

## 规则 3.5：probabilistic fallback 的归属必须说清楚

如果新增能力引入了 OCR / CV / screenshot heuristic / fuzzy matching，必须明确它属于哪一层：

- 更偏视觉识别、置信度阈值、OCR/CV 执行的能力 -> 优先考虑 `packages/adapter-vision`
- 更偏平台 runtime、树查询、确定性选择器、tool orchestration 的能力 -> 优先考虑 `packages/adapter-maestro`

并且结果中必须体现：

- `resolutionStrategy`
- `fallbackUsed`
- `confidence`
- failure / ambiguity / low-confidence reason

不要把 probabilistic 路径混进确定性 runtime 里却不暴露其不确定性。

---

## 规则 4：每个新能力都要进入 evidence 链路

这个仓库不是只负责“执行动作”，而是要给 AI 足够高密度的信息做下一步决策。

因此新增功能时，至少要考虑以下输出是否需要补齐：

- `status`
- `reasonCode`
- `artifacts`
- `nextSuggestions`
- 执行前后状态摘要
- fallback / retry / confidence 信息
- session timeline 中可关联的 action/evidence 记录

### 最低要求

如果一个 tool 可能影响 UI、app state、调试判断或恢复路径，返回值就不应只有：

```json
{ "ok": true }
```

而应尽可能回答：

- 做了什么
- 是否真的改变了 app state
- 是否用了 fallback
- 为什么失败
- 下一步建议是什么

---

## 规则 5：session 与 policy 是功能定义的一部分

在这个仓库里，session / policy 不是“上线前再补的治理层”，而是 capability 本身的一部分。

新增能力时必须检查：

### Session 侧

- 是否需要 session 才能安全执行
- 是否要写入 action timeline / artifact references
- 是否影响 lease、并发、目标设备占用
- 是否需要复用历史 outcome / baseline / failure memory

### Policy 侧

- 该能力属于 read-only、interactive，还是 destructive
- 是否需要新增 scope 或复用已有 scope
- 是否涉及日志、网络、截图、crash、diagnostics 等敏感 evidence
- 是否需要 redaction、采样或 retention 控制

### 禁止

- 新增高风险 capability，但没有 policy 映射
- 在没有 session 上下文的情况下落地难以复盘的 side effect
- 把 evidence 存下来，但没有审计或边界说明

---

## 规则 6：支持边界必须显式，而不是“假装全平台都支持”

这是一个 Android / iOS / React Native / Flutter 并存的仓库。

因此扩展功能时，必须写清楚：

- 哪个平台已实现
- 哪个平台是 partial support
- 哪个平台只是 contract ready / placeholder
- 哪些差异来自 runtime 能力，而不是代码尚未整理

应该同步考虑：

- `packages/adapter-maestro/src/capability-model.ts`
- `packages/mcp-server/src/server.ts`
- README / architecture / adapter docs 中的支持边界表述

### 禁止

- 代码只对 Android 成熟，但对外描述成“通用 mobile capability”
- iOS 仅有实验性路径，却没有 caveat
- 对外能力声明领先于真实验证范围

开源项目的长期信任，靠的是 **准确边界**，不是“功能看起来很多”。

---

## 规则 6.5：对外支持升级必须有成熟度证明

当你准备把某个平台/框架能力从“有代码”升级成“对外宣称支持”时，至少使用下面这个成熟度梯度：

| 等级 | 含义 | 适合写进什么文案 |
|---|---|---|
| `contract-ready` | contract 或入口已准备，但 runtime/验证尚不完整 | 仅限内部或架构说明 |
| `experimental` | 有实现路径，但需要手动条件、局限明显、验证不足 | 文档中必须带 caveat |
| `reproducible-demo` | 有可复现实验脚本、demo 文档或 showcase evidence | 可以写入 README/support docs，但需保留边界说明 |
| `ci-verified` | 已进入稳定 CI / regression 验证链 | 可以作为稳定支持能力对外表达 |

### 升级原则

- 没有 demo / evidence / test 支撑，不要轻易升级公开支持表述
- README 的能力宣称，不应领先于真实验证成熟度
- support level 变化时，必须同步 capability 文本、docs 和测试证据

---

## 规则 7：扩展应该沿模块边界生长，而不是重新长出巨型入口文件

当前仓库已经明确强调：不要把新逻辑不断堆回单一入口文件。

新增能力时优先判断是否应放在：

- `*-model.ts`：纯数据语义、匹配、归一化
- `*-runtime.ts`：平台命令、side effects、执行细节
- `*-tools.ts`：tool-level orchestration
- `*-config.ts`：profile/config/session defaults

尤其在 `adapter-maestro` 中，应优先保持：

- 纯语义逻辑可单测
- runtime 逻辑可替换/扩展
- tool 编排逻辑薄而清晰

如果一个新功能同时混合：

- selector 语义
- adb/idb/simctl 命令
- policy 判断
- result shaping

说明边界已经错了，应先拆层再实现。

---

## 规则 7.5：平台扩展要连带检查 profile/config 边界

如果新增能力改变了 Android / iOS / React Native / Flutter 的支持语义，不要只改 runtime 代码。

还必须检查：

- `configs/profiles/*` 是否需要补 profile capability 或默认值
- `configs/policies/*` 是否需要补 policy scope / risk boundary
- adapter capability declaration 是否需要更新
- README / architecture / guide 中的平台边界是否需要修正

在这个仓库里，runtime 代码只是 capability 的一部分，不是 capability 的全部定义。

---

## 规则 8：新增功能必须补齐“扩展链路”而不是单点修改

对这个仓库来说，一个 capability 的完成，通常至少横跨这些层：

| 层 | 典型落点 | 必查问题 |
|---|---|---|
| Contract | `packages/contracts/src/types.ts` | 输入输出字段是否稳定、可导出、可复用 |
| Export surface | `packages/contracts/src/index.ts` | 消费方是否能一致导入 |
| Core/Governance | `packages/core/*` | session/policy/scheduler 是否需要扩展 |
| Adapter runtime | `packages/adapter-*/*` | deterministic path、fallback、平台实现是否清楚 |
| MCP server | `packages/mcp-server/src/tools/*`, `src/server.ts` | tool registry、policy guard、tool result shaping 是否完整 |
| Capability/docs | README, `docs/architecture/*`, `docs/engineering/*` | 对外支持边界和设计约束是否同步 |
| Tests | package tests + root validation | 行为是否有最小回归覆盖 |

### 经验规则

如果一个 PR 只改了 adapter，却声称“新增了某个 AI-first capability”，大概率还没完成。

---

## 三类常见扩展，应该怎么判断

### A. 新增一个 action tool

例如：新增某种交互、恢复、环境控制能力。

至少要补齐：

1. contract 输入输出
2. server tool registry / wrapper
3. policy scope
4. adapter runtime 实现
5. reasonCode / artifact / summary
6. capability 文本与测试

重点不是“动作发出去了”，而是 **AI 能否知道这次动作是否真正有效**。

### B. 新增一个 diagnostics / evidence tool

例如：新的日志、崩溃、性能、debug 信号采集能力。

至少要补齐：

1. evidence 的结构化摘要，而不是只返回原始文件
2. session/timeline 关联方式
3. 敏感信息与 policy 边界
4. 与现有 failure attribution / remediation 流程的关系

重点不是“多采了一个文件”，而是 **能否减少 AI 的判断成本**。

### C. 扩展平台/框架支持

例如：给 Flutter、React Native 或 iOS 补一个新路径。

至少要补齐：

1. support level 声明
2. profile / capability 差异说明
3. 平台特定 caveat
4. 不支持场景的 reasonCode
5. 对 README / docs 的边界修正

重点不是“接口名字一样”，而是 **能力是否真的在该平台具备可靠语义**。

---

## 新增 capability 的标准检查清单

在提交实现前，至少确认：

- [ ] capability 的 AI-facing 目标已写清楚（state / action / evidence / diagnosis / recovery 中哪一类）
- [ ] contract 已在 `packages/contracts` 定义并正确导出
- [ ] control-plane 与 execution-plane 归属明确，没有错层
- [ ] deterministic path 与 fallback path 都被明确记录
- [ ] `status` / `reasonCode` / `artifacts` / `nextSuggestions` 语义合理
- [ ] session / policy / lease / evidence 影响已评估
- [ ] capability 宣传与真实支持边界一致
- [ ] 平台差异通过 support level / caveat 表达，而不是被隐藏
- [ ] 至少有一层 package test 和一层 tool/server 级验证覆盖改动
- [ ] README / architecture / engineering docs 中该更新的地方已同步

---

## 反模式（明确禁止）

### 反模式 1：为了 demo 先做一个只在本机跑通的入口

如果能力只能在作者当前环境、当前设备、当前 app 状态下成立，它就还不是 harness capability。

### 反模式 2：只扩 adapter，不扩 contract 与 tool surface

这样会让实现存在，但外部协作方、AI agent、CLI、文档都无法稳定使用。

### 反模式 3：把高层语义塞进低层执行文件

一旦 policy、capability、reasoning、runtime 混在一起，后续扩展会迅速退化成不可维护的大文件。

### 反模式 4：只返回原始 artifacts，不返回摘要

AI-first 系统的价值，是把原始信号提炼成可决策的结构，而不是把 token 成本转嫁给 agent。

### 反模式 5：为了“统一 API”掩盖平台差异

平台差异不是缺点，隐瞒差异才是。

### 反模式 6：把目标态文档当成当前 shipped behavior

如果 live registry、contracts、config 与某篇架构文档的能力状态不一致，应先核对当前实现，再修正文档，而不是直接沿用目标态描述。

### 反模式 7：扩 capability 时忽略 AUT readiness

如果 app 本身没有稳定 ID、ready-state、deep link 或 reset 语义，只在 harness 侧堆 workaround，通常会把能力推向 flaky 而不是 product-grade。

---

## 非目标护栏

功能扩展时，不应把仓库带向以下方向：

- 试图替代 Appium / Maestro / Detox / WDA 等框架内部实现
- 试图用单一抽象完全抹平平台差异
- 把 OCR/CV 变成默认主路径
- 为了 demo 效果优先做 human-first surface，而忽略 AI-facing structured signals

如果一个方案只有“看起来更统一”或“更容易 demo”，但会损害 deterministic-first、governance、evidence 或 support-boundary honesty，就不应采用。

---

## 最终判断标准

如果一个新功能上线后，贡献者能够清楚回答下面这些问题，说明它更接近本仓库需要的扩展质量：

1. 这个能力服务于 AI agent 的哪一个决策环节？
2. 它的 deterministic path 是什么？何时退化？
3. 它的 policy / session / evidence 边界是否清楚？
4. 它是否以 machine-consumable 的方式暴露给 MCP client？
5. 它的支持边界是否真实、可验证、可维护？

如果答案主要还是“代码已经能跑”，那还不够。

> 口诀：**先定义 capability，再补 contracts，再分层实现，再接入 policy/session/evidence，最后再对外宣称支持。**

---

## Appendix: PR Reviewer Questions

当你在 review 一个声称“扩展了 capability”的 PR 时，至少快速问完这 8 个问题：

1. **这次改动扩展的是 AI agent 的哪个决策环节？**
   - 是 state、action、evidence、diagnosis、recovery，还是只是局部代码整理？
2. **当前实现的 deterministic path 清楚吗？**
   - fallback 何时发生，是否显式记录了 `resolutionStrategy` / `fallbackUsed` / `confidence`？
3. **contracts 是否先定义、先导出、再消费？**
   - 有没有出现“consumer 先改、contracts 后补”的逆序扩展？
4. **层次边界是否正确？**
   - policy/governance 有没有误塞进 adapter？runtime/platform 细节有没有误塞进 tool handler？
5. **AUT readiness 是否被诚实评估？**
   - 如果依赖 stable IDs、deep link、reset semantics、ready-state，这些前提真的存在吗？
6. **session / policy / evidence 链路补齐了吗？**
   - 有没有 reasonCode、artifacts、timeline、scope、risk boundary、redaction / retention 考量？
7. **公开支持边界是否真实？**
   - 这次变更属于 `contract-ready`、`experimental`、`reproducible-demo` 还是 `ci-verified`？README / docs 文案有没有超前？
8. **验证链是否完整？**
   - 是否覆盖了 package tests、tool/server-level verification，以及必要的 docs/capability 同步？

如果其中 2 个以上问题回答不清，这个 PR 大概率还没有把“代码改动”提升成“AI-first harness capability”。
