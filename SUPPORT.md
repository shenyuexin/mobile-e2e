# Support

## Getting help

- Usage and architecture questions: open a GitHub Issue with reproduction context.
- Security-related concerns: follow `SECURITY.md` and use private reporting.

## What to include in support requests

- Environment (macOS/Linux, Node, pnpm versions)
- Target platform (Android/iOS/React Native/Flutter)
- Commands executed and exact error output
- Relevant artifacts or logs (redacted)

## Before opening an issue

1. Read `README.md` and `AGENTS.md`
2. Run:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test:ci
```

3. Check existing issues for duplicates
