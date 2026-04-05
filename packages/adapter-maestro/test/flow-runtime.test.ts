import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runFlowWithRuntime } from "../src/flow-runtime.ts";
import { resolveRepoPath } from "../src/harness-config.ts";

test("runFlowWithRuntime passes iOS physical-device env vars to custom runner scripts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "m2e-flow-runtime-"));
  const scriptPath = path.join(tempDir, "capture-ios-env.sh");
  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'mkdir -p "__OUT_DIR__/run-001"',
    'printf "PASS\\n" > "__OUT_DIR__/run-001/result.txt"',
    'printf "runner ok\\n" > "__OUT_DIR__/run-001/maestro.out"',
    'printf "IOS_DEVICE_ID=%s\\nDEVICE_ID=%s\\nMAESTRO_UDID=%s\\nSIM_UDID=%s\\n" "__IOS_DEVICE_ID__" "__DEVICE_ID__" "__MAESTRO_UDID__" "__SIM_UDID__" > "__OUT_DIR__/env.txt"',
    "",
  ]
    .join("\n")
    .replace(/__OUT_DIR__/g, "$" + "{OUT_DIR}")
    .replace(/__IOS_DEVICE_ID__/g, "$" + "{IOS_DEVICE_ID:-}")
    .replace(/__DEVICE_ID__/g, "$" + "{DEVICE_ID:-}")
    .replace(/__MAESTRO_UDID__/g, "$" + "{MAESTRO_UDID:-}")
    .replace(/__SIM_UDID__/g, "$" + "{SIM_UDID:-}");
  await writeFile(scriptPath, script, "utf8");
  await chmod(scriptPath, 0o755);

  const deviceId = "00008101-000D482C1E78001E";
  const sessionId = "flow-ios-physical-env-test";
  const repoRoot = resolveRepoPath();
  let artifactsDir: string | undefined;
  try {
    const result = await runFlowWithRuntime({
      sessionId,
      platform: "ios",
      runnerScript: scriptPath,
      flowPath: "flows/samples/native/mobitru-ios-login.yaml",
      appId: "com.mobitru.demoapp",
      deviceId,
      runCount: 1,
      dryRun: false,
    });

    assert.equal(result.status, "success");
    assert.equal(result.reasonCode, "OK");

    artifactsDir = result.data.artifactsDir;
    const capturedEnv = await readFile(path.resolve(repoRoot, artifactsDir, "env.txt"), "utf8");
    assert.match(capturedEnv, new RegExp(`IOS_DEVICE_ID=${deviceId}`));
    assert.match(capturedEnv, new RegExp(`DEVICE_ID=${deviceId}`));
    assert.match(capturedEnv, new RegExp(`MAESTRO_UDID=${deviceId}`));
    assert.match(capturedEnv, new RegExp(`SIM_UDID=${deviceId}`));
  } finally {
    if (artifactsDir) {
      await rm(path.resolve(repoRoot, artifactsDir), { recursive: true, force: true });
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
