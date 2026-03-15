# Reference Architecture

## 1. High-Level Topology

```text
AI Agent(s)
   |
   v
MCP API Gateway
   |
   +--> Session Manager
   +--> Planner/Executor
   +--> Policy Engine
   +--> Artifact Store
   +--> Interruption Manager
   +--> Adapter Router
              |
              +--> Android Adapter(s)
              +--> iOS Adapter(s)
              +--> RN Debug Adapter
              +--> Visual Fallback Adapter
```

---

## 2. Control Plane vs Execution Plane

## Control Plane

- MCP tool registration and schema contracts.
- AuthZ/AuthN and policy checks.
- Session lifecycle and run orchestration.
- Audit, telemetry, and artifact indexing.

## Execution Plane

- Platform-specific action execution.
- Element resolution and retries.
- Interruption detection and handling.
- Screenshot/OCR/CV fallback orchestration.
- Device and app-level diagnostics collection.

---

## 2.1 AUT Contract for Deterministic Automation

Each app onboarded to the platform must satisfy a minimum App-Under-Test contract:

1. Stable IDs/identifiers for critical interactive elements.
2. Accessibility semantics for key controls and states.
3. Deterministic entry points (deep links/test hooks) for critical flows.
4. Reset semantics (session/data/environment) documented.
5. Loading and ready-state conventions defined.

Without this contract, deterministic guarantees are downgraded and OCR/CV usage rises.

---

## 3. Session Model

Session payload should include:

- sessionId
- target (platform, device UDID/serial, app identifiers)
- environment metadata (OS version, app build, locale)
- policy profile (read-only vs full control)
- action timeline
- artifacts pointers (screenshots, logs, trees, crashes, videos)

This is required for reproducibility and safe handoff.

---

## 4. Tool Contract Standards

All MCP tools should return:

- `status`: success | failed | partial
- `reasonCode`: deterministic enum (e.g., ELEMENT_NOT_FOUND, OVERLAY_BLOCKING)
- `durationMs`
- `attempts`
- `artifacts`: references
- `nextSuggestions`: optional actionable hints

Do not return raw strings only. Return structured, machine-consumable envelopes.

Canonical fields for adapter conformance:

- operation name
- idempotency class
- timeout default
- maximum retries
- fallback eligibility
- required policy scope

---

## 5. Adapter Router

For code ownership inside the current TypeScript adapter implementation, see [`docs/architecture/adapter-code-placement.md`](./adapter-code-placement.md).

For the current React Native debugger sequence and the capability gap from Metro inspector snapshots to a full debugger, see [`docs/architecture/rn-debugger-sequence.md`](./rn-debugger-sequence.md).

For the broader AI-first capability model of the project, including required state, evidence, attribution, recovery, memory, and governance layers, see [`docs/architecture/ai-first-capability-model.md`](./ai-first-capability-model.md).

Routing policy should evaluate:

1. Platform (Android/iOS)
2. Target environment (emulator/simulator/real device)
3. Framework context (native/RN/Flutter)
4. Required capability (tree, logs, performance, action)
5. Policy constraints

Router output:

- selected adapter
- confidence
- fallback chain

---

## 6. Reliability Controls

- UI stability wait (layout hash unchanged threshold)
- bounded retries with reason-aware backoff
- overlay detection before action
- system alert / action sheet / permission prompt detection
- keyboard state normalization
- deterministic timeouts by action class
- post-action verification hooks

---

## 6.1 Execution State Machine and Fallback Policy

Required ordered state transitions:

1. Resolve stable locator (deterministic).
2. Execute platform-native action.
3. Detect interruption window before post-condition check.
4. If interruption is present, resolve via interruption policy.
5. Verify post-condition.
6. If resolution/action fails, evaluate fallback eligibility:
   - allow app test hook path (if available)
   - allow OCR/CV only under bounded policy
7. If bounded fallback fails, hard fail with reasonCode + artifacts.

Prohibited transitions:

- OCR/CV as first action path for standard controls.
- Unbounded retry loops without state change evidence.
- Silent downgrade from deterministic to probabilistic without telemetry.

---

## 6.3 Interruption Manager

The Interruption Manager is responsible for handling transient UI that can invalidate otherwise-correct automation flows.

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

Interruption Orchestrator v2 implementation notes:

- Add explicit tool surface for `detect_interruption`, `classify_interruption`, `resolve_interruption`, and `resume_interrupted_action`.
- Keep deterministic-first action execution while injecting pre/post interruption guard checks around bounded actions.
- Persist interruption events into session timeline with explicit `interruption_detected` / `interruption_resolved` / `interrupted_action_resumed` markers.

Interruption handling is deterministic-first and policy-driven. It must not silently dismiss unknown prompts without recording evidence.

---

## 6.2 Session and Device Control Model

Deterministic session requirements:

- Device leasing/locking model.
- Environment setup profile (locale/timezone/network/permissions).
- Cleanup/reset on session end.
- Artifact bundling with immutable session IDs.
- Isolation mode (local dev, CI, shared environment).

---

## 7. Visual Fallback Architecture

Primary: accessibility tree.

Fallback path:

1. Capture screenshot
2. Preprocess (contrast/invert/denoise)
3. OCR detect text regions
4. Map target intent to region
5. Inject coordinate action
6. Validate via post-action tree/screen change

CV template fallback reserved for icon-only UIs.
