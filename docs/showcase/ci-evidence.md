# CI Evidence and Boundary Guide

This page is the fixed entry for CI execution evidence referenced by `README.md` and `README.zh-CN.md`.

## Where to view the latest CI runs

- CI workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml
- test:ci workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/test-ci.yml

## What evidence CI provides

For each run of `CI` (`.github/workflows/ci.yml`):

1. Job logs for `unit-and-typecheck` and `dry-run-smoke`
2. Two uploaded metadata artifacts:
   - `ci-unit-typecheck-metadata`
   - `ci-dry-run-smoke-metadata`
3. Job-level step summary with:
   - job status
   - run URL
   - artifact names
   - boundary reminder

## CI boundary (important)

- Ubuntu CI validates **buildability, type-safety, and smoke-level tool behavior**.
- Ubuntu CI does **not** prove real-device execution fidelity.
- Real-device confidence should be validated through showcase scripts and artifacts under:
  - `docs/showcase/README.md`
  - `docs/showcase/demo-playbook.zh-CN.md`

## Quick review checklist for maintainers

- CI run is green on `main` and target PR branch.
- Step summaries mention both metadata artifacts.
- Boundary statement remains visible in this document and workflow summary.
