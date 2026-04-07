# Vivo/Oppo 多用户（XSpace）回放排查与操作手册

> 适用场景：`run_flow` 在 vivo/oppo 真机上需要执行 Maestro 专属命令（extendedWaitUntil, setClipboard, openLink 等），或者回放在首个 UI 步骤超时。
>
> **注意**：Phase 16 之后，绝大多数 Android 回放命令（launchApp, tapOn, inputText, assertVisible, assertNotVisible, swipe, back, home, hideKeyboard, stopApp, clearState）已通过 owned-adb 原生执行，**不需要安装 `dev.mobile.maestro` helper app**。仅当 flow 包含 owned-adb 不支持的命令时才会回退到 Maestro。

## 1) 先确认是否是多用户场景

```bash
adb -s <DEVICE_ID> shell pm list users
adb -s <DEVICE_ID> shell am get-current-user
```

如果输出里存在类似：

- `UserInfo{0:...} running`
- `UserInfo{666:XSpace User:...} running`

说明当前是典型多用户/XSpace 场景。

---

## 2) 检查 helper app 是否装在目标用户

```bash
adb -s <DEVICE_ID> shell cmd package list packages --user 0 | grep "dev.mobile.maestro"
adb -s <DEVICE_ID> shell cmd package list packages --user 0 | grep "dev.mobile.maestro.test"
```

建议同时检查 AUT（例如 Mobitru）是否在 user 0：

```bash
adb -s <DEVICE_ID> shell cmd package list packages --user 0 | grep "com.epam.mobitru"
```

---

## 3) 强制 user 0 执行 replay（推荐）

### 3.1 手工前置切用户

```bash
adb -s <DEVICE_ID> shell am switch-user 0
```

### 3.2 用脚本强制 user 0 执行

```bash
OUT_DIR="artifacts/mcp-server/vivo-user0-replay/android/phase1" \
APP_ID="com.epam.mobitru" \
FLOW="/ABS/PATH/TO/your-flow.yaml" \
DEVICE_ID="<DEVICE_ID>" \
ANDROID_USER_ID="0" \
bash scripts/dev/run-phase1-android.sh 1
```

说明：

- 脚本会使用 `cmd package list packages --user "$ANDROID_USER_ID"` 检查 helper app；
- helper 已存在时走 `--no-reinstall-driver`，避免重复安装授权弹窗；
- 若 helper 缺失会前置失败，不会在回放中途弹安装框。

### 3.3 用 `run_flow` 显式配置（推荐给 MCP 调用方）

现在 `run_flow` 已支持显式 Android 回放配置：

```json
{
  "sessionId": "your-session-id",
  "platform": "android",
  "deviceId": "<DEVICE_ID>",
  "flowPath": "flows/samples/native/mobitru-android-login.yaml",
  "androidReplayOptions": {
    "userId": "0",
    "textInputStrategy": "oem_fallback",
    "expectedAppPhase": "detail"
  }
}
```

字段含义：

- `userId`: 强制 user 域（vivo/oppo 多用户场景推荐 `0`）
- `textInputStrategy`:
  - `auto`: 自动判断
  - `maestro`: 强制走 Maestro 原始文本输入
  - `oem_fallback`: 强制走 OEM 文本输入 fallback
- `expectedAppPhase`: 回放后强校验页面阶段（例如登录后首页可用 `detail`）

---

## 4) 当前已验证结果（vivo 真机）

- `ANDROID_USER_ID=0` 可以显著降低“重复安装 helper”问题；
- 但在部分 vivo 机型上，`Maestro inputText / pasteText` 仍可能失败：
  - `Command failed (tcp:7001): closed`
  - `DEADLINE_EXCEEDED`
  - `UNAVAILABLE: Network closed for unknown reason`

这说明问题已从“安装/用户域”收敛到“Maestro driver 文本输入 RPC 通道稳定性（7001）”。

---

## 5) 已集成的 OEM 文本输入 fallback

针对 **vivo/oppo + 多用户/XSpace + flow 中存在文本输入命令** 的场景，`scripts/dev/run-phase1-android.sh` 已支持自动分流到：

- `scripts/dev/android-oem-text-fallback.ts`

该 fallback 的工作方式是：

1. 继续使用 MCP `query_ui` 定位控件（仍然需要结构化 UI dump）；
2. 对 `tapOn/assertVisible` 走正常 UI 查询与 adb 点击；
3. 对 `inputText/pasteText` 改用 **adb 文本注入**，避免走 Maestro `inputText` RPC；
4. 保留 user 0 切换与 OEM 设备分流。

### 当前已验证通过的范围

- **Mobitru 登录流**（user 0 / vivo 真机）
- 结果：成功进入登录后首页（`appPhase=detail`）

### 当前限制（务必注意）

- 这是一个**有限 Maestro YAML 子集解释器**，不是完整 Maestro 引擎替代；
- 当前仅稳定覆盖：
  - `launchApp`
  - `assertVisible`
  - `tapOn`
  - `inputText`
  - `setClipboard`
  - `pasteText`
- 更复杂命令（条件块、子 flow、复杂手势、断言组合）仍应优先走原始 Maestro 路径。

---

## 6) 建议执行策略（生产可落地）

1. **保留 user 0 强制策略** 作为 vivo/oppo 多用户设备默认前置。
2. 对含文本输入的登录类 flow，优先启用 **OEM text fallback**。
3. 若仍出现 `tcp:7001` 且 flow 超出 fallback 能力边界：
   - 将该设备标记为“回放受限”；
   - 把回放真值验证放到单用户设备/模拟器；
   - 真机继续用于录制与非 Maestro driver 依赖动作验证。
4. 将失败证据固定保留（`maestro.out` + `maestro.log`），用于后续驱动层专项治理。

---

## 7) 快速判定清单

- [ ] `pm list users` 是否有 XSpace/secondary user
- [ ] helper app 是否在 `--user 0` 可见
- [ ] `ANDROID_USER_ID=0` 回放是否消除安装弹窗
- [ ] 若无弹窗但 `inputText/pasteText` 仍报 `tcp:7001`，切换到 OEM text fallback
- [ ] 若超出 fallback 支持命令范围，归类为 driver 通道问题并转模拟器/单用户设备验证
