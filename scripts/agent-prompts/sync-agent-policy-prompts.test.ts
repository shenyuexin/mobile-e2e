import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  resolveAgentPromptInstallTargetPreset,
  syncAgentPolicyPrompts,
} from "./sync-agent-policy-prompts-lib.ts";

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-agent-prompts-"));
  await mkdir(path.join(repoRoot, "agent_policies"), { recursive: true });
  await writeFile(path.join(repoRoot, "agent_policies", "base.md"), "# Base Policy\n", "utf8");
  await writeFile(path.join(repoRoot, "agent_policies", "strict.md"), "# Strict Policy\n", "utf8");
  await writeFile(path.join(repoRoot, "agent_policies", "exploratory.md"), "# Exploratory Policy\n", "utf8");
  await writeFile(path.join(repoRoot, "agent_policies", "closure.md"), "# Closure Policy\n", "utf8");
  return repoRoot;
}

async function writeRuntimeConfig(configPath: string, content: unknown): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

test("resolveAgentPromptInstallTargetPreset returns opencode-config path", () => {
  const expected = path.join(process.env.HOME ?? "", ".config", "opencode", "oh-my-openagent.json");
  assert.equal(resolveAgentPromptInstallTargetPreset("opencode-config"), expected);
});

test("syncAgentPolicyPrompts injects managed prompt_append block for prometheus", async () => {
  const repoRoot = await createTempRepo();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-agent-config-"));
  const configPath = path.join(tempDir, "oh-my-openagent.json");

  try {
    await writeRuntimeConfig(configPath, {
      agents: {
        prometheus: {
          model: "codexlb/gpt-5.4",
          variant: "high",
        },
      },
    });

    const result = await syncAgentPolicyPrompts({
      agents: ["prometheus"],
      configPath,
      repoRoot,
    });

    const written = await readFile(configPath, "utf8");
    assert.equal(result.updatedAgents, 1);
    assert.match(written, /mobile-e2e-mcp managed agent prompt:prometheus begin/);
    assert.match(written, /# Base Policy/);
    assert.match(written, /# Strict Policy/);
    assert.match(written, /# Closure Policy/);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("syncAgentPolicyPrompts preserves existing manual prompt_append text and is idempotent", async () => {
  const repoRoot = await createTempRepo();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-agent-config-"));
  const configPath = path.join(tempDir, "oh-my-openagent.json");

  try {
    await writeRuntimeConfig(configPath, {
      agents: {
        prometheus: {
          model: "codexlb/gpt-5.4",
          prompt_append: "manual guidance",
          variant: "high",
        },
      },
    });

    await syncAgentPolicyPrompts({ agents: ["prometheus"], configPath, repoRoot });
    const first = await readFile(configPath, "utf8");

    await syncAgentPolicyPrompts({ agents: ["prometheus"], configPath, repoRoot });
    const second = await readFile(configPath, "utf8");

    assert.match(first, /manual guidance/);
    assert.equal(first, second);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("syncAgentPolicyPrompts check mode fails when config drifts", async () => {
  const repoRoot = await createTempRepo();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-agent-config-"));
  const configPath = path.join(tempDir, "oh-my-openagent.json");

  try {
    await writeRuntimeConfig(configPath, {
      agents: {
        prometheus: {
          model: "codexlb/gpt-5.4",
          prompt_append: "manual guidance",
          variant: "high",
        },
      },
    });

    await assert.rejects(
      () => syncAgentPolicyPrompts({ agents: ["prometheus"], check: true, configPath, repoRoot }),
      /out of sync/i,
    );
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
    await rm(tempDir, { force: true, recursive: true });
  }
});
