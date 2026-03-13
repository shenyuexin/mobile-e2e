# AI-First Capability Model

## 1. Scope

This document defines the capabilities that are necessary if this project is optimized for AI-first mobile automation rather than human-first tooling.

Core premise:

- The main user is an AI agent, not a human clicking through a debugger UI.
- The platform should optimize for structured evidence, bounded actioning, fast diagnosis, and repeatable recovery.
- Human-style control surfaces matter only when they expose a capability the AI actually needs.

In practice, the target loop is:

1. Understand goal and constraints.
2. Discover current device and app state.
3. Choose the next bounded action.
4. Capture the minimum evidence needed around that action.
5. Decide whether the action succeeded, failed, or was interrupted.
6. Attribute the failure to the most likely layer.
7. Recover, escalate, or produce a bug packet.
8. Persist learnings for future runs.

## 2. What AI-First Changes

An AI-first system should not primarily optimize for:

- manual debugger UI parity
- large raw artifact dumps with weak structure
- low-level action APIs without post-action interpretation
- human memory of project-specific caveats

An AI-first system should primarily optimize for:

- high-density structured state
- causally ordered evidence
- explicit capability boundaries
- deterministic recovery paths
- reusable historical memory

## 3. Required Capability Layers

### 3.1 State Model

The system must expose a compact, structured view of current state.

Required outputs:

- current device identity and environment
- current app build, app ID, and foreground/background state
- current screen or route summary
- actionable UI targets and ambiguity signals
- loading, blocked, interrupted, or idle state
- key runtime summary such as recent exception, recent failed request, or recent crash signal

Why this is necessary:

Without a state model, the AI is forced to infer everything from screenshots and raw logs, which is expensive and error-prone.

### 3.2 Action-Centered Evidence

Each important action should automatically produce a minimal evidence packet.

Required outputs per action:

- normalized action intent
- pre-action state summary
- post-action state summary
- visible UI change summary
- recent logs, exceptions, and network deltas
- whether fallback or retry occurred
- confidence and determinism tier

Why this is necessary:

AI agents reason better over "what changed after action X" than over disconnected artifacts collected later.

### 3.3 Causal Timeline

The system must merge events into a single ordered timeline inside a session.

Required event classes:

- action execution
- UI transitions
- network activity
- JS runtime exceptions and console errors
- native logs and crash signals
- interruption detection and resolution
- performance slowdowns and timeouts

Why this is necessary:

Most mobile failures are multi-layer. AI needs one timeline to correlate "tap submit" with "request 401", "toast shown", and "screen did not navigate".

### 3.4 Failure Attribution

The platform should not stop at evidence collection. It should produce machine-usable candidate root causes.

Required outputs:

- likely layer: selector, app state, interruption, network, backend, crash, performance, environment, test bug
- ranked candidate causes
- missing evidence warnings
- recommended next probe or recovery action

Why this is necessary:

This is the layer that converts a tool collection into an actual AI debugging platform.

### 3.5 Recovery And Re-Entry

AI-first automation must know how to recover instead of only failing loudly.

Required recovery primitives:

- recover to known screen
- relaunch app
- clear app state
- re-login or restore session through bounded hooks
- dismiss supported interruptions
- retry with reason-aware backoff
- bail out when deterministic guarantees are lost

Why this is necessary:

Long-running agentic execution is only viable if the platform can re-enter a known state cheaply and safely.

### 3.6 Environment Control

The platform must control the environment enough to keep failures interpretable.

Required controls:

- device selection and reservation
- app install, launch, terminate, and reset
- permissions
- locale, timezone, and geolocation where relevant
- network profile and reachability controls
- seed data or deep-link/test-entry support

Why this is necessary:

If environment state is drifting, AI cannot distinguish product bugs from infrastructure noise.

### 3.7 Historical Memory

The platform should preserve learned knowledge across runs.

Required memory types:

- historical failure signatures
- known flaky selectors and screens
- supported interruption patterns by app/environment
- previous successful baselines
- common remediation patterns

Why this is necessary:

Without memory, every run is analyzed from scratch, which wastes time and tokens.

### 3.8 Governance And Cost Boundaries

AI-first does not reduce the need for control. It increases it.

Required controls:

- policy scopes per tool
- redaction for logs, screenshots, and network payloads
- destructive action gating
- artifact retention tiers
- heavy artifact and diagnostics sampling
- full audit trail for agent actions and evaluations

Why this is necessary:

An autonomous system can scale mistakes as easily as it scales value.

## 4. Priority Model

### P0: Must Exist For AI-First Execution

