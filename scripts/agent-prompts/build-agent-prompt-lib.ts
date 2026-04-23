import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SUPPORTED_POLICIES = ["strict", "exploratory"] as const;
export const SUPPORTED_AGENTS = ["atlas", "prometheus"] as const;

export type SupportedPolicy = (typeof SUPPORTED_POLICIES)[number];
export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

const AGENT_POLICY_MAP: Record<SupportedAgent, SupportedPolicy | undefined> = {
  atlas: undefined,
  prometheus: "strict",
};

// Current scope is intentionally narrow: each agent gets base + closure, plus at most
// one optional middle policy overlay. If a future agent truly needs multiple overlays,
// evolve this map into an ordered layer list rather than introducing runtime abstraction.
// Exploratory remains a policy overlay, not a first-class runtime agent target.

export type BuildAgentPromptOptions =
  | {
      agent: SupportedAgent;
      outPath?: string;
      repoRoot: string;
    }
  | {
      outPath?: string;
      policy: SupportedPolicy;
      repoRoot: string;
    };

export interface BuildAgentPromptRequest {
  agent?: SupportedAgent;
  outPath?: string;
  policy?: SupportedPolicy;
  repoRoot: string;
}

export interface BuildAgentPromptResult {
  agent?: SupportedAgent;
  outPath?: string;
  policy?: SupportedPolicy;
  prompt: string;
  sourceFiles: string[];
}

export function repoRootFromScript(scriptImportMetaUrl: string): string {
  const scriptPath = fileURLToPath(scriptImportMetaUrl);
  return path.resolve(path.dirname(scriptPath), "..", "..");
}

export function isSupportedPolicy(value: string): value is SupportedPolicy {
  return SUPPORTED_POLICIES.includes(value as SupportedPolicy);
}

export function isSupportedAgent(value: string): value is SupportedAgent {
  return SUPPORTED_AGENTS.includes(value as SupportedAgent);
}

export function resolvePolicySourceFiles(repoRoot: string, policy?: SupportedPolicy): string[] {
  const sourceFiles = [path.join(repoRoot, "agent_policies", "base.md")];
  if (policy) {
    sourceFiles.push(path.join(repoRoot, "agent_policies", `${policy}.md`));
  }
  sourceFiles.push(path.join(repoRoot, "agent_policies", "closure.md"));
  return sourceFiles;
}

export function resolvePromptTarget(request: BuildAgentPromptRequest): { agent?: SupportedAgent; policy?: SupportedPolicy } {
  if (request.agent && request.policy) {
    throw new Error("Specify either policy or agent, not both.");
  }
  if (!request.agent && !request.policy) {
    throw new Error(
      `Either --policy or --agent is required. Supported policies: ${SUPPORTED_POLICIES.join(", ")}. Supported agents: ${SUPPORTED_AGENTS.join(", ")}.`,
    );
  }
  if (request.agent) {
    return {
      agent: request.agent,
      policy: AGENT_POLICY_MAP[request.agent],
    };
  }
  return { policy: request.policy };
}

export async function buildAgentPrompt(options: BuildAgentPromptOptions): Promise<BuildAgentPromptResult> {
  const target = resolvePromptTarget(options);
  const sourceFiles = resolvePolicySourceFiles(options.repoRoot, target.policy);
  const sections = await Promise.all(
    sourceFiles.map(async (filePath) => readFile(filePath, "utf8")),
  );
  const prompt = sections.map((section) => section.trim()).join("\n\n---\n\n");

  if (options.outPath) {
    await mkdir(path.dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, `${prompt}\n`, "utf8");
  }

  return {
    agent: target.agent,
    outPath: options.outPath,
    policy: target.policy,
    prompt,
    sourceFiles,
  };
}

export interface BuildPromptCliOptions {
  agent?: SupportedAgent;
  outPath?: string;
  policy?: SupportedPolicy;
}

export function parseBuildPromptCliOptions(argv: string[]): BuildPromptCliOptions {
  let agent: SupportedAgent | undefined;
  let outPath: string | undefined;
  let policy: SupportedPolicy | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--out") {
      outPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--agent") {
      const next = argv[index + 1];
      if (!next || !isSupportedAgent(next)) {
        throw new Error(`--agent must be one of: ${SUPPORTED_AGENTS.join(", ")}. Got: ${String(next)}`);
      }
      agent = next;
      index += 1;
      continue;
    }
    if (arg === "--policy") {
      const next = argv[index + 1];
      if (!next || !isSupportedPolicy(next)) {
        throw new Error(`--policy must be one of: ${SUPPORTED_POLICIES.join(", ")}. Got: ${String(next)}`);
      }
      policy = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  resolvePromptTarget({ agent, policy, repoRoot: "" });
  if (agent) {
    return { agent, outPath };
  }
  return { outPath, policy };
}
