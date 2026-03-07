# 迁移后实施说明

## 1. 文档目的

本说明用于约束目录迁移完成之后的继续实施路径，避免后续 AI 或工程执行仍按迁移前的旧仓库结构推进工作。

本文档回答两个问题：

1. 迁移前定义的步骤，哪些已经完成？
2. 迁移完成后，下一轮实施应从哪里开始？

## 2. 当前基线

本仓库已经完成以下基础迁移：

- 文档已按 `docs/architecture`、`docs/delivery`、`docs/phases`、`docs/templates` 分层
- 配置已归位到 `configs/`
- 样例 flow 已归位到 `flows/samples/`
- 执行脚本已归位到 `scripts/dev/` 和 `scripts/report/`
- 最小产品骨架已建立在 `packages/contracts/`、`packages/mcp-server/`、`packages/adapter-maestro/`、`packages/cli/`
- 旧的作者机器绝对路径已移除

因此，后续实施**不需要再次做目录迁移**，应直接在新结构上继续。

## 3. 已完成步骤

如果按迁移前定义的实施顺序来看，以下步骤已经完成：

1. 盘点和分类
2. 目录迁移映射
3. 文档、配置、flow、脚本归位
4. 路径治理与绝对路径清理
5. 最小 contracts 骨架建立
6. 最小 MCP server 骨架建立

这些步骤后续只需要维护，不应重复推倒重做。

## 4. 后续步骤需要如何调整

迁移前的旧顺序里，“目录重构”是大头；迁移完成后，下一轮应改为“实现收敛”优先。

推荐的新实施顺序如下。

### Step 1: 抽离执行核心

目标：

- 把当前 `scripts/dev/` 里的公共执行逻辑逐步迁入 `packages/adapter-maestro/`

优先抽离：

- 仓库根路径解析
- flow 路径装载
- screenshot / report 输出
- Android / iOS 通用 runner 包装

### Step 2: 接通最小 MCP tool

目标：

- 把 `packages/mcp-server/` 中的最小工具从占位实现接到真实 runner

优先顺序：

1. `start_session`
2. `run_flow`
3. `end_session`

要求：

- 使用 `packages/contracts/` 中的统一字段
- 返回结构化 envelope
- 至少能驱动当前 sample harness

### Step 3: 建立 config 装载层

目标：

- 不再让脚本分散读取参数，而是通过统一 config loader 读取 `configs/`

优先覆盖：

- `configs/harness/sample-harness.yaml`
- `configs/profiles/`
- `configs/policies/`

### Step 4: 增加最小 CLI 闭环

目标：

- 把当前脚本型入口逐步收敛成 CLI 命令

第一批建议命令：

- `mobile-e2e-mcp doctor`
- `mobile-e2e-mcp server start`
- `mobile-e2e-mcp sample run`
- `mobile-e2e-mcp report generate`

### Step 5: 做真实回归

目标：

- 在不改 flow 语义的前提下，验证迁移后的结构没有破坏现有验证资产

建议顺序：

1. RN sample
2. Native Android
3. Native iOS
4. Flutter Android

## 5. 后续 AI 执行约束

后续 AI 应遵守以下约束：

- 不要再把文件搬回仓库根目录
- 不要引入新的绝对路径
- 不要绕开 `packages/contracts/` 重新定义返回结构
- 不要在 `scripts/dev/` 中继续堆积新的长期逻辑
- 新实现优先进入 `packages/`，脚本仅保留过渡职责

## 6. 下一轮实施任务模板

如果把任务继续交给 AI，建议描述为：

> 在已完成目录迁移和骨架搭建的基础上，继续实现最小可运行的 MCP 闭环。优先把 `run_flow` 接入现有 Maestro runner，并把 `scripts/dev` 中的共享逻辑收敛到 `packages/adapter-maestro`。不要再次做大规模目录迁移，不要重写 phase 文档语义，不要引入新的绝对路径。

## 7. 新的验收重点

迁移之后，验收重点要从“目录是否合理”切换到“产品骨架是否开始真正工作”。

后续每轮实施至少检查：

1. MCP tool 是否开始调用真实执行逻辑
2. contracts 是否被实际复用
3. config 是否被统一读取
4. 现有 sample runner 是否还能工作
5. report 是否还能生成

## 8. 结论

迁移阶段已经结束。  
后续工作不应继续围绕“怎么搬目录”，而应围绕：

- adapter 抽离
- server 接线
- config 收敛
- CLI 闭环
- 真正回归验证

来推进项目。
