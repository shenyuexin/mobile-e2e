---
phase: 07-ios-parity-hardening
plan: 04
summary_type: internal-planning
task_type: feature
completed: 2026-04-03
requirements_completed: []
key_files:
  created:
    - .planning/phases/07-ios-parity-hardening/07-04-SUMMARY.md
    - .planning/phases/07-ios-parity-hardening/07-04-VERIFY.md
  modified: []
repo_truth_synced:
  - packages/adapter-maestro/src/recording-runtime-ios.ts
  - packages/adapter-maestro/src/recording-runtime-platform.ts
  - packages/adapter-maestro/src/recording-mapper.ts
  - packages/adapter-maestro/test/recording-runtime.test.ts
  - packages/adapter-maestro/test/recording-mapper.test.ts
verify_file: 07-04-VERIFY.md
---

# Phase 07 Plan 04 Summary

## Meta
- Task ID: 07-04
- Date: 2026-04-03
- Repo: mobile-e2e-mcp
- Branch: main
- Owner: OpenCode agent
- Type: feature

## Goal

### Problem
iOS recording and replay output lagged Android because capture context, selector recovery, timestamp handling, and replayable step generation still degraded too easily into weak or coordinate-heavy output.

### Expected Outcome
- [x] iOS recording capture and replay mapping now preserve stronger selector-driven semantics.
- [x] Timestamp and carried-input handling now avoid common iOS replay corruption cases.
- [x] The adapter tests now lock the iOS recording/replay behavior behind explicit regression coverage.

### Non-goals
- Claiming full real-device recording parity.
- Rewriting general replay orchestration outside the iOS fidelity workstream.
- Promoting iOS support levels based only on recording improvements.

## Plan

### Strategy
Use the existing recording runtime and mapper seams to harden iOS capture and replay quality incrementally: preserve better selector identity, reduce accidental coordinate fallback, and keep weak-confidence paths explicit instead of pretending replay quality improved automatically.

### Task Breakdown
1. Strengthen iOS recording runtime/device handling and snapshot anchoring.
2. Improve selector recovery, input-target carry rules, and replay step rendering in `recording-mapper.ts`.
3. Preserve timestamp correctness and identifier-backed replay output for iOS-specific event streams.
4. Add regression tests that prove selector-driven replay stays stronger and weak fallbacks remain explicit.

### Risks / Unknowns
- iOS raw event sources still impose intrinsic ambiguity in some scenarios, so selector recovery must stay confidence-aware.
- Real-device capture maturity can still lag simulator capture even when replay mapping improves.

### Done Criteria
- [x] Recording/replay quality is now improved through capture, mapping, and replay-output changes rather than cosmetic YAML differences.
- [x] Weak-confidence fallbacks remain visible instead of being hidden behind optimistic replay output.
- [x] Regression coverage exists for iOS identifier export, timestamp stability, and carried-target behavior.

## Implement

### Changes
- `packages/adapter-maestro/src/recording-runtime-ios.ts` — strengthened iOS recording capture/device handling and event timing support.
- `packages/adapter-maestro/src/recording-runtime-platform.ts` — preserved platform-specific recording dispatch semantics for the improved iOS lane.
- `packages/adapter-maestro/src/recording-mapper.ts` — tightened iOS selector recovery, carried-input rules, identifier export, and replay rendering behavior.
- `packages/adapter-maestro/test/recording-runtime.test.ts` — covers iOS event parsing, timestamp mapping, and snapshot anchoring.
- `packages/adapter-maestro/test/recording-mapper.test.ts` — covers identifier-backed replay output, fallback degradation, and replay-step generation rules.

### Key Decisions
- Replay quality is measured by selector-driven output and visible confidence semantics, not by raw event capture alone.
- Timestamp stability and carried-target rules are correctness issues, not formatting details.
- Simulator and real-device maturity remain separate support questions even when the shared mapper improves.

### Notes
- This slice closes the iOS recording/replay hardening track without changing the higher-level support label or claiming full real-device capture maturity.

### Deviations
- None — executed within the planned recording/replay scope.

## Verify

### Test Cases
- [x] iOS recording preserves stable timestamps and selector-carry behavior.
- [x] Replay output prefers identifier-backed steps and degrades weak selectors honestly.
- [x] Recording/replay regression coverage exists in the adapter test suite.

### Evidence Types
- [x] test
- [x] command
- [ ] screenshot
- [ ] log

### Evidence
```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro exec tsx --test test/recording-runtime.test.ts test/recording-mapper.test.ts
# PASS — iOS recording and replay fidelity regressions remain green.
```

- Artifact / diff / readback:
  - Local unpushed commits include the recording/replay hardening series (`7a86ecd`, `8589d1f`, `7c8d429`, `21c330d`, `7e6f158`) covering selector promotion, timestamp stability, and replay mapping correctness.

### Result
- ✅ Success

### Execution Metrics
- Duration: cumulative multi-commit recording/replay hardening slice
- Verification scenarios run: recording runtime + recording mapper regression lanes
- Environments checked: local adapter-maestro test environment
- Notable evidence count: recording runtime tests + recording mapper tests + commit-series readback

## Retro

### What went well
- The recording runtime and mapper were already separated enough to improve capture and replay quality without disturbing general orchestration.

### What went wrong
- The planning workspace never recorded closure for the recording work even after the code and tests had landed.

### Reusable Rule
- If replay fidelity improves through mapper/runtime commits, then close the matching planning slice once the replay regressions are green, because deferred planning sync makes mature work look unfinished.

### Optimization Ideas
- Future recording slices should land their summary/verify artifacts in the same session as the last replay-quality regression change.

## Source-of-Truth Sync

- Formal repo truth affected: yes
- If yes, where it was updated: [`packages/adapter-maestro/src/recording-runtime-ios.ts`, `packages/adapter-maestro/src/recording-runtime-platform.ts`, `packages/adapter-maestro/src/recording-mapper.ts`, `packages/adapter-maestro/test/recording-runtime.test.ts`, `packages/adapter-maestro/test/recording-mapper.test.ts`]

## Next Step

- Ready for `07-05-PLAN.md`
