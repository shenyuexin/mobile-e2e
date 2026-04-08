# AI-First Capability Model

## 1. Scope and Premise

This document defines the capabilities necessary if this project is optimized for AI-first mobile automation rather than human-first tooling.

Core premise:

- The main user is an AI agent, not a human clicking through a debugger UI.
- The platform should optimize for structured evidence, bounded actioning, fast diagnosis, and repeatable recovery.
- Human-style control surfaces matter only when they expose a capability the AI actually needs.

### The Target Loop

1. Understand goal and constraints.
2. Discover current device and app state.
3. Choose the next bounded action.
4. Capture the minimum evidence needed around that action.
5. Decide whether the action succeeded, failed, or was interrupted.
6. Attribute the failure to the most likely layer.
7. Recover, escalate, or produce a bug packet.
8. Persist learnings for future runs.

### What AI-First Changes

An AI-first system should NOT primarily optimize for:
- manual debugger UI parity
- large raw artifact dumps with weak structure
- low-level action APIs without post-action interpretation
- human memory of project-specific caveats

An AI-first system SHOULD primarily optimize for:
- high-density structured state
- causally ordered evidence
- explicit capability boundaries
- deterministic recovery paths
- reusable historical memory

---

## 2. Required Capability Layers

### 2.1 State Model

The system must expose a compact, structured view of current state:

- current device identity and environment
- current app build, app ID, and foreground/background state
- current screen or route summary
- actionable UI targets and ambiguity signals
- loading, blocked, interrupted, or idle state
- key runtime summary (recent exception, failed request, crash signal)

### 2.2 Action-Centered Evidence

Every action returns a structured envelope with:

- pre-action state snapshot
- action intent and normalized parameters
- post-action state delta
- screenshots, UI tree, and log snippets
- reason code for failure (deterministic enum)
- bounded recovery suggestions

### 2.3 Failure Attribution

Failures are attributed to the most likely layer:

- network (connectivity, timeout, malformed response)
- app (crash, ANR, slow render, wrong screen)
- UI element (not found, wrong target, overlay blocking)
- platform (backend unavailable, signing expired, device offline)
- policy (scope denied, read-only profile, governance block)

### 2.4 Bounded Recovery

Recovery actions are bounded and policy-gated:

- retry with backoff (bounded attempts)
- relaunch app (bounded restart count)
- clear app data (requires write policy scope)
- resolve interruption (detect → classify → resolve → resume)
- escalate to human (structured handoff event)

### 2.5 Interruption Handling

Supported interruption classes:

- system alerts
- action sheets / bottom sheets
- permission prompts
- save-password prompts
- keyboard overlays
- app-level transient overlays

Required functions:

1. detect interruption before and after critical actions
2. classify interruption source and priority
3. apply platform-specific resolution policy
4. resume interrupted action with bounded retry
5. emit interruption telemetry and artifacts

### 2.6 Governance and Audit

- Policy profiles (read-only / interactive / full-control)
- Per-session credentials with TTL
- Explicit device reservation and lock model
- Secret redaction in logs and screenshots
- Action audit trail with actor identity and timestamp

---

## 3. Capability Domains

### A. Environment Control

- listDevices, selectDevice, bootDevice/shutdownDevice
- resetDeviceState, setNetworkProfile, setGeoLocation, setPermissions

### B. App Lifecycle

- installApp/uninstallApp, launchApp/terminateApp
- activateApp/backgroundApp, openDeepLink, clearAppData

### C. Perception & Inspection

- getAccessibilityTree, getElementAtPoint
- takeScreenshot, recordScreen
- getScreenHash (stability detection)
- runOCR (fallback), runTemplateMatch (fallback)

### D. Action Execution

- tap/doubleTap/longPress, swipe/scroll
- typeText/clearText/keyEvent
- dragAndDrop, waitForCondition
- runFlow (scripted action batch)

### E. Interruption Handling

- detectInterruption, classifyInterruption
- dismissInterruption, resolveInterruptionWithPolicy
- resumeInterruptedAction, getInterruptionReport

### F. Assertions & Validation

- assertVisible, assertText, assertNotPresent
- assertWithinBounds, assertVisualBaseline

### G. Observability & Debugging

- getDeviceLogs, getAppLogs, getCrashReports
- getPerformanceSnapshot
- getRNConsoleLogs (RN adapter)
- getActionTimeline, getInterruptionTimeline

### H. Session, Governance, and Collaboration

- startSession/endSession, manualHandoffCheckpoint
- checkpoint/rollback, attachArtifacts
- exportSessionReport
- actionPolicyPreview, auditTrailQuery

---

## 4. Deterministic Ladder (Mandatory)

Action resolution order:

1. Accessibility ID / resource-id / testID
2. Semantic text/label match in tree
3. OCR text region fallback
4. CV template/icon fallback
5. Escalation to human or workflow abort

---

## 5. Maturity Levels

### L1 (MVP)

Device selection, app lifecycle, screenshot, tree, tap/type/swipe, basic assertions, logs, and minimal interruption detection/handling for known system prompts.

### L2 (Stability)

Flakiness controls, retries with reason codes, session report, crash diagnostics, baseline visuals, reusable interruption policy library, and interruption telemetry.

### L3 (Scale)

Multi-device orchestration, parallel sessions, cloud farm integration, policy controls.

### L4 (Agentic)

Goal-to-flow planning, self-healing proposals, automatic bug packet generation.

### L5 (Enterprise)

RBAC, environment policy, signed action trails, compliance exports, approval workflows.

---

## 6. Capability Definition Template (Mandatory)

For each capability, define:

- Preconditions
- Determinism tier (D0 deterministic, D1 bounded fallback, D2 probabilistic)
- Allowed fallback target
- Confidence threshold (if OCR/CV involved)
- Retry policy
- Emitted telemetry and artifacts
- Platform caveats and unsupported conditions

Without this definition, capability status is considered incomplete.

---

## 7. Platform Implementation Summary

| Platform | Simulator/Emulator | Real Device | Framework Profiles |
|---|---|---|---|
| Android | ADB + UIAutomator2 (FULL) | ADB + UIAutomator2 (FULL) | Native, RN, Flutter |
| iOS | AXe CLI (FULL, Phase 14+) | WDA HTTP API (FULL, Phase 15+) | Native, RN, Flutter |
| iOS secondary | simctl (lifecycle) | devicectl (lifecycle, PARTIAL) | — |

For detailed adapter design, see [02-platform-adapters.md](./02-platform-adapters.md).

For the full platform implementation matrix, see [platform-implementation-matrix.zh-CN.md](./platform-implementation-matrix.zh-CN.md).

---

## 8. Capability Family Ownership

| Family | Contracts | Adapter Runtime | MCP Wrapper | Docs Boundary |
|---|---|---|---|---|
| UI | `InspectUi*`, `QueryUi*`, `ResolveUiTarget*`, `WaitForUi*`, `TapElement*`, `TypeIntoElement*`, `ScrollAnd*` | `packages/adapter-maestro/src/ui-*` | `packages/mcp-server/src/tools/*ui*` | [02-platform-adapters.md](./02-platform-adapters.md) |
| Device/App Lifecycle | `InstallApp*`, `LaunchApp*`, `TerminateApp*`, `ResetAppState*`, `ListDevices*` | `packages/adapter-maestro/src/device-*` | `install-app.ts`, `launch-app.ts`, `terminate-app.ts`, `reset-app-state.ts`, `list-devices.ts` | README.md |
| Diagnostics/Evidence | `GetLogs*`, `GetCrashSignals*`, `CollectDiagnostics*`, `CollectDebugEvidence*`, `GetScreenSummary*`, `GetSessionState*` | `packages/adapter-maestro/src/device-*` + evidence helpers | `get-logs.ts`, `get-crash-signals.ts`, `collect-diagnostics.ts`, `collect-debug-evidence.ts`, `get-screen-summary.ts`, `get-session-state.ts` | [05-governance-security.md](./05-governance-security.md) |
| Performance | `MeasureAndroidPerformance*`, `MeasureIosPerformance*` | `packages/adapter-maestro/src/performance-*` | `measure-android-performance.ts`, `measure-ios-performance.ts` | [03-capability-model.md](./03-capability-model.md) |
| Recording/Replay | `StartRecordSession*`, `RecordSessionStatus*`, `EndRecordSession*`, `CancelRecordSession*`, `ExportSessionFlow*`, `RecordTaskFlow*` | `packages/adapter-maestro/src/recording-*` | `start-record-session.ts`, `get-record-session-status.ts`, `end-record-session.ts`, `cancel-record-session.ts`, `export-session-flow.ts`, `record-task-flow.ts` | [guides/flow-generation.md](../guides/flow-generation.md) |
| Interruption/Recovery | `DetectInterruption*`, `ClassifyInterruption*`, `ResolveInterruption*`, `ResumeInterruptedAction*`, `RecoverToKnownState*`, `ReplayLastStablePath*` | `packages/adapter-maestro/src/interruption-*` | `detect-interruption.ts`, `classify-interruption.ts`, `resolve-interruption.ts`, `resume-interrupted-action.ts`, `recover-to-known-state.ts`, `replay-last-stable-path.ts` | [05-governance-security.md](./05-governance-security.md) |
