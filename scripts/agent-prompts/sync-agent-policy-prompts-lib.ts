import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildAgentPrompt, type SupportedAgent } from "./build-agent-prompt-lib.ts";

export type AgentPromptInstallTargetPreset = "opencode-config";

export interface SyncAgentPolicyPromptsOptions {
  agents: SupportedAgent[];
  check?: boolean;
  configPath: string;
  dryRun?: boolean;
  repoRoot: string;
}

export interface SyncAgentPolicyPromptsResult {
  checkedAgents: number;
  plannedAgents: number;
  updatedAgents: number;
}

interface RuntimeAgentConfig {
  prompt_append?: string;
  [key: string]: unknown;
}

interface RuntimeConfigFile {
  agents?: Record<string, RuntimeAgentConfig>;
  [key: string]: unknown;
}

export function resolveAgentPromptInstallTargetPreset(preset: AgentPromptInstallTargetPreset): string {
  switch (preset) {
    case "opencode-config":
      return path.join(process.env.HOME ?? "", ".config", "opencode", "oh-my-openagent.json");
    default:
      throw new Error(`Unknown install target preset: ${String(preset)}`);
  }
}

function managedBlockStart(agent: SupportedAgent): string {
  return `[mobile-e2e-mcp managed agent prompt:${agent} begin]`;
}

function managedBlockEnd(agent: SupportedAgent): string {
  return `[mobile-e2e-mcp managed agent prompt:${agent} end]`;
}

function buildManagedBlock(agent: SupportedAgent, prompt: string): string {
  return `${managedBlockStart(agent)}\n${prompt}\n${managedBlockEnd(agent)}`;
}

function stripManagedBlock(value: string, agent: SupportedAgent): string {
  const pattern = new RegExp(
    `${escapeRegExp(managedBlockStart(agent))}[\\s\\S]*?${escapeRegExp(managedBlockEnd(agent))}`,
    "gu",
  );
  return value.replace(pattern, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mergePromptAppend(existingValue: string | undefined, agent: SupportedAgent, prompt: string): string {
  const manual = stripManagedBlock(existingValue ?? "", agent);
  const managed = buildManagedBlock(agent, prompt);
  return manual.length > 0 ? `${manual}\n\n${managed}` : managed;
}

function stringifyConfig(config: RuntimeConfigFile): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function syncAgentPolicyPrompts(options: SyncAgentPolicyPromptsOptions): Promise<SyncAgentPolicyPromptsResult> {
  const currentRaw = await readFile(options.configPath, "utf8");
  const parsed = JSON.parse(currentRaw) as RuntimeConfigFile;
  const agents = parsed.agents ?? {};
  let checkedAgents = 0;

  for (const agent of options.agents) {
    const existing = agents[agent];
    if (!existing) {
      throw new Error(`Agent '${agent}' does not exist in runtime config: ${options.configPath}`);
    }
    const built = await buildAgentPrompt({ agent, repoRoot: options.repoRoot });
    existing.prompt_append = mergePromptAppend(existing.prompt_append, agent, built.prompt);
    checkedAgents += 1;
  }

  parsed.agents = agents;
  const nextRaw = stringifyConfig(parsed);

  if (options.check) {
    if (currentRaw !== nextRaw) {
      throw new Error("Agent policy prompt runtime config is out of sync.");
    }
    return {
      checkedAgents,
      plannedAgents: options.agents.length,
      updatedAgents: 0,
    };
  }

  if (options.dryRun) {
    return {
      checkedAgents: 0,
      plannedAgents: options.agents.length,
      updatedAgents: 0,
    };
  }

  await writeFile(options.configPath, nextRaw, "utf8");
  return {
    checkedAgents: 0,
    plannedAgents: options.agents.length,
    updatedAgents: options.agents.length,
  };
}

export interface SyncAgentPolicyPromptsCliOptions {
  agents: SupportedAgent[];
  check: boolean;
  configPath: string;
  dryRun: boolean;
}

export function parseSyncAgentPolicyPromptsCliOptions(argv: string[]): SyncAgentPolicyPromptsCliOptions {
  const agents = new Set<SupportedAgent>();
  let check = false;
  let configPath: string | undefined;
  let dryRun = false;
  let preset: AgentPromptInstallTargetPreset = "opencode-config";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--config-path") {
      configPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--preset") {
      const next = argv[index + 1];
      if (next !== "opencode-config") {
        throw new Error(`--preset must be 'opencode-config', got: ${String(next)}`);
      }
      preset = next;
      index += 1;
      continue;
    }
    if (arg === "--agent") {
      const next = argv[index + 1];
      if (next !== "prometheus" && next !== "atlas") {
        throw new Error(`--agent must be one of: prometheus, atlas. Got: ${String(next)}`);
      }
      agents.add(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    agents: agents.size > 0 ? [...agents] : ["prometheus"],
    check,
    configPath: configPath ?? resolveAgentPromptInstallTargetPreset(preset),
    dryRun,
  };
}
