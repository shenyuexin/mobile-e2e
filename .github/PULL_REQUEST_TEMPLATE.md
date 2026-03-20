## Summary

- What problem does this PR solve?
- Why is this change needed now?
- Why is this the right scope for one reviewable PR?

## Capability impact

- Capability category: state / action / evidence / diagnosis / recovery / infra-only
- User-visible or AI-facing behavior change:
- Platforms/frameworks affected: Android / iOS / React Native / Flutter / docs-only
- Support boundary change: none / contract-ready / experimental / reproducible-demo / ci-verified

## Implementation notes

- Key implementation changes:
- Contract / policy / session / evidence changes:
- Deterministic path and fallback behavior:
- Compatibility, migration, or rollout notes:

## Validation

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:ci`
- [ ] Additional targeted validation noted below

### Validation evidence

- Targeted tests, flows, or fixtures:
- Device / simulator / environment notes:
- Screenshots, logs, or artifacts (if applicable):

## Risks and rollback

- Main risks:
- Rollback strategy:
- Follow-up work (if any):

## Checklist

- [ ] No secrets, credentials, or local artifacts committed
- [ ] Docs updated when behavior or support boundary changed
- [ ] Contracts/exports updated before downstream consumption when applicable
- [ ] Policy / session / evidence impact reviewed when capability behavior changed
- [ ] Deterministic-first behavior preserved, with explicit fallback semantics when used
- [ ] No new platform command builder / selector-query / policy logic added to `packages/adapter-maestro/src/index.ts`
- [ ] Scope is focused and reviewable
