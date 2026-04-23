import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAgentPrompt,
  parseBuildPromptCliOptions,
  repoRootFromScript,
} from "./build-agent-prompt-lib.ts";

const repoRoot = repoRootFromScript(import.meta.url);

test("buildAgentPrompt assembles base strict and closure in order", async () => {
  const result = await buildAgentPrompt({ policy: "strict", repoRoot });

  assert.match(result.prompt, /^# Base Policy/m);
  assert.match(result.prompt, /# Strict Policy/);
  assert.match(result.prompt, /# Closure Policy/);

  const baseIndex = result.prompt.indexOf("# Base Policy");
  const strictIndex = result.prompt.indexOf("# Strict Policy");
  const closureIndex = result.prompt.indexOf("# Closure Policy");

  assert.ok(baseIndex >= 0);
  assert.ok(strictIndex > baseIndex);
  assert.ok(closureIndex > strictIndex);
  assert.equal(result.sourceFiles.length, 3);
});

test("parseBuildPromptCliOptions rejects unknown policy", () => {
  assert.throws(
    () => parseBuildPromptCliOptions(["--policy", "mystery"]),
    /--policy must be one of: strict, exploratory/,
  );
});

test("buildAgentPrompt assembles base exploratory and closure in order", async () => {
  const result = await buildAgentPrompt({ policy: "exploratory", repoRoot });

  assert.match(result.prompt, /^# Base Policy/m);
  assert.match(result.prompt, /# Exploratory Policy/);
  assert.match(result.prompt, /# Closure Policy/);

  const baseIndex = result.prompt.indexOf("# Base Policy");
  const exploratoryIndex = result.prompt.indexOf("# Exploratory Policy");
  const closureIndex = result.prompt.indexOf("# Closure Policy");

  assert.ok(baseIndex >= 0);
  assert.ok(exploratoryIndex > baseIndex);
  assert.ok(closureIndex > exploratoryIndex);
});

test("buildAgentPrompt assembles atlas mapping as base plus closure", async () => {
  const result = await buildAgentPrompt({ agent: "atlas", repoRoot });

  assert.match(result.prompt, /^# Base Policy/m);
  assert.doesNotMatch(result.prompt, /# Strict Policy/);
  assert.match(result.prompt, /# Closure Policy/);
});

test("buildAgentPrompt assembles prometheus mapping as base strict and closure", async () => {
  const result = await buildAgentPrompt({ agent: "prometheus", repoRoot });

  assert.match(result.prompt, /^# Base Policy/m);
  assert.match(result.prompt, /# Strict Policy/);
  assert.match(result.prompt, /# Closure Policy/);
});

test("parseBuildPromptCliOptions parses agent mode", () => {
  assert.deepEqual(parseBuildPromptCliOptions(["--agent", "atlas"]), {
    agent: "atlas",
    outPath: undefined,
  });
});

test("parseBuildPromptCliOptions rejects unknown agent", () => {
  assert.throws(
    () => parseBuildPromptCliOptions(["--agent", "architect"]),
    /--agent must be one of: atlas, prometheus/,
  );
});

test("parseBuildPromptCliOptions rejects when both agent and policy are provided", () => {
  assert.throws(
    () => parseBuildPromptCliOptions(["--agent", "atlas", "--policy", "strict"]),
    /Specify either policy or agent, not both/,
  );
});

test("parseBuildPromptCliOptions rejects when neither agent nor policy is provided", () => {
  assert.throws(
    () => parseBuildPromptCliOptions([]),
    /Either --policy or --agent is required/,
  );
});

test("buildAgentPrompt writes output when outPath is provided", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-prompt-"));
  const outPath = path.join(tempDir, "strict.md");

  try {
    const result = await buildAgentPrompt({
      outPath,
      policy: "strict",
      repoRoot,
    });

    const written = await readFile(outPath, "utf8");
    assert.equal(written, `${result.prompt}\n`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
