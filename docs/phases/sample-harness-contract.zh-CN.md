# Sample Harness 执行合同（Phase 2 基线）

## 目的

这个文档定义当前 sample/demo app 验证基线的运行前提，避免后续换机器、换执行者或进入 CI 后出现“明明流程没变但跑不通”的问题。

---

## 1. 样例目标

- 项目：`rn-login-demo/`
- 类型：Expo React Native 登录样例
- 黄金链路：登录页 -> 输入账号密码 -> 点击登录 -> 首页可见

---

## 2. 平台执行前提

### iOS

- 需要 booted iOS simulator
- 通过 `xcrun simctl openurl <UDID> exp://127.0.0.1:8081` 打开样例
- 每轮执行前终止 `host.exp.Exponent`

### Android

- 需要 Android emulator 在线（当前基线：`emulator-5554`）
- 必须执行：`adb reverse tcp:8081 tcp:8081`
- 通过 `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent` 打开样例
- 每轮执行前 force-stop `host.exp.exponent`

---

## 3. 已知中断前提

### iOS 已知中断

- Save Password / Not Now
- 中文本地化版本的同类弹窗

### Android 已知中断

- Expo 首次说明页（Continue）
- Expo Dev UI（Reload）
- 常见权限按钮（Allow / 允许 / Only this time）

---

## 4. 运行成功的定义

一次运行只有在以下全部满足时才算成功：

1. 登录页可见
2. 输入动作成功
3. 登录按钮点击成功
4. 已知中断被处理或跳过
5. 首页文案“欢迎进入首页”可见

---

## 5. 调试产物要求

每次 run 至少保留：

- `maestro.out`
- `result.txt`
- `final.jpg`
- `debug/` 目录（失败时尤为关键）
