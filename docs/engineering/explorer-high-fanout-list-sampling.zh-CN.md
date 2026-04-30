# Explorer 高扇出重复列表采样方案（Smoke 模式）

> Phase 28 起，高扇出采样规则通过 Explorer rule registry 暴露稳定 rule ID、覆盖方式和报告解释字段。配置与报告语义见 [`explorer-rule-registry.zh-CN.md`](./explorer-rule-registry.zh-CN.md)。

## 1. 背景

当前 explorer 的遍历模型是：基于当前 `inspect_ui` / `axe describe-ui` 捕获到的 **可视 viewport** 层级树，提取可点击元素，然后做 DFS。

这对普通设置页是合理的，但对 `Settings > General > Fonts > System Fonts` 这类**长列表 + 重复详情页**场景，会产生两个问题：

1. **单次捕获天然低估列表规模**
   - iOS simulator 的 `axe describe-ui` 返回的是当前屏幕的 accessibility tree，不会一次性返回整个可滚动列表的全部离屏元素。
   - repo 内已有明确证据：`docs/spike/settings-inventory.md` 说明 `axe describe-ui` 只覆盖 visible viewport，off-screen items 需要滚动后重新捕获。

2. **Smoke 目标与全量列表穷举不匹配**
   - Smoke 模式的目标是快速验证核心导航链路和基本恢复能力。
   - `System Fonts` 这种列表即使只滚动前几屏，就能出现数十个字体项和多个下载动作；继续全量 DFS 会迅速吞掉 smoke 预算，但新增信号非常有限。

本方案的目标是：为 explorer 引入一套**面向 smoke 模式的高扇出重复列表采样规则**，让它在长列表场景下保持可控、快速、可解释。

**重要边界：第一版是 viewport-local 采样策略。**

- 它基于当前 viewport 中可见的 sibling 和有限的 smoke 规则做代表项验证。
- 它**不是**“整条滚动列表已经被完整感知或完整统计”的能力。
- 如果未来要支持跨滚动聚合、估算列表总量或滚动后全局去重，那是第二阶段能力，不应在第一版文档里被暗示为已具备。

---

## 2. 问题定义

这里要解决的不是“字体页”这个特例，而是更通用的问题：

> 当 explorer 进入一个**高扇出重复集合页**时，应该如何在 smoke 模式下避免把时间消耗在大量结构相似、收益递减的 sibling 上？

典型例子包括但不限于：

- `System Fonts`
- 国家/地区列表
- 语言列表
- 资源下载列表
- 权限对象列表
- 联系人/账号/城市这类纯数据集合页

关键点是：

- **不能靠名字语义识别**（例如“看到字体名就判断它是字体”）。
- 必须靠**UI 结构特征**和**跨滚动采样结果**识别这是“高扇出重复集合”。

---

## 3. 设计结论

### 3.1 模式语义

本方案只改变 **smoke** 模式的默认行为。

- `smoke`：自动采样高扇出重复列表
- `scoped`：默认仍按现有遍历逻辑执行，后续如有需要可再引入可选采样
- `full`：默认全量遍历，不采样

### 3.2 运行时交互策略

**不在运行过程中弹窗询问用户**。

原因：

- repo 当前的 explorer 交互模型是“启动前 interview/config，一次确认后无人值守执行”。
- 运行中再问会与 `--no-prompt`、CI、批处理执行相冲突。
- 中途询问会让 smoke 与 unattended run 的语义不稳定。

如果需要用户控制采样策略，应放在**启动前配置**里，而不是运行时临时弹问。

### 3.3 采样判定原则

判定“高扇出重复集合页”时，**不依赖内容语义**，只依赖结构信号：

1. 当前页面存在大量同构 sibling（同类 Button/Cell/row）。
2. sibling 的文本更像“数据值列表”而不是功能入口。
3. 点击若干 sibling 后，进入的详情页结构高度相似，主要只是标题变化。
4. 列表中反复出现相同类型的动作（例如多个 `Download`）。
5. 多次滚动后仍持续出现新的同构项，说明这是长集合而不是短菜单。

### 3.4 Smoke 默认策略

当页面被判定为高扇出重复集合时，smoke 模式只要求：

1. 成功进入该列表页
2. 从**当前 viewport 内**成功打开 **1 个代表项**
3. 成功从代表项返回列表页
4. 记录该页面被按“sampled collection”处理

默认不继续枚举剩余 sibling。

---

## 4. 推荐规则

### 4.1 第一阶段：显式规则优先

第一阶段不要直接上全自动启发式，而是先引入**显式路径规则**，原因是最稳定、最容易验证。

推荐新增一类 explorer 配置：

```json
{
  "samplingRules": [
    {
      "match": {
        "pathPrefix": ["General", "Fonts", "System Fonts"]
      },
      "mode": "smoke",
      "strategy": "representative-child",
      "maxChildrenToValidate": 1,
      "stopAfterFirstSuccessfulNavigation": true,
      "excludeActions": ["Download"]
    }
  ]
}
```

