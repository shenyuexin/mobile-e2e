/**
 * CLI entry point for the explorer.
 *
 * Parses process.argv, optionally runs the interview, then delegates to the runner.
 * Exported as `explore()` for wiring through the mcp-server CLI.
 */

import type { ExplorerConfig, ExplorerPlatform, ExplorationMode, FailureStrategy, DestructiveActionPolicy, AuthConfig } from "./types.js";
import type { InvokableServer } from "./mcp-adapter.js";
import { runExplore, type ExplorerResult } from "./runner.js";
import { runInterview } from "./interview.js";
import { ConfigStore } from "./config-store.js";
import { loadConfig, buildDefaultConfig } from "./config.js";

// ---------------------------------------------------------------------------
// CLI flag
// ---------------------------------------------------------------------------

interface ExploreFlags {
  mode?: ExplorationMode;
  appId?: string;
  platform?: ExplorerPlatform;
  noPrompt: boolean;
  configPath?: string;
  output?: string;
  compare?: string;
  maxDepth?: number;
  timeoutMs?: number;
  help: boolean;
  failureStrategy?: FailureStrategy;
  destructiveActionPolicy?: DestructiveActionPolicy;
}

const VALID_MODES: ExplorationMode[] = ["smoke", "scoped", "full"];
const VALID_PLATFORMS: ExplorerPlatform[] = ["ios-simulator", "ios-device", "android-emulator", "android-device"];
const VALID_FAILURE_STRATEGIES: FailureStrategy[] = ["retry-3", "skip", "handoff"];
const VALID_DESTRUCTIVE_POLICIES: DestructiveActionPolicy[] = ["skip", "allow", "confirm"];

function printHelp(): void {
  console.log(`
Usage: mobile-e2e-mcp explore [options]

Options:
  --mode <mode>             Exploration mode: smoke, scoped (default), full
  --app-id <id>             Application Bundle ID / Package Name
  --platform <platform>     Target platform: ios-simulator, ios-device, android-emulator, android-device
  --max-depth <n>           Maximum exploration depth (default: mode-based: 5/8/∞)
  --timeout-ms <ms>         Total timeout in milliseconds (default: 300000)
  --no-prompt               Skip interactive interview, use defaults or args
  --config <path>           Path to config file (default: .explorer-config.json)
  --output <dir>            Output directory for reports (default: ./explorer-reports)
  --compare <runId>         Run ID to compare against
  --help                    Show this help message

Examples:
  mobile-e2e-mcp explore --no-prompt
  mobile-e2e-mcp explore --mode smoke --app-id com.apple.Preferences
  mobile-e2e-mcp explore --platform android-emulator --app-id com.example.app
  mobile-e2e-mcp explore --config ./my-config.json
`);
}

function parseFlags(argv: string[]): ExploreFlags {
  const flags: ExploreFlags = {
    noPrompt: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help") {
      flags.help = true;
    } else if (arg === "--no-prompt") {
      flags.noPrompt = true;
    } else if (arg === "--mode" && next) {
      if (!VALID_MODES.includes(next as ExplorationMode)) {
        console.error(`Error: Invalid mode "${next}". Valid: ${VALID_MODES.join(", ")}`);
        process.exit(2);
      }
      flags.mode = next as ExplorationMode;
      i++;
    } else if (arg === "--app-id" && next) {
      flags.appId = next;
      i++;
    } else if (arg === "--platform" && next) {
      if (!VALID_PLATFORMS.includes(next as ExplorerPlatform)) {
        console.error(`Error: Invalid platform "${next}". Valid: ${VALID_PLATFORMS.join(", ")}`);
        process.exit(2);
      }
      flags.platform = next as ExplorerPlatform;
      i++;
    } else if (arg === "--max-depth" && next) {
      const val = parseInt(next, 10);
      if (isNaN(val) || val < 1) {
        console.error(`Error: --max-depth must be a positive integer`);
        process.exit(2);
      }
      flags.maxDepth = val;
      i++;
    } else if (arg === "--timeout-ms" && next) {
      const val = parseInt(next, 10);
      if (isNaN(val) || val < 1000) {
        console.error(`Error: --timeout-ms must be at least 1000`);
        process.exit(2);
      }
      flags.timeoutMs = val;
      i++;
    } else if (arg === "--config" && next) {
      flags.configPath = next;
      i++;
    } else if (arg === "--output" && next) {
      flags.output = next;
      i++;
    } else if (arg === "--compare" && next) {
      flags.compare = next;
      i++;
    }
  }

  return flags;
}

/**
 * Main explore entry point called from the mcp-server CLI.
 *
 * @param argv — process.argv slice (after 'explore' subcommand)
 * @param server — the MCP server instance
 */
export async function explore(argv: string[], server: InvokableServer): Promise<void> {
  const flags = parseFlags(argv);

  if (flags.help) {
    printHelp();
    return;
  }

  // Build overrides from flags
  const overrides: Partial<ExplorerConfig> = {};
  if (flags.mode) overrides.mode = flags.mode;
  if (flags.appId) overrides.appId = flags.appId;
  if (flags.platform) overrides.platform = flags.platform;
  if (flags.maxDepth !== undefined) overrides.maxDepth = flags.maxDepth;
  if (flags.timeoutMs !== undefined) overrides.timeoutMs = flags.timeoutMs;
  if (flags.output) overrides.reportDir = flags.output;
  if (flags.compare !== undefined) overrides.compareWith = flags.compare;

  // Try to load saved config
  const savedConfig = loadConfig(flags.configPath);

  // Run interview unless --no-prompt is set
  let finalConfig: ExplorerConfig;
  if (flags.noPrompt) {
    finalConfig = buildDefaultConfig({ ...overrides });
    // Merge with saved config if available
    if (savedConfig) {
      finalConfig = { ...finalConfig, ...savedConfig, ...overrides };
    }
  } else {
    finalConfig = await runInterview(savedConfig, overrides);
  }

  // Validate appId
  if (!finalConfig.appId) {
    console.error("Error: --app-id is required. Use --help for usage.");
    process.exit(2);
  }

  // Save the config for future reuse
  const store = new ConfigStore(flags.configPath);
  store.save(finalConfig);

  // Run the exploration
  const result = await runExplore(server, {
    ...finalConfig,
    configPath: flags.configPath,
    skipInterview: flags.noPrompt,
  });

  // Print summary
  printSummary(result);
  process.exitCode = result.exitCode;
}

function printSummary(result: ExplorerResult): void {
  console.log("\n" + "=".repeat(50));
  console.log("  Explorer Session Summary");
  console.log("=".repeat(50));
  console.log(`  Status:       ${result.success ? "COMPLETE" : "INCOMPLETE"}`);
  console.log(`  Stage:        ${result.stage}`);
  console.log(`  Pages:        ${result.visitedPages}`);
  console.log(`  Failures:     ${result.failedCount}`);
  console.log(`  Duration:     ${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.reportPath) {
    console.log(`  Report:       ${result.reportPath}`);
  }
  if (result.error) {
    console.log(`  Error:        ${result.error}`);
  }
  console.log("=".repeat(50));
}
