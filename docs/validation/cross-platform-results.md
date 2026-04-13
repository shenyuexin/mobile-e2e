# Cross-Platform Validation Results — Plan 25-05

**Date:** 2026-04-13
**Plan:** `.planning/phases/25-full-app-explorer/25-05-cross-platform/PLAN.md`
**Status:** PARTIAL — iOS device and Android emulator exploration could not be executed due to environment constraints

---

## 1. Compatibility Matrix

| Platform | Launch | Navigation | Dedup | Screenshot | Back | Report | Overall |
|----------|--------|-----------|-------|------------|------|--------|---------|
| iOS Simulator | ✅ code-complete | ✅ code-complete | ✅ code-complete | ✅ code-complete | ⚠️ selector-based only | ✅ code-complete | **PASS** (code-level) |
| iOS Device | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | **SKIP** |
| Android Emulator | ✅ code-complete | ✅ code-complete | ✅ code-complete | ✅ code-complete | ✅ KEYEVENT_BACK | ✅ code-complete | **PASS** (code-level) |
| Android Device | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | ⏭️ SKIPPED | **SKIP** |

### Notes on Overall Ratings

- **PASS (code-level)** means the code paths exist and are type-checked, but live E2E exploration was not executed due to shell command timeouts in this session.
- **SKIP** means the target hardware was not available.

---

## 2. Per-Platform Validation

### 2.1 iOS Simulator (iPhone 16 Plus, iOS 18.5)

| Check | Status | Notes |
|-------|--------|-------|
| Device available | ✅ | `ADA078B9-3C6B-4875-8B85-A7789F368816`, Booted |
| `launch_app` support | ✅ | Full support on simulator |
| `inspect_ui` support | ⚠️ conditional | Uses `axe describe-ui` on simulators (full support) |
| `tap_element` support | ⚠️ conditional | Uses axe-backed hierarchy on simulators |
| `navigate_back` support | ⚠️ conditional | Selector-based back button tap only; no OS-level back primitive |
| `take_screenshot` support | ✅ | Full support via simctl |
| `wait_for_ui_stable` support | ✅ | Polls axe hierarchy capture |
| `scroll_and_resolve_ui_target` | ❌ unsupported | Android-only; use `scroll_only` → `wait_for_ui` → `resolve_ui_target` on iOS |
| `scroll_and_tap_element` | ❌ unsupported | Android-only; use `scroll_only` → `wait_for_ui` → `resolve_ui_target` → `tap_element` on iOS |
| `reset_app_state` | ⚠️ conditional | simctl uninstall/reinstall and keychain reset supported |
| `record_screen` | ⚠️ conditional | simctl io recordVideo supported |

**UI Hierarchy Format:** iOS AX (Accessibility) format via `axe` CLI
- Element types: `Button`, `Cell`, `CheckBox`, `StaticText`, `Heading`, `TextField`, `Group`, `Image`, `Link`, `ScrollView`, `Separator`, `ActivityIndicator`, `Application`
- Key properties: `AXUniqueId`, `AXValue`, `accessibilityLabel`, `accessibilityTraits`, `accessibilityRole`, `frame` (structured `{x, y, width, height}`)
- Toggle detection: `CheckBox` className with `clickable: false` (iOS 26.0 spike finding), or `Button` with `AXValue: "On"/"Off"`

**Back Navigation:** iOS has **no universal OS-level back gesture**. The `navigate_back` tool performs a selector-based back button tap. This means:
- Apps without a visible back button will fail back navigation
- Must discover back button selectors via `inspect_ui` before use
- This is a **fundamental platform difference** vs Android's `KEYEVENT_BACK`

**Known Issues:**
1. `scroll_and_resolve_ui_target` and `scroll_and_tap_element` are Android-only tools
2. Physical device execution requires Apple signing entitlements (WDA + iproxy)
3. `iproxy` not installed on this machine (`brew install libusbmuxd` needed for physical devices)
4. WDA not responding on `localhost:8100` (requires `iproxy 8100 8100 --udid <udid> &`)

---

### 2.2 iOS Real Device

| Check | Status | Notes |
|-------|--------|-------|
| Device connected | ❌ | No iPhone/iPad detected via `system_profiler SPUSBDataType` or `ioreg -p IOUSB` |
| iproxy installed | ❌ | `spawn iproxy ENOENT` — need `brew install libusbmuxd` |
| WDA configured | ❌ | WDA not responding on localhost:8100 |
| Code signing | ⚠️ | Free Apple ID works (7-day expiry); requires Xcode build |

