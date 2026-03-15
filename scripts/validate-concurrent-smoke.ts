import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function extractJsonPayload(raw: string): string | undefined {
  const trimmed = raw.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    return undefined;
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

async function runCli(cliArgs: string[], allowFailureExit = false): Promise<unknown> {
  const repoRoot = repoRootFromScript();
  const commandArgs = [
    "--filter",
    "@mobile-e2e-mcp/mcp-server",
    "exec",
    "tsx",
    "src/dev-cli.ts",
    ...cliArgs,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("pnpm", commandArgs, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const jsonPayload = extractJsonPayload(stdout);
      if (code === 0 || (allowFailureExit && jsonPayload !== undefined)) {
        resolve(jsonPayload ?? stdout);
        return;
      }
      reject(new Error(`CLI command failed (${String(code)}): ${stderr || stdout}`));
    });
  });

  const jsonPayload = extractJsonPayload(output) ?? output.trim();
  return JSON.parse(jsonPayload);
}

async function validateParallelDifferentDevices(): Promise<void> {
  const seed = Date.now();
  const runA = runCli([
    "--platform", "android",
    "--dry-run",
    "--run-count", "1",
    "--session-id", `concurrent-smoke-a-${seed}`,
    "--device-id", `concurrent-smoke-device-a-${seed}`,
  ]);
  const runB = runCli([
    "--platform", "android",
    "--dry-run",
    "--run-count", "1",
    "--session-id", `concurrent-smoke-b-${seed}`,
    "--device-id", `concurrent-smoke-device-b-${seed}`,
  ]);

  const [resultA, resultB] = await Promise.all([runA, runB]) as Array<{
    startResult: { status: string };
    runResult: { status: string; data?: { queueWaitMs?: number } };
    endResult: { status: string };
  }>;

  assert.equal(resultA.startResult.status, "success");
  assert.equal(resultB.startResult.status, "success");
  assert.equal(resultA.runResult.status, "success");
  assert.equal(resultB.runResult.status, "success");
  assert.equal(resultA.endResult.status, "success");
  assert.equal(resultB.endResult.status, "success");
  assert.equal(typeof resultA.runResult.data?.queueWaitMs, "number");
  assert.equal(typeof resultB.runResult.data?.queueWaitMs, "number");
}

async function validateParallelSameDeviceConflict(): Promise<void> {
  const seed = Date.now();
  const sharedDeviceId = `concurrent-smoke-device-shared-${seed}`;

  const runA = runCli([
    "--platform", "android",
    "--dry-run",
    "--run-count", "1",
    "--session-id", `concurrent-smoke-conflict-a-${seed}`,
    "--device-id", sharedDeviceId,
  ], true);
  const runB = runCli([
    "--platform", "android",
    "--dry-run",
    "--run-count", "1",
    "--session-id", `concurrent-smoke-conflict-b-${seed}`,
    "--device-id", sharedDeviceId,
  ], true);

  const [resultA, resultB] = await Promise.all([runA, runB]) as Array<{
    startResult: { status: string; reasonCode: string };
    runResult?: { status: string };
    endResult?: { status: string };
  }>;

  const statuses = [resultA.startResult.status, resultB.startResult.status];
  assert.equal(statuses.includes("success"), true);
  assert.equal(statuses.includes("failed"), true);

  const failedStart = resultA.startResult.status === "failed" ? resultA.startResult : resultB.startResult;
  assert.equal(failedStart.reasonCode, "DEVICE_UNAVAILABLE");
}

async function main(): Promise<void> {
  await validateParallelDifferentDevices();
  await validateParallelSameDeviceConflict();
  console.log(JSON.stringify({ status: "ok", suite: "validate-concurrent-smoke" }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
