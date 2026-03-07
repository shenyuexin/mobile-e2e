# 开源范围与发布计划

## 1. 文档目的

定义 `mobile-e2e-mcp` 将来开源时的公开范围、保留范围、推荐发布顺序和仓库治理基线。

目标是避免在开源时出现以下问题：

- 把私有资产、私有样例、私有设备信息误提交
- 把还没有产品化的内部实验内容直接暴露为外部承诺
- 一次性公开过大的范围，导致维护成本失控

## 2. 开源范围原则

开源范围应满足以下标准：

- 公开后对外部用户有实际使用价值
- 不包含私有业务信息
- 不依赖作者私有设备或私有账号才能理解
- 与产品定位一致
- 有基本文档和维护边界

## 3. 建议公开的目录

将来建议作为开源主体公开：

- `docs/`
- `packages/contracts/`
- `packages/core/`
- `packages/adapter-maestro/`
- `packages/mcp-server/`
- `packages/cli/`
- `configs/`
- `flows/`
- `examples/rn-login-demo/`
- `scripts/` 中与安装、报告、开发辅助相关的通用脚本
- `tests/`

## 4. 建议不公开或不默认提交的内容

以下内容不应作为公开仓库默认内容：

- 私有业务 app 包
- 私有业务 flow
- 私有设备标识
- 真实账号密码
- 访问令牌、证书、签名资产
- 私有 CI 细节
- 包含敏感信息的 artifact 和 report

## 5. 运行产物处理原则

`artifacts/`、`reports/` 这类目录建议保留在仓库结构中，但默认不纳入源码提交。

原因：

- 这些目录是运行产物，不是源码资产
- 其中可能含截图、日志、设备信息和敏感内容
- 公开仓库应保留目录语义，但不提交本地执行结果

## 6. 对外开放的最小能力包

建议开源第一阶段只公开一个“最小可运行集合”：

- 最小 MCP server
- 单个可用 adapter
- 样例 App
- 样例 flow
- 最小 policy/profile/config
- Quickstart 文档

这比一开始同时承诺完整 Android/iOS/RN/Flutter 全覆盖更现实。

## 7. 推荐的分阶段发布

### Phase OSS-1: Prototype Release

目标：

- 证明这是一个可运行的 MCP server，而不是纯蓝图

推荐内容：

- `contracts`
- `mcp-server`
- `adapter-maestro`
- `configs`
- `flows/samples`
- `examples/rn-login-demo`
- Quickstart 和安装文档

推荐承诺：

- 本地模式可运行
- 至少一个样例闭环
- 统一返回结构可用

### Phase OSS-2: Execution Baseline Release

目标：

- 证明 session、artifact、reporting 已形成稳定基础

新增内容：

- 更完整的 session 模型
- artifact/report 输出标准
- 更多样例 flow
- CI 文档

### Phase OSS-3: Multi-Profile Expansion

目标：

- 证明 Native/RN/Flutter profile 开始具备统一接入方式

新增内容：

- framework profile 扩展
- 兼容矩阵
- 更多 adapter 扩展位

### Phase OSS-4: Governance Baseline

目标：

- 将 policy 从静态配置推进到最小 runtime enforcement

新增内容：

- policy enforcement
- 审计导出
- retention/redaction 基线

## 8. 开源前必须补齐的仓库元数据

正式开源前建议至少补齐：

- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `ROADMAP.md`
- Issue / PR 模板
- 最小兼容性说明
- 支持范围声明

## 9. README 应明确的关键信息

开源时主 README 至少要清楚回答：

1. 这是什么？
2. 它不是什么？
3. 它是否依赖官方托管服务？
4. 用户需要准备什么环境？
5. 如何在本地启动？
6. 如何接入 Agent？
7. 当前稳定支持哪些场景？

## 10. 推荐的目录开放策略

建议将来采用如下策略：

- 源码、文档、配置、示例默认公开
- 运行产物默认忽略
- 私有样例单独保留在非公开仓库
- 私有 flow 与公开 sample flow 完全分离

## 11. 维护承诺建议

开源首版不要承诺过多维护范围。

建议显式限定：

- 首版支持的 adapter
- 首版支持的平台边界
- 首版支持的样例和 profile
- 哪些能力仍属于 roadmap，而不是 current support

## 12. 成功标准

开源范围和发布计划设计完成后，应满足以下判断：

- 外部用户知道项目当前成熟度
- 外部用户能区分“已实现”和“规划中”
- 仓库不会泄漏私有资产
- 开源首版具备最小可运行价值
- 后续发布能够按阶段扩展，而不是一次性失控