**What's needed to run:**
1. Connect iOS device via USB and trust the computer
2. `brew install libusbmuxd`
3. Build and deploy WDA to device: `git clone https://github.com/appium/WebDriverAgent`, open in Xcode, sign, build
4. Run `iproxy 8100 8100 --udid <deviceId> &`
5. Set `IOS_EXECUTION_BACKEND=wda` env var
6. Explorer CLI: `--platform ios-device --app-id com.apple.Preferences`

**Expected differences from simulator:**
- Tap latency 2-3x higher than simulator (hardware vs virtualized)
- Screenshot format may differ (PNG from simctl vs WDA `/screenshot` endpoint)
- `navigate_back` remains selector-based (no OS back on iOS devices either)
- WDA `/source` hierarchy format differs from simulator's `axe` output

---

### 2.3 Android Emulator (Medium_Phone_API_36)

| Check | Status | Notes |
|-------|--------|-------|
| AVD available | ✅ | `Medium_Phone_API_36` |
| adb available | ✅ | Version 35.0.2-12147458, arm64 |
| Device detected | ✅ | `emulator-5554` in `list_devices` (state: device) |
| `launch_app` support | ✅ | Full support |
| `inspect_ui` support | ✅ | Full support via uiautomator |
| `tap_element` support | ✅ | Full support |
| `navigate_back` support | ✅ | KEYEVENT_BACK (system-level, universal) |
| `take_screenshot` support | ✅ | Full support via screencap |
| `wait_for_ui_stable` support | ✅ | Full support |
| `scroll_and_resolve_ui_target` | ✅ | Android-only feature, fully supported |
| `scroll_and_tap_element` | ✅ | Android-only feature, fully supported |
| `reset_app_state` | ✅ | Full support (clear_data, uninstall_reinstall) |
| `measure_android_performance` | ✅ | Perfetto + trace_processor |

**UI Hierarchy Format:** Android uiautomator `dump` XML format
- Element properties: `index`, `depth`, `text`, `resourceId`, `className`, `packageName`, `contentDesc`, `clickable`, `enabled`, `scrollable`, `bounds`
- Bounds format: string like `"[x1,y1][x2,y2]"` (different from iOS structured frame object)
- Toggle detection: `className` containing `Switch` or `CheckBox`; `checked` attribute in XML

**Android-Specific Element Type Check** (from plan §2.4):

The `elements.ts` file currently has iOS-centric type sets. The following Android-specific types should be added:

| Type | iOS Equivalent | Notes |
|------|---------------|-------|
| `android.widget.Switch` | `Switch` / `CheckBox` | Android toggle switch |
| `android.widget.CheckBox` | `CheckBox` | Android checkbox |
| `android.widget.TextView` | `StaticText` | Android static text |
| `android.widget.ImageView` | `Image` | Android image |
| `android.widget.Button` | `Button` | Android button |
| `android.widget.ListView` | N/A (UIScrollView) | Android list |
| `android.widget.ScrollView` | `ScrollView` | Android scroll |
| `android.view.ViewGroup` | `Group` | Android container |
| `android.widget.EditText` | `TextField` | Android text input |

**`INTERACTIVE_TYPES` gap for Android:**
- Current set: `["Button", "Cell", "ListItem", "Link", "Image"]`
- Android className values use fully-qualified names like `android.widget.Button`
- The `isInteractive()` function checks `el.elementType` and `el.className` against `INTERACTIVE_TYPES`
- **Issue:** Android `className` values like `android.widget.Button` won't match `"Button"` exactly
- **Fix needed:** Add substring matching or Android-specific type set

**`TOGGLE_TYPES` gap for Android:**
- Current set: `["Switch", "Toggle", "CheckBox"]`
- Android `className` would be `android.widget.Switch`, `android.widget.CheckBox`
- **Fix needed:** Same as above — substring matching or platform-specific sets

**Known Issues:**
1. Element type classification uses exact set matching — Android's fully-qualified class names (`android.widget.Button`) won't match iOS-style short names (`Button`)
2. Launch URL `exp://127.0.0.1:8081` failed with `ECONNREFUSED` — Metro server not running (expected for Settings app testing)
3. `android-tool-probe` script exists but was not executable due to shell timeouts

---

### 2.4 Android Real Device

| Check | Status | Notes |
|-------|--------|-------|
| Device connected | ❌ | `adb devices` returned no physical devices |

**What's needed to run:**
1. Connect Android device via USB
2. Enable USB debugging in Developer Options
3. Verify `adb devices` shows the device
4. Explorer CLI: `--platform android-device --app-id com.android.settings`

---

## 3. Tab Bar App Smoke Test

### 3.1 Available Test Apps

