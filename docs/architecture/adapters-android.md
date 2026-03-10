# Android Adapter Design

For current implementation-oriented file placement inside `packages/adapter-maestro`, see [`docs/architecture/adapter-code-placement.md`](./adapter-code-placement.md).

## 1. Backend Options

- **ADB**: device/app lifecycle, shell actions, logs, screenshots.
- **UIAutomator2 / Espresso**: deterministic UI tree and interactions.
- **Appium Android drivers**: standardized remote execution.
- **Maestro**: fast flow authoring and execution.

Recommended strategy:

- Base control: ADB
- Deterministic UI: UIAutomator2/Espresso via adapter
- Optional cross-platform: Appium/Maestro integration adapters

Platform adapters are primary. Framework context (native/RN/Flutter) is treated as instrumentation profile on top of Android adapter capabilities.

---

## 2. Representative Primitive Mapping

- list devices: `adb devices`
- launch app: `adb shell am start ...`
- stop app: `adb shell am force-stop ...`
- tap: `adb shell input tap x y`
- text: `adb shell input text '...'`
- screenshot: `adb exec-out screencap -p`
- logs: `adb logcat`

For robust element-based actions, avoid coordinate-only mode as default.

---

## 3. Android Risks and Mitigations

- OEM fragmentation → maintain compatibility matrix by API level and vendor.
- Soft keyboard overlap → keyboard-state checks and normalized input paths.
- Animation flakiness → animation disable profile in test env where possible.
- Permission dialogs variability → reusable permission-handler subflows.

---

## 4. Android MCP Tooling Set (Phase-wise)

## Phase 1

- android.listDevices
- android.launchApp
- android.terminateApp
- android.getTree
- android.tap / android.type / android.swipe
- android.takeScreenshot
- android.getLogs

## Phase 2+

- android.setNetworkProfile
- android.getCrashSignals
- android.recordScreen
- android.assertions.visualBaseline
- android.runFlow

---

## 5. System UI, WebView, and OEM Variance

Add explicit handling policies for:

- Runtime permissions dialogs
- System notifications/overlays
- WebView context switching limits
- OEM-specific UI/permission behavior

Each policy should declare supported/partial/unsupported status by Android version/vendor profile.
