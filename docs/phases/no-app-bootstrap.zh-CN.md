# 没有业务 App 时，如何启动 Phase 1（实操）

你当前没有可用于“登录冒烟”的业务 App，这是正常情况。建议直接走“最小登录样例”路径，不阻塞 Phase 1。

## 推荐方案（最快）

使用 **Expo React Native** 创建一个最小登录 App（同一套代码跑 iOS + Android 模拟器）。

你本机现状：

- 已有 Node/npm/npx
- 已有 iOS/Android 模拟器环境
- 没有 Flutter（所以不建议先走 Flutter）

---

## 1) 创建样例项目

```bash
mkdir -p ~/Documents/mobile-e2e-mcp-samples
cd ~/Documents/mobile-e2e-mcp-samples
npx create-expo-app rn-login-demo --template blank-typescript
cd rn-login-demo
```

---

## 2) 替换为最小登录页面

将 `App.tsx` 替换为本仓库提供的模板：

- 模板路径：`examples/rn-login-demo/App.tsx.template`

复制方式：

```bash
cp <repo-root>/examples/rn-login-demo/App.tsx.template ./App.tsx
```

---

## 3) 启动并在模拟器运行

```bash
npm run ios
# 或
npm run android
```

默认测试账号（模板内置）：

- 手机号：`13800138000`
- 密码：`123456`

成功后会进入 Home 页面，并显示 `welcome-home` 标识。

---

## 4) 为什么这样做

这个最小样例满足 Phase 1 的核心验收需求：

- 有清晰登录链路
- 有稳定标识（testID）
- 可重复执行 5 次并统计通过率
- 可输出标准证据包（截图/tree/logs）

后续你接入真实业务 App 时，只需要替换样例 app，不需要推翻验收框架。

---

## 5) 备选方案

如果你不想创建 RN 样例，也可以先用 Appium 官方样例做“非登录冒烟”：

- Android: `ApiDemos-debug.apk`
  - https://github.com/appium/android-apidemos/releases/latest
- iOS: `UIKitCatalog-iphonesimulator.zip`
  - https://github.com/appium/ios-uicatalog/releases/latest

但这条路径不满足“登录冒烟”场景，仅适合验证基础交互与工具链。
