# External Tools Setup Guide

> This document covers all external tools required by the mobile-e2e-mcp project,
> organized by platform and role. Each tool includes install instructions,
> verification steps, and how it's used in this project.

## Quick Reference

| Tool | Platform | Install | Used For | Required? |
|---|---|---|---|---|
| **axe** | macOS | `brew install cameroncooke/axe/axe` | iOS simulator UI automation | ✅ Yes (iOS simulators) |
| **WebDriverAgent** | macOS + iOS | Build from source (see [WDA Setup](wda-setup.md)) | iOS physical device UI automation | ✅ Yes (iOS physical devices) |
| **iproxy** | macOS | `brew install libusbmuxd` | WDA port forwarding | ✅ Yes (iOS physical devices) |
| **adb** | macOS/Linux/Windows | `brew install android-platform-tools` | Android device communication | ✅ Yes (Android devices) |
| **Maestro** | macOS/Linux/Windows | `curl -Ls https://get.maestro.mobile.dev \| bash` | Fallback for edge-case replay commands | ⚠️ Optional (edge-case commands only) |
| **Xcode** | macOS | App Store | WDA building, iOS simulator runtime | ✅ Yes (iOS development) |
| **libimobiledevice** | macOS | `brew install libimobiledevice` | iOS physical device crash reports (fallback) | ❌ Optional |
| **Perfetto** | macOS/Linux/Windows | `brew install perfetto` | Android performance profiling | ❌ Optional |
| **idb** | macOS | `pipx install fb-idb` | Deprecated — legacy compatibility only | ❌ Deprecated |

---

## AXe CLI

