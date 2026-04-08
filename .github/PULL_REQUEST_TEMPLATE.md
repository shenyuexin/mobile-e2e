## Summary

- What problem does this PR solve?
- Why is this change needed now?
- Why is this the right scope for one reviewable PR?

## Capability impact

> Required when this PR touches capability-governed paths such as `packages/contracts`, `packages/core`, `packages/adapter-*`, `packages/mcp-server`, `configs/*`, `README*`, or support-boundary docs under `docs/architecture/*` and selected `docs/engineering/*` guides. CI checks these fields for guarded-path PRs.

- Capability category: state / action / evidence / diagnosis / recovery / infra-only
- User-visible or AI-facing behavior change:
- Platforms/frameworks affected: Android / iOS / React Native / Flutter / docs-only
- Support boundary change: none / contract-ready / experimental / reproducible-demo / ci-verified
- Invocation guidance impact: none / canonical / topic-only
- Capability truth source checked:
- Public docs / canonical guide update: yes / no / not-needed (why)

## Implementation notes

- Key implementation changes:
- Contract / policy / session / evidence changes:
- Deterministic path and fallback behavior:
- AI-first capability guideline consulted: yes / no (if no, why not applicable)
- Compatibility, migration, or rollout notes:

## Validation

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:ci`
- [ ] `pnpm validate:architecture-guardrails` (CI-enforced)
- [ ] `pnpm validate:tool-output-contracts` (CI-enforced)
- [ ] Additional targeted validation noted below

### Validation evidence

- Targeted tests, flows, or fixtures:
- Device / simulator / environment notes:
- Screenshots, logs, or artifacts (if applicable):

### Machine-checked vs reviewer-only

The following architecture guardrails are now **CI-enforced** (no longer reviewer-only):
- Hotspot file size limits (soft: 500 lines warn, hard: 1500 lines warn-first rollout)
- Thin-facade boundary violations in `adapter-maestro/src/index.ts`
- Platform leakage into pure model/config modules
- Dependency direction (no reverse imports from focused modules into orchestration)
- Tool catalog drift (registered tools vs README documentation)
- ToolResult envelope integrity and Tier 1 tool payload contracts

The following remain **reviewer-only** checks:
- AI-first capability guideline consultation quality
- Support boundary language appropriateness
- Deterministic-first design judgment
- Scope focus and reviewability

## Risks and rollback

- Main risks:
- Rollback strategy:
- Follow-up work (if any):

## Checklist

- [ ] No secrets, credentials, or local artifacts committed
- [ ] Docs updated when behavior or support boundary changed
- [ ] Invocation guidance updated or explicitly marked not needed when tool usage, sequencing, session rules, recovery routing, or support boundary changed
- [ ] `docs/engineering/ai-first-capability-expansion-guideline.md` was reviewed for any capability-surface change (or explicitly marked not applicable)
- [ ] Contracts/exports updated before downstream consumption when applicable
- [ ] Policy / session / evidence impact reviewed when capability behavior changed
- [ ] Deterministic-first behavior preserved, with explicit fallback semantics when used
- [ ] `packages/adapter-maestro/src/index.ts` remains a thin facade only (exports + thin composition/coordinator), with no new runtime/platform/selector/policy logic added
- [ ] No low-level helper backflow into `index.ts` and no reverse import that breaks intended module direction
- [ ] If touching `adapter-maestro` hotspots (`index.ts`/`ui-tools.ts`/`device-runtime.ts`/`recording-runtime.ts`), include line-count delta + boundary justification in PR notes
- [ ] Scope is focused and reviewable
