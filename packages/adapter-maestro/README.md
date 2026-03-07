# Maestro Adapter

This package now provides the minimal TypeScript adapter used by `run_flow`.

Current scope:

- `resolveRepoPath()`
- `buildArtifactsDir()`
- `collectBasicRunResult()`
- `runFlowWithMaestro()`

The adapter intentionally preserves the existing shell runners under `scripts/dev/` as the execution backend. Shared logic can move inward from those scripts in later iterations after the TS loop is stable.
