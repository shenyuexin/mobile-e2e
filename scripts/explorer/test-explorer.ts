/**
 * Quick test harness for the explorer on iOS Settings simulator.
 *
 * Run: npx tsx scripts/test-explorer.ts [smoke|full]
 *
 * First terminates Settings app to ensure clean home page state,
 * then runs the explorer.
 */

import { createWriteStream } from "node:fs";

import { explore } from "../../packages/explorer/src/cli.js";
import { prepareRunArtifacts } from "../../packages/explorer/src/run-artifacts.js";
import { formatRunTimestamp } from "../../packages/explorer/src/report/summary.js";
import { createServer } from "../../packages/mcp-server/src/index.js";

const mode = process.argv[2] === "full" ? "full" : "smoke";
const outputDir = mode === "full" ? "artifacts/explorer/full" : "artifacts/explorer/smoke";
const maxDepth = mode === "full" ? "8" : "5";
const timeoutMs = mode === "full" ? "7200000" : "3600000";
const { logPath, runDir, runId } = prepareRunArtifacts(outputDir);
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
  logStream.write(`[${formatRunTimestamp(new Date())}] [${level}] ${line}\n`);
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

async function terminateSettingsApp(): Promise<void> {
  console.log("\n[CLEANUP] Terminating Settings app to ensure clean state...");
  const server = await createServer();
  const sessionId = `cleanup-${Date.now()}`;
  const deviceId = "ADA078B9-3C6B-4875-8B85-A7789F368816";

  await server.invoke("terminate_app", {
    sessionId, platform: "ios", runnerProfile: "native_ios", deviceId,
    appId: "com.apple.Preferences",
  });

  // Wait for full termination
  await new Promise(r => setTimeout(r, 3000));

  // Dispose to free resources
  await server.dispose?.();
  console.log("[CLEANUP] Settings terminated.\n");
}

async function main(): Promise<void> {
  // Step 0: Clean state
  await terminateSettingsApp();

  console.log(`=== Explorer Test Harness: iOS Settings App ===`);
  console.log(`Target: com.apple.Preferences on iOS simulator`);
  console.log(`Mode: ${mode} (${mode === "smoke" ? "shallow breadth" : "deep coverage"})\n`);
  console.log(`[ARTIFACTS] runId=${runId}`);
  console.log(`[ARTIFACTS] runDir=${runDir}`);

  const server = await createServer();

  try {
    await explore(
      [
        "--mode", mode,
        "--app-id", "com.apple.Preferences",
        "--platform", "ios-simulator",
        "--no-prompt",
        "--output", outputDir,
        "--max-depth", maxDepth,
        "--timeout-ms", timeoutMs,
      ],
      server,
    );

    console.log(`\n${mode} mode complete. Reports in ${runDir}/`);
  } finally {
    await server.dispose?.();
    await flushLogStream();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Explorer test failed:", err);
  void flushLogStream().finally(() => {
    process.exit(1);
  });
});
