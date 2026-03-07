# 发现驱动的执行与收敛流程（中文版）

这个项目在执行过程中，一定会不断遇到一开始没有完全考虑到的问题：

- 系统弹窗
- Action Sheet / Bottom Sheet
- 键盘遮挡
- 权限请求
- 页面加载抖动
- 异常提示浮层

这些不应该被当作“单次事故”，而应该被纳入一个固定的发现驱动收敛流程。

## 推荐流程

### 第 1 步：发现问题

在冒烟、回归、人工验证或日志分析中发现异常。

### 第 2 步：保留证据

必须保留：

- screenshot
- ui tree
- action timeline
- logs

### 第 3 步：归类

将问题归类到以下之一：

- 能力缺口（Capability Gap）
- 平台适配缺口（Adapter Gap）
- 环境问题（Environment Issue）
- 验收缺口（Validation Gap）
- 样例/业务 App 问题（AUT Issue）

### 第 4 步：更新权威文档

最少要更新其中一个；通常需要更新多个：

- `docs/architecture/capability-map.md`
- `docs/architecture/architecture.md`
- `03/04` 平台适配文档
- `docs/delivery/roadmap.md`
- `docs/phases/phase-validation-strategy.zh-CN.md`

### 第 5 步：更新实现或规则

- 加 flow guard
- 加 interruption policy
- 加平台特定处理
- 加验收用例/断言

### 第 6 步：从头复验

受影响链路必须从头重跑，不能只从中间成功步骤继续。

### 第 7 步：沉淀结论

记录：

- 归属 phase
- 是否阻塞当前 Go/No-Go
- 是否升级为通用能力
- 是否需要 ADR 或 owner 跟踪

---

## 为什么这样更系统？

因为这样做可以保证：

1. 发现的问题不会只停留在某次临时修复
2. 文档、实现、验收始终保持一致
3. 项目会越跑越完整，而不是越跑越乱
4. 每个新增问题都会反过来提升平台通用性

---

## 这次案例的归类

“iOS 存储密码系统弹窗打断登录流程” 应归类为：

- **Capability Gap**：缺少 interruption handling 能力
- **Adapter Gap**：iOS 平台需要系统弹窗策略
- **Validation Gap**：Phase 1 验收用例中应显式覆盖已知系统弹窗
