# Mobile Developer Workflow Analysis & MCP Optimization Gaps

> Written from a mobile developer's perspective. Maps daily work to 6 core workflows, shows how each MCP tool chain helps today, and identifies concrete optimization gaps per link.

---

## 1. App Lifecycle Management

**What devs do:** Discover devices → install build → launch → clear state → terminate hung processes.

### Current MCP Chain

| Step | MCP Tool | Implementation Layer |
|------|----------|---------------------|
| Discover devices | `list_devices` | `adapter-maestro/src/device-runtime.ts` → `adb devices` / `simctl list` |
| Health check | `doctor` | `adapter-maestro/src/doctor-runtime.ts` — connectivity + backend probe |
| Install build | `install_app` | `device-runtime-android.ts` (`adb install`) / `device-runtime-ios.ts` (`devicectl install`) |
| Launch app | `launch_app` | `app-lifecycle-tools.ts` — monkey intent (Android) / devicectl process launch (iOS) |
| Reset state | `reset_app_state` | Strategy: `clear_data` / `uninstall_reinstall` / `keychain_reset` |
| Terminate | `terminate_app` | `am force-stop` (Android) / `devicectl process kill` (iOS) |

### Optimization Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **No warm-up / cold-start profiling** | Medium | `launch_app` fires and forgets. No measurement of first-frame render time, no detection of cold-start crash loops. A `warmup_app` tool that launches, waits for first stable frame, and reports TTI would catch regression before tests run. |
| **Missing deep-link entry verification** | Medium | `launch_app` accepts `launchUrl` but does not verify the deeplink actually routed to the expected screen. Post-launch `get_screen_summary` comparison against expected `screenId` would close this gap. |
| **No multi-app scenario** | Low-Medium | Real workflows often span host app + helper app (e.g., browser OAuth, payment SDK). Current chain assumes single `appId`. A `switch_app_context` tool with session-scoped app stack would enable cross-app flow testing. |
| **Install signature verification** | Low | iOS physical install silently fails on signing mismatch. The adapter catches this in startup evidence, but `install_app` itself should surface `codesign --verify` preflight before pushing the binary. |

---

## 2. UI Inspection & Targeting

**What devs do:** Dump UI tree → find element → verify it renders → get coordinates.

### Current MCP Chain

| Step | MCP Tool | Implementation Layer |
|------|----------|---------------------|
| Dump UI tree | `inspect_ui` | `adapter-maestro/src/ui-inspection-tools.ts` → `uiautomator dump` / `axe describe-ui` / WDA `/source` |
| Query by selector | `query_ui` | Same file — filters by text, role, resourceId, contentDesc with pagination |
| Resolve target | `resolve_ui_target` | `ui-tool-shared.ts` — disambiguation, returns coordinates + confidence |
| Scroll + resolve | `scroll_and_resolve_ui_target` | `ui-runtime-platform.ts` — scroll containers, retry resolution |
| Wait for appearance | `wait_for_ui` | Poll hierarchy until selector matches or timeout |

### Optimization Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **No element snapshot / visual diff** | High | `query_ui` returns a structural match but no visual baseline. Adding `capture_element_screenshot` (crop to element bounds) enables pixel-diff regression and AI visual verification. Currently the dev must manually compare full-screen screenshots. |
| **Flat selector priority, no learned ranking** | Medium | `resolve_ui_target` returns all matches with confidence scoring, but does not learn from past successful resolutions. A simple session-scoped "selector effectiveness cache" (resourceId that worked before → higher priority) would reduce ambiguity on repeated runs. |
| **No accessibility audit pass** | Medium | `inspect_ui` returns raw tree but does not flag missing accessibility labels, zero-size touch targets, or contrast issues. A `audit_accessibility` tool that scans the tree for common a11y violations would double as a developer productivity feature. |
| **WebView content blind spot** | Medium-High | WebView trees are often incomplete or merged poorly with native tree. Current adapter does not distinguish WebView nodes, making `query_ui` unreliable for hybrid screens. A `detect_webview` + `switch_to_webview_context` lane (via Chrome DevTools Protocol on Android, Safari inspector on iOS) is missing. |
| **Scroll heuristics are generic** | Low-Medium | `scroll_and_resolve_ui_target` scrolls containers but does not know scroll direction hints from the action intent. Passing `scrollDirection` and `maxScrollAttempts` from the caller would reduce overscroll on known layouts. |

