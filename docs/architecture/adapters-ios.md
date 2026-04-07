# iOS Adapter Design

For current implementation-oriented file placement inside `packages/adapter-maestro`, see [`docs/architecture/adapter-code-placement.md`](./adapter-code-placement.md).

## 1. Backend Roles

- **xcrun simctl**: simulator lifecycle, install/uninstall, screenshots, media, deep links, UI interactions (tap, type, swipe, hierarchy).
- **xcrun devicectl**: physical device lifecycle (install, launch, terminate, logs, crashes).
- **Maestro**: UI interaction execution backend for physical devices (devicectl generates Maestro flow YAML).
- **idb (deprecated)**: previously the primary iOS backend. Still functional via `IOS_EXECUTION_BACKEND=idb` but shows deprecation warnings.

Practical principle:

- Simulators use native `xcrun simctl` commands for all UI actions (FULL support).
- Physical devices use `xcrun devicectl` for lifecycle + Maestro flow YAML for UI interactions (PARTIAL support).
- Do not rely on idb — it is no longer maintained by Facebook.

Framework support (native/RN/Flutter) is resolved through iOS platform control surfaces plus framework instrumentation quality.

---

## 2. iOS Backend Router (Phase 13)

Starting from Phase 13, iOS execution uses a backend router instead of direct `idb` calls:

| Module | Purpose |
|---|---|
| `ios-backend-types.ts` | `IosExecutionBackend` interface (command builders, not execution) |
| `ios-backend-simctl.ts` | `SimctlSimulatorBackend` — simulator actions via `xcrun simctl` |
| `ios-backend-devicectl.ts` | `DevicectlPhysicalBackend` — physical device via devicectl + Maestro YAML fallback |
| `ios-backend-router.ts` | `IosBackendRouter` — selection logic, probe summary, test hooks |

### Simulator Backend (FULL support)

| Action | Command |
|---|---|
| tap | `xcrun simctl io <udid> tap <x> <y>` |
| typeText | `xcrun simctl keyboard <udid> type <text>` |
| swipe | `xcrun simctl io <udid> swipe <x1> <y1> <x2> <y2>` |
| hierarchy | `xcrun simctl spawn <udid> accessibility dump` |
| screenshot | `xcrun simctl io <udid> screenshot <path>` |

### Physical Device Backend (PARTIAL support)

`xcrun devicectl` provides device lifecycle commands but NOT native UI interaction commands. For tap, typeText, swipe, and hierarchy, the backend generates Maestro flow YAML and delegates execution to the Maestro CLI. This dependency is explicitly documented and marked as "partial" in capability declarations.

### Backend Selection Logic

1. **Environment variable**: `IOS_EXECUTION_BACKEND=simctl|devicectl|maestro|idb`
2. **Auto-detect**: Simulator UDID → simctl, Physical UDID → devicectl
3. **Fallback**: devicectl → maestro (if devicectl unavailable)

---

## 3. Representative Primitive Mapping

From xcrun simctl (simulators):

- tap: `xcrun simctl io <udid> tap <x> <y>`
- type: `xcrun simctl keyboard <udid> type <text>`
- hierarchy: `xcrun simctl spawn <udid> accessibility dump`
- screenshot/video/log: `xcrun simctl io <udid> screenshot|recordVideo|spawn log ...`

From devicectl + Maestro (physical devices):

- install/launch/terminate: `xcrun devicectl device install|process launch|...`
- UI interactions: Maestro flow YAML (tapOn, inputText, swipe)
- logs/crashes: `xcrun devicectl device info logs|crashes`

From WDA model (future):

- WebDriver-compatible element interaction
- app lifecycle control
- scrolling/tap/type/assertions on iOS/tvOS

---

## 4. iOS Risks and Mitigations

- Code signing/provisioning complexity (real devices) → explicit signing runbooks.
- WDA startup instability → health checks + warmup caching.
- Sim vs real device behavior differences → split compatibility CI lanes.
- System alerts interruptions → centralized alert handler service.

---

## 4. iOS MCP Tooling Set (Phase-wise)

Important note for the current repository state (Phase 13+):

- `inspect_ui`, `query_ui`, `resolve_ui_target`, `wait_for_ui`, and `scroll_and_resolve_ui_target` use `xcrun simctl spawn accessibility dump` for simulators and Maestro snapshot for physical devices.
- Direct iOS `tap` and `type_text` are wired through `xcrun simctl io tap` and `xcrun simctl keyboard type` for simulators, and Maestro flow YAML for physical devices.
- Selector-driven `tap_element`, `type_into_element`, and `scroll_and_tap_element` are implemented through hierarchy resolution plus the simctl/Maestro-backed action path.
- Physical device UI interactions are marked PARTIAL due to Maestro dependency for execution.

## Phase 1

- ios.listTargets
- ios.bootSimulator
- ios.launchApp / ios.terminateApp
- ios.getTree
- ios.tap / ios.type / ios.swipe (simctl-backed for simulators, Maestro-backed for physical devices)
- ios.takeScreenshot
- ios.getLogs

## Phase 2+

- ios.recordVideo
- ios.getCrashReports
- ios.permissionProfiles
- ios.debugSessionStart/Stop
- ios.WDA integration for native physical device UI automation (future)

---

## 5. SpringBoard, System Alerts, and WebView Boundaries

Define explicit constraints and handlers for:

- SpringBoard interruptions
- Permission/system alerts
- External app/browser transitions
- WebView/native context transitions

Document unsupported and partially supported paths explicitly in compatibility matrix.
