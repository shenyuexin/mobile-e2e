/**
 * Explorer harness for Android physical devices.
 *
 * Run:
 *   pnpm exec tsx scripts/explorer/test-explorer-android.ts [smoke|full]
 *
 * Optional env vars:
 *   M2E_DEVICE_ID=10AEA40Z3Y000R5
 *   APP_ID=com.android.settings
 *   EXPLORER_OUTPUT_DIR=artifacts/explorer/android-full
 *   EXPLORER_MAX_DEPTH=8
 *   EXPLORER_TIMEOUT_MS=7200000
 */

import { createServer } from "../../packages/mcp-server/src/index.js";
import { explore } from "../../packages/explorer/src/cli.js";
import { execFile } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] === "full" ? "full" : "smoke";
const appId = process.env.APP_ID?.trim() || "com.android.settings";
const deviceId = process.env.M2E_DEVICE_ID?.trim() || "10AEA40Z3Y000R5";

// Explorer runner resolves device from process.env.M2E_DEVICE_ID.
// Ensure one-command runs use the script's default device when env is unset.
if (!process.env.M2E_DEVICE_ID) {
  process.env.M2E_DEVICE_ID = deviceId;
}

const outputDir = process.env.EXPLORER_OUTPUT_DIR?.trim()
  || (mode === "full" ? "artifacts/explorer/android-full" : "artifacts/explorer/android-smoke");
const maxDepth = process.env.EXPLORER_MAX_DEPTH?.trim()
  || (mode === "full" ? "8" : "5");
const timeoutMs = process.env.EXPLORER_TIMEOUT_MS?.trim()
  || (mode === "full" ? "7200000" : "3600000");
const runId = process.env.EXPLORER_RUN_ID?.trim()
  || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

process.env.EXPLORER_RUN_ID = runId;

const runDir = join(outputDir, runId);
mkdirSync(runDir, { recursive: true });
const logPath = join(runDir, "log.txt");
const logStream = createWriteStream(logPath, { flags: "a" });

const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
};

function formatLogArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function teeLog(level: "LOG" | "ERROR" | "WARN" | "INFO", args: unknown[]): void {
  const line = args.map(formatLogArg).join(" ");
  logStream.write(`[${new Date().toISOString()}] [${level}] ${line}\n`);
}

console.log = (...args: unknown[]) => {
  teeLog("LOG", args);
  originalConsole.log(...args);
};
console.error = (...args: unknown[]) => {
  teeLog("ERROR", args);
  originalConsole.error(...args);
};
console.warn = (...args: unknown[]) => {
  teeLog("WARN", args);
  originalConsole.warn(...args);
};
console.info = (...args: unknown[]) => {
  teeLog("INFO", args);
  originalConsole.info(...args);
};

async function flushLogStream(): Promise<void> {
  await new Promise<void>((resolve) => {
    logStream.end(() => resolve());
  });
}