---

## 3. UI Interaction

**What devs do:** Tap buttons → type text → scroll lists → verify outcome.

### Current MCP Chain

| Step | MCP Tool | Implementation Layer |
|------|----------|---------------------|
| Tap element | `tap_element` | `adapter-maestro/src/ui-action-tools.ts` → `tapResolvedTarget` — resolve + tap, unambiguous only |
| Coordinate tap | `tap` | Direct coordinate tap via `adb shell input tap` / `axe tap` / WDA `wda/tap` |
| Scroll + tap | `scroll_and_tap_element` | Scroll containers, resolve, then tap |
| Type text | `type_text` | `adb shell input text` / `axe type` / WDA `wda/keys` |
| Type into field | `type_into_element` | Resolve field + type in one call |

### Optimization Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **No gesture composition** | High | Real interactions include long-press, drag-and-drop, pinch-to-zoom, multi-finger swipe. Current chain only exposes `tap`, `type`, and the adapter's internal `swipe`. Exposing `long_press`, `drag`, and `multi_swipe` as first-class MCP tools would cover 80%+ of missing gesture scenarios. |
| **No keyboard state awareness** | Medium | `type_into_element` does not check if soft keyboard is already visible before typing. On Android, this causes double-keyboard overlap and coordinate shifts. A `keyboard_state` probe (visible/hidden/IME type) before type actions would prevent this. |
| **No haptic/audio feedback verification** | Low | After interaction, some screens rely on haptic or audio cues. No tool captures these signals. Not critical for E2E correctness, but valuable for UX regression. |
| **iOS physical device action flow generation is opaque** | Medium | `buildIosPhysicalActionFlowPaths` generates Maestro YAML flows for physical devices, but the generated flows are not exposed back to the caller. Returning the generated YAML path in the tool result would let devs inspect and reuse the flow. |
| **No atomic multi-action composition** | Medium-High | Some interactions require atomic sequences (e.g., pull-to-refresh = swipe down + hold + release). Currently each action is a separate MCP call with full pre/post state capture between them. A `compose_actions` tool that executes N actions atomically (single pre + single post snapshot) would be faster and more accurate for gesture sequences. |

---

## 4. Diagnostics & Debugging

**What devs do:** Check logs → investigate crashes → capture screenshots → understand root cause.

### Current MCP Chain

| Step | MCP Tool | Implementation Layer |
|------|----------|---------------------|
| Get logs | `get_logs` | `device-runtime.ts` → `adb logcat` / simctl logs / devicectl logs |
| Crash signals | `get_crash_signals` | `diagnostics-pull.ts` — ANR traces / `devicectl info crashes` |
| Full diagnostics | `collect_diagnostics` | Android bugreport / iOS diagnostics bundle |
| Debug evidence | `collect_debug_evidence` | `diagnostics-tools.ts` — merges logs + crash + JS console + JS network + iOS startup evidence into a structured packet |
| Screen summary | `get_screen_summary` | `session-state.ts` — builds `StateSummary` from UI tree + log signals + crash signals |
| Session state | `get_session_state` | Same + persists to session timeline + returns capability profile |
| JS console (RN) | `capture_js_console_logs` | `js-debug.ts` — Metro inspector WebSocket |
| JS network (RN) | `capture_js_network_events` | Same — network failure snapshot |
| Performance | `measure_android_performance` / `measure_ios_performance` | `performance-tools.ts` — Perfetto / xctrace trace window |

