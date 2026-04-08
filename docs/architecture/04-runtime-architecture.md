# Runtime Architecture

> This document synthesizes the execution coordinator, fallback ladder, failure attribution, recovery, evidence timeline, interruption handling, policy engine, and OCR fallback into a single runtime architecture reference.
>
> Original sources: `execution-coordinator-and-fallback-ladder.zh-CN.md`, `failure-attribution-and-recovery-architecture.zh-CN.md`, `evidence-timeline-architecture.zh-CN.md`, `interruption-orchestrator-v2.zh-CN.md`, `policy-engine-runtime-architecture.zh-CN.md`, `mobile-e2e-ocr-fallback-design.md`, `orchestration-robustness-strategy.md`, `bounded-retry-and-state-change-evidence-architecture.md`, `network-anomaly-runtime-architecture.md`.

---

## 1. Execution Coordinator and Fallback Ladder

### 1.1 Standard Execution State Machine

```
pending -> resolving_target -> executing_action -> verifying_post_condition -> success

failure branch:
  -> check_fallback_eligibility -> fallback_executing (bounded) -> fallback_verifying -> success | failed
```

Prohibited transitions:
- Report success without executing post-condition verification.
- Continuous retry without state-change evidence.
- Enter OCR/CV without explicit policy allowance.

### 1.2 Fallback Ladder

Ordered sequence (must be followed strictly):

1. Stable identifier (id/resource-id/testID/accessibility ID)
2. Semantic tree match (text/label/role)
3. OCR fallback (bounded, policy-gated)
4. CV/template fallback (bounded, policy-gated)
5. Hard fail + escalation guidance

Each layer must record: trigger reason, confidence, retry count, and whether progression to the next layer is permitted.

### 1.3 Platform-Specific Execution

| Platform | Primary Path | Fallback Behavior |
|---|---|---|
| Android | UI tree + selector via ADB/UIAutomator2 | Coordinate tap only after target resolution succeeds |
| iOS Simulator | AXe CLI hierarchy (Phase 14+) | Bounded fallback, explicitly mark partial/unsupported |
| iOS Physical | WDA HTTP API (Phase 15+) | devicectl lifecycle fallback, Maestro legacy fallback |
| React Native | Native adapter + Metro debug evidence | Debug lane supplements but never replaces post-condition verification |
| Flutter | Deterministic tree path | Higher fallback frequency expected; fail-fast on low-confidence OCR/CV |

### 1.4 Evidence Output Contract

Each key action outputs:

| Field | Location |
|---|---|
| `status` | `tool-result.status` |
| `reasonCode` | `tool-result.reasonCode` |
| `resolutionStrategy` | `tool-result.data.outcome` |
| `fallbackUsed` | `tool-result.data.outcome` |
| `confidence` | `tool-result.data.outcome` |
| `attempts` | `tool-result.attempts` |
| `artifacts[]` | `tool-result.artifacts` |
| `nextSuggestions` | `tool-result.nextSuggestions` |

Current schema: `packages/contracts/tool-result.schema.json`. Extended fields live in `data` until schema evolution.

---

## 2. Failure Attribution and Recovery

### 2.1 Failure Candidate Categories

Failures are attributed to the most likely layer:

| Category | Examples |
|---|---|
| Selector / UI ambiguity | Element not found, wrong target, overlay blocking |
| Interruption | System alert, permission prompt, action sheet |
| App state drift | Wrong screen, partial previous step, stale auth |
| Network / backend | Timeout, 429/5xx, offline, captive network |
| Crash / native exception | App crash, ANR, native exception |
| Performance timeout | Slow render, transition timeout |
| Environment / config / policy | Policy denied, device offline, signing expired |

Each candidate includes: `category`, `confidence`, `evidenceRefs`, `reasoningSummary`, `nextProbe`.

### 2.2 Standard Recovery Primitives

- Recover to known screen
- Replay last stable path
- Relaunch app
- Reset app state
- Bounded retry with backoff

Recovery preconditions:
1. Session is still valid.
2. Policy scope allows the recovery action.
3. Sufficient evidence supports the recovery decision.

### 2.3 Recovery State Transitions

```
failure_attributed -> recovery_attempted -> recovery_succeeded | recovery_failed -> re-verify
```

