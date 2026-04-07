# iOS Adapter Design

For current implementation-oriented file placement inside `packages/adapter-maestro`, see [`docs/architecture/adapter-code-placement.md`](./adapter-code-placement.md).

## 1. Backend Roles

- **[AXe CLI](https://github.com/cameroncooke/AXe)**: primary simulator backend for all UI actions (hierarchy, tap, type, swipe, screenshot). Single binary, no daemon. `brew install cameroncooke/axe/axe`.
- **xcrun simctl**: simulator lifecycle, install/uninstall, screenshots (secondary), media, deep links.
- **xcrun devicectl**: physical device lifecycle (install, launch, terminate, logs, crashes).
- **Maestro**: UI interaction execution backend for physical devices (devicectl generates Maestro flow YAML).
- **idb (deprecated)**: previously the primary iOS backend. Still functional via `IOS_EXECUTION_BACKEND=idb` but shows deprecation warnings.

Practical principle:

- Simulators use AXe CLI for all UI actions (FULL support).
- Physical devices use `xcrun devicectl` for lifecycle + Maestro flow YAML for UI interactions (PARTIAL support).
- Do not rely on idb — it is no longer maintained by Facebook.

Framework support (native/RN/Flutter) is resolved through iOS platform control surfaces plus framework instrumentation quality.

---

## 2. iOS Backend Router (Phase 13 + Phase 14)

Starting from Phase 13, iOS execution uses a backend router instead of direct `idb` calls. Phase 14 replaced simctl with [AXe](https://github.com/cameroncooke/AXe) as the primary simulator backend.

| Module | Purpose |
|---|---|
| `ios-backend-types.ts` | `IosExecutionBackend` interface (command builders, not execution) |
| `ios-backend-axe.ts` | `AxeSimulatorBackend` — simulator actions via AXe CLI (Phase 14+) |
| `ios-backend-simctl.ts` | `SimctlSimulatorBackend` — screenshot only (simplified in Phase 14) |
| `ios-backend-devicectl.ts` | `DevicectlPhysicalBackend` — physical device via devicectl + Maestro YAML fallback |
| `ios-backend-router.ts` | `IosBackendRouter` — selection logic, probe summary, test hooks |

### Simulator Backend (FULL support — Phase 14+)

All UI actions use [AXe CLI](https://github.com/cameroncooke/AXe):

| Action | Command |
|---|---|
| tap | `axe tap -x <x> -y <y> --udid <udid>` |
| typeText | `axe type "<text>" --udid <udid>` |
| swipe | `axe swipe --start-x <x1> --start-y <y1> --end-x <x2> --end-y <y2> --udid <udid>` |
| hierarchy | `axe describe-ui --udid <udid>` |
| screenshot | `axe screenshot --udid <udid> --output <path>` |

AXe uses Apple's Accessibility APIs + idb's lower-level frameworks directly, but requires no daemon process.

### Physical Device Backend (PARTIAL support)

`xcrun devicectl` provides device lifecycle commands but NOT native UI interaction commands. For tap, typeText, swipe, and hierarchy, the backend generates Maestro flow YAML and delegates execution to the Maestro CLI. This dependency is explicitly documented and marked as "partial" in capability declarations.

### Backend Selection Logic

1. **Environment variable**: `IOS_EXECUTION_BACKEND=axe|simctl|devicectl|maestro|idb`
2. **Auto-detect**: Simulator UDID → axe, Physical UDID → devicectl
3. **Fallback**: devicectl unavailable → maestro; axe unavailable throws (install axe: `brew install cameroncooke/axe/axe`)

---

## 3. Representative Primitive Mapping

From AXe CLI (simulators, Phase 14+):

- tap: `axe tap -x <x> -y <y> --udid <udid>`
- type: `axe type "<text>" --udid <udid>`
- hierarchy: `axe describe-ui --udid <udid>`
- screenshot: `axe screenshot --udid <udid> --output <path>`
- swipe: `axe swipe --start-x <x1> --start-y <y1> --end-x <x2> --end-y <y2> --udid <udid>`

From xcrun simctl (simulators, secondary):

- screenshot/video: `xcrun simctl io <udid> screenshot|recordVideo`
- install/launch/terminate: `xcrun simctl install|launch|terminate <udid> <bundle>`

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
