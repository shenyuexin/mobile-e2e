/**
 * CLI executable command constants for the adapter-maestro package.
 *
 * These are the actual command-line tool names invoked via shell execution.
 * Subcommands (e.g. "simctl", "devicectl") are children of "xcrun" and
 * compose as [CLI_COMMANDS.xcrun, "simctl", ...] — no separate constant needed.
 *
 * Note: backendId values ("wda", "axe", "simctl", "devicectl", "maestro", "idb")
 * in ios-backend-types.ts are routing identifiers, NOT CLI executable names.
 * They serve a different purpose and are not included here.
 */
export const CLI_COMMANDS = {
  // Android CLI
  adb: "adb",
  // Cross-platform
  maestro: "maestro",
  traceProcessor: "trace_processor",
  // iOS toolchain
  xcrun: "xcrun",
  xctrace: "xctrace",
} as const;
