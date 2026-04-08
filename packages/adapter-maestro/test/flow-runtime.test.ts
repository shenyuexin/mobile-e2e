import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runFlowWithRuntime, selectAndroidReplayBackend } from "../src/flow-runtime.ts";
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

// --- Android backend selection tests ---

test("selectAndroidReplayBackend returns owned-adb for flow with only supported commands", async () => {
  const flowContent = [
    `- launchApp:\n    appId: com.example.app`,
    `- tapOn:\n    text: Submit`,
    `- inputText: hello`,
    `- assertVisible:\n    text: Welcome`,
  ].join("\n");
  const result = await selectAndroidReplayBackend({
    flowContent,
    deviceId: "emulator-5554",
    userId: undefined,
    repoRoot: "/Users/linan/Documents/mobile-e2e-mcp",
  });
  assert.equal(result.backend, "owned-adb");
  assert.equal(result.helperAppsRequired, false);
});

test("selectAndroidReplayBackend returns maestro for flow with unsupported commands (skipped if adb unavailable)", async () => {
  // This test requires adb to check helper app availability when unsupported commands exist
  // Skip gracefully on CI environments without adb installed
  const adbPath = process.env.ADB_PATH ?? (await findExecutable("adb").catch(() => null));
  if (!adbPath) {
    console.log("# skip: adb not available — selectAndroidReplayBackend requires adb for maestro fallback path");
    return;
  }

  const flowContent = [
    `- launchApp:\n    appId: com.example.app`,
    `- extendedWaitUntil:\n    visible: Loading\n    timeout: 5000`,
  ].join("\n");
  const result = await selectAndroidReplayBackend({
    flowContent,
    deviceId: "emulator-5554",
    userId: undefined,
    repoRoot: "/Users/linan/Documents/mobile-e2e-mcp",
  });
  assert.equal(result.backend, "maestro");
});

async function findExecutable(name: string): Promise<string | null> {
  const { exec } = await import("node:child_process");
  return new Promise((resolve) => {
    exec(`command -v ${name}`, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });
}

test("selectAndroidReplayBackend returns owned-adb for flow with newly supported commands", async () => {
  const flowContent = [
    `- launchApp:\n    appId: com.example.app`,
    `- tapOn:\n    point: "540,960"`,
    `- swipe:\n    start: "500,1000"\n    end: "500,200"\n    duration: 300`,
    `- back`,
    `- home`,
    `- hideKeyboard`,
    `- stopApp:\n    appId: com.example.app`,
    `- clearState:\n    appId: com.example.app`,
    `- assertNotVisible:\n    text: Loading`,
  ].join("\n");
  const result = await selectAndroidReplayBackend({
    flowContent,
    deviceId: "emulator-5554",
    userId: undefined,
    repoRoot: "/Users/linan/Documents/mobile-e2e-mcp",
  });
  assert.equal(result.backend, "owned-adb");
  assert.equal(result.helperAppsRequired, false);
});
