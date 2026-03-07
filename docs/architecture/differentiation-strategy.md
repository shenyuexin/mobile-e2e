# Differentiation Strategy (2026-2027)

## 1. Goals

Create defensible product advantages beyond being a wrapper around existing automation tools.

---

## 2. Practical Differentiators

## D1. Semantic View-Tree Diffing (Quick Win)

Instead of pixel-only visual regression, compare semantic structure and intent in view trees.

Example assertion intent:

- "Primary checkout CTA exists below cart list; no error banner shown."

Value:

- Fewer false positives from non-functional visual changes.

## D2. Dynamic Network Fault Injection (No App Rebuild)

Support controlled network behavior mutation (latency/error/malformed payload) in test sessions.

Value:

- Faster edge-case validation without custom app instrumentation.

## D3. Self-Healing Selector Suggestions

When deterministic selectors fail but fallback succeeds, generate candidate selector updates as reviewable patch suggestions.

Value:

- Reduce long-term selector maintenance burden.

## D4. Time-Travel State Rehydration

Allow direct state setup + deep-link handoff to jump into deep screens quickly.

Value:

- Large reduction in end-to-end setup time.

## D5. Multi-Device Orchestration

Support coordinated actions/assertions across multiple devices in one session context.

Value:

- High-value scenarios (chat, realtime collaboration, marketplace dual roles).

## D6. Agentic Exploratory Chaos (Long-term)

Constrained autonomous exploration to discover unknown failure paths and produce reproducible scripts.

Value:

- Finds defects not covered by scripted scenarios.

---

## 3. Delivery Placement

- Near-term: D1, D2
- Mid-term: D3, D4
- Expansion: D5
- R&D moonshot: D6

---

## 4. Risk Notes

- Any auto-healing output should be proposal-only by default (human-reviewed patch).
- Dynamic network tooling needs strict policy control and environment scoping.
- Exploratory chaos needs guardrails to prevent unbounded loops.
