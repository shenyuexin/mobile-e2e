# iOS Adapter Design

For current implementation-oriented file placement inside `packages/adapter-maestro`, see [`docs/architecture/adapter-code-placement.md`](./adapter-code-placement.md).

## 1. Backend Roles

- **simctl**: simulator lifecycle, install/uninstall, screenshots, media, deep links.
- **XCUITest/WebDriverAgent (WDA)**: element-level deterministic interaction.
- **idb**: command-oriented automation/debugging interface for sim + device.

Practical principle:

- Do not rely on simctl alone for deterministic UI interactions.
- Use WDA/XCUITest/idb class capabilities for tap/type/tree on iOS.

Framework support (native/RN/Flutter) is resolved through iOS platform control surfaces plus framework instrumentation quality.

---

## 2. Representative Primitive Mapping

From idb command model:

- launch app: `idb launch <bundle_id>`
- tap: `idb ui tap X Y`
- type: `idb ui text "..."`
- describe tree: `idb ui describe-all`
- screenshot/video/log/crash operations supported via idb command groups

From WDA model:

- WebDriver-compatible element interaction
- app lifecycle control
- scrolling/tap/type/assertions on iOS/tvOS

---

## 3. iOS Risks and Mitigations

- Code signing/provisioning complexity (real devices) → explicit signing runbooks.
- WDA startup instability → health checks + warmup caching.
- Sim vs real device behavior differences → split compatibility CI lanes.
- System alerts interruptions → centralized alert handler service.

---

## 4. iOS MCP Tooling Set (Phase-wise)

Important note for the current repository state:

- `inspect_ui`, `query_ui`, `resolve_ui_target`, `wait_for_ui`, and `scroll_and_resolve_ui_target` now use `idb ui describe-all --json --nested` as the current iOS hierarchy surface in this repo.
- direct iOS `tap` and `type_text` are wired through `idb ui tap` and `idb ui text`.
- selector-driven `tap_element`, `type_into_element`, and `scroll_and_tap_element` are implemented through hierarchy resolution plus the idb-backed action path.
- this is still an idb-backed bounded implementation, not full WDA/XCUITest parity; documentation should continue to distinguish current repo integration from broader backend potential.

## Phase 1

- ios.listTargets
- ios.bootSimulator
- ios.launchApp / ios.terminateApp
- ios.getTree
- ios.tap / ios.type / ios.swipe (idb-backed in the current repo, with deeper WDA parity still future work)
- ios.takeScreenshot
- ios.getLogs

## Phase 2+

- ios.recordVideo
- ios.getCrashReports
- ios.permissionProfiles
- ios.debugSessionStart/Stop

---

## 5. SpringBoard, System Alerts, and WebView Boundaries

Define explicit constraints and handlers for:

- SpringBoard interruptions
- Permission/system alerts
- External app/browser transitions
- WebView/native context transitions

Document unsupported and partially supported paths explicitly in compatibility matrix.
