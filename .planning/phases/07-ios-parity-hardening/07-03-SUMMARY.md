---
phase: 07-ios-parity-hardening
plan: 03
summary_type: internal-planning
task_type: feature
completed: 2026-04-03
requirements_completed: []
key_files:
  created:
    - .planning/phases/07-ios-parity-hardening/07-03-SUMMARY.md
    - .planning/phases/07-ios-parity-hardening/07-03-VERIFY.md
  modified: []
repo_truth_synced:
  - packages/adapter-maestro/src/ui-model.ts
  - packages/adapter-maestro/src/ui-runtime.ts
  - packages/adapter-maestro/src/ui-runtime-ios.ts
  - packages/adapter-maestro/test/ui-model.test.ts
  - packages/adapter-maestro/test/ui-runtime.test.ts
verify_file: 07-03-VERIFY.md
---

# Phase 07 Plan 03 Summary

## Meta
- Task ID: 07-03
- Date: 2026-04-03
- Repo: mobile-e2e-mcp
- Branch: main
- Owner: OpenCode agent
- Type: feature

## Goal

### Problem
iOS selector-driven actions were weaker than Android because hierarchy normalization, ambiguity handling, visibility gating, and post-action verification were not yet strong enough to keep deterministic action flows trustworthy.

### Expected Outcome
- [x] iOS query/resolve/tap/type/wait flows now use stronger selector semantics and bounded ambiguity reporting.
- [x] Post-action confidence for iOS taps and text entry is now backed by runtime verification instead of transport success alone.
- [x] The adapter test suite now locks the iOS selector/action fidelity behavior behind explicit regression coverage.

### Non-goals
- Replacing the chosen iOS backend direction from 07-02.
- Claiming support promotion from partial to stronger public support.
- Folding recording or evidence work into the selector/action closure itself.

## Plan

### Strategy
Strengthen the iOS action path in place by improving selector normalization and resolution in the model layer, then harden runtime-side visibility, target verification, and postcondition checks so iOS actions degrade honestly instead of optimistically.

### Task Breakdown
1. Harden iOS selector normalization, exact-match preference, and ambiguity/off-screen handling in the UI model layer.
2. Add stronger runtime verification for iOS taps, describe-point confirmation, visibility gating, and typed-field postconditions.
3. Extend iOS UI runtime handling to reject obviously unusable hierarchy captures instead of pretending inspection succeeded.
4. Lock the new behavior with regression tests across `ui-model.test.ts` and `ui-runtime.test.ts`.

### Risks / Unknowns
- Mixed SwiftUI/UIKit and hybrid hierarchies can still produce weaker semantics than Android even after the new ranking and verification guards.
- Runtime verification adds bounded extra checks, so future regressions must keep retry behavior honest rather than stretching action loops indefinitely.

### Done Criteria
- [x] Selector fidelity work is now split across model-layer semantics and runtime-layer verification rather than hidden in transport success.
- [x] iOS ambiguity, visibility, and postcondition behavior are covered by named regression tests.
- [x] The action path now fails honestly when hierarchy capture is degenerate instead of misreporting inspectable state.

## Implement

### Changes
- `packages/adapter-maestro/src/ui-model.ts` — strengthened iOS selector normalization, exact-match resolution, visibility scoring, and ambiguity/off-screen reasoning.
- `packages/adapter-maestro/src/ui-runtime-ios.ts` — added stronger iOS-native locator, describe-point verification, tap safety, and typed-field postcondition hooks.
- `packages/adapter-maestro/src/ui-runtime.ts` — now rejects degenerate root-only iOS hierarchy captures and feeds the stronger snapshot semantics into shared wait/scroll loops.
- `packages/adapter-maestro/test/ui-model.test.ts` — locks iOS selector resolution, visibility, and fallback expectations.
- `packages/adapter-maestro/test/ui-runtime.test.ts` — locks degenerate snapshot handling plus iOS wait/scroll runtime behavior.

### Key Decisions
- Transport success is not enough for iOS actions; runtime verification and postconditions must remain part of the success path.
- Low-visibility or off-screen matches should stay unresolved instead of being silently treated as actionable.
- Degenerate iOS hierarchy payloads are a runtime-readiness problem, not a successful inspect result.

### Notes
- This slice closes the selector/action fidelity workstream without changing the higher-level support labels; iOS can still stay partial while the runtime gets stronger.

### Deviations
- None — the shipped code aligns with the planned 07-03 scope.

## Verify

### Test Cases
- [x] iOS selector semantics prefer stronger exact matches, preserve ambiguity, and keep off-screen targets unresolved.
- [x] iOS runtime verification guards taps/type actions with describe-point and postcondition checks.
- [x] Degenerate iOS hierarchy captures now fail as unusable runtime snapshots rather than successful inspections.

### Evidence Types
- [x] test
- [x] command
- [ ] screenshot
- [ ] log

### Evidence
```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro exec tsx --test test/ui-model.test.ts test/ui-runtime.test.ts
# PASS — iOS selector/action regression coverage remains green, including degenerate snapshot handling.
```

- Artifact / diff / readback:
  - Local unpushed commits include the selector/action hardening series (`a1ca772`, `62ed0cc`, `0c9aedc`, `80c8fd5`, `ce6805d`, `a9cc992`, `17ffe95`, `07cf6e1`, `e2768fc`, `d6ff7a5`, `e15285f`, `b689cd2`, `5c2093b`, `0df21da`) and the remaining uncommitted `ui-runtime.ts` / `ui-runtime.test.ts` degenerate snapshot guard.

### Result
- ✅ Success

### Execution Metrics
- Duration: cumulative multi-commit runtime hardening slice
- Verification scenarios run: selector model + runtime regression lanes
- Environments checked: local adapter-maestro test environment
- Notable evidence count: model/runtime regression suites + commit-series readback

## Retro

### What went well
- The existing split between `ui-model.ts` and `ui-runtime*.ts` made it possible to improve selector semantics and runtime verification without inventing new tool surfaces.

### What went wrong
- Planning drift made this slice look open even though the runtime work had already shipped across many commits.

### Reusable Rule
- If iOS action confidence improves through multiple small runtime/model commits, then close the matching planning slice with summary/verify artifacts promptly, because otherwise the planning workspace will under-report shipped parity work.

### Optimization Ideas
- Future iOS fidelity slices should create the summary/verify pair as soon as the regression suite stabilizes instead of deferring closure until a later planning sync.

## Source-of-Truth Sync

- Formal repo truth affected: yes
- If yes, where it was updated: [`packages/adapter-maestro/src/ui-model.ts`, `packages/adapter-maestro/src/ui-runtime.ts`, `packages/adapter-maestro/src/ui-runtime-ios.ts`, `packages/adapter-maestro/test/ui-model.test.ts`, `packages/adapter-maestro/test/ui-runtime.test.ts`]

## Next Step

- Ready for `07-04-PLAN.md`