- Structured session state summary
- Deterministic action execution with explicit caveats
- Action-centered evidence packets
- Unified causal timeline
- Failure attribution primitives
- Interruption detection and recovery
- Environment control and reset semantics
- Policy scopes and audit trail

If these are missing, the system is still a collection of automation tools, not an AI-first execution platform.

### P1: High-Value Multipliers

- Historical memory and failure pattern reuse
- Baseline diff against previous successful runs
- Structured business-state probes
- Network/body/timing correlation
- Performance slowdown attribution
- Controlled runtime probes such as limited expression evaluation

These capabilities materially reduce repeated analysis cost and improve diagnosis accuracy.

### P2: Optional Or Domain-Specific Enhancements

- Rich human-facing debugger surfaces
- Advanced profiler views
- Continuous video intelligence
- Full source-level interactive debugger parity
- Broad visual AI fallback for weakly instrumented apps

These can be valuable, but they are not the first bottlenecks for AI-first E2E automation.

## 5. Mapping To The Current Repository

Current strengths:

- Session-oriented MCP tool model exists.
- Device listing, app launch, install, UI inspection, query, tap, type, and flow execution exist.
- Native logs, crash signals, diagnostics, and partial RN inspector evidence exist.
- Capability boundaries and policy concepts already exist in architecture docs.

Current gaps that matter most for AI-first:

- No single structured session state summary
- No first-class action-to-evidence correlation layer
- No unified cross-signal timeline
- No machine-ranked failure attribution layer
- No historical memory or baseline diff layer
- Limited environment control beyond the current adapter surface
- Limited business-state probing
- Limited interruption intelligence on iOS and broader app-specific cases

## 6. Capability Matrix Against Current Tools

This section translates the AI-first model into the current MCP surface.

### 6.1 Already Present In Some Form

- Session lifecycle: `start_session`, `end_session`
- Device discovery: `list_devices`, `doctor`
- App lifecycle: `install_app`, `launch_app`, `terminate_app`
- UI inspection: `inspect_ui`, `query_ui`, `resolve_ui_target`, `wait_for_ui`
- Action execution: `tap`, `tap_element`, `type_text`, `type_into_element`, `run_flow`
- Visual evidence: `take_screenshot`
- Native observability: `get_logs`, `get_crash_signals`, `collect_diagnostics`
- RN debug observability: `list_js_debug_targets`, `capture_js_console_logs`, `capture_js_network_events`
- Performance snapshots: `measure_android_performance`, `measure_ios_performance`
- AI-friendly evidence packet: `collect_debug_evidence`

These tools establish a useful execution and observability base, but they remain mostly tool-centric rather than AI decision-centric.

### 6.2 Partially Present But Not Yet AI-First

- Session timeline exists in the contract, but it is not yet a unified causal timeline across action, UI, logs, network, and performance.
- `collect_debug_evidence` summarizes evidence, but it is not yet a general post-action evidence layer.
- Capability profiles exist, but they do not yet expose enough AI-facing determinism, confidence, and caveat detail per action.
- UI resolution exists, but there is not yet a compact screen-state abstraction that tells the AI what screen it is on and whether the app is ready.
- Performance tools exist, but they are not yet correlated with specific user actions or failures.

### 6.3 Missing And High Priority

- `get_session_state`
- `get_screen_summary`
- `perform_action_with_evidence`
- `get_action_outcome`
- `explain_last_failure`
- `rank_failure_candidates`
- `recover_to_known_state`
- baseline and historical comparison tools

These are the tools that would move the system from "many useful adapters" to "AI-first execution substrate".

## 7. Suggested Contract Additions

The current contracts already have strong basics such as `status`, `reasonCode`, `artifacts`, `attempts`, and `nextSuggestions`.

To support AI-first execution, future tool contracts should add or standardize the following fields where relevant.

### 7.1 State Summary

Suggested fields:

- `screenId`
- `screenTitle`
- `routeName`
- `appPhase`: launching | ready | loading | blocked | backgrounded | crashed
- `readiness`: ready | waiting_network | waiting_ui | interrupted | unknown
- `visibleTargets`: compact list of likely actionable elements
- `blockingSignals`: overlays, permission prompts, spinners, toasts, dialogs
- `recentFailures`: recent network, exception, or crash summary

### 7.2 Action Outcome

Suggested fields:

- `actionIntent`
- `resolutionStrategy`: deterministic | semantic | ocr | cv
- `preStateSummary`
- `postStateSummary`
- `stateChanged`
- `uiDiffSummary`
- `networkDeltaSummary`
- `runtimeDeltaSummary`
- `retryCount`
- `fallbackUsed`
- `confidence`
- `retryRecommendationTier`
- `retryRecommendation`: `{ tier, reason, suggestedAction }`
- `actionabilityReview`: structured signal codes, for example:
  - `target_score_delta:<number>`
  - `target_suggested_selector:<json>`
  - `target_visibility:<heuristics>`
  - `refresh_signal:noop`
  - `retry_tier_code:refresh_context_noop | refresh_context_stale_state`

