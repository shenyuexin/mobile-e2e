/**
 * Explorer runner — orchestrates the full exploration pipeline.
 *
 * Flow: create session -> load config -> pre-flight auth -> create MCP adapter -> run explore engine -> generate report -> cleanup
 */

import type { ExplorerConfig, ExplorerPlatform, ExplorationMode, FailureStrategy, DestructiveActionPolicy, AuthConfig } from "./types.js";
import type { InvokableServer } from "./mcp-adapter.js";
import { explore, FailureLog } from "./engine.js";
import { createMcpAdapter, type SessionContext } from "./mcp-adapter.js";
import { generateReport } from "./report.js";
import { checkAuth } from "./auth-preflight.js";
import { ConfigStore } from "./config-store.js";
import { buildDefaultConfig } from "./config.js";
import type { Platform, RunnerProfile } from "@mobile-e2e-mcp/contracts";

/** Map ExplorerPlatform to MCP Platform */
function toMcpPlatform(platform: ExplorerPlatform): Platform {
  if (platform.startsWith("ios")) return "ios";
  return "android";
}

/** Map ExplorerPlatform to MCP RunnerProfile */
function toRunnerProfile(platform: ExplorerPlatform): RunnerProfile {
  if (platform.startsWith("ios")) return "native_ios";
  if (platform.startsWith("android")) return "native_android";
  return "native_ios";
}

/** Input for the runner, can come from CLI args, config file, or defaults. */
export interface RunnerInput {
  mode?: ExplorationMode;
  appId?: string;
  platform?: ExplorerPlatform;
  failureStrategy?: FailureStrategy;
  destructiveActionPolicy?: DestructiveActionPolicy;
  maxDepth?: number;
  maxPages?: number;
  timeoutMs?: number;
  reportDir?: string;
  compareWith?: string | null;
  auth?: AuthConfig;
  configPath?: string;
  skipInterview?: boolean;
}

/** Result returned by the runner. */
export interface ExplorerResult {
  success: boolean;
  exitCode: number;
  visitedPages: number;
  failedCount: number;
  durationMs: number;
  reportPath: string | null;
  stage: string;
  error?: string;
}

/**
 * Run a full exploration session.
 *
 * @param server — the MCP server instance to bind to
 * @param input — configuration overrides
 * @returns ExplorerResult with outcome summary
 */
export async function runExplore(
  server: InvokableServer,
  input: RunnerInput = {},
): Promise<ExplorerResult> {
  const startTime = Date.now();

  // --- Stage 1: Load config ---
  console.log("[RUNNER] Stage 1/5: Loading configuration...");
  let config: ExplorerConfig;
  try {
    const store = new ConfigStore(input.configPath);
    const saved = store.load();
    const defaults = buildDefaultConfig(input);
    config = saved ? { ...defaults, ...saved, ...input } : defaults;
    console.log(`[RUNNER]   mode=${config.mode}, appId=${config.appId}, platform=${config.platform}`);
  } catch (err) {
    return failResult("config-load", startTime, err);
  }

  // --- Stage 2: Create session context ---
  console.log("[RUNNER] Stage 2/6: Creating session context...");
  const sessionId = `explorer-${Date.now()}`;
  const platform = toMcpPlatform(config.platform ?? "ios-simulator");
  const runnerProfile = toRunnerProfile(config.platform ?? "ios-simulator");
  const deviceId = process.env.M2E_DEVICE_ID; // optional, simulator UDID or empty

  const sessionCtx: SessionContext = {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
  };

  console.log(`[RUNNER]   sessionId=${sessionId}, platform=${platform}, runnerProfile=${runnerProfile}`);

  // --- Stage 3: Pre-flight auth ---
  console.log("[RUNNER] Stage 3/6: Auth pre-flight...");
  const mcp = createMcpAdapter(server, sessionCtx);
  try {
    const authResult = await checkAuth(
      { auth: config.auth, appId: config.appId },
      mcp,
    );
    if (!authResult.success) {
      console.error(`[RUNNER] Auth pre-flight failed: ${authResult.reason}`);
      return failResult("auth", startTime, authResult.reason);
    }
  } catch (err) {
    return failResult("auth", startTime, err);
  }

  // --- Stage 4: Run explore engine ---
  console.log("[RUNNER] Stage 4/6: Running exploration engine...");
  let explorationResult: Awaited<ReturnType<typeof explore>>;
  try {
    explorationResult = await explore(config, mcp);
    console.log(`[RUNNER]   Visited ${explorationResult.visited.count} pages, ${explorationResult.failed.getEntries().length} failures`);
  } catch (err) {
    return failResult("engine", startTime, err);
  }

  // --- Stage 5: Generate report ---
  console.log("[RUNNER] Stage 5/6: Generating report...");
  try {
    const entries = explorationResult.visited.getEntries();
    const failures = explorationResult.failed.getEntries();
    const durationMs = Date.now() - startTime;
    await generateReport(entries, failures, config, {
      partial: explorationResult.aborted ?? false,
      abortReason: explorationResult.abortReason,
      durationMs,
      sampling: explorationResult.sampling,
      runId: process.env.EXPLORER_RUN_ID,
    });
    const reportPath = `${config.reportDir}/index.json`;
    console.log(`[RUNNER]   Report written to ${config.reportDir}/`);
  } catch (err) {
    console.error(`[RUNNER] Report generation failed: ${err}`);
    // Non-fatal — exploration data is still valid
  }

  // --- Stage 6: Cleanup ---
  console.log("[RUNNER] Stage 6/6: Cleanup...");
  // In Phase 1, cleanup is minimal. Future: terminate app, save final config.

  const durationMs = Date.now() - startTime;
  const visitedCount = explorationResult.visited.count;
  const failedCount = explorationResult.failed.getEntries().length;
  const aborted = explorationResult.aborted ?? false;

  return {
    success: !aborted,
    exitCode: aborted ? 2 : 0,
    visitedPages: visitedCount,
    failedCount,
    durationMs,
    reportPath: `${config.reportDir}/index.json`,
    stage: "complete",
  };
}

function failResult(stage: string, startTime: number, error: unknown): ExplorerResult {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    exitCode: 1,
    visitedPages: 0,
    failedCount: 0,
    durationMs: Date.now() - startTime,
    reportPath: null,
    stage,
    error: msg,
  };
}
