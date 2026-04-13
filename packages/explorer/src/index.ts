/**
 * @mobile-e2e-mcp/explorer — DFS-based full app exploration engine.
 *
 * Public API for the explorer package.
 */

// Core types
export type {
  ExplorerConfig,
  ExplorationMode,
  ExplorationScope,
  AuthConfig,
  FailureStrategy,
  DestructiveActionPolicy,
  ExplorerPlatform,
  TestCredentials,
  PageSnapshot,
  UiHierarchy,
  ClickableTarget,
  ElementSelector,
  DedupResult,
  Frame,
  PageState,
  ExplorationResult,
  FailureEntry,
  PageEntry,
  Action,
  PageRegistryContract,
  FailureLogContract,
  CircuitBreakerState,
  BacktrackResult,
} from "./types.js";

// MCP adapter
export {
  createMcpAdapter,
  unwrapResult,
} from "./mcp-adapter.js";
export type { McpToolInterface, InvokableServer } from "./mcp-adapter.js";

// Element filtering and prioritization
export {
  findClickableElements,
  prioritizeElements,
  isToggle,
  isInteractive,
  isTextInput,
  isNonInteractive,
  isDestructive,
  flattenTree,
  collectVisibleTexts,
  getElementLabel,
  buildSelector,
  toClickableTarget,
  priorityScore,
} from "./element-prioritizer.js";

// Page registry and dedup
export { PageRegistry } from "./page-registry.js";
export { hashVisibleTexts, hashUiStructure } from "./page-registry.js";

// Circuit breaker
export {
  createCircuitBreaker,
  recordPageSuccess,
  recordPageFailure,
  resetCircuit,
  isCircuitOpen,
  shouldSkipPage,
} from "./circuit-breaker.js";

// Snapshot and tap execution
export {
  createSnapshotter,
  createTapExecutor,
  generateScreenId,
  extractScreenTitle,
} from "./snapshot.js";
export type { TapResult } from "./snapshot.js";

// Backtracking
export { createBacktracker } from "./backtrack.js";

// DFS engine
export { explore as exploreEngine, FailureLog } from "./engine.js";

// Report
export { generateReport } from "./report.js";

// Config & CLI (25-03)
export {
  INTERVIEW_QUESTIONS,
  loadConfig,
  saveConfig,
  shouldReuseConfig,
  buildDefaultConfig,
  AdaptiveMaxPages,
  globalConfigPath,
  projectConfigPath,
} from "./config.js";

// Config store
export { ConfigStore } from "./config-store.js";

// Interview
export { runInterview } from "./interview.js";

// Auth pre-flight
export { checkAuth } from "./auth-preflight.js";

// Runner
export { runExplore } from "./runner.js";
export type { RunnerInput, ExplorerResult } from "./runner.js";

// CLI entry point
export { explore } from "./cli.js";