### Optimization Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **JS debug lane is RN-only, not Flutter** | High | `js-debug.ts` targets Metro inspector. Flutter's DevTools use a different protocol (Dart VM Service). No equivalent `capture_flutter_devtools_events` exists. Adding a Flutter debug lane (via `flutter attach` or DDS WebSocket) would make the MCP framework-profile-agnostic. |
| **Network evidence is passive capture, not active interception** | Medium-High | `capture_js_network_events` captures failures from Metro inspector but cannot intercept all traffic, add latency, or mock responses. Integrating a proxy layer (e.g., mitmadb for Android, or a local HTTP proxy for iOS simulator) would enable active network testing: latency injection, error simulation, response mocking. |
| **No log streaming mode** | Medium | `get_logs` is one-shot: captures N lines since T seconds ago. For real-time debugging during a flow, a `tail_logs` streaming mode (WebSocket or SSE) would let devs watch logs as actions execute. |
| **Crash attribution is signal-based, not stack-trace-level** | Medium | `get_crash_signals` returns top signals and samples but does not parse native stack traces. Adding a `parse_crash_stack` step that maps native addresses to symbolicated frames (via `ndk-stack` on Android, `atos` on iOS) would turn signal summaries into actionable stack traces. |
| **Performance traces are manual windows** | Low-Medium | `measure_android_performance` and `measure_ios_performance` capture a time window but require the caller to know start/end timing. A `benchmark_action_performance` tool that wraps a single `perform_action_with_evidence` call with automatic Perfetto/xctrace start/stop would make performance testing a one-liner. |
| **No visual regression baseline** | Medium | Screenshots are captured but never compared against a baseline. Adding a `compare_screenshot_baseline` tool (pixel diff with configurable threshold, stored under `baselines/{screenId}.png`) would add visual regression to the diagnostic toolkit. |

---

## 5. Failure Analysis & Recovery

**What devs do:** Detect failure → attribute cause → recover state → retry → verify.

### Current MCP Chain

| Step | MCP Tool | Implementation Layer |
|------|----------|---------------------|
| Detect interruption | `detect_interruption` | `interruption-detector.ts` — structural change, system ownership, blocking signals |
| Classify interruption | `classify_interruption` | `interruption-classifier.ts` — type + confidence scoring |
| Resolve interruption | `resolve_interruption` | `interruption-resolver.ts` — policy-driven dismiss/continue/deny |
| Resume action | `resume_interrupted_action` | `interruption-orchestrator.ts` — replay from checkpoint with drift detection |
| Perform + evidence | `perform_action_with_evidence` | `action-orchestrator.ts` — pre-state → execute → post-state → OCR fallback → retry loop |
| Explain failure | `explain_last_failure` | `action-orchestrator-model.ts` — `classifyActionFailureCategory` + reason mapping |
| Rank candidates | `rank_failure_candidates` | Multi-layer attribution (network → app → UI → platform → policy) |
| Find similar | `find_similar_failures` | Local pattern matching against historical failure signatures |
| Remediation | `suggest_known_remediation` | Built-in readiness skill routing + local baseline matching |
| Recovery | `recover_to_known_state` | `recovery-tools.ts` — relaunch / wait / clear data strategies |
| Replay stable | `replay_last_stable_path` | Same — replay last successful action from session history |

### Optimization Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **No network-aware orchestration** | High | The codebase has `network-anomaly-runtime-architecture.md` documenting the design, but the current `action-orchestrator.ts` only classifies `waiting_network`, `offline_terminal`, and `backend_failed_terminal` as readiness states. It does not actively probe network health, retry with backoff tuned to network type, or suggest network-specific recovery (e.g., toggle airplane mode, switch WiFi/cellular). The network anomaly runtime is documented but not fully implemented. |
| **No multi-step checkpoint chain** | High | `replay_last_stable_path` replays the *last single* successful action. Real failures often occur mid-flow after N successful steps. A `replay_checkpoint_chain` tool that identifies the last stable checkpoint and replays all subsequent low-risk actions would close the multi-step robustness gap documented in `04-runtime-architecture.md` §7.3. |
| **Historical failure memory is session-scoped** | Medium | `find_similar_failures` matches within the current session's local records. Cross-session, cross-build historical failure patterns are not persisted. A `failure_pattern_index` (e.g., under `.mcp/failures/`) that accumulates failure signatures across runs would enable "this same tap fails on Android 14 every time" detection. |
| **Recovery strategies are shallow** | Medium | `recover_to_known_state` currently supports: relaunch app, wait_until_ready, and stop on terminal states. Missing: `clear_app_data` as a bounded recovery (high-risk write scope), `navigate_back` to escape wrong screen, `force_permission_grant` for stuck permission dialogs. |
| **No flakiness scoring** | Medium | There is no mechanism to track "this action fails 30% of the time" across runs. A `flakiness_score` per action type + selector combination would help devs distinguish "broken" from "flaky". |
| **OCR fallback does not learn from failures** | Low-Medium | `action-orchestrator-ocr.ts` executes OCR fallback with confidence thresholds but does not record which OCR regions matched/didn't match. Feeding OCR resolution results back into a "region effectiveness cache" would improve future OCR targeting. |
| **Remediation suggestions are template-based** | Medium | `suggest_known_remediation` uses built-in routing logic and local baseline matching. It does not leverage LLM-generated remediation proposals. An optional `--ai-remediate` flag that sends the failure packet to an LLM for structured remediation suggestions would close the L4 (Agentic) maturity gap. |

