# 当前项目阶段状态（中文版）

## 已完成

### Phase 1

- 已完成 sample/demo app 的双平台黄金链路验证
- iOS 5/5 通过
- Android 5/5 通过
- 已知中断已纳入处理

### Phase 2

- 已完成 sample harness 的最小稳定化
- 已建立 interruption policy 基线
- 已建立统一执行合同
- 已建立结构化运行报告脚本

---

## 已建立基线，但尚未完全实证完成

### Phase 3

- 已建立 framework profile contracts
- React Native profile 已有 sample baseline
- Native sample onboarding 已完成第一轮 Mobitru 双端验证
- Native harness baseline 已落地（Android 登录 flow 已通过，iOS baseline 与输入型 flow 均已通过）
- Flutter onboarding 已完成第一轮本机构建与 harness 验证
- 已建立 `validate:phase3-samples` 自动校验链，并新增 self-hosted real-run lane plumbing
- 本机 Android emulator real-run 已跑通，`flutter-android` 2/2 通过，`native-android` 1/1 通过，并已生成 acceptance evidence

### Phase 4

- 已建立治理配置基线
- policy / audit / retention / redaction 已开始进入运行时执行链路

### Phase 5

- 已建立 bug packet / self-healing review 的最小骨架
- 已落地 bounded auto-remediation 最小闭环（sample / dry-run / Android real-run stop-path 范围）
- 尚未接入开放式真实 agentic 自动修复闭环

### 主链路加固（进行中）

- 已启动 `state + locator + action` 主链优化
- 第一轮已完成：状态分类增强、locator 排序增强、action failure taxonomy 增强
- 第二轮已完成：auto-remediation 开始直接复用 `failureCategory / targetQuality / actionabilityReview`
- 第三轮已完成：viewport-aware locator 排序、off-screen/ambiguity diff、latestKnownStateDelta 与 stale-state 候选提示
- 第四轮已完成：scroll 决策开始真正消费 off-screen locator 信号
- 详见：`docs/phases/state-locator-action-hardening.zh-CN.md`

---

## 当前最重要的剩余工作

1. 在新的 sample 上继续验证 Phase 3 的扩展有效性，尤其补齐 iOS / React Native 的 real-run 验收
2. 在 GitHub self-hosted runner 上完成一次正式 `phase3-real-run` 工作流执行并沉淀证据
3. 继续扩大 Phase 4 运行时治理覆盖面，尤其是更细粒度的 redaction / retention 执行
4. 在 bounded auto-remediation 基线之上再讨论更强但仍受控的 Phase 5 agentic integration
5. 继续推进 `state + locator + action` 主链的第二轮加固

---

## 状态原则

这个仓库当前最重要的状态判断是：

- **Phase 1：完成**
- **Phase 2：完成**
- **Phase 3：共享 runner/report 路径已覆盖 RN / Native / Flutter，等待新 sample 实证**
- **Phase 3：RN / Native / Flutter 三条主路径均已建立实证样本与 harness 基线**
- **Phase 3：dry-run 校验链、自托管 real-run lane 与本机 Android emulator real-run 已打通，并已生成 `reports/acceptance-evidence.*`**
- **Phase 3：Android sample real-run 当前已通过；后续重点转向 iOS / React Native real-run 与新 sample 扩展**
- **Phase 4：基线已建，运行时接入已开始但仍未完全覆盖**
- **Phase 5：bounded auto-remediation baseline 已落地，等待更完整的 agentic integration 讨论**
