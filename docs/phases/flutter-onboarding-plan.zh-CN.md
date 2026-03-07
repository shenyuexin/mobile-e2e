# Flutter Onboarding 计划（中文版）

## 当前状态

Flutter demo 项目已经完成结构分析，但**尚未开始实际构建与执行**。

项目路径：

- `examples/demo-flutter-app`

---

## 已确认的信息

### app identifiers

- Android package: `com.epam.mobitru`
- iOS bundle: `com.epam.mobitru.demoapp`

### 候选黄金链路

优先选择：

1. `loginValidCredential`
   - 输入用户名
   - 输入密码
   - 点击登录
   - 断言进入产品页

备选扩展链路：

2. `completeOrder`
   - 登录
   - 添加商品到购物车
   - 进入 checkout
   - 完成下单

### 自动化资产

项目已经自带：

- Appium Java tests
- Page Object 结构
- 本地运行说明文档
- 预先准备的 harness flow 骨架：
  - `flows/samples/flutter/mobitru-flutter-login-baseline.yaml`
  - `flows/samples/flutter/mobitru-flutter-login.yaml`

---

## 当前唯一外部阻塞

当前机器上：

- `flutter` 命令不存在

因此 Flutter onboarding 暂时卡在“无法构建 app”这一层，而不是卡在自动化路径选择层。

---

## 一旦 Flutter SDK 就绪，下一步将直接执行

1. `flutter doctor`
2. `flutter build apk --debug`
3. 安装到 Android emulator
4. 先跑项目自带 Appium / 或直接走我们自己的 harness baseline
5. 建立 Flutter profile 的第一条自有 flow

当前我们已经完成到第 4 步之前的所有准备工作。

---

## 结论

Flutter 不是“还没想清楚怎么做”，而是**方案已经明确，只差本机 Flutter toolchain 这个外部依赖**。