---

## 6. Session & Flow Management

**What devs do:** Plan test scenario → record manual flow → export for CI → replay regression.

### Current MCP Chain

| Step | MCP Tool | Implementation Layer |
|------|----------|---------------------|
| Start session | `start_session` | Creates session record with policy profile, platform, device, app |
| Record flow | `start_record_session` → `end_record_session` | `recording-runtime.ts` — maps platform events to replayable actions |
| Export to Maestro | `export_session_flow` | `recording-mapper.ts` — converts session actions to Maestro YAML |
| Run flow | `run_flow` | `flow-runtime.ts` — executes Maestro flow through adapter |
| Task execution | `execute_intent` / `complete_task` | `task-planner.ts` — high-level intent → bounded multi-step action |
| End session | `end_session` | Closes session, emits final metadata |

### Optimization Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **No flow validation before export** | High | `export_session_flow` converts recorded actions to Maestro YAML but does not validate the generated flow against the current app state. A `validate_flow` dry-run that executes each step in the generated flow and reports which steps would fail on the current build would catch drift before CI. |
| **No conditional branching in recorded flows** | Medium | Recorded flows are linear sequences. Real test scenarios need conditionals: "if element X is visible, do Y, else do Z". The `task-planner.ts` has intent-to-action mapping but no conditional logic encoding. Adding `if_visible`, `if_network_ok` branches to the flow format would make exported flows more robust. |
| **No parallel device execution** | Medium | `run_flow` executes on a single device/session. Regression suites benefit from running the same flow across multiple devices (Android emulator + iOS simulator + real device) in parallel. A `run_flow_parallel` tool that fans out to multiple sessions and aggregates results would multiply throughput. |
| **No flow versioning / diff** | Low-Medium | Exported flows are written to disk but not versioned. A `diff_flow` tool that compares two versions of a flow YAML and reports added/removed/changed steps would help teams understand what changed in their automation suite. |
| **No data-driven flow parameterization** | Medium | Recorded flows use concrete values (specific search text, specific product). A `parameterize_flow` tool that identifies variable inputs and replaces them with placeholders + data file references would enable data-driven testing (e.g., login with 10 different credential sets). |
| **No CI/CD pipeline integration** | Medium | Flows are exported as Maestro YAML but there is no built-in CI integration. A `generate_ci_config` tool that produces GitHub Actions / GitLab CI / Jenkins pipeline configs for running the exported flows would close the delivery loop. |

---

## 7. Cross-Cutting Optimization Opportunities

These gaps span multiple workflow chains and represent structural improvements to the MCP platform itself.

| Gap | Affected Chains | Description |
|-----|----------------|-------------|
| **Structured state schema evolution** | All chains | `StateSummary` in `session-state.ts` is inferred from signals (text matching on UI tree). It works but is fragile. A more robust approach would use platform-native state APIs (e.g., `AccessibilityService.getState()` on Android, `XCUIElementQuery` state on iOS) as primary state sources, with signal inference as fallback. |
| **Tool composition / pipeline DSL** | All chains | Currently each tool is a standalone call. A `pipeline` tool that chains N tools with conditional branching (e.g., `if inspect_ui shows alert → resolve_interruption → tap_element`) would reduce the orchestration burden on the caller. The `execute_intent` and `complete_task` tools are steps in this direction but are not yet a general-purpose composition surface. |
| **Deterministic replay across sessions** | Session, Recovery | Session records are persisted under `.mcp/sessions/` but replay is limited to `replay_last_stable_path` (single action). Full session replay (start → all actions → end) with per-step verification would enable "reproduce this exact session on a different device" workflows. |
| **Policy profile management UX** | All chains | Policy profiles (read-only / interactive / full-control) are defined in `configs/policies/*.yaml` but there is no MCP tool to preview, test, or modify them. A `policy_preview` + `policy_test` tool would let devs understand what scopes their current profile allows before hitting denials. |
| **Real-device farm integration** | Lifecycle, Session | The current model assumes local device/emulator/simulator. Cloud device farms (Firebase Test Lab, BrowserStack, Sauce Labs) are not supported as execution targets. A `farm_adapter` that routes actions to remote devices with the same MCP interface would enable scale-out testing. |
| **Framework profile maturity: Flutter** | Inspection, Interaction | Flutter's semantic tree quality depends heavily on app instrumentation. The current adapter treats Flutter surfaces the same as native, leading to higher fallback rates. A dedicated `flutter_semantic_coverage` audit tool that reports which Flutter widgets have semantics labels and which don't would help Flutter teams instrument their apps for better automation. |

