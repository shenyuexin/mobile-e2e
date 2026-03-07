# 开源部署模型

## 1. 文档目的

定义开源版 `mobile-e2e-mcp` 的部署方式、运行边界、组件职责和执行链路。

目标是回答三个关键问题：

1. 开源后用户如何部署和运行它？
2. 这个 MCP 依赖哪些外部环境？
3. 哪些资源由项目提供，哪些资源必须由用户自己提供？

## 2. 总体原则

开源版采用**自托管执行模型**：

- MCP server 运行在用户自己的环境中
- 设备和自动化后端由用户自己提供
- 项目本身不依赖中心控制平面
- 本地模式与 CI 模式共享同一套执行合同

## 3. 推荐支持的部署模式

### 3.1 本地开发模式

适用对象：

- 个人开发者
- 本地调试自动化流程的工程师
- 用模拟器或真机快速验证样例的用户

部署方式：

- 在开发机上启动 MCP server
- 使用本机的 Android 模拟器、iOS Simulator 或连接的真机
- Agent 通过 `stdio` 或本地端口连接 MCP

特点：

- 启动最快
- 最适合作为首版示例
- 适合单机验证和问题排查

### 3.2 CI / Runner 模式

适用对象：

- 持续集成环境
- 有固定 Mac runner / Linux runner 的团队
- 需要自动执行 smoke / regression 的团队

部署方式：

- 在 runner 上安装依赖并启动 MCP server
- 连接 runner 可访问的模拟器、真机或远程设备节点
- 由 CI job 或内部 Agent 调用 MCP 工具

特点：

- 适合批量执行和重复运行
- 适合沉淀稳定的报告和 artifact
- 更接近团队落地场景

### 3.3 自托管设备节点模式

适用对象：

- 拥有专用设备机或 Mac mini 池的团队
- 希望将执行环境与开发机分离的团队

部署方式：

- 在专用设备节点上运行 MCP server 或 MCP worker
- 连接本地设备、模拟器、真机、WDA 或其他 backend
- 由上层 Agent 或内部调度系统连接这些节点

特点：

- 更利于隔离和复用设备资源
- 适合后续扩展，但不是开源首版必选项

## 4. 不建议首版承诺的部署模式

开源首版不建议承诺：

- 公共云托管 MCP 服务
- 公共 API 网关
- 多租户在线控制台
- 内置设备租赁平台

这些能力会显著增加运维、鉴权、成本和安全复杂度，不适合当前阶段。

## 5. 运行架构

推荐的最小执行链路如下：

```text
AI Agent / MCP Client
        |
        v
mobile-e2e-mcp server
        |
        +--> session manager
        +--> policy engine
        +--> adapter router
        +--> artifact collector
        |
        v
adapter implementation
        |
        +--> maestro
        +--> adb / xcrun
        +--> future appium / idb / wda / others
        |
        v
simulator / emulator / real device
        |
        v
app under test
```

## 6. 组件职责划分

### 6.1 MCP server

负责：

- 暴露 MCP tool
- 管理 session 生命周期
- 调用 policy 检查
- 选择和调用 adapter
- 统一返回结构化结果
- 组织 artifact、timeline 和 report

### 6.2 Adapter

负责：

- 与底层 backend 交互
- 执行 tap、type、launch、flow run 等动作
- 获取 screenshot、logs、view hierarchy 等底层证据
- 把底层失败映射成统一 reasonCode

### 6.3 用户环境

负责：

- 提供可执行的 Android/iOS 环境
- 提供设备和 App
- 安装底层依赖
- 配置环境变量、路径和权限

## 7. 资源责任边界

### 7.1 项目需要提供

- MCP server 代码
- contracts 和 schema
- 默认配置、profile、policy
- sample flow
- sample app 或可公开样例
- CLI 和安装说明
- 最小测试集

### 7.2 用户需要自备

- Android SDK / `adb`
- iOS 运行环境和 `xcrun`，如果要跑 iOS
- `maestro` 或首版要求的 backend
- 模拟器、真机或设备节点
- 待测 App 或 demo app

## 8. 平台约束

### 8.1 Android

可在常见开发机或 CI 环境运行，只要能访问：

- `adb`
- Android Emulator 或真机
- 首版 adapter 所依赖的 backend

### 8.2 iOS

iOS 执行本身要求 macOS 环境，因此开源文档必须明确：

- iOS 功能仅在 macOS 节点可运行
- Linux 环境不能直接承担 iOS Simulator 执行

## 9. 数据与 Artifact 存储

开源首版建议默认使用本地文件系统：

- session 临时目录
- artifact 输出目录
- report 输出目录

不要求首版接入对象存储或远程数据库。

后续可以扩展：

- S3 兼容对象存储
- 远程 artifact 索引
- 审计导出后端

## 10. 网络依赖原则

建议首版遵循以下原则：

- MCP server 启动和运行默认不依赖公共在线服务
- 所有关键能力优先支持本地执行
- 如某些 backend 自身有外部依赖，应在安装文档中明确标注

## 11. 安全与权限原则

开源首版建议从一开始就保留 policy 概念，即使 enforcement 先做最小版本。

至少要支持：

- read-only
- interactive
- full-control

任何会改动设备或 App 状态的工具都应声明需要的 policy scope。

## 12. 推荐的首版运行方式

建议优先支持：

1. `stdio` 模式
2. 单机本地 artifact 输出
3. 单 adapter 可运行闭环
4. 本地和 CI 共用同一份 config 结构

这是当前阶段投入产出比最高的部署模型。

## 13. 成功标准

部署模型设计完成的标准不是“写了文档”，而是以下判断可以成立：

- 用户无需依赖你的公共服务器
- 用户知道自己要准备什么环境
- 用户知道如何在本地或 CI 启动 MCP
- 用户知道 MCP 与 backend、设备、App 的责任边界
- 用户知道哪些能力属于首版承诺，哪些不是
