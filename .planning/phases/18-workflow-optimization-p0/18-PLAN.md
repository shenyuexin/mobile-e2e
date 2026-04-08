# Phase 18: Workflow Optimization P0 — Developer Workflow Gaps

**Phase Number:** 18
**Status:** Planned
**Created:** 2026-04-08
**Depends on:** Phase 12 (crash attribution foundation), Phase 13 (iOS native backend — partial dependency, can proceed without)
**Source:** `docs/strategy/mobile-developer-workflow-analysis.zh-CN.md` — P0 priority matrix

---

## Goal

Close the 4 highest-impact gaps identified from the mobile developer workflow analysis. Each gap is a concrete capability addition that improves the MCP's usefulness for daily mobile development work.

## Problem Statement

The workflow analysis document (`docs/strategy/mobile-developer-workflow-analysis.zh-CN.md`) identified 15+ optimization gaps across 6 developer workflow chains. The 4 P0 items (high impact, manageable cost) are:

### P0-1: 网络感知编排 (Network-Aware Orchestration)

**Gap:** `action-orchestrator.ts` classifies `waiting_network`, `offline_terminal`, `backend_failed_terminal` as readiness states but does not **actively probe** network health, **adjust retry strategy** based on network type, or **suggest network-specific recovery**. The design exists in `docs/architecture/network-anomaly-runtime-architecture.md` but is not fully implemented.

**Impact:** When network instability causes action failures, the harness can label it but cannot act on it intelligently. Retry budgets are consumed without network-specific adaptation.

### P0-2: 多步检查点链 (Multi-Step Checkpoint Chain)

**Gap:** `replay_last_stable_path` replays only the **last single** successful action. Real failures occur mid-flow after N successful steps. There is no `replay_checkpoint_chain` that identifies the last stable checkpoint and replays all subsequent low-risk actions.

**Impact:** Multi-step flow recovery is incomplete. Developer must manually replay each step or restart the entire flow.

### P0-3: 导出前流程验证 (Flow Validation Before Export)

**Gap:** `export_session_flow` converts recorded actions to Maestro YAML but does not validate the generated flow against the current app state. No dry-run path exists to catch drift before CI.

**Impact:** Exported flows may fail on the current build, wasting CI time and developer debugging cycles.

### P0-4: 元素截图/视觉对比 (Element Screenshot / Visual Diff)

**Gap:** `query_ui` and `resolve_ui_target` return structural matches but no visual baseline. There is no `capture_element_screenshot` that crops to element bounds for pixel-diff regression.

**Impact:** Developer must manually compare full-screen screenshots. No visual regression capability exists.

---

## Architecture Overview

### P0-1: Network-Aware Orchestration — Target Design

```
perform_action_with_evidence
  │
  ├─ action executes → fails
  │
  ├─ classifyActionFailureCategory → "network" failure
  │
  ├─ [NEW] probeNetworkReadiness(sessionId, platform, deviceId)
  │    ├─ Android: `adb shell ping -c 1 8.8.8.8` or `adb shell cmd connectivity` 
  │    ├─ iOS: `devicectl device info network` or simctl network reachability
  │    └─ Returns: NetworkReadinessProbe { connected, latency, type, dnsOk, backendReachable }
  │
  ├─ [NEW] classifyNetworkRecoveryStrategy(probe, failureCategory)
  │    ├─ offline → suggest: toggle_airplane_mode (bounded)
  │    ├─ high_latency → suggest: retry with extended timeout
  │    ├─ dns_failure → suggest: check_network_config
  │    ├─ backend_5xx → suggest: wait_and_retry (bounded, not app fault)
  │    └─ connected_but_slow → suggest: bounded_wait_for_backend
  │
  └─ [ENHANCED] suggest_known_remediation
       └─ Includes network-specific remediation from probe results
```

**New contracts:**
- `NetworkReadinessProbe` in `packages/contracts/src/types.ts`
- `NetworkRecoveryStrategy` in contracts
- `probeNetworkReadiness` tool in `packages/adapter-maestro/src/network-probe.ts`
- `classifyNetworkRecoveryStrategy` in `packages/adapter-maestro/src/action-orchestrator-model.ts`

**Key design decisions:**
- Probe is **bounded** (single ping, single DNS lookup, single backend health check) — not a full network diagnostic suite
- Recovery suggestions are **policy-gated** — high-risk actions (toggle airplane mode) require `network-high-risk` scope
- Results are **attached to action outcome** — not a standalone tool only

