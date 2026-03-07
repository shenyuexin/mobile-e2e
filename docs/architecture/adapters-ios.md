# iOS Adapter Design

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

## Phase 1

- ios.listTargets
- ios.bootSimulator
- ios.launchApp / ios.terminateApp
- ios.getTree
- ios.tap / ios.type / ios.swipe
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
