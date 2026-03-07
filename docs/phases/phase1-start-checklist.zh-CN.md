# Phase 1 启动清单（可直接执行）

## 1. 目标

在本地模拟器环境完成 Phase 1 最小闭环：

1. 启动 Android + iOS 模拟器
2. 启动/安装被测 App
3. 跑通登录主链路（样例项目 5 次重复）
4. 产出并归档证据包
5. 基于指标做 Go/No-Go

---

## 2. 本机环境确认（你当前结果）

- Xcode 已安装（`xcodebuild -version` 可用）
- iOS Simulator 可用（`xcrun simctl list devices available` 返回大量可用机型）
- Android SDK 已安装（`~/Library/Android/sdk` 存在）
- ADB 可用（`adb version` 正常）
- Android AVD 已存在：`Medium_Phone_API_36`

> 结论：可直接进入 Phase 1 验收，不需要额外安装。

---

## 3. 启动命令（iOS）

### 3.1 选择并启动一个 iPhone 模拟器

```bash
# 查看可用设备
xcrun simctl list devices available

# 启动指定 UDID（示例）
xcrun simctl boot D0C79B69-5042-4E4A-82E2-9F05BAEC3A09

# 打开 Simulator 界面
open -a Simulator
```

### 3.2 常用 iOS 验收命令

```bash
# 截图
xcrun simctl io booted screenshot ./artifacts/ios-screenshot.png

# 终止 app
xcrun simctl terminate booted <BUNDLE_ID>

# 启动 app
xcrun simctl launch booted <BUNDLE_ID>
```

---

## 4. 启动命令（Android）

### 4.1 启动 AVD

```bash
# 列出 AVD
"$HOME/Library/Android/sdk/emulator/emulator" -list-avds

# 启动 AVD（后台）
"$HOME/Library/Android/sdk/emulator/emulator" -avd Medium_Phone_API_36
```

### 4.2 常用 Android 验收命令

```bash
# 查看设备
adb devices

# 启动 app（示例）
adb shell am start -n <PACKAGE>/<ACTIVITY>

# 停止 app
adb shell am force-stop <PACKAGE>

# 截图
adb exec-out screencap -p > ./artifacts/android-screenshot.png
```

---

## 5. Phase 1 验收执行节奏（建议）

## Day 1

- 固化测试机型与系统版本
- 固化登录主链路用例
- 定义证据包目录结构

## Day 2-3

- Android 主链路跑 5 次
- iOS 主链路跑 5 次
- 记录成功率/失败分类/中位时延

## Day 4

- 对失败样本做分类：locator、状态漂移、环境问题、适配器问题
- 修复 P0 问题后再跑回归

## Day 5

- 汇总指标，按 `docs/phases/phase-validation-strategy.zh-CN.md` 做 Go/No-Go

---

## 6. 证据包目录建议

```text
artifacts/
  run-001/
    action-timeline.json
    screenshot-before.png
    screenshot-after.png
    ui-tree.json
    app.log
    device.log
  run-002/
  ...
```

---

## 7. 截图体积与分辨率控制（强烈建议）

你的判断是对的：原始截图在高分辨率设备上很容易达到数 MB，影响传输、存储与回放效率。

建议采用双轨策略：

1. **运行证据图（默认）**：用于自动化回放/日志关联，压缩后保留可读性。
2. **高保真原图（按需）**：仅在失败复盘或关键问题时保留少量样本。

### 推荐参数（默认）

- 长边限制：`1280`
- 格式：`JPEG`
- 质量：`70~80`
- 单张目标体积：`200KB ~ 1.2MB`

### iOS 示例（simctl + sips）

```bash
# 先抓原图（PNG）
xcrun simctl io booted screenshot ./artifacts/ios-raw.png

# 压缩为 JPEG（宽度 1280，质量 75）
sips -Z 1280 -s format jpeg -s formatOptions 75 ./artifacts/ios-raw.png --out ./artifacts/ios-evidence.jpg
```

### Android 示例（adb + sips）

```bash
# 先抓原图（PNG）
adb exec-out screencap -p > ./artifacts/android-raw.png

# 压缩为 JPEG（宽度 1280，质量 75）
sips -Z 1280 -s format jpeg -s formatOptions 75 ./artifacts/android-raw.png --out ./artifacts/android-evidence.jpg
```

### 可选优化

- 保留最后一次失败步骤的原图，其余仅保留压缩图。
- 在 CI 中统一只上传压缩图 + 原图抽样（比如每 5 次保留 1 次原图，或仅失败保留原图）。

---

## 8. Go / No-Go（Phase 1）

建议满足：

- 每平台 5 次执行通过率 >= 95%
- 失败证据包完整率 >= 99%
- 回退链路可追踪（原因码+置信度）

补充说明：如果是当前这个最小 RN 登录样例，5 次足够作为 Phase 1 门槛；如果切到复杂业务 App，再按风险提高轮次。

满足则 Go，进入 Phase 2；否则 No-Go，先修复再复验。