---

## 8. Priority Matrix

Based on impact × implementation effort, here is the recommended prioritization:

| Priority | Gap | Impact | Effort | Target Chain |
|----------|-----|--------|--------|-------------|
| P0 | Network-aware orchestration | High | Medium | Failure Analysis |
| P0 | Multi-step checkpoint chain | High | Medium | Failure Analysis |
| P0 | No flow validation before export | High | Low | Session & Flow |
| P0 | Element snapshot / visual diff | High | Low | UI Inspection |
| P1 | No gesture composition | High | Medium | UI Interaction |
| P1 | JS debug lane: Flutter support | High | Medium | Diagnostics |
| P1 | Historical failure memory (cross-session) | Medium | Medium | Failure Analysis |
| P1 | WebView context detection | Medium-High | Medium | UI Inspection |
| P2 | Flakiness scoring | Medium | Low | Failure Analysis |
| P2 | Visual regression baseline | Medium | Medium | Diagnostics |
| P2 | Tool composition / pipeline DSL | High | High | Cross-cutting |
| P2 | Parallel device execution | Medium | Medium | Session & Flow |
| P3 | Accessibility audit pass | Medium | Low | UI Inspection |
| P3 | Log streaming mode | Medium | Low | Diagnostics |
| P3 | Policy profile management UX | Medium | Low | Cross-cutting |

---

## 9. Maturity Roadmap Alignment

Mapping gaps to the capability maturity levels defined in `03-capability-model.md`:

| Maturity Level | Current State | Gap to Close |
|----------------|--------------|-------------|
| **L1 (MVP)** ✅ | Device selection, app lifecycle, screenshot, tree, tap/type, basic interruption | Complete |
| **L2 (Stability)** 🔄 | Partial — flakiness controls, retries, reason codes exist but network-aware orchestration and multi-step replay are missing | P0 gaps above |
| **L3 (Scale)** ❌ | Not started — multi-device orchestration, parallel sessions, cloud farm integration | Parallel execution, farm adapter |
| **L4 (Agentic)** ❌ | Not started — goal-to-flow planning, self-healing, automatic bug packets | AI remediation, pipeline DSL, task planner maturity |
| **L5 (Enterprise)** ❌ | Not started — RBAC, compliance exports, approval workflows | Policy UX, audit trail exports |

---

## Appendix A: File Reference Map

| Component | Primary File |
|-----------|-------------|
| MCP tool registry | `packages/mcp-server/src/server.ts` |
| MCP tool wrappers | `packages/mcp-server/src/tools/*.ts` |
| Action orchestrator | `packages/adapter-maestro/src/action-orchestrator.ts` |
| Action orchestrator model | `packages/adapter-maestro/src/action-orchestrator-model.ts` |
| OCR fallback | `packages/adapter-maestro/src/action-orchestrator-ocr.ts` |
| Session state | `packages/adapter-maestro/src/session-state.ts` |
| Recovery tools | `packages/adapter-maestro/src/recovery-tools.ts` |
| Diagnostics | `packages/adapter-maestro/src/diagnostics-tools.ts` |
| Interruption orchestrator | `packages/adapter-maestro/src/interruption-orchestrator.ts` |
| JS debug | `packages/adapter-maestro/src/js-debug.ts` |
| Recording runtime | `packages/adapter-maestro/src/recording-runtime.ts` |
| Task planner | `packages/adapter-maestro/src/task-planner.ts` |
| UI inspection | `packages/adapter-maestro/src/ui-inspection-tools.ts` |
| UI action tools | `packages/adapter-maestro/src/ui-action-tools.ts` |
| Performance tools | `packages/adapter-maestro/src/performance-tools.ts` |
| Contracts | `packages/contracts/src/types.ts` |
| Policy engine | `packages/core/src/policy-engine.ts` |
| Governance | `packages/core/src/governance.ts` |
