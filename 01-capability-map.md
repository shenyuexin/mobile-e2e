# Capability Map and Maturity Model

## 1. Capability Domains

## A. Environment Control

- listDevices
- selectDevice
- bootDevice / shutdownDevice
- resetDeviceState
- setNetworkProfile (offline/3g/5g/packet loss)
- setGeoLocation
- setPermissions

## B. App Lifecycle

- installApp / uninstallApp
- launchApp / terminateApp
- activateApp / backgroundApp
- openDeepLink
- clearAppData

## C. Perception & Inspection

- getAccessibilityTree
- getElementAtPoint
- takeScreenshot
- recordScreen
- getScreenHash (stability detection)
- runOCR (fallback)
- runTemplateMatch (fallback)

## D. Action Execution

- tap / doubleTap / longPress
- swipe / scroll
- typeText / clearText / keyEvent
- dragAndDrop
- waitForCondition
- runFlow (scripted action batch)

## E. Assertions & Validation

- assertVisible
- assertText
- assertNotPresent
- assertWithinBounds
- assertVisualBaseline

## F. Observability & Debugging

- getDeviceLogs
- getAppLogs
- getCrashReports
- getPerformanceSnapshot
- getRNConsoleLogs (RN adapter)
- getActionTimeline

## G. Session, Governance, and Collaboration

- startSession / endSession
- checkpoint / rollback
- attachArtifacts
- exportSessionReport
- actionPolicyPreview
- auditTrailQuery

---

## 2. Deterministic Ladder (Mandatory)

Action resolution order:

1. Accessibility ID / resource-id / testID
2. Semantic text/label match in tree
3. OCR text region fallback
4. CV template/icon fallback
5. Escalation to human or workflow abort

---

## 3. Maturity Levels

### L1 (MVP)

- Device selection, app lifecycle, screenshot, tree, tap/type/swipe, basic assertions, logs.

### L2 (Stability)

- Flakiness controls, retries with reason codes, session report, crash diagnostics, baseline visuals.

### L3 (Scale)

- Multi-device orchestration, parallel sessions, cloud farm integration, policy controls.

### L4 (Agentic)

- Goal-to-flow planning, self-healing proposals, automatic bug packet generation.

### L5 (Enterprise)

- RBAC, environment policy, signed action trails, compliance exports, approval workflows.

---

## 4. Capability Definition Template (Mandatory)

For each capability, define:

- Preconditions
- Determinism tier (D0 deterministic, D1 bounded fallback, D2 probabilistic)
- Allowed fallback target
- Confidence threshold (if OCR/CV involved)
- Retry policy
- Emitted telemetry and artifacts
- Platform caveats and unsupported conditions

Without this definition, capability status is considered incomplete.