Each event includes: `sessionId`, `actionId`, `reasonCode`, `artifactRefs`.

---

## 3. Interruption Orchestration

### 3.1 Unified Interruption Chain

```
Action Executor
  -> preActionGuard (detect -> classify -> resolve)
  -> executeAction
  -> postActionGuard (detect -> classify -> resolve -> resume bounded)
```

Core modules:
- `interruption-detector` — multi-signal detection (structural change, system ownership, blocking evidence)
- `interruption-classifier` — type classification with confidence scoring
- `interruption-resolver` — policy-driven dismiss/continue/deny/cancel
- `interruption-orchestrator` — chains pre/post guards, recovery, and audit events

### 3.2 Interruption State Machine

```
none -> detected -> classified -> resolved -> resumed -> (back to action)
                                          |
                                          v
                                      escalated (on failure)
```

Classification types: `system_alert | action_sheet | permission_prompt | app_modal | overlay | unknown`.

Prohibited transitions:
- Execute high-risk dismiss without classification.
- Infinite recovery loops without state-change evidence.

### 3.3 Detection Signals (by priority)

1. **Structural signals**: root/top-layer node mutation, modal container appearance, interactive area shrinkage.
2. **Ownership signals**: system component ownership (iOS SpringBoard / Android permission controller).
3. **Behavioral signals**: action produces no target change + blocking node present.
4. **Visual signals (supplementary)**: overlay geometry patterns, bottom sheet patterns (enabled only when structural signals are insufficient).

### 3.4 Resolution Policy

Upgrade from "text matching" to "semantic slot actions":

- `primary` / `secondary` / `cancel` / `destructive`

High-risk actions (destructive/business side effects) default to deny automatic resolution; must return recommendations and escalate to human decision.

### 3.5 Platform-Specific Handling

| Platform | Structural Anchors | Default Strategy |
|---|---|---|
| iOS | `XCUIElementTypeAlert`, `Sheet`, button slot layout, SpringBoard ownership | Default `cancel` (low-risk); other slots require explicit policy |
| Android | `Dialog`/`BottomSheet` shape, system package ownership, standard button slots | Distinguish system permission vs. app modal via owner package + structural signature |

### 3.6 Audit Events

Required events: `interruption_detected`, `interruption_classified`, `interruption_resolved`, `interrupted_action_resumed`, `interruption_escalated`.

Unknown interruptions must preserve full evidence: screenshot, UI tree, action timeline window, logs/crash signals.

---

## 4. Evidence and Timeline Model

### 4.1 Timeline Event

Minimum fields:

| Field | Description |
|---|---|
| `sessionId` | Active session identifier |
| `eventType` | Event type string |
| `timestamp` | ISO-8601 timestamp |
| `actionId` | Optional action identifier |
| `reasonCode` | Deterministic enum |
| `policyProfile` | Active policy profile |
| `artifactRefs[]` | References to artifacts |

Current schema: `packages/contracts/session.schema.json` enforces timeline as array of objects. Replay events currently: `replay_started`, `replay_step_started`, `replay_step_completed`, `replay_step_failed`, `replay_stopped`, `replay_completed`.

### 4.2 Evidence Packet

Suggested fields:
- `actionIntent`
- `preStateSummary`
- `postStateSummary`
- `fallbackUsed`
- `confidence`
- `logs/crash/network snippets`

Storage: evidence packet lives in `tool-result.data.evidence[]` with `artifacts[]` as index+reference (not duplicate storage).

### 4.3 Artifact Taxonomy

| Category | Source |
|---|---|
| screenshots | `adb exec-out screencap -p`, `axe screenshot`, WDA `/screenshot` |
| UI trees | `adb shell uiautomator dump`, `axe describe-ui`, WDA `/source` |
| logs | `adb logcat`, simulator logs, device logs |
| crash signals | `xcrun devicectl device info crashes`, Android ANR traces |
| diagnostics bundles | Android bugreport, iOS diagnostics |
| performance traces | Android Perfetto, iOS xctrace |
| interruption evidence | Pre/post screenshots, tree snapshots, timeline windows |

### 4.4 Platform-Specific Evidence

