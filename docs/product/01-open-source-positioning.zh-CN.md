# 开源产品定位

## 1. 文档目的

定义 `mobile-e2e-mcp` 将来在 GitHub 开源后的标准产品定位，避免仓库被误解为：

- 纯文档仓
- 云端托管平台
- 另一个通用测试框架
- 与现有移动自动化工具完全重复的封装层

本项目的正确定位应当在开源前被明确并在 README、网站、发布说明中保持一致。

## 2. 产品定义

`mobile-e2e-mcp` 的目标产品形态是：

> 一个面向 AI Agent 的、开源的、自托管的移动端 E2E MCP server。

该 MCP server 运行在用户自己的开发机、Mac 主机、CI runner 或设备节点上，通过本地可用的移动端自动化后端执行测试和调试任务。

## 3. 核心定位

开源版不是：

- 公共云服务
- 设备农场
- SaaS 控制台
- 托管式 artifact 平台

开源版是：

- MCP server
- 本地/CI 可部署执行层
- 多 adapter 的统一入口
- 面向 Agent 的结构化工具层
- 带 policy、artifact、session、reporting 约束的 orchestration layer

## 4. 核心价值

项目的价值不在于重新发明 Appium、Maestro、WDA、idb，而在于提供统一的 AI-facing 执行与治理层。

首要价值包括：

- 把移动自动化能力封装成 Agent 可调用的 MCP 工具
- 统一 session、artifact、reasonCode、policy、timeline 等执行合同
- 允许在 Android、iOS、RN、Flutter 之间逐步扩展
- 保持 deterministic-first，避免视觉路径成为默认主路径
- 让本地调试、CI 执行、后续 agentic 扩展使用同一套基础模型

## 5. 目标用户

首批目标用户建议限定为：

- 移动端自动化工程师
- 需要让 AI Agent 操作 App 的开发者
- 使用本地模拟器/真机进行验证的个人开发者
- 在自有 CI 中执行移动测试的工程团队
- 希望把现有 Maestro/Appium 资产纳入统一 orchestration 的团队

## 6. 非目标

开源首版不应承诺以下能力：

- 为用户托管公共设备或运行任务
- 提供多租户账号系统
- 提供网页版执行控制台
- 覆盖所有移动自动化后端的完整兼容
- 在没有本地执行环境时直接工作
- 自动解决所有 flaky 问题或实现完全自动自愈

## 7. 推荐的首版承诺

开源首版建议只承诺以下边界内能力：

- Android + iOS 的最小 session 模型
- 基于首个 adapter 的可运行 MCP 工具集
- 样例 flow 的可重复执行
- 截图、日志、基础 artifact 采集
- 结构化结果输出
- 本地模式和 CI 模式下的基本接入文档

如果首版继续以 Maestro 为底层执行后端，这是合理的，不需要急于支持所有 adapter。

## 8. 运行责任划分

开源项目维护者负责：

- 提供 MCP server 代码
- 提供 contracts、adapter、policy/config、sample flows
- 提供安装、配置和接入文档
- 提供基础测试与兼容性声明

用户负责：

- 准备自己的 Android/iOS 环境
- 提供模拟器、真机或设备执行节点
- 安装所需 backend，例如 `adb`、`xcrun`、`maestro`
- 提供待测 App 包或 sample app
- 在本地或 CI 中启动 MCP 并接入 Agent

## 9. 首版推荐对外表述

建议统一使用类似表达：

> `mobile-e2e-mcp` 是一个开源、自托管的 mobile E2E MCP server，面向 AI Agent 暴露结构化移动自动化工具，可运行在开发机或 CI 环境中，并通过本地移动自动化后端执行测试与调试任务。

## 10. 产品边界判断原则

后续所有目录设计、MCP server 设计、CLI 设计、README 编写，都应符合以下原则：

- 不要求作者提供公共服务器
- 不把私有运行环境写死在产品模型中
- 不夸大当前未实现的能力
- 不把“文档规划”误写成“已实现功能”
- 所有对外能力应尽量映射到可调用工具、可配置 contract 和可复现执行链路
