# Capability Family Inventory & Refactor Guardrails

This inventory defines ownership and migration guardrails for the phased AI-first capability refactor.

## Capability Family Ownership

| Family | Contracts Owner | Adapter Runtime Owner | MCP Wrapper Owner | Docs/Support Boundary Owner |
|---|---|---|---|---|
| UI | `packages/contracts` (`InspectUi*`, `QueryUi*`, `ResolveUiTarget*`, `WaitForUi*`, `TapElement*`, `TypeIntoElement*`, `ScrollAnd*`) | `packages/adapter-maestro/src/ui-*` | `packages/mcp-server/src/index.ts` + `packages/mcp-server/src/tools/*ui*` | `docs/architecture/capability-map.md`, `docs/architecture/platform-implementation-matrix.zh-CN.md` |
| Device / App Lifecycle | `packages/contracts` (`InstallApp*`, `LaunchApp*`, `TerminateApp*`, `ResetAppState*`, `ListDevices*`) | `packages/adapter-maestro/src/device-*` + lifecycle orchestration | `packages/mcp-server/src/tools/install-app.ts`, `launch-app.ts`, `terminate-app.ts`, `reset-app-state.ts`, `list-devices.ts` | `README.md`, `docs/architecture/framework-coverage.md` |
| Diagnostics / Evidence | `packages/contracts` (`GetLogs*`, `GetCrashSignals*`, `CollectDiagnostics*`, `CollectDebugEvidence*`, `GetScreenSummary*`, `GetSessionState*`) | `packages/adapter-maestro/src/device-*` + evidence helpers | `packages/mcp-server/src/tools/get-logs.ts`, `get-crash-signals.ts`, `collect-diagnostics.ts`, `collect-debug-evidence.ts`, `get-screen-summary.ts`, `get-session-state.ts` | `docs/architecture/governance-security.md`, `docs/showcase/ci-evidence.md` |
| Performance | `packages/contracts` (`MeasureAndroidPerformance*`, `MeasureIosPerformance*`) | `packages/adapter-maestro/src/performance-*` | `packages/mcp-server/src/tools/measure-android-performance.ts`, `measure-ios-performance.ts` | `docs/architecture/capability-map.md`, `docs/architecture/platform-implementation-matrix.zh-CN.md` |
| Recording / Replay | `packages/contracts` (`StartRecordSession*`, `RecordSessionStatus*`, `EndRecordSession*`, `CancelRecordSession*`, `ExportSessionFlow*`, `RecordTaskFlow*`) | `packages/adapter-maestro/src/recording-*` | `packages/mcp-server/src/tools/start-record-session.ts`, `get-record-session-status.ts`, `end-record-session.ts`, `cancel-record-session.ts`, `export-session-flow.ts`, `record-task-flow.ts` | `docs/guides/flow-generation.md`, `docs/showcase/README.md` |
| Interruption / Recovery | `packages/contracts` (`DetectInterruption*`, `ClassifyInterruption*`, `ResolveInterruption*`, `ResumeInterruptedAction*`, `RecoverToKnownState*`, `ReplayLastStablePath*`) | `packages/adapter-maestro/src/interruption-*` | `packages/mcp-server/src/tools/detect-interruption.ts`, `classify-interruption.ts`, `resolve-interruption.ts`, `resume-interrupted-action.ts`, `recover-to-known-state.ts`, `replay-last-stable-path.ts` | `docs/architecture/governance-security.md`, `docs/guides/golden-path.md` |

## Index Guardrails (`packages/adapter-maestro/src/index.ts`)

Non-negotiable migration rules:

1. New platform command builders MUST NOT be added to `index.ts`.
2. New selector/query matching logic MUST NOT be added to `index.ts`.
3. New policy-gate decisions MUST NOT be added to `adapter-maestro`; policy enforcement remains in `packages/mcp-server/src/policy-guard.ts` and server wrappers.
4. `index.ts` is treated as composition/export surface; platform branches belong in `*-android.ts` / `*-ios.ts` / `*-platform.ts` hooks modules.

## Phase PR Checklist (Required for refactor phases)

For each phase PR, all items must be checked:

- [ ] Contracts changes (if any) land before adapter/server consumers.
- [ ] New platform behavior is implemented via hooks modules, not via fresh `if (platform)` branches in `index.ts`.
- [ ] Deterministic-first path is unchanged unless explicitly documented.
- [ ] Fallback behavior changes are explicit in contract/docs and covered by tests.
- [ ] Policy/session/audit wrapping behavior is preserved in mcp-server.
- [ ] Support boundary text in README/docs is updated to match shipped behavior.