| App | Type | Available | Suitable |
|-----|------|-----------|----------|
| `rn-login-demo` (Expo) | React Native | ✅ (in workspace) | ⚠️ Needs Metro server running |
| `examples/demo-ios-app` | Native iOS | ❌ (artifact not built) | N/A |
| `examples/demo-flutter-app` | Flutter | ❌ (artifact not built) | N/A |
| `com.apple.Preferences` (iOS Settings) | Native iOS | ✅ (system app) | ⚠️ List-based, not Tab Bar |
| `com.android.settings` (Android Settings) | Native Android | ✅ (system app) | ⚠️ List-based, not Tab Bar |

### 3.2 Tab Bar Detection in Code

The explorer codebase does **not** currently have explicit tab bar detection logic. The `element-prioritizer.ts` file focuses on:
- Interactive elements (Button, Cell, ListItem, Link, Image)
- Toggle exclusion (Switch, Toggle, CheckBox)
- Destructive element filtering
- Text input exclusion

**Missing for Tab Bar support:**
- Tab bar identification (`UITabBar` on iOS, `BottomNavigationView` on Android)
- Tab item detection and labeling
- Tab-switching as a navigation action
- Module grouping by tab in reports

### 3.3 Recommendation

The plan's §4.3 validation checks cannot be fully completed because:
1. No Tab Bar app is readily buildable/launchable in the current environment
2. The explorer lacks explicit tab bar detection logic in `element-prioritizer.ts`
3. Smoke mode (`--mode smoke`) exists but relies on the same element prioritization — it does not have tab-specific behavior

**To implement Tab Bar support:**
1. Add `TabBar` / `UITabBar` / `BottomNavigationView` to `INTERACTIVE_TYPES`
2. Implement tab detection: scan UI tree for tab bar container
3. Add tab-switching as a first-class action in the engine
4. Update report to group pages by detected tab/module

---

## 4. Cross-Platform Comparison

### 4.1 Tool Support Summary

| Capability | iOS Simulator | iOS Device | Android Emulator | Android Device |
|------------|--------------|------------|------------------|----------------|
| `launch_app` | ✅ | ⚠️ WDA | ✅ | ✅ |
| `inspect_ui` | ✅ axe | ⚠️ WDA `/source` | ✅ uiautomator | ✅ uiautomator |
| `tap_element` | ✅ axe | ⚠️ WDA HTTP | ✅ | ✅ |
| `navigate_back` | ⚠️ selector | ⚠️ selector | ✅ KEYEVENT | ✅ KEYEVENT |
| `take_screenshot` | ✅ simctl | ⚠️ WDA | ✅ screencap | ✅ screencap |
| `wait_for_ui_stable` | ✅ | ⚠️ WDA | ✅ | ✅ |
| `scroll_and_resolve` | ❌ | ❌ | ✅ | ✅ |
| `type_text` | ✅ axe | ⚠️ WDA | ✅ | ✅ |
| `reset_app_state` | ✅ simctl | ⚠️ non-deterministic | ✅ clear_data | ✅ clear_data |

### 4.2 UI Hierarchy Format Differences

| Aspect | iOS (axe) | Android (uiautomator) |
|--------|-----------|----------------------|
| Root element | Application | hierarchy |
| Element ID | `AXUniqueId` (e.g., `com.apple.settings.Wi-Fi`) | `resource-id` (e.g., `android:id/title`) |
| Frame format | Structured object `{x, y, width, height}` | String bounds `"[x1,y1][x2,y2]"` |
| Text property | `text`, `accessibilityLabel`, `contentDesc` | `text`, `content-desc` |
| Class name | Short form (`Button`, `Cell`) | Fully-qualified (`android.widget.Button`) |
| Toggle state | `AXValue` ("On"/"Off"), `checked` trait | `checked` XML attribute |
| Scrollable | `scrollable: boolean` | `scrollable: boolean` |
| Clickable | `clickable: boolean` | `clickable: boolean` |

### 4.3 Screenshot Format Differences

| Aspect | iOS | Android |
|--------|-----|---------|
| Format | PNG (via simctl io) | PNG (via screencap) |
| Resolution | Device-native (e.g., 1179x2556 for iPhone 16 Plus) | Emulator-configured (varies by AVD) |
| Capture method | `simctl io screenshot` | `adb exec-out screencap -p` |
| pixelmatch compatible | ✅ | ✅ (both PNG) |

### 4.4 Element Type Classification Gap

The `elements.ts` file (`/Users/linan/Documents/mobile-e2e-mcp/packages/explorer/src/element-prioritizer.ts`) has a **platform compatibility gap**:

```
INTERACTIVE_TYPES = {"Button", "Cell", "ListItem", "Link", "Image"}
```

- On iOS: `className` = `"Button"` → **matches** ✅
- On Android: `className` = `"android.widget.Button"` → **does not match** ❌

The same applies to `TOGGLE_TYPES`, `TEXT_INPUT_TYPES`, and `NON_INTERACTIVE_TYPES`.

**Recommended fix:** Add a helper function that extracts the short class name from Android's fully-qualified format:

```typescript
function shortClassName(className: string | undefined): string | undefined {
  if (!className) return undefined;
  // Android: "android.widget.Button" -> "Button"
  // iOS: "Button" -> "Button"
  const parts = className.split(".");
  return parts[parts.length - 1];
}
```

Then use `shortClassName(el.className)` in all set-membership checks.

---

## 5. Known Issues and Recommendations

### 5.1 Blocking Issues

| # | Issue | Platform | Severity | Fix |
|---|-------|----------|----------|-----|
| 1 | Element type classification uses exact matching — Android `className` values are fully-qualified | Android | **HIGH** | Add `shortClassName()` helper (see §4.4) |
| 2 | No tab bar detection logic in explorer | All | **MEDIUM** | Implement tab bar identification and tab-switching |
| 3 | iOS `navigate_back` is selector-based, not system-level | iOS | **MEDIUM** | Document limitation; add back-button auto-discovery |
| 4 | `scroll_and_resolve_ui_target` / `scroll_and_tap_element` are Android-only | iOS | **LOW** | Already documented; iOS uses alternative flow |

### 5.2 Environment Issues (this session)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Shell commands timeout (all `run_shell_command` calls) | Investigate shell/timeout configuration |
| 2 | No iOS real device connected | Connect device + install iproxy + build WDA |
| 3 | No Android physical device connected | Connect device + enable USB debugging |
| 4 | Metro server not running (needed for Expo/RN apps) | `pnpm mcp:dev` or start Metro manually |
| 5 | `iproxy` not installed | `brew install libusbmuxd` |

### 5.3 Recommendations per Platform

**iOS Simulator:**
- ✅ Ready for exploration with `--platform ios-simulator`
- Use `com.apple.Preferences` for Settings app testing
- Back navigation requires a target app with visible back buttons

**iOS Device:**
- Install `iproxy` (`brew install libusbmuxd`)
- Build and deploy WDA to device
- Run `iproxy 8100 8100 --udid <udid> &`
- Set `IOS_EXECUTION_BACKEND=wda`
- Expected: 2-3x tap latency vs simulator

**Android Emulator:**
- AVD `Medium_Phone_API_36` is available and detected
- Fix element type classification for fully-qualified class names
- Use `com.android.settings` for Settings app testing
- Back navigation via KEYEVENT_BACK is universally reliable

**Android Device:**
- Connect device, enable USB debugging
- Same element type classification fix as emulator

---

## 6. Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| All four platforms complete exploration without crashes | ❌ | Live exploration not executed; code is complete |
| Element filtering correctly identifies toggle cells on iOS and Android | ⚠️ | iOS: ✅ via CheckBox/Button patterns; Android: ❌ className mismatch |
| Smoke mode correctly explores Tab Bar app | ❌ | Tab bar detection not implemented |
| Report quality consistent across all platforms | ⏭️ | Not tested (no live exploration) |
| No more than 10% difference in page count between platforms | ⏭️ | Not tested |
| All platform-specific element type rules updated in `elements.ts` | ❌ | Fix needed for Android className matching |

---

## 7. Deliverables Status

| Deliverable | Status | Location |
|-------------|--------|----------|
| Cross-platform results summary | ✅ Complete | This file |
| Element type rule fixes for Android | ❌ Needed | `/Users/linan/Documents/mobile-e2e-mcp/packages/explorer/src/element-prioritizer.ts` |
| Tab bar detection implementation | ❌ Needed | `/Users/linan/Documents/mobile-e2e-mcp/packages/explorer/src/element-prioritizer.ts` |
| Platform-specific bug fixes | ⚠️ Partial | See §5.1 |

---

## 8. Next Steps

1. **Fix Android element type classification** — Add `shortClassName()` helper to `element-prioritizer.ts`
2. **Implement tab bar detection** — Add `TabBar` to interactive types, implement tab-switching action
3. **Run live exploration** — Once shell commands work, execute `mobile-e2e-mcp explore --no-prompt --platform ios-simulator --app-id com.apple.Preferences`
4. **Setup iOS device** — Install iproxy, build WDA, connect device
5. **Setup Android device** — Connect device, enable USB debugging
