# Agent Policy Prompt Sync

This guide explains how the repo-owned agent policy prompts connect to the current OpenCode / Oh-My-OpenAgent runtime configuration.

## Why this exists

The repo now keeps policy text under `agent_policies/` and prompt composition logic under `scripts/agent-prompts/build-agent-prompt*.ts`.

The OpenCode runtime does **not** currently load those markdown files directly. The runtime-facing prompt hook that exists today is `prompt_append` inside:

- `~/.config/opencode/oh-my-openagent.json`

That means the practical integration model is:

1. keep policy sources canonical in the repo
2. build agent prompts from those sources
3. sync the built prompt text into the runtime config where the plugin already expects inline prompt text

This keeps a single source of truth in the repo while staying compatible with the current global OpenCode setup.

## Current configuration layers

### 1. Repo-local OpenCode instructions

File:

- `opencode.json`

This is the repo-local instruction entrypoint. It tells OpenCode which in-repo instruction documents to load when you work inside this repository.

It is **not** the agent registry and it does **not** currently own agent-specific prompt text.

### 2. Global OpenCode bootstrap config

File:

- `~/.config/opencode/opencode.json`

This holds provider, plugin, and model registry configuration.

In the current setup, this is where:

- OpenCode plugins are enabled
- model providers are defined
- global model choices are registered

It is **not** the place where agent-specific `prompt_append` values are currently managed.

### 3. Global Oh-My-OpenAgent runtime config

File:

- `~/.config/opencode/oh-my-openagent.json`

This is the active runtime-facing agent registry.

Today it owns:

- agent-to-model mappings
- category-to-model mappings
- inline `prompt_append` overrides

This is the narrowest real runtime hook for the policy-layer work.

## Current repo-owned policy sources

Canonical sources live here:

- `agent_policies/base.md`
- `agent_policies/strict.md`
- `agent_policies/exploratory.md`
- `agent_policies/closure.md`

Current builder files:

- `scripts/agent-prompts/build-agent-prompt-lib.ts`
- `scripts/agent-prompts/build-agent-prompt.ts`

Current supported compositions:

- `atlas` → `base + closure`
- `prometheus` → `base + strict + closure`
- `exploratory` policy → `base + exploratory + closure`

## Current runtime sync boundary

Current sync files:

- `scripts/agent-prompts/sync-agent-policy-prompts-lib.ts`
- `scripts/agent-prompts/sync-agent-policy-prompts.ts`

Current default runtime sync target:

- `prometheus` only

Why only `prometheus` right now:

- `prometheus` had no specialized inline prompt before, so syncing repo-owned policy text into `prompt_append` is low risk
- `atlas` already has a specialized closure-oriented `prompt_append` in global config; replacing it now would be riskier and could collapse useful custom behavior into a more generic policy block
- `exploratory` is currently treated as a reusable policy overlay, not a standalone runtime agent name in the current global `oh-my-openagent.json`

This is why the present split is more reasonable than trying to auto-migrate every agent immediately.

## Commands

### Build a prompt locally

```bash
pnpm exec tsx scripts/agent-prompts/build-agent-prompt.ts --agent prometheus
pnpm exec tsx scripts/agent-prompts/build-agent-prompt.ts --policy exploratory --out output/agent-prompts/exploratory.md
```

### Sync the runtime config

Default behavior syncs the repo-owned `prometheus` prompt into:

- `~/.config/opencode/oh-my-openagent.json`

```bash
pnpm agent-prompts:sync
```

Check mode:

```bash
pnpm agent-prompts:check
```

Dry run:

```bash
pnpm agent-prompts:sync -- --dry-run
```

Explicit config path:

```bash
pnpm agent-prompts:sync -- --config-path "/absolute/path/to/oh-my-openagent.json"
```

Explicit agent override:

```bash
pnpm agent-prompts:sync -- --agent prometheus
```

## Managed block behavior

The sync script writes a managed block inside `prompt_append` with markers like:

- `[mobile-e2e-mcp managed agent prompt:prometheus begin]`
- `[mobile-e2e-mcp managed agent prompt:prometheus end]`

Rules:

- existing non-managed `prompt_append` text is preserved
- the managed block is replaced in-place on re-sync
- repeated syncs are idempotent
- check mode fails if the runtime config has drifted from the repo-owned source

## Current recommendation

For the current setup, this is the most reasonable division of responsibilities:

- repo `agent_policies/` = canonical policy source
- repo scripts = build + sync mechanism
- global `opencode.json` = providers/plugins/models
- global `oh-my-openagent.json` = runtime agent registry and inline prompt hook

The important boundary is:

- use `--agent` for stable runtime-backed agent names that already exist in `oh-my-openagent.json`
- use `--policy exploratory` when you want exploratory behavior as a standalone policy build target or future overlay, not as a new runtime role

That gives you runtime compatibility today without inventing a second policy system or forcing an early atlas migration.