### P0-2: Multi-Step Checkpoint Chain — Target Design

```
replay_checkpoint_chain(input: { sessionId, fromStep?: number, maxSteps?: number })
  │
  ├─ Load session action records: listActionRecordsForSession(sessionId)
  │
  ├─ Find last stable checkpoint:
  │    └─ Walk backwards from most recent action
  │    └─ Find first action with: outcome.outcome === "success" AND outcome.progressMarker === "full"
  │    └─ This is the "checkpoint anchor"
  │
  ├─ Collect all actions AFTER the anchor (up to maxSteps or end of session)
  │
  ├─ [NEW] Filter for replay-safe actions:
  │    ├─ Skip high-risk keywords (pay, purchase, delete, submit, confirm)
  │    ├─ Skip actions with outcome.outcome !== "success"
  │    ├─ Skip actions that used OCR fallback (non-deterministic)
  │    └─ Keep: tap, type, wait_for_ui, launch_app (low-risk, idempotent)
  │
  ├─ Verify current state matches anchor's postState:
  │    ├─ get_session_state → compare screenId, readiness, appPhase
  │    ├─ If divergence > threshold → stop, report divergence
  │    └─ If matches → proceed with replay
  │
  ├─ Execute each replayable action sequentially:
  │    ├─ perform_action_with_evidence(action)
  │    ├─ Compare outcome with original outcome
  │    ├─ If divergence → mark as diverged, continue or stop based on policy
  │    └─ Record per-step replay result
  │
  └─ Return: ReplayChainResult {
       anchorActionId,
       replayedCount,
       succeededCount,
       divergedCount,
       skippedCount,
       perStepResults: ReplayStepResult[],
       overallStatus: "full" | "partial" | "failed"
     }
```

**New contracts:**
- `ReplayCheckpointChainInput` / `ReplayCheckpointChainData` in contracts
- `ReplayStepResult` in contracts
- `replay_checkpoint_chain` tool in `packages/mcp-server/src/tools/replay-checkpoint-chain.ts`
- Implementation in `packages/adapter-maestro/src/replay-chain.ts`

### P0-3: Flow Validation Before Export — Target Design

```
validate_flow(input: { sessionId?: string, flowPath?: string, platform?, runnerProfile? })
  │
  ├─ Load flow:
  │    ├─ If sessionId: load recorded actions from session → generate in-memory Maestro flow
  │    └─ If flowPath: load existing Maestro YAML
  │
  ├─ For each step in flow (dry-run mode):
  │    ├─ Resolve UI target (without tapping)
  │    ├─ Check: target exists in current UI tree?
  │    ├─ Check: target is actionable (not blocked, not loading)?
  │    ├─ Check: prerequisites met (app installed, app launched)?
  │    └─ Record step validation: { stepIndex, status: "pass" | "fail" | "warn", reason }
  │
  ├─ If any step fails:
  │    └─ Return: FlowValidationResult {
         valid: false,
         totalSteps,
         passedSteps,
         failedSteps: [{ stepIndex, stepType, resourceId, reason, suggestion }],
         warnedSteps: [{ stepIndex, reason }],
         overallConfidence: number
       }
  │
  └─ If all steps pass:
       └─ Return: FlowValidationResult { valid: true, ... }
```

**New contracts:**
- `ValidateFlowInput` / `ValidateFlowData` in contracts
- `FlowStepValidation` in contracts
- `validate_flow` tool in `packages/mcp-server/src/tools/validate-flow.ts`
- Implementation in `packages/adapter-maestro/src/flow-validation.ts`

**Key design decisions:**
- Dry-run mode: resolves targets and checks preconditions but **does not execute actions** (no tap, no type)
- Fast: each step is a single `inspect_ui` + `query_ui` call, not a full action cycle
- Export gate: `export_session_flow` can optionally call `validate_flow` first and include validation result in export metadata

### P0-4: Element Screenshot / Visual Diff — Target Design