**GitHub:** [cameroncooke/AXe](https://github.com/cameroncooke/AXe)
**Role:** Primary backend for iOS simulator UI automation (Phase 14+)

### What it does

AXe is a single-binary CLI tool that interacts with iOS simulators using Apple's Accessibility APIs. It replaces the deprecated `idb` tool for simulator automation.

### Commands used by this project

| Project Action | AXe Command |
|---|---|
| `inspect_ui` | `axe describe-ui --udid <UDID>` |
| `tap` | `axe tap -x <x> -y <y> --udid <UDID>` |
| `type_text` | `axe type "<text>" --udid <UDID>` |
| `swipe` | `axe swipe --start-x <x1> --start-y <y1> --end-x <x2> --end-y <y2> --udid <UDID>` |
| `take_screenshot` | `axe screenshot --udid <UDID> --output <path>` |

### Install

```bash
brew install cameroncooke/axe/axe
```

### Verify

```bash
axe --version
axe describe-ui --help
```

### Use with this project

For simulator actions, AXe is auto-selected when you target a simulator UDID:

```bash
export IOS_EXECUTION_BACKEND=axe
mobile-e2e-mcp inspect_ui --platform ios --deviceId <SIMULATOR_UDID>
```

### Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `axe: command not found` | Not installed | `brew install cameroncooke/axe/axe` |
| `simulator is not booted` | Simulator not running | `xcrun simctl boot <UDID>` |
| `accessibility permission denied` | macOS accessibility permissions | System Settings → Privacy & Security → Accessibility → allow Terminal/iTerm |

---

## WebDriverAgent (WDA)

**GitHub:** [appium/WebDriverAgent](https://github.com/appium/WebDriverAgent)
**Role:** Primary backend for iOS physical device UI automation (Phase 15+)

See the dedicated **[WDA Setup Guide](wda-setup.md)** for complete instructions.

### Quick summary

| Step | Command |
|---|---|
| 1. Clone | `git clone https://github.com/appium/WebDriverAgent && cd WebDriverAgent` |
| 2. Build | Open in Xcode → Build For Testing → select device |
| 3. Launch | `xcrun devicectl device process launch --device <UDID> <BUNDLE_ID>` |
| 4. Forward | `iproxy 8100 8100 --udid <UDID> &` |
| 5. Verify | `curl -s http://localhost:8100/status` |

---

## iproxy

**Package:** `libusbmuxd` (Homebrew)
**Role:** USB-to-TCP port forwarding for WDA communication

### Why needed

WDA listens on the iOS device's `localhost:8100`. iproxy creates a tunnel from your Mac's `localhost:8100` to the device's `localhost:8100`.

### Install

```bash
brew install libusbmuxd
```

### Verify

```bash
iproxy --version
```

### Usage

```bash
iproxy 8100 8100 --udid <DEVICE_UDID> &
# To stop: kill %1
```

---

## adb (Android Debug Bridge)

**Package:** `android-platform-tools` (Homebrew) or Android SDK
**Role:** Primary communication layer for all Android device actions

### Commands used by this project

| Project Action | adb Command |
|---|---|
| `inspect_ui` | `adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml` |
| `tap` | `adb shell input tap <x> <y>` |
| `type_text` | `adb shell input text "<escaped_text>"` |
| `swipe` | `adb shell input swipe <x1> <y1> <x2> <y2> <duration>` |
| `launch_app` | `adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1` |
| `stop_app` | `adb shell am force-stop <package>` |
| `clear_state` | `adb shell pm clear <package>` |
| `back` | `adb shell input keyevent 4` |
| `home` | `adb shell input keyevent 3` |

### Install

```bash
brew install android-platform-tools
```

### Verify

```bash
adb version
adb devices
```

### Use with this project

No configuration needed. The project auto-detects adb and uses it for all Android actions.

---

## Maestro

**Website:** [maestro.mobile.dev](https://maestro.mobile.dev)
**Role:** Fallback backend for edge-case replay commands

### When is Maestro needed?

After Phase 16, Maestro is **only** needed for these edge-case Android replay commands:
- `extendedWaitUntil`
- `setClipboard` / `pasteText`
- `openLink`
- `runFlow` with complex sub-flows

For common commands (launchApp, tapOn, inputText, assertVisible, swipe, back, home, stopApp, clearState), the project uses native adb — **no Maestro needed**.

### Install

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Verify

```bash
maestro --version
```

---

## Xcode

**Role:** iOS simulator runtime, WDA building

### Required for

- Running iOS simulators (all iOS simulator automation)
- Building and signing WDA for physical device automation

### Install

From the App Store or [developer.apple.com/download/](https://developer.apple.com/download/).

### Verify

```bash
xcrun simctl list devices
xcodebuild -version
```

---

## libimobiledevice (Optional)

**Package:** `libimobiledevice` (Homebrew)
**Role:** iOS physical device crash reports fallback

### Install

```bash
brew install libimobiledevice
```

### What it provides

- `idevicecrashreport` — pull crash logs from physical devices (fallback when devicectl is unavailable)

---

## Perfetto (Optional)

**Package:** `perfetto` (Homebrew)
**Role:** Android performance profiling

### Install

```bash
brew install perfetto
```

### What it provides

- `trace_processor` — analyze Android Perfetto traces for performance analysis
- Used by `measure_android_performance` MCP tool

---

## idb (Deprecated)

**Package:** `fb-idb` (pipx)
**Status:** Deprecated — kept only for backward compatibility

### Why deprecated

idb is no longer maintained by Facebook. This project now uses:
- **AXe CLI** for iOS simulator automation
- **WDA** for iOS physical device automation
- **adb** for Android automation

### If you still need it

```bash
pipx install fb-idb
brew install idb-companion
```

### Use with this project

Set the deprecated backend:
```bash
export IOS_EXECUTION_BACKEND=idb
```
You'll see a deprecation warning but it will still work.

---

## Environment Variables Summary

| Variable | Values | Effect |
|---|---|---|
| `IOS_EXECUTION_BACKEND` | `axe`, `wda`, `simctl`, `devicectl`, `maestro`, `idb` | Force specific iOS backend |
| `ANDROID_REPLAY_BACKEND` | `owned-adb`, `maestro` | Force specific Android replay backend |
| `IDB_CLI_PATH` | Path to idb binary | Custom idb location (deprecated) |
| `IDB_COMPANION_PATH` | Path to idb_companion | Custom companion location (deprecated) |

If not set, the project auto-detects the appropriate backend based on device type and available tools.

---

## Doctor Check

Run `mobile-e2e-mcp doctor` to verify all tool installations:

```
Node.js         ✅ v22.x
pnpm            ✅ v9.x
Python 3        ✅ 3.12.x
adb             ✅ 35.0.x
xcrun simctl    ✅ Xcode 16.x
xcrun xctrace   ✅ Xcode 16.x
xcrun devicectl ✅ Xcode 16.x
axe             ✅ 1.6.0
iproxy          ✅ 1.1.x
wda             ✅ session:abcd1234
maestro         ✅ 1.38.x
trace_processor ✅ 13.x
idb (deprecated) ⚠️ deprecated
idb companion   ⚠️ deprecated
```
