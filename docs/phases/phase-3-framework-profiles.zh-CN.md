# Phase 3 框架 Profile 基线（中文版）

## 结论

当前仓库已经具备 **React Native profile 的 sample baseline**，因此 Phase 3 可以从“框架扩展基线”开始，而不需要重新证明 RN 这条链路是否成立。

---

## 当前状态

### 已具备

- React Native sample baseline（Expo RN）
- iOS / Android 双平台黄金链路
- 中断处理和结构化报告基础

### 尚未具备

- 新 sample 上的持续扩展实证
- 兼容矩阵在更多 sample 上的持续实例化

---

## 本阶段基线产物

- `configs/profiles/react-native.yaml`
- `configs/profiles/native.yaml`
- `configs/profiles/flutter.yaml`

它们分别定义：

- 当前状态（validated / contract-only）
- 接入前提
- 已知约束

其中当前实证状态已经推进为：

- `configs/profiles/react-native.yaml`：validated-sample-baseline
- `configs/profiles/native.yaml`：validated-sample-baseline
- `configs/profiles/flutter.yaml`：validated-sample-baseline（当前先覆盖 Android）

---

## Phase 3 进入规则

如果后续要扩展真实 Native 或 Flutter 项目，应按各自 profile 的 contract 进行 onboarding，而不是直接复用 RN 的所有假设。