| Platform | Evidence Sources | Directory Layout |
|---|---|---|
| Android | ADB path (screenshot, logcat, Perfetto trace) | `platform/sessionId/actionId` |
| iOS | AXe/WDA/simctl path (hierarchy, screenshot, logs) | `platform/sessionId/actionId` |
| React Native | JS inspector snapshot + native logs merged into unified timeline | Same layout + `js-debug` subdirectory |
| Flutter | Fallback evidence nodes for semantic-deficient surfaces | Same layout + `fallback` subdirectory |

---

## 5. Policy Engine Runtime

### 5.1 Architecture

```
Tool Request -> policy-guard.ts -> policy-engine.ts -> access profile resolution
                                                        -> required scope check
                                                        -> interruption/fallback rule check
                                                     -> allow | deny (structured envelope)
```

Design principles:
1. **Policy in core, enforcement in server** — parsing in `core`, enforcement at `mcp-server` gateway.
2. **Default deny on unknown write scope** — unknown high-risk scopes are denied by default.
3. **Explainable decision** — every denial outputs `reasonCode` and suggestions.
4. **No silent fallback escalation** — fallback upgrades require explicit policy allowance.

### 5.2 Policy Decision State Machine

```
policy_unresolved -> policy_loaded -> scope_checked -> rule_matched -> allowed | denied | partial
```

Key rules:
- Tool first validates scope, then fine-grained rule match.
- If scope is not met, deny immediately — do not enter adapter execution.
- Fallback actions require additional allowance level and confidence threshold checks.

### 5.3 Policy Layer Model

| Layer | Content |
|---|---|
| Access Profile | Read-only / Interactive / Full-control, mapped to minimum required scope per tool |
| Interruption Policy | Platform-specific rules (iOS/Android), high-risk interruption actions denied by default |
| Fallback Policy | Scenarios, thresholds, and limits for entering OCR/CV after deterministic failure |

### 5.4 Current Scopes

| Scope | Tools | Risk Level |
|---|---|---|
| `inspect` | inspect_ui, query_ui, resolve_ui_target | Low |
| `screenshot` | take_screenshot | Low |
| `logs` | get_logs | Medium (may contain sensitive data) |
| `performance` | measure_android_performance | Low |
| `tap` / `type` / `swipe` | tap, type_text, scroll_and_tap_element | Medium |
| `install` / `uninstall` / `clear-data` | install_app, terminate_app, reset_app_state | High |
| `interrupt` | low-risk interruption resolution | Medium |
| `interrupt-high-risk` | destructive interruption actions | High |
| `diagnostics-export` | collect_diagnostics, get_crash_signals | Medium-High |
| `crash-export` | crash report export | High |
| `js-debug-read` | capture_js_console_logs, capture_js_network_events | Medium |
| `recovery-write` | recover_to_known_state, replay_last_stable_path | High |
| `ocr-action` | OCR-driven coordinate action | High |
| `cv-action` | CV/template-driven coordinate action | High |

### 5.5 Denial Response

Denied responses must include:
- `status: failed|partial`
- `reasonCode` (policy denial related)
- `requiredScope`
- `currentProfile`
- `nextSuggestions`

---

## 6. OCR Fallback Subsystem

### 6.1 Design Principle

OCR is a **policy-governed, evidence-rich fallback** — never the primary path.

Entry conditions (all must be true):
1. Deterministic resolution failed.
2. Semantic resolution failed or unavailable.
3. Action type is allowed by policy.
4. Screenshot is fresh.
5. Screen is not in loading or transition state.

Block conditions (any blocks):
- Risky action (delete, purchase, confirmPayment)
- Stale screenshot
- Active UI transition
- OCR confidence below threshold
- Candidate ambiguity above threshold
- No clear text target in action context

### 6.2 Architecture Layers

```
perform_action_with_evidence
  -> deterministic / semantic resolution
  -> if failed:
       fallback policy check
       -> take screenshot
       -> OcrService -> OcrProvider (default: MacVisionOcrProvider) -> normalize to OcrOutput
       -> OcrTargetResolver
       -> confidence / action policy gate
       -> adapter coordinate action
       -> post-action verification
       -> telemetry + artifacts
```

### 6.3 OCR Provider Contract

```
OcrInput { screenshotPath, platform, languageHints?, crop? }
  -> OcrProvider.extractTextRegions()
  -> OcrOutput { provider, engine, model?, durationMs, screenshotPath, blocks[] }
    -> OcrTextBlock { text, confidence, bounds{left,top,right,bottom} }
```

