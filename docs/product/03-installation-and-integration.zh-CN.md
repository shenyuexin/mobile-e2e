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
- Node.js 和包管理器
- Python，如果报告脚本仍有 Python 依赖
- 可执行 shell 环境

### 3.2 Android 运行要求

- Android SDK
- `adb`
- Android Emulator 或已连接真机

### 3.3 iOS 运行要求

- macOS
- Xcode
- `xcrun simctl`
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
npm install
```

如果项目是 monorepo，可使用后续选定的 workspace 方案完成安装。

### 4.2 二进制/包安装

这可以作为后续增强能力，不必是首版要求。

例如未来可支持：

- `npm install -g`
- `npx mobile-e2e-mcp`
- Homebrew

但在第一阶段，源码安装更现实，也更利于贡献者理解结构。

## 5. 建议提供的基础命令

将来建议提供以下 CLI：

- `mobile-e2e-mcp doctor`
- `mobile-e2e-mcp server start`
- `mobile-e2e-mcp config validate`
- `mobile-e2e-mcp sample run`
- `mobile-e2e-mcp report generate`

如果首版 CLI 尚未完成，可先用等价脚本替代，但对外文档要说明这是过渡状态。

## 6. 环境校验

建议在首版提供 `doctor` 命令，用于检查：

- Node.js 版本
- `adb` 是否可用
- `xcrun` 是否可用
- `maestro` 是否可用
- Android 设备是否在线
- iOS Simulator 是否可用
- 关键配置文件是否存在

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
mobile-e2e-mcp server start
```

或在源码期使用：

```bash
npm run server
```

### 8.2 传输模式

开源首版建议优先支持：

- `stdio`

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
4. 调用 `run_flow` 或逐步执行 `tap` / `type_text`
5. 调用 `collect_artifacts`
6. 调用 `end_session`

## 11. 首批 MCP 工具建议

建议首版优先暴露以下工具：

- `start_session`
- `list_devices`
- `launch_app`
- `open_deep_link`
- `inspect_ui`
- `take_screenshot`
- `tap`
- `type_text`
- `run_flow`
- `collect_logs`
- `end_session`

这些工具应足以覆盖：

- session 建立
- 基础页面感知
- 基础交互
- 样例流程执行
- 证据收集
- session 收尾

## 12. 统一返回结构

所有工具都应返回统一 envelope，至少包含：

```json
{
  "status": "success|failed|partial",
  "reasonCode": "ENUM_VALUE",
  "sessionId": "string",
  "durationMs": 1234,
  "attempts": 1,
  "artifacts": [],
  "data": {},
  "nextSuggestions": []
}
```

这样用户才能在本地、CI、Agent 自动化场景中统一消费结果。

## 13. 本地模式推荐执行流程

建议未来 Quickstart 设计成下面的顺序：

1. 安装依赖
2. 运行 `doctor`
3. 启动 Android 模拟器或 iOS Simulator
4. 启动 sample app
5. 启动 MCP server
6. 在 Agent 中连接 MCP
7. 运行登录 smoke flow
8. 查看 artifact 和 report

## 14. CI 模式推荐执行流程

建议未来 CI 文档明确：

1. 准备 runner 镜像
2. 安装 SDK 和 backend
3. 启动模拟器或连接设备
4. 启动 MCP server
5. 执行 sample / smoke 流程
6. 保存 artifact 和 report

## 15. 常见失败场景

未来安装文档应显式处理以下问题：

- `adb` 不可用
- `xcrun` 不可用
- iOS 不在 macOS 环境
- `maestro` 未安装
- 设备未连接或未启动
- sample app 未启动或 App ID 不匹配
- Agent 能启动 MCP，但 MCP 无法访问本地设备资源

## 16. 文档落地标准

当以下内容都能被实际写进仓库并跑通时，说明安装与接入文档达标：

- 一个明确的安装入口
- 一个明确的 server 启动命令
- 一个 `doctor` 或同等检查入口
- 一个 sample 快速开始路径
- 一个 MCP client 接入示例
- 一个 CI 最小示例
