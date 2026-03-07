# Native Onboarding：Mobitru Demo Apps（中文版）

## 目标

将当前已经在 RN sample 上验证通过的移动端自动化能力，迁移到真正的 Native 项目中做第一轮 onboarding。

本次选择项目：

- Android: `examples/demo-android-app`
- iOS: `examples/demo-ios-app`

---

## 为什么选择 Mobitru

这两个项目不是普通业务 App，而是专门为测试自动化演示设计的 demo app，因此非常适合作为 native onboarding 的第一站。

它们满足：

- 原生双端
- 明确的输入框 / 按钮 / 页面跳转
- 已有 Espresso / XCUITest 作为参考实现
- 大量 `android:id` / `accessibilityIdentifier`

---

## 我们验证的不是“登录功能本身”

这里的登录流程只是一个**通用交互能力样本**，主要用于验证：

1. 文本输入
2. 密码输入
3. 点击按钮
4. 页面切换
5. 成功/失败断言

所以如果后续换成“新增 Todo”“修改表单”“搜索”之类流程，本质验证目标是一样的。

---

## 本次选择的黄金链路

### Android

- 参考测试：`app/src/androidTest/java/com/epam/mobitru/login/LoginViewTests.java`
- 目标路径：输入有效用户名和密码 -> 点击登录 -> 校验进入产品页（`Mobile phones`）

### iOS

- 参考测试：`MobitruUITests/Login/LoginUiTests.swift`
- 目标路径：输入有效用户名和密码 -> 点击 Sign in -> 校验 `productHeaderViewLabel` 为 `Mobile phones (12)`

---

## 当前接入策略

### 第一层：先验证项目自带原生测试是否能在本机跑通

原因：

- 这一步可以最快验证项目是否可运行、依赖是否完整、模拟器/构建环境是否满足要求。

### 第二层：再把同样黄金链路迁移到我们自己的 harness 里

原因：

- 这样才能证明“不是只能跑项目自带测试”，而是我们的工具也能复用这套能力。

---

## 预期产出

1. native onboarding 基线文档
2. 至少一端（优先 Android）原生测试跑通
3. 明确 native 项目相比 RN sample 增加了哪些新接入要求
