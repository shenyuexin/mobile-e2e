# Phase 2 最小范围定义（中文版）

## 核心原则

Phase 2 不是去扩更多样例，不是去做真实业务覆盖，也不是马上冲到 RN/Flutter 全兼容。

**Phase 2 的目标是把 Phase 1 已经证明可行的 sample baseline，变成更稳定、可复用、可交接的执行基线。**

---

## Phase 2 最小范围

### 1. 共享执行合同

明确记录：

- iOS 启动方式
- Android `adb reverse` 前提
- Expo/Metro 前提
- 每轮 reset 方式
- 已知中断列表

### 2. interruption policy 归一化

将当前零散的中断处理 flow 提升为清晰规则：

- 平台
- 命中文本/模式
- 处理动作
- 优先级
- 是否允许自动忽略

### 3. 统一运行报告

每次平台执行输出统一结果：

- pass/fail
- interruption 命中记录
- 最终截图
- 调试产物路径
- 失败原因分类

### 4. 稳定性增强而非范围扩张

只增强当前黄金登录链路的稳定性，不新增更多业务用例。

---

## 不属于当前 Phase 2 的内容

- 真实业务 App onboarding
- Flutter 适配
- 复杂 OCR/CV 决策
- 多设备协同
- 企业级权限与审计深化

---

## Phase 2 完成标志

如果以下条件满足，则可进入 Phase 3：

1. 当前 sample harness 的执行方式已标准化
2. interruption handling 已经不是零散脚本，而是可复用规则
3. 每次运行结果可结构化追踪
4. Phase 1 黄金链路在新增稳定性机制后仍然保持通过