```
capture_element_screenshot(input: { sessionId, selector, outputPath?, cropPadding? })
  │
  ├─ inspect_ui → get full screen tree + screenshot
  │
  ├─ resolve_ui_target(selector) → get element bounds { x, y, width, height }
  │
  ├─ [NEW] Crop screenshot to element bounds (+ optional padding):
  │    ├─ Read full screenshot from artifact path
  │    ├─ Use sharp/jimp (or native sips on macOS) to crop
  │    └─ Write cropped screenshot to outputPath
  │
  └─ Return: ElementScreenshotData {
       fullScreenshotPath,
       croppedElementPath,
       elementBounds: { x, y, width, height },
       cropPadding,
       confidence: number (from resolve confidence)
     }

compare_visual_baseline(input: { sessionId?, selector?, baselinePath?, currentPath?, threshold? })
  │
  ├─ If baselinePath and currentPath provided:
  │    └─ Direct comparison: pixel diff with threshold
  │
  ├─ If sessionId + selector provided:
  │    ├─ capture_element_screenshot → currentPath
  │    ├─ Load baseline from `baselines/{screenId}-{selector}.png`
  │    └─ Compare
  │
  └─ Return: VisualDiffData {
       baselinePath,
       currentPath,
       diffPath (if different),
       pixelDiffPercent: number,
       threshold: number,
       passed: boolean,
       structuralDiff: { addedElements, removedElements, changedText }
     }
```

**New contracts:**
- `ElementScreenshotInput` / `ElementScreenshotData` in contracts
- `VisualDiffInput` / `VisualDiffData` in contracts
- `capture_element_screenshot` tool in `packages/mcp-server/src/tools/capture-element-screenshot.ts`
- `compare_visual_baseline` tool in `packages/mcp-server/src/tools/compare-visual-baseline.ts`
- Implementation in `packages/adapter-vision/src/element-screenshot.ts`

**Key design decisions:**
- Cropping uses **existing screenshot** from `inspect_ui` — no additional screenshot call needed
- For macOS, use built-in `sips` or a lightweight JS library (`sharp` if available, otherwise `jimp`)
- Baselines stored under `baselines/{screenId}/{selector}.png` — screen-scoped to avoid cross-screen confusion
- `compare_visual_baseline` also includes **structural diff** (UI tree comparison) alongside pixel diff

---

## Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NET-01 | Network readiness probe for Android and iOS | network-anomaly-runtime-architecture.md |
| NET-02 | Network-specific recovery strategy classification | action-orchestrator-model.ts gap |
| NET-03 | Network probe result attached to action outcome | contracts extension |
| RPL-03 | Multi-step checkpoint chain replay | workflow-analysis §5 |
| RPL-04 | Checkpoint divergence detection and reporting | recovery-tools.ts extension |
| VAL-01 | Flow dry-run validation before export | workflow-analysis §6 |
| VAL-02 | Per-step validation with failure reasons and suggestions | flow-validation.ts |
| VIS-01 | Element-level screenshot cropping | ui-inspection-tools.ts extension |
| VIS-02 | Visual baseline comparison with pixel + structural diff | adapter-vision extension |

---

## Success Criteria

1. **Network probe works** on both Android (ADB ping/connectivity) and iOS (simctl/devicectl network check) — verified with smoke test on both platforms.
2. **Multi-step replay succeeds** on a recorded session with 3+ successful actions — replays all low-risk steps from last stable checkpoint.
3. **Flow validation catches at least one broken step** when a recorded flow is validated against a changed app state — verified with a controlled test case.
4. **Element screenshot cropping** produces a valid cropped image for a resolved UI element — verified with inspect_ui + capture_element_screenshot chain.
5. All 4 new tools (`probe_network_readiness`, `replay_checkpoint_chain`, `validate_flow`, `capture_element_screenshot`) are exposed via MCP server and pass type checking.
6. No regressions: `pnpm build && pnpm typecheck && pnpm test:ci` passes.

---

## Implementation Plan

### Plan 18-01: Network-Aware Orchestration

**Scope:** Network readiness probe + recovery strategy classification + integration with action orchestrator.

**Files changed:**
- `packages/contracts/src/types.ts` — add `NetworkReadinessProbe`, `NetworkRecoveryStrategy` types
- `packages/contracts/tool-result.schema.json` — extend if needed
- `packages/adapter-maestro/src/network-probe.ts` — NEW: `probeNetworkReadiness` function
- `packages/adapter-maestro/src/action-orchestrator-model.ts` — add `classifyNetworkRecoveryStrategy`
- `packages/adapter-maestro/src/action-orchestrator.ts` — integrate network probe into failure path
- `packages/mcp-server/src/tools/probe-network-readiness.ts` — NEW: MCP tool wrapper
- `packages/mcp-server/src/server.ts` — register new tool
- `packages/adapter-maestro/src/device-runtime-android.ts` — add Android network probe command
- `packages/adapter-maestro/src/device-runtime-ios.ts` — add iOS network probe command