这条规则的意义是：

- 在 `General > Fonts > System Fonts` 路径下
- 如果当前模式是 `smoke`
- 只验证 1 个代表字体项
- 成功进入详情并成功返回后停止该列表后续 DFS
- 明确排除 `Download` 这种副作用动作，不把它当作代表项

### 4.2 第二阶段：通用启发式检测

在显式规则稳定后，再补一层通用检测：

- 连续滚动聚合后，去重 sibling 数量 `>= 30`
- 新出现 sibling 的结构特征与已有 sibling 高度一致
- 代表采样点击后，详情页结构在多个样本之间高度相似

满足上述条件时，可自动判定为“高扇出重复集合页”。

**推荐阈值：30，而不是 50。**

原因：

- 50 对 smoke 来说太晚，预算通常已经被大量消耗。
- 30 足以表明这不是普通功能菜单，而是长集合页。
- 该阈值适合做 smoke 的自动降采样切点。

---

## 5. 代表项选择规则

在 `representative-child` 策略下，代表项选择必须明确、稳定。

### 5.1 默认选择顺序

优先顺序建议为：

1. 排除明显副作用动作（如 `Download`）
2. 排除已经被规则标记为 destructive / side-effect 的项
3. 选择第一个稳定可导航的普通 sibling

### 5.2 代表项成功标准

只有满足以下条件，才能算“代表项验证成功”：

1. 点击后页面发生真实导航（不是 stateChanged=false）
2. 新页面标题/结构与列表页不同
3. 可以从详情页稳定返回列表页
4. 返回后列表页恢复成功

如果第一个代表项失败，可以在 smoke 下允许**最多 1 次代表项重选**，即再试一个 sibling；若第二个仍失败，则按正常 failure 记录。

---

## 6. Download / 安装类动作处理规则

对于 `System Fonts` 这类列表，`Download` 不应被当作代表项。

理由：

- 它是副作用动作，不是纯导航。
- 它可能触发下载、状态变化、网络等待、权限弹窗。
- Smoke 模式的核心目标不是验证每个资源下载流程，而是验证集合页的进入、列表展示、详情导航和返回能力。

因此：

- `Download` 默认从 representative candidate 中排除。
- 只有在显式策略允许时，才把下载动作纳入 smoke 验证。

---

## 7. 实施方案

### 7.0 平台适配与支持边界

本方案的**策略定义是跨平台的**，但第一阶段的**证据基础、实现优先级、验证成熟度**不是完全对等的。

#### iOS Simulator

这是第一阶段的**主落地点**。

原因：

- 当前问题样本（`Settings > General > Fonts > System Fonts`）就是在 iOS simulator 上复现并分析出来的。
- 现有证据最完整：`axe describe-ui` 的 viewport 限制、连续滚动采样、代表项误导遍历风险，都是在 simulator 上被直接验证的。
- 当前 explorer 的实际调试和报告样本也主要来自 iOS simulator 路径。

第一阶段 acceptance 应至少覆盖：

- `System Fonts` 进入成功
- 代表项进入/返回成功
- smoke 不再沿长列表持续下钻
- 报告中明确记录 sampled collection

#### iOS 真机

策略层应视为**适用**，但实现成熟度应标为**待验证 / partial**，不能默认与 simulator 同等成熟。

原因：

- iOS 真机当前依赖 WDA `/source` 路径，而不是 simulator 的 `axe describe-ui`。
- 虽然 repo 已支持 WDA `/source` 归一化，但真机的 hierarchy 格式、可见范围、滚动后稳定性、返回路径一致性，都需要单独验证。
- 因此文档和实现都不应暗示“只要 simulator 方案成立，真机就天然等价成立”。

第一阶段对真机的要求应是：

- 规则接口与策略语义可复用
- acceptance 结论单独记录
- 若真机 hierarchy 行为不同，可保留平台特化阈值或暂不启用自动采样

#### Android

策略层同样是**适用**的，但第一阶段不应把 Android 说成“已被同等证明”。

原因：

- Android 使用的是 uiautomator 路径，不是 iOS 的 axe/WDA。
- Android 在 scroll / resolve / off-screen 处理上的工具链成熟度、节点结构、滚动后可见范围判断，与 iOS 并不完全一致。
- 高扇出重复集合在 Android 上也会出现，但其 sibling 结构特征、下载按钮表现、去重稳定性需要平台专项验证。

因此第一阶段推荐：

- 先把策略和配置结构设计成跨平台可复用
- 但只在已有证据的平台上默认启用
- Android 先做单独验证样本，再决定是否默认开启自动采样

#### 第一阶段支持边界结论

第一版文档和实现应明确写成：

- **策略模型：跨平台通用**
- **第一阶段默认落地：iOS simulator**
- **iOS 真机 / Android：策略可复用，但需要单独 acceptance，不应默认宣称同等成熟**

这条边界必须在文档、报告语义、以及后续 PR 描述里都保持一致。

### 7.1 推荐实施顺序

