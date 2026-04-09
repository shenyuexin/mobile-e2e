# Coverage Baseline

Generated: 2026-04-09
Tool: c8 10.1.3 (via `scripts/coverage.sh` wrapper for Node.js v25 ESM compatibility)
Config: `.c8rc.json`

## Summary

| Package | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| `@mobile-e2e-mcp/core` | 62.88% | 74.90% | 63.93% | 62.88% |
| `@mobile-e2e-mcp/adapter-vision` | 76.34% | 58.06% | 86.66% | 76.34% |
| `@mobile-e2e-mcp/adapter-maestro` | 61.05% | 67.73% | 79.26% | 61.05% |
| `@shenyuexin/mobile-e2e-mcp` (mcp-server) | 85.90% | 82.69% | 92.51% | 85.90% |

## Lowest-Coverage Files (< 50%)

### core

| File | % Lines | Notes |
|------|---------|-------|
| `recording-store.ts` | 22.96% | Large store, mostly untested paths |
| `action-record-store.ts` | 31.06% | Large store, mostly untested paths |

### adapter-vision

| File | % Lines | Notes |
|------|---------|-------|
| `visual-diff.ts` | 12.90% | Core diff logic, needs tests |

### adapter-maestro

| File | % Lines | Notes |
|------|---------|-------|
| `flow-validation.ts` | 7.89% | Large file, mostly untested |
| `network-probe.ts` | 6.13% | Large file, mostly untested |
| `element-screenshot.ts` | 9.44% | Large file, mostly untested |
| `replay-chain.ts` | 10.69% | Large file, mostly untested |
| `recording-runtime.ts` | 14.35% | Large runtime, mostly untested |

### mcp-server

| File | % Lines | Notes |
|------|---------|-------|
| `compare-visual-baseline.ts` | 6.66% | Stub tool, needs implementation |

## Commands

```bash
# Run coverage for all packages
pnpm test:coverage

# Run coverage for a single package
pnpm --filter @mobile-e2e-mcp/core test:coverage

# View HTML report (after running coverage)
open packages/core/coverage/html/index.html
open packages/adapter-vision/coverage/html/index.html
open packages/adapter-maestro/coverage/html/index.html
open packages/mcp-server/coverage/html/index.html
```

## Architecture Note

c8's CLI has a yargs/ESM incompatibility on Node.js v25 (yargs uses `require()` in an ESM context). The `test:coverage` scripts use a wrapper (`scripts/coverage.sh` + `scripts/coverage-report.cjs`) that collects V8 coverage data via `NODE_V8_COVERAGE` and generates reports using c8's programmatic API, bypassing the broken CLI.