**Approach:**
1. Define contracts (`NetworkReadinessProbe` with `connected`, `latencyMs`, `type`, `dnsOk`, `backendReachable`)
2. Implement platform-specific probes (Android: `adb shell ping -c 1 -W 3 8.8.8.8`; iOS: depends on simulator vs physical)
3. Add `classifyNetworkRecoveryStrategy` to `action-orchestrator-model.ts`
4. Integrate into `performActionWithEvidenceWithMaestro` — probe network when failure category is "network"
5. Wire MCP tool `probe_network_readiness` for standalone use

**Verification:**
- Unit test: `classifyNetworkRecoveryStrategy` with each probe result type
- Smoke test: run on Android emulator with network disconnected → verify probe returns `connected: false`
- Integration: `perform_action_with_evidence` on a network-dependent action → verify network probe is triggered and attached to outcome

### Plan 18-02: Multi-Step Checkpoint Chain

**Scope:** Replay chain from last stable checkpoint with divergence detection.

**Files changed:**
- `packages/contracts/src/types.ts` — add `ReplayCheckpointChainInput`, `ReplayCheckpointChainData`, `ReplayStepResult`
- `packages/adapter-maestro/src/replay-chain.ts` — NEW: `replayCheckpointChain` function
- `packages/adapter-maestro/src/recovery-tools.ts` — add divergence detection helpers
- `packages/mcp-server/src/tools/replay-checkpoint-chain.ts` — NEW: MCP tool wrapper
- `packages/mcp-server/src/server.ts` — register new tool
- `packages/core/src/session-store.ts` — may need to extend `listActionRecordsForSession` query

**Approach:**
1. Define contracts for chain input/output
2. Implement `replayCheckpointChain`:
   - Load session records
   - Find last stable checkpoint (success + full progress marker)
   - Filter subsequent actions for replay safety
   - Verify current state matches anchor postState
   - Execute each replayable action, compare outcomes
   - Return chain result with per-step details
3. Wire MCP tool `replay_checkpoint_chain`

**Verification:**
- Unit test: checkpoint anchor selection logic with various outcome combinations
- Unit test: replay-safe action filtering (high-risk keyword detection)
- Smoke test: record a 5-step session → replay checkpoint chain → verify 3-4 steps replayed (some skipped as high-risk)

### Plan 18-03: Flow Validation Before Export

**Scope:** Dry-run flow validation against current app state.

**Files changed:**
- `packages/contracts/src/types.ts` — add `ValidateFlowInput`, `ValidateFlowData`, `FlowStepValidation`
- `packages/adapter-maestro/src/flow-validation.ts` — NEW: `validateFlow` function
- `packages/adapter-maestro/src/recording-mapper.ts` — extend to support validation metadata
- `packages/mcp-server/src/tools/validate-flow.ts` — NEW: MCP tool wrapper
- `packages/mcp-server/src/server.ts` — register new tool

**Approach:**
1. Define contracts for flow validation
2. Implement `validateFlow`:
   - Load flow (from session or file)
   - For each step: inspect_ui → query_ui → check target exists and is actionable
   - Collect pass/fail/warn per step
   - Return validation result with confidence score
3. Wire MCP tool `validate_flow`
4. Optionally: extend `export_session_flow` to include validation result

**Verification:**
- Unit test: validateFlow with mock UI tree — element exists, element missing, element blocked
- Smoke test: record a 3-step flow → modify app state (navigate away) → validate_flow → verify step fails
- Integration: export_session_flow → validate_flow → verify validation result attached

### Plan 18-04: Element Screenshot and Visual Baseline

**Scope:** Element-level cropping + visual baseline comparison.

**Files changed:**
- `packages/contracts/src/types.ts` — add `ElementScreenshotInput`, `ElementScreenshotData`, `VisualDiffInput`, `VisualDiffData`
- `packages/adapter-vision/src/element-screenshot.ts` — NEW: crop screenshot to element bounds
- `packages/adapter-vision/src/visual-diff.ts` — NEW: pixel diff + structural diff
- `packages/adapter-vision/src/index.ts` — export new modules
- `packages/mcp-server/src/tools/capture-element-screenshot.ts` — NEW: MCP tool wrapper
- `packages/mcp-server/src/tools/compare-visual-baseline.ts` — NEW: MCP tool wrapper
- `packages/mcp-server/src/server.ts` — register new tools
- `package.json` — add `sharp` or `jimp` dependency (prefer `jimp` for pure JS, no native build)