function execAdb(args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile("adb", ["-s", deviceId, ...args], { timeout }, (err, stdout) => {
      resolve(err ? "" : stdout);
    });
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getForegroundPackage(): Promise<string | undefined> {
  const windowDump = await execAdb(["shell", "dumpsys", "window", "windows"]);
  const focusMatch = windowDump.match(/mCurrentFocus=Window\{[^\s]+\s([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+\}/);
  if (focusMatch?.[1]) {
    return focusMatch[1];
  }

  const activityTop = await execAdb(["shell", "dumpsys", "activity", "top"]);
  const topMatch = activityTop.match(/ACTIVITY\s+([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+/);
  return topMatch?.[1];
}

async function collectEntryEvidence(server: ReturnType<typeof createServer>, label: string): Promise<{
  currentFocus: string;
  topActivity: string;
  sampleTexts: string[];
}> {
  const windowDump = await execAdb(["shell", "dumpsys", "window", "windows"]);
  const currentFocus = windowDump.match(/mCurrentFocus=Window\{[^\}]+\}/)?.[0] ?? "unknown";

  const activityTop = await execAdb(["shell", "dumpsys", "activity", "top"]);
  const topActivity = activityTop.match(/ACTIVITY\s+([A-Za-z0-9._]+\/[A-Za-z0-9.$_]+)/)?.[1] ?? "unknown";

  const inspectResult = await server.invoke("inspect_ui", {
    sessionId: `entry-evidence-${Date.now()}`,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
  }) as {
    status: string;
    data?: { content?: string };
  };

  const content = inspectResult.data?.content ?? "";
  const textMatches = Array.from(content.matchAll(/text="([^"]+)"/g))
    .map((match) => match[1])
    .filter((value) => value.trim().length > 0)
    .slice(0, 12);

  console.log(`[ENTRY-EVIDENCE] ${label}: currentFocus=${currentFocus}`);
  console.log(`[ENTRY-EVIDENCE] ${label}: topActivity=${topActivity}`);
  console.log(`[ENTRY-EVIDENCE] ${label}: sampleTexts=${JSON.stringify(textMatches)}`);

  return { currentFocus, topActivity, sampleTexts: textMatches };
}

function looksLikeLockedSystemOverlay(evidence: { topActivity: string; sampleTexts: string[] }): boolean {
  const joined = evidence.sampleTexts.join(" ").toLowerCase();
  return joined.includes("do not disturb")
    || joined.includes("kb/s")
    || joined.includes("mon, ")
    || joined.includes("swipe up")
    || evidence.topActivity.startsWith("com.android.systemui/");
}

function looksLikeSettingsHome(evidence: { sampleTexts: string[] }): boolean {
  const joined = evidence.sampleTexts.join(" ").toLowerCase();
  const matchedSignals = [
    "airplane mode",
    "wi-fi",
    "bluetooth",
    "sims &amp; mobile network",
    "more connections",
    "notifications &amp; status bar",
    "display, brightness &amp; eye protection",
    "vivo account, vivo cloud, find devices, and more",
  ].filter((signal) => joined.includes(signal));

  return matchedSignals.length >= 3;
}

async function ensureDeviceAwakeAndUnlocked(): Promise<void> {
  await execAdb(["shell", "am", "switch-user", "0"], 8000);
  await sleep(500);

  const before = await getForegroundPackage();
  if (before && before !== "com.android.systemui") {
    return;
  }

  console.log(`[ENTRY] Foreground before unlock handling: ${before ?? "unknown"}`);
  await execAdb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
  await sleep(500);
  await execAdb(["shell", "wm", "dismiss-keyguard"], 5000);
  await sleep(500);
  await execAdb(["shell", "input", "keyevent", "82"], 5000);
  await sleep(500);

  const sizeOutput = await execAdb(["shell", "wm", "size"]);
  const sizeMatch = sizeOutput.match(/Physical size:\s*(\d+)x(\d+)/);
  const width = sizeMatch?.[1] ? Number(sizeMatch[1]) : 1260;
  const height = sizeMatch?.[2] ? Number(sizeMatch[2]) : 2800;
  const midX = Math.round(width / 2);
  const startY = Math.round(height * 0.82);
  const endY = Math.round(height * 0.28);

  // Vivo lockscreen often requires a swipe-up even after face unlock.
  await execAdb(["shell", "input", "swipe", String(midX), String(startY), String(midX), String(endY), "250"]);
  await sleep(1200);
  await execAdb(["shell", "input", "keyevent", "3"], 5000);
  await sleep(800);

  const after = await getForegroundPackage();
  console.log(`[ENTRY] Foreground after unlock handling: ${after ?? "unknown"}`);
}

async function aggressivelyRecoverToUsableForeground(): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[ENTRY] Aggressive unlock attempt ${attempt}/3...`);
    await ensureDeviceAwakeAndUnlocked();
    await execAdb(["shell", "input", "keyevent", "4"], 5000);
    await sleep(500);
    await execAdb(["shell", "input", "keyevent", "3"], 5000);
    await sleep(1200);
    await execAdb(["shell", "wm", "dismiss-keyguard"], 5000);
    await sleep(700);
  }
}

async function launchSettingsViaAdbFallback(): Promise<void> {
  console.log("[ENTRY] Falling back to direct adb launch...");
  await execAdb(["shell", "am", "force-stop", appId], 8000);
  await sleep(500);

  if (appId === "com.android.settings") {
    await execAdb(["shell", "am", "start", "-W", "-a", "android.settings.SETTINGS"], 8000);
  } else {
    await execAdb(["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"], 8000);
  }
  await sleep(2500);
}

async function launchSettingsAndVerifyForeground(server: ReturnType<typeof createServer>): Promise<void> {
  const launchSessionId = `launch-guard-${Date.now()}`;

  await ensureDeviceAwakeAndUnlocked();

  await server.invoke("launch_app", {
    sessionId: launchSessionId,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    appId,
    launchUrl: "android.settings.SETTINGS",
  });
  await sleep(2500);

  let foreground = await getForegroundPackage();
  console.log(`[ENTRY] Foreground after launch_app: ${foreground ?? "unknown"}`);
  let evidence = await collectEntryEvidence(server, "after-launch_app");

  if (looksLikeSettingsHome(evidence)) {
    console.log("[ENTRY] Settings UI semantics detected after launch_app; accepting launch despite foreground mismatch.");
    return;
  }

  if (foreground === appId) {
    return;
  }

  if (foreground === "com.android.systemui") {
    console.log("[ENTRY] Still on systemui after launch; retrying after unlock gesture...");
    await ensureDeviceAwakeAndUnlocked();
    await server.invoke("launch_app", {
      sessionId: `${launchSessionId}-retry`,
      platform: "android",
      runnerProfile: "native_android",
      deviceId,
      appId,
      launchUrl: "android.settings.SETTINGS",
    });
    await sleep(2500);
    foreground = await getForegroundPackage();
    console.log(`[ENTRY] Foreground after launch retry: ${foreground ?? "unknown"}`);
    evidence = await collectEntryEvidence(server, "after-launch_retry");
    if (looksLikeSettingsHome(evidence)) {
      console.log("[ENTRY] Settings UI semantics detected after launch retry; accepting launch despite foreground mismatch.");
      return;
    }
  }

  if (foreground !== appId) {
    await ensureDeviceAwakeAndUnlocked();
    await launchSettingsViaAdbFallback();
    foreground = await getForegroundPackage();
    console.log(`[ENTRY] Foreground after adb fallback launch: ${foreground ?? "unknown"}`);
    evidence = await collectEntryEvidence(server, "after-adb-fallback");
    if (looksLikeSettingsHome(evidence)) {
      console.log("[ENTRY] Settings UI semantics detected after adb fallback; accepting launch despite foreground mismatch.");
      return;
    }
  }

  if (looksLikeLockedSystemOverlay(evidence)) {
    console.log("[ENTRY] Locked/system overlay still detected; performing aggressive recovery...");
    await aggressivelyRecoverToUsableForeground();
    await launchSettingsViaAdbFallback();
    foreground = await getForegroundPackage();
    console.log(`[ENTRY] Foreground after aggressive recovery: ${foreground ?? "unknown"}`);
    evidence = await collectEntryEvidence(server, "after-aggressive-recovery");
    if (looksLikeSettingsHome(evidence)) {
      console.log("[ENTRY] Settings UI semantics detected after aggressive recovery.");
      return;
    }
    if (looksLikeLockedSystemOverlay(evidence)) {
      throw new Error(
        `Android entry guard failed: device still appears locked or covered by system UI. ` +
        `topActivity=${evidence.topActivity}, sampleTexts=${JSON.stringify(evidence.sampleTexts)}. ` +
        `Unlock the Vivo device fully, keep it awake on the home screen, then rerun.`,
      );
    }
  }

  if (foreground !== appId) {
    throw new Error(`Android entry guard failed: foreground package is ${foreground ?? "unknown"}, expected ${appId}`);
  }
}

async function runMcpUiProbe(server: ReturnType<typeof createServer>): Promise<void> {
  const probeSessionId = `probe-${Date.now()}`;
  const probeOutputPath = `artifacts/explorer/debug-inspect-${probeSessionId}.xml`;

  console.log("[PROBE] Running MCP UI probe before explorer...");

  await launchSettingsAndVerifyForeground(server);

  await server.invoke("wait_for_ui_stable", {
    sessionId: probeSessionId,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    timeoutMs: 5000,
    intervalMs: 300,
    consecutiveStable: 2,
  });

  const inspectResult = await server.invoke("inspect_ui", {
    sessionId: probeSessionId,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    outputPath: probeOutputPath,
  }) as {
    status: string;
    reasonCode?: string;
    data?: {
      content?: string;
      outputPath?: string;
      summary?: {
        totalNodes?: number;
        clickableNodes?: number;
      };
    };
  };

  const content = inspectResult.data?.content ?? "";
  const firstLine = content.split(/\r?\n/)[0]?.trim() ?? "";
  const totalNodes = inspectResult.data?.summary?.totalNodes;
  const clickableNodes = inspectResult.data?.summary?.clickableNodes;

  console.log(
    `[PROBE] inspect_ui status=${inspectResult.status}, reason=${inspectResult.reasonCode ?? "OK"}, totalNodes=${totalNodes ?? "n/a"}, clickableNodes=${clickableNodes ?? "n/a"}`,
  );
  console.log(
    `[PROBE] inspect_ui contentLength=${content.length}, firstLine=${firstLine || "<empty>"}, outputPath=${inspectResult.data?.outputPath ?? probeOutputPath}`,
  );
}

async function terminateTargetApp(): Promise<void> {
  console.log("\n[CLEANUP] Terminating target app to ensure clean state...");

  const server = createServer();
  const sessionId = `cleanup-${Date.now()}`;

  await server.invoke("terminate_app", {
    sessionId,
    platform: "android",
    runnerProfile: "native_android",
    deviceId,
    appId,
  });

  await sleep(2000);
  await server.dispose?.();

  console.log("[CLEANUP] Target app terminated.\n");
}

async function main(): Promise<void> {
  await terminateTargetApp();

  console.log("=== Explorer Test Harness: Android Physical Device ===");
  console.log(`Target app: ${appId}`);
  console.log(`Device ID: ${deviceId}`);
  console.log(`Mode: ${mode} (${mode === "smoke" ? "shallow breadth" : "deep coverage"})\n`);

  const server = createServer();

  await runMcpUiProbe(server);
  process.env.EXPLORER_SKIP_PREFLIGHT_LAUNCH = "1";

  await explore(
    [
      "--mode", mode,
      "--app-id", appId,
      "--platform", "android-device",
      "--no-prompt",
      "--output", outputDir,
      "--max-depth", maxDepth,
      "--timeout-ms", timeoutMs,
    ],
    server,
  );

  const exitCode = process.exitCode ?? 0;
  if (exitCode === 0) {
    console.log(`\n${mode} mode complete. Reports in ${outputDir}/`);
  } else {
    console.error(`\n${mode} mode finished with failures (exitCode=${exitCode}). Reports in ${outputDir}/`);
  }

  await server.dispose?.();
  await flushLogStream();
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Explorer Android physical-device test failed:", err);
  flushLogStream().finally(() => process.exit(1));
});
