---
phase: 07-ios-parity-hardening
plan: 05
summary_type: internal-planning
task_type: feature
completed: 2026-04-03
requirements_completed: []
key_files:
  created:
    - .planning/phases/07-ios-parity-hardening/07-05-SUMMARY.md
    - .planning/phases/07-ios-parity-hardening/07-05-VERIFY.md
  modified: []
repo_truth_synced:
  - packages/adapter-maestro/src/device-runtime-ios.ts
  - packages/adapter-maestro/src/device-runtime-platform.ts
  - packages/adapter-maestro/src/performance-runtime.ts
  - packages/adapter-maestro/src/performance-model.ts
  - packages/adapter-maestro/test/performance.test.ts
verify_file: 07-05-VERIFY.md
---

# Phase 07 Plan 05 Summary

## Meta
- Task ID: 07-05
- Date: 2026-04-03
- Repo: mobile-e2e-mcp
- Branch: main
- Owner: OpenCode agent
- Type: feature

## Goal

### Problem
iOS observability, diagnostics, and performance evidence were thinner than Android’s baseline, which weakened failure diagnosis and left real-device attach/performance behavior under-specified.

### Expected Outcome
- [x] iOS device/runtime helpers now provide stronger diagnostics and real-device-aware execution behavior.
- [x] iOS performance capture now preserves more useful attach, manifest, hotspot, and transcript semantics.
- [x] The adapter tests now lock the iOS evidence/performance behavior behind explicit regression coverage.

### Non-goals
- Promoting iOS support labels beyond the partial frontier.
- Claiming full template parity with Android Perfetto outputs.
- Treating public docs as the source of truth instead of code/tests/capability metadata.

## Plan

### Strategy
Use the existing device-runtime and performance seams to densify iOS evidence: strengthen physical-device discovery and launch behavior, improve attach-target resolution for xctrace, and make performance summaries and manifests more honest about capture scope and process attribution.

### Task Breakdown
1. Strengthen iOS device/runtime helpers for physical-device discovery and launch behavior.
2. Improve xctrace planning and attach-target resolution so iOS performance runs can scope to the app when possible.
3. Improve iOS performance manifests, hotspot attribution, and transcript persistence so evidence stays diagnostically useful.
4. Add regression tests that prove the iOS evidence/performance path is stronger without overclaiming support.

### Risks / Unknowns
- Apple tooling and template behavior still limit some real-device and template combinations even when attach discovery improves.
- Evidence density can improve without implying public support promotion, so capture-scope honesty must stay explicit.

### Done Criteria
- [x] iOS observability/performance work is now reflected in named runtime/model files rather than planning-only intent.
- [x] Real-device performance attach behavior is stronger and still explicit about fallback.
- [x] Regression coverage exists for iOS performance frontier behavior and attach-target handling.

## Implement

### Changes
- `packages/adapter-maestro/src/device-runtime-ios.ts` — strengthened iOS physical-device discovery, launch, and attach-target resolution helpers.
- `packages/adapter-maestro/src/device-runtime-platform.ts` — preserved platform-specific device/runtime ownership for the improved iOS evidence path.
- `packages/adapter-maestro/src/performance-runtime.ts` — plans iOS performance capture with attach-aware target selection and explicit fallback semantics.
- `packages/adapter-maestro/src/performance-model.ts` — keeps iOS manifests, capture-scope notes, and summaries honest and diagnostically useful.
- `packages/adapter-maestro/test/performance.test.ts` — covers partial frontier assertions, manifest honesty, and real-device attach-target behavior.

### Key Decisions
- App-scoped iOS performance capture should prefer PID attach when discoverable, but fall back explicitly rather than pretending the trace stayed app-scoped.
- Real-device discovery and launch behavior are part of evidence quality because they determine whether targeted diagnostics/performance capture are possible.
- Better manifests and process attribution matter more than merely producing another raw artifact file.

### Notes
- This slice closes the observability/performance hardening track without changing the higher-level support labels; iOS remains partial while evidence quality improves.

### Deviations
- None — the code and tests align with the planned 07-05 scope.

## Verify

### Test Cases
- [x] iOS performance planning uses attach targets when available and preserves all-process fallback honesty when not.
- [x] iOS summary/manifests keep process attribution and capture-scope behavior explicit.
- [x] Real-device discovery and launch support are covered by the adapter code path and tests.

### Evidence Types
- [x] test
- [x] command
- [ ] screenshot
- [ ] log

### Evidence
```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro exec tsx --test test/device-runtime.test.ts test/performance.test.ts
# PASS — iOS physical-device runtime and performance regression coverage remains green, including real-device PID attach behavior.
```

- Artifact / diff / readback:
  - Local unpushed commits include the evidence/performance hardening series (`1636046`, `6b26fca`, `df6d40f`, `755d9da`, `fb1896e`, `2c3035c`, `9d4cee8`, `1bb15ad`, `169a9eb`) covering transcripts, manifests, process attribution, attach-aware profiling, physical-device discovery, real-device launch, and real-device attach.

### Result
- ✅ Success

### Execution Metrics
- Duration: cumulative multi-commit observability/performance hardening slice
- Verification scenarios run: device runtime + performance regression lanes
- Environments checked: local adapter-maestro test environment
- Notable evidence count: device/performance regression suites + commit-series readback

## Retro

### What went well
- The device-runtime and performance seams were already strong enough to absorb real-device discovery and attach logic without widening the MCP surface.

### What went wrong
- Planning closure lagged behind the actual code/test work, which made the evidence slice look less mature than it is.

### Reusable Rule
- If observability or performance support improves through runtime/model commits, then record the closure as soon as the corresponding regression suites pass, because otherwise later sessions will confuse “docs stale” with “runtime still missing.”

### Optimization Ideas
- Future evidence-focused slices should sync their planning artifacts in the same session as the final runtime/test change so capability notes, tests, and planning stay aligned.

## Source-of-Truth Sync

- Formal repo truth affected: yes
- If yes, where it was updated: [`packages/adapter-maestro/src/device-runtime-ios.ts`, `packages/adapter-maestro/src/device-runtime-platform.ts`, `packages/adapter-maestro/src/performance-runtime.ts`, `packages/adapter-maestro/src/performance-model.ts`, `packages/adapter-maestro/test/performance.test.ts`]

## Next Step

- Ready for `07-06-PLAN.md`