**Approach:**
1. Add `jimp` dependency (pure JS, no native compilation needed)
2. Implement `cropElementScreenshot`:
   - Call `inspect_ui` to get full screenshot + tree
   - Resolve element bounds from tree
   - Load screenshot image with `jimp`
   - Crop to element bounds + padding
   - Save cropped image
3. Implement `compareVisualBaseline`:
   - Load baseline and current images
   - Pixel diff with configurable threshold
   - Structural diff (compare UI trees if both available)
   - Return diff image + metrics
4. Wire MCP tools

**Verification:**
- Unit test: crop calculation logic (bounds + padding → crop coordinates)
- Unit test: pixel diff with known different images → verify threshold behavior
- Smoke test: `inspect_ui` → `capture_element_screenshot` on a button → verify cropped image is valid

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Network probe commands vary by OEM/Android version | Medium | Medium | Use fallback chain: ping → connectivity manager → DNS lookup; document limitations |
| iOS physical device network probing limited | High | Low | Frame as "simulator-first, physical-device best-effort"; document boundary honestly |
| Multi-step replay diverges significantly from original path | Medium | Medium | Stop at first divergence, report clearly; do not attempt to "fix" diverged steps |
| Flow validation false positives (element exists but in different state) | Medium | Low | Validation is "dry-run hint" not "guaranteed pass"; mark as validation confidence, not pass/fail binary |
| `jimp` adds bundle size | Low | Low | Only used in `adapter-vision`, not in core runtime; can be optional dependency |
| Visual diff flakiness across different device resolutions | Medium | Medium | Structural diff as supplement to pixel diff; resolution-normalized comparison where possible |

---

## Execution Order

Plans can execute in parallel for contract changes (all touch `types.ts`), but implementation should follow this order:

1. **18-04 (Element Screenshot)** — standalone, no dependencies on other plans, lowest risk
2. **18-03 (Flow Validation)** — standalone, depends only on existing `recording-mapper.ts`
3. **18-02 (Checkpoint Chain)** — depends on existing `recovery-tools.ts` and `session-store.ts`
4. **18-01 (Network Orchestration)** — most complex, integrates with `action-orchestrator.ts` (the hottest file in the codebase)

This order maximizes parallelism opportunity: 18-04 and 18-03 can be built simultaneously. 18-02 follows. 18-01 last as it touches the most critical path.

---

## File Impact Summary

| File | Plans | Change Type |
|------|-------|-------------|
| `packages/contracts/src/types.ts` | All 4 | Add ~8 new type interfaces |
| `packages/mcp-server/src/server.ts` | All 4 | Add 4 new tool registrations + 2 new tool imports |
| `packages/adapter-maestro/src/network-probe.ts` | 18-01 | NEW file |
| `packages/adapter-maestro/src/action-orchestrator-model.ts` | 18-01 | Add `classifyNetworkRecoveryStrategy` |
| `packages/adapter-maestro/src/action-orchestrator.ts` | 18-01 | Integrate network probe into failure path |
| `packages/adapter-maestro/src/replay-chain.ts` | 18-02 | NEW file |
| `packages/adapter-maestro/src/flow-validation.ts` | 18-03 | NEW file |
| `packages/adapter-vision/src/element-screenshot.ts` | 18-04 | NEW file |
| `packages/adapter-vision/src/visual-diff.ts` | 18-04 | NEW file |
| `packages/mcp-server/src/tools/probe-network-readiness.ts` | 18-01 | NEW file |
| `packages/mcp-server/src/tools/replay-checkpoint-chain.ts` | 18-02 | NEW file |
| `packages/mcp-server/src/tools/validate-flow.ts` | 18-03 | NEW file |
| `packages/mcp-server/src/tools/capture-element-screenshot.ts` | 18-04 | NEW file |
| `packages/mcp-server/src/tools/compare-visual-baseline.ts` | 18-04 | NEW file |

Total: **8 new files, 5 existing files modified** (excluding test files).