Default provider: `MacVisionOcrProvider` (local macOS OCR, no API key required).

### 6.4 Target Resolution

Matching order: exact match → normalized match → fuzzy match → fail safe on ambiguity.

Normalization rules: trim whitespace, lowercase, collapse repeated spaces, normalize punctuation variants.

### 6.5 Post-Action Verification (Mandatory)

After OCR-driven tap, at least one must hold:
- Target text disappears
- Expected next text appears
- Screen summary changes as expected
- Deterministic locator becomes available
- Screen identity changes

Failure handling: retry at most once; second attempt with tighter matching or local crop refinement; hard fail after bounded retry.

### 6.6 Default Policy

| Parameter | Value |
|---|---|
| `enabled` | true |
| `allowedActions` | ["tap", "assertText"] |
| `blockedActions` | ["delete", "purchase", "confirmPayment"] |
| `minConfidenceForAssert` | 0.70 |
| `minConfidenceForTap` | 0.82 |
| `maxCandidatesBeforeFail` | 5 |

---

## 7. Orchestration Robustness Strategy

### 7.1 Current Baseline vs Target

Current maturity: **single-action evidence + bounded recovery**.
Target maturity: **closed-loop multi-step robustness**.

The repository already has:
- Structured tool contracts and reason-coded results
- Session-oriented execution and auditability
- Interruption detect/classify/resolve/resume chain
- Failure attribution and bounded recovery helpers
- JS console/network/native log/crash evidence aggregation

### 7.2 High-Frequency Scenario Taxonomy

| Scenario | Examples |
|---|---|
| Slow-ready/unstable-ready | Loading states exceed wait budget; UI visible but not actionable |
| State drift across multi-step | Previous step partially succeeded; wrong screen without explicit error |
| Interruption + drift combined | System prompt handled but resume lands on changed UI state |
| Network-triggered UX instability | Timeouts, 429/5xx, offline transitions, partial content rendering |
| Attribution ambiguity | UI timeout actually network-induced; apparent selector failure is state drift |

### 7.3 Deepening Areas

| Priority | Area | Description |
|---|---|---|
| 1 | Automation-flow robustness | Multi-step resilience under slow rendering, state drift, stale targets, transient interruption |
| 2 | Network anomaly handling | First-class network-aware orchestration, not just observability |
| 3 | Recovery state machine depth | Clearer checkpoints, replay scope, stop conditions |
| 4 | Historical failure memory | Baseline and remediation guidance for repeated instability |
| 5 | Real-run reliability validation | Repeatable validation lanes for flaky-flow and network-stress scenarios |

### 7.4 What This Should NOT Become

- Unbounded self-healing loops
- Opaque planner behavior that cannot explain retry/stop decisions
- Aggressive automation that bypasses policy boundaries

Core principle: **deterministic-first, bounded, auditable**.

---

## 8. Capability Boundaries

### Current Baseline

- Evidence-rich single-action execution
- Bounded interruption handling
- Failure attribution and recovery helpers
- Partial JS network evidence capture in supported debug contexts

### Partial Support

- Network capture through Metro inspector (RN-debug-lane only, not general mobile network observability)
- iOS physical device automation (WDA requires one-time setup; iproxy port forwarding required)
- Flutter semantic coverage (depends on app instrumentation quality)

### Future

- Richer network-aware remediation loops across more platforms
- Stronger multi-step checkpoint replay and task-state reasoning
- Broader real-run stress lanes for flaky-flow and network-instability scenarios
- Dynamic network fault injection and debugger-grade network workflows

---

## 9. Related Documents

- [System Architecture](./01-system-architecture.md) — topology, control plane, execution plane
- [Platform Adapters](./02-platform-adapters.md) — Android/iOS backends, framework profiles
- [Capability Model](./03-capability-model.md) — AI-first capability layers, maturity levels
- [Governance & Security](./05-governance-security.md) — policy profiles, audit, human handoff
- [RN Debugger Sequence](./rn-debugger-sequence.md) — Metro inspector capability gap
- [Network Anomaly Runtime](./network-anomaly-runtime-architecture.md) — network-aware retry and stop logic
