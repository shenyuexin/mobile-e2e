# Mobile E2E MCP 蓝图（中文版）

本项目用于设计并落地一个面向 AI Agent 的移动端端到端（E2E）MCP 平台，覆盖 Android、iOS、React Native、Flutter。

## 代码导览

- `repomix-output.xml`：包含整个项目源代码的整合 XML 文件，方便 AI 快速理解项目上下文与代码细节。`npx repomix@latest` 可以用来更新 XML 文档。

### 项目分析顺序（重要）

以后所有 AI/代码分析建议统一按以下顺序执行：

1. **先读 `repomix-output.xml`**，快速建立全局架构与代码脉络。
2. **再做仓库增量核对**（`git ls-files` + 定向文件读取），确认结论与当前仓库一致。
3. 将 `repomix-output.xml` 作为**第一入口**，但不要当作唯一事实来源。

原因：

- Repomix 可能会排除部分文件（例如二进制资源、忽略规则命中的文件，或未进入 packed file 段的文件）。
- 所以最终结论需要以仓库真实文件做二次校验。

## 开源产品文档

- `docs/product/README.zh-CN.md`：开源产品文档索引
- `docs/product/01-open-source-positioning.zh-CN.md`：开源产品定位
- `docs/product/02-deployment-model.zh-CN.md`：开源部署模型
- `docs/product/03-installation-and-integration.zh-CN.md`：安装与接入指南
- `docs/product/04-open-source-scope-and-release-plan.zh-CN.md`：开源范围与发布计划
- `docs/product/05-post-migration-implementation-brief.zh-CN.md`：迁移后实施说明
- `docs/product/06-harness-tech-gap-and-optimization.zh-CN.md`：harness 技术缺口分析与优化建议（含已落地项）

## 这个 MCP 会实现哪些能力？

## 1) 设备与环境控制

- 设备发现、选择、启动/关闭、重置
- 网络、定位、权限、语言/时区等环境控制
- 会话隔离与资源占用控制

## 2) 应用生命周期管理

- 安装/卸载
- 启动/终止
- 前后台切换
- Deep Link 跳转
- 应用数据清理

## 3) 页面感知与检查

- 优先获取 Accessibility / UI Tree
- 截图、录屏、页面结构快照
- 元素定位与页面状态检测

## 4) 自动化交互执行

- 点击、输入、滑动、滚动、长按、等待条件
- 流程编排（如登录、下单、支付前流程）

## 5) 断言与结果验证

- 可见性、文本、存在/不存在、范围/位置断言
- 失败时自动产出证据包（截图 + tree + logs + action timeline）

## 6) 调试与观测能力

- 设备日志、应用日志、崩溃信息
- 关键性能快照
- RN 场景下可补充 Metro/Runtime 调试日志

## 7) 可靠性策略（Deterministic-first）

- 默认走确定性路径（ID/可访问性树/原生能力）
- OCR/CV 仅作为有边界的兜底，不作为主路径
- 所有回退都会记录置信度与原因码

## 8) 治理与企业化

- 权限分级（只读/交互/全控制）
- 审计追踪与留痕
- 脱敏、保留策略、模型版本治理

---

## 分阶段目标（简版）

- **Phase 0**：协议、会话、错误模型、治理框架搭好
- **Phase 1**：Android+iOS 核心确定性流程可跑通（优先登录主链路）
- **Phase 2**：稳定性与兜底能力（OCR/CV、重试、抗波动）
- **Phase 3**：RN/Flutter 扩展与兼容矩阵
- **Phase 4**：企业治理能力（RBAC、审批、审计导出）
- **Phase 5**：智能化增强（自愈建议、目标到流程规划）

---

## 可以用你本地模拟器做验收吗？

可以，而且建议作为第一阶段主验收环境：

- iOS：Xcode Simulator
- Android：Android Studio Emulator

建议策略：

1. **先模拟器验收主链路**（高频、稳定、可重复）
2. **再补少量真机冒烟**（处理通知、系统弹窗、OEM差异）
3. 每阶段都按统一证据包与门禁指标做 Go/No-Go

详细验收逻辑请看：`docs/phases/phase-validation-strategy.zh-CN.md`
