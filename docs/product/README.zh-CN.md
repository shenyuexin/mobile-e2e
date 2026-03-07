# 开源产品文档索引

本文档组用于定义 `mobile-e2e-mcp` 将来开源后的产品形态、部署方式、用户接入路径、开源边界和发布顺序。

适用场景：

- 在正式开源前统一产品定位
- 为后续目录重构和 MCP server 骨架提供边界
- 为 README、安装文档、发布说明提供母版
- 为本地、CI、自托管三类使用方式建立一致叙述

## 文档列表

- `01-open-source-positioning.zh-CN.md`
  说明项目开源后的产品定位、目标用户、非目标和最小能力承诺。
- `02-deployment-model.zh-CN.md`
  说明开源版的部署模型、运行边界、执行链路和环境职责划分。
- `03-installation-and-integration.zh-CN.md`
  说明用户如何安装、配置、启动 MCP、接入 Agent，并执行第一个样例流程。
- `04-open-source-scope-and-release-plan.zh-CN.md`
  说明哪些目录和能力应开源、哪些内容不应公开，以及推荐的分阶段发布方案。
- `05-post-migration-implementation-brief.zh-CN.md`
  说明目录迁移完成后，后续 AI 和工程实现应如何继续推进。

## 当前结论

本项目将来更适合以如下形态开源：

- 一个**开源、自托管、可本地部署、可 CI 部署**的 mobile E2E MCP server
- 首版不依赖你提供任何公共托管服务
- 用户在自己的本地或 CI 环境中运行 MCP
- MCP 连接用户本地已有的 Android/iOS 自动化能力和设备资源

## 与当前仓库的关系

这组文档定义的是**目标产品形态**，不是对当前仓库现状的夸大描述。

当前仓库仍以 blueprint、样例 flow、验证脚本和配置基线为主；后续目录重构和 MCP server 骨架应逐步向本组文档收敛。
