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
- keyboard state normalization
- deterministic timeouts by action class
- post-action verification hooks

---

## 6.1 Execution State Machine and Fallback Policy

Required ordered state transitions:

1. Resolve stable locator (deterministic).
2. Execute platform-native action.
3. Verify post-condition.
4. If resolution/action fails, evaluate fallback eligibility:
   - allow app test hook path (if available)
   - allow OCR/CV only under bounded policy
5. If bounded fallback fails, hard fail with reasonCode + artifacts.

Prohibited transitions:

- OCR/CV as first action path for standard controls.
- Unbounded retry loops without state change evidence.
- Silent downgrade from deterministic to probabilistic without telemetry.

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