### 7.3 Failure Attribution

Suggested fields:

- `candidateCauses`
- `mostLikelyCause`
- `affectedLayer`
- `evidenceCompleteness`
- `missingEvidence`
- `recommendedNextProbe`
- `recommendedRecovery`

### 7.4 Historical Memory

Suggested fields:

- `failureSignature`
- `similarIncidents`
- `baselineRunId`
- `knownFlakyArea`
- `suggestedRemediation`

The goal is not to make every payload huge. The goal is to make the key decision signals explicit and stable.

## 8. Anti-Patterns For AI-First Design

The following patterns should be actively avoided.

### 8.1 Raw Artifact Dumps Without Summaries

Bad pattern:

- return a screenshot path
- return a 5,000-line log
- return no structured summary

Why it is harmful:

The AI spends tokens reconstructing state that the platform could have summarized once.

### 8.2 Low-Level Actions Without Outcome Interpretation

Bad pattern:

- perform `tap`
- return success because the input command was sent
- provide no statement about whether the app actually changed state

Why it is harmful:

For AI-first automation, transport success is weaker than outcome success.

### 8.3 Silent Determinism Downgrades

Bad pattern:

- fallback from stable selector to OCR
- do not record that fallback happened

Why it is harmful:

The AI loses the ability to distinguish product failure from tooling uncertainty.

### 8.4 Sessionless Diagnosis

Bad pattern:

- collect logs, screenshots, and UI dumps as unrelated artifacts
- do not preserve shared timestamps, action IDs, or causal links

Why it is harmful:

Without correlation, AI can only guess causality.

### 8.5 Human-First Surfaces Before AI Primitives

Bad pattern:

- build rich manual dashboards before adding machine-usable state summaries and attribution

Why it is harmful:

It produces good demos for humans while leaving the agent loop weak.

## 9. Recommended Tool Families

If this project continues in an AI-first direction, the next tool families should look like this.

### 9.1 State And Readiness

- `get_session_state`
- `get_screen_summary`
- `wait_until_ready`
- `get_environment_summary`

### 9.2 Action And Evidence

- `perform_action_with_evidence`
- `capture_post_action_evidence`
- `get_action_outcome`
- `compare_action_against_baseline`

### 9.3 Failure Analysis

- `explain_last_failure`
- `rank_failure_candidates`
- `link_action_to_signals`
- `summarize_missing_evidence`

### 9.4 Recovery

- `recover_to_known_state`
- `resolve_interruption_with_policy`
- `reset_app_or_session`
- `replay_last_stable_path`

### 9.5 Learning

- `record_failure_signature`
- `find_similar_failures`
- `suggest_known_remediation`

## 10. Suggested Delivery Order

Recommended order:

1. Build `get_session_state` and `get_screen_summary` first, because the AI cannot plan well without compact current-state visibility.
2. Build `perform_action_with_evidence` and `get_action_outcome` second, because action success needs to mean app-level outcome, not transport-level execution.
3. Add unified causal timeline and `explain_last_failure` third, so evidence becomes attributable instead of merely collected.
4. Add `recover_to_known_state` and interruption recovery fourth, so long-running sessions can self-heal.
5. Add historical memory, baseline diff, and known-remediation lookup fifth, so repeated failures become cheaper to analyze.
6. Add deeper runtime probes and broader framework-specific escape hatches only after the previous layers exist.

This order keeps the project aligned with AI-first execution instead of drifting toward human-first debugger parity.

## 11. Success Criteria

The platform is behaving like an AI-first execution system when the following become true.

- For a failed run, the agent can identify the failing step and likely layer without reading full raw logs by default.
- For a successful action, the system can explain what changed in the app, not only what command was sent.
- For a flaky failure, the platform can distinguish environment noise from product bugs with explicit evidence.
- For a repeated failure, the agent can reuse historical signatures or baselines instead of starting from zero.
- For a recovery-capable incident, the agent can return to a known-good state through bounded tools rather than ad hoc improvisation.

If these are not true, the project may still be useful, but it is not yet optimized for AI-first automation.

## 12. Implementation Companion

For a phase-by-phase implementation breakdown, package touch points, suggested contracts, sprint backlog, and acceptance criteria, see [`docs/delivery/ai-first-implementation-plan.md`](../delivery/ai-first-implementation-plan.md).