#### Phase A — 显式采样规则落地（viewport-local）

目标：先把 `System Fonts` 这类已知问题页变得可控，并且明确只对当前 viewport 做代表项采样，不引入跨滚动全局统计。

**新增/修改文件建议：**

- `packages/explorer/src/types.ts`
  - 新增 `SamplingRule`、`SamplingStrategy`、`SamplingMatch` 等类型
- `packages/explorer/src/config.ts`
  - 增加默认 `samplingRules` 配置支持
- `packages/explorer/src/engine.ts`
  - 在 frame 遍历前判断当前页面是否命中 sampling rule
  - 对命中的页面改用 representative-child 流程
- `packages/explorer/src/element-prioritizer.ts`
  - 补充“副作用动作排除”辅助能力（如排除 `Download`）
- `packages/explorer/tests/*.test.ts`
  - 增加 representative-child 的 smoke 回归测试

#### Phase B — 跨滚动聚合采样器（后续增强）

目标：让系统能自动识别长集合页，而不是完全依赖路径配置；这是后续增强，不属于第一版 smoke 采样必需能力。

**建议新增模块：**

- `packages/explorer/src/list-sampler.ts`

职责：

- 执行多次 scroll + inspect
- 聚合同构 sibling
- 去重 visible items
- 估算列表规模和重复度
- 判断是否命中高扇出重复集合阈值

#### Phase C — 报告与可解释性

目标：让报告明确记录“这个页面为什么没有全量遍历”。

**建议修改：**

- `packages/explorer/src/report/summary.ts`
- `packages/explorer/src/report/markdown.ts`

新增输出示例：

- `samplingApplied: true`
- `samplingReason: high_fanout_repetitive_collection`
- `estimatedUniqueItemsSeen: 34`
- `representativeChildrenValidated: 1`

---

## 8. 算法细节

### 8.1 显式规则匹配

显式规则匹配字段建议支持：

- `pathPrefix`
- `screenTitle`
- `screenId`

匹配优先级建议：

1. `screenId`
2. `pathPrefix`
3. `screenTitle`

### 8.2 高扇出检测（第二阶段）

检测流程建议：

1. 在当前列表页做一次初始 snapshot
2. 提取可点击 sibling，并按 label + selector + elementType 做第一轮去重
3. 执行 N 次 scroll（建议上限 5~7 次）
4. 每次 scroll 后重新 capture + 去重
5. 如果聚合后的 sibling 数量 `>= 30` 且相似结构占比高，则判定为高扇出重复集合

### 8.3 详情页相似性

可使用现有 page identity 能力辅助判断：

- visible text hash
- structure hash
- screen title 差异

规则不是要求“完全相同”，而是要求：

- 详情页结构骨架高度相似
- 变化主要集中在标题或少量文本值

---

## 9. 验证要求

### 9.1 单元测试

至少覆盖：

1. 路径规则命中时，smoke 只验证 1 个代表项
2. `Download` 不会被选成代表项
3. 第一个代表项失败时，允许切换到第二个代表项
4. `full` 模式不会触发采样
5. 报告中正确记录 `samplingApplied`

### 9.2 集成测试

至少覆盖：

1. 构造一个 30+ sibling 的模拟列表页，确认 smoke 不再全量 DFS
2. 构造一个普通短列表页，确认 smoke 保持原有遍历逻辑
3. 构造一个包含下载动作的集合页，确认下载不会被当作代表项

### 9.3 手工验证

在 iOS Settings 上至少验证：

1. `General > Fonts > System Fonts`
2. 一个普通非重复页（例如 `General > About`）
3. 一个有副作用按钮的页

成功标准：

- `System Fonts` 不再导致 smoke 无限拉长
- 代表项进入/返回成功
- 报告明确说明该页被 sampled，而不是误以为全量遍历完成
- 报告中不得把 viewport-local 采样表述成“已完整遍历整个列表”

---

## 10. 非目标

本方案当前**不**做以下事情：

- 不尝试精确统计整个长列表的真实总数
- 不把当前 viewport 采样包装成全列表覆盖
- 不在运行中向用户弹窗询问“要不要全量遍历”
- 不改变 `full` 模式的全量遍历语义
- 不引入基于字体名、国家名、语言名等语义词典的识别逻辑

---

## 11. 推荐决策

如果只做一版最小可落地方案，推荐如下：

1. 先引入 **显式 `samplingRules`**
2. 先覆盖 `General > Fonts > System Fonts`
3. smoke 模式下默认 `maxChildrenToValidate = 1`
4. 默认排除 `Download`
5. 在报告里显式标注该页采用了 sampled collection 策略

这是最小、最稳、最容易验证的一版。

等这一版稳定后，再做跨滚动聚合和通用高扇出检测。

---

## 12. 一句话总结

`System Fonts` 不是“字体特例”，而是一个典型的**高扇出重复集合页**；smoke 模式不应穷举这类列表，而应使用**结构驱动的代表项采样策略**，以保持运行时长、稳定性和报告可解释性。
