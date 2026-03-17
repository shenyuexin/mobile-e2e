# Contributing

Thanks for your interest in contributing to `mobile-e2e-mcp`.

## Development setup

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Branching and pull requests

1. Fork the repository and create a focused branch.
2. Keep each PR scoped to one problem.
3. Include tests or validation updates for behavior changes.
4. Ensure CI passes before requesting review.

## Coding expectations

- Follow existing project structure and naming conventions.
- Keep deterministic-first behavior and policy constraints intact.
- Do not introduce secret material or local artifacts into commits.

## Commit and PR quality

- Write clear commit messages explaining why the change is needed.
- In PR description, include:
  - problem statement
  - approach and tradeoffs
  - validation evidence (`build`, `typecheck`, `test`)

## Questions

If you are unsure where to place changes, read:

- `AGENTS.md`
- `README.md`
- `docs/architecture/architecture.md`
