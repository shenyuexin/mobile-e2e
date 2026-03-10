# Maestro Adapter

This package now provides the TypeScript execution adapter used by `packages/mcp-server`.

Current scope:

- `resolveRepoPath()`
- `buildArtifactsDir()`
- harness/profile resolution in `src/harness-config.ts`
- UI hierarchy parsing and selector semantics in `src/ui-model.ts`
- JS inspector and Metro debug helpers in `src/js-debug.ts`
- capability reporting in `src/capability-model.ts`
- tool-facing execution functions in `src/index.ts`

The adapter still preserves the existing shell runners under `scripts/dev/` where that is the pragmatic backend, but it now also contains live session, UI, diagnostics, app lifecycle, JS debug, and policy-adjacent execution wiring.

For ongoing file-placement guidance as the package grows, see [`docs/architecture/adapter-code-placement.md`](../../docs/architecture/adapter-code-placement.md).
