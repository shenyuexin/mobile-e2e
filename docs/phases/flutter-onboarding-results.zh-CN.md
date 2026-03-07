# Flutter Onboarding 结果记录（中文版）

## 结论

Flutter onboarding 已经从“仅有计划与 flow skeleton”推进到“本机可构建、可安装、可通过自有 harness 执行”。

---

## 已完成的工作

### 1. 环境打通

- 安装并验证 Flutter SDK
- Android licenses 全部接受
- 使用隔离的 Gradle user home 绕开全局 init script 干扰

### 2. 构建链路打通

为了兼容 Flutter 3.41.4，对 `examples/demo-flutter-app/android/` 做了最小 Android Gradle 迁移：

- 迁移到新的 Flutter plugin loader 方式
- 升级 Gradle wrapper / AGP / Kotlin 插件版本
- 修复 JDK / NDK / 输出路径相关问题

结果：

- Flutter demo Android debug APK 可成功构建

### 3. 自有 harness 执行通过

#### baseline flow

- `flows/samples/flutter/mobitru-flutter-login-baseline.yaml`
- 结果：**通过**

#### 输入型 flow

- `flows/samples/flutter/mobitru-flutter-login.yaml`
- 结果：**通过**

已验证能力：

- 点击快捷登录
- 文本输入
- 密码输入
- 提交登录
- 产品页断言

---

## 关键经验

1. Flutter onboarding 的真正挑战不只是 UI 自动化，而是构建链兼容。
2. 一旦构建链收敛后，基于 semantics / accessibility 的 harness flow 是可行的。
3. Flutter 与 Native/RN 一样，也可以纳入统一的能力模型：启动、输入、点击、断言、留证据。

---

## 当前阶段意义

这意味着当前项目已经完成了：

- RN sample baseline
- Native sample baseline + harness
- Flutter sample baseline + harness

也就是说，**React Native / Native / Flutter 三条主路径都已经有了实证样本。**
