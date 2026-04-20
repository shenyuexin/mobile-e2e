/**
 * Core type definitions for the explorer engine.
 *
 * This is the SHARED contract for 25-02 (Report) and 25-03 (Config).
 * Types must be stable and well-documented.
 */

import type { McpToolInterface } from "./mcp-adapter.js";

// ---------------------------------------------------------------------------
// §3.1 Configuration Schema
// ---------------------------------------------------------------------------

/** Match criteria for a sampling rule. */
export interface SamplingRuleMatch {
  /** Full path prefix to match (e.g. ["General", "Fonts", "System Fonts"]). */
  pathPrefix?: string[];
  /** Screen title to match (exact). */
  screenTitle?: string;
  /** Screen ID to match (exact). */
  screenId?: string;
}

/** Strategy for sampling high-fanout collection pages. */
export type SamplingStrategy = "representative-child";

/** A sampling rule for high-fanout repeated collection pages. */
export interface SamplingRule {
  /** How to match this rule against the current page. */
  match: SamplingRuleMatch;
  /** Explorer mode(s) this rule applies to. */
  mode?: ExplorationMode;
  /** Sampling strategy to use when matched. */
  strategy: SamplingStrategy;
  /** Max children to validate as representatives (default: 1). */
  maxChildrenToValidate?: number;
  /** Stop after the first successful child navigation. */
  stopAfterFirstSuccessfulNavigation?: boolean;
  /** Action labels to exclude (e.g. ["Download"]). */
  excludeActions?: string[];
}

/** Credentials for auto-login auth mode. */
export interface TestCredentials {
  /** Accessibility ID or selector for the username/identifier field. */
  identifierField: string;
  /** Accessibility ID or selector for the password field. */
  passwordField: string;
  /** Text or ID of the login/submit button. */
  submitAction: string;
  /** The identifier value (username/email). */
  identifier: string;
  /** Environment variable name for password (never stored in plaintext). */
  passwordEnv: string;
}

/** Exploration mode determining how deeply the engine traverses. */
export type ExplorationMode = "smoke" | "scoped" | "full";

/** Scope filter for 'scoped' mode. */
export interface ExplorationScope {
  type: "screen-title" | "element-text" | "tab-index" | "module-name";
  value: string | number;
}

/** Auth strategy for the exploration session. */
export type AuthConfig =
  | { type: "already-logged-in" }
  | { type: "skip-auth" }
  | { type: "handoff" }
  | { type: "auto-login"; credentials: TestCredentials };

/** How to handle element tap failures. */
export type FailureStrategy = "retry-3" | "skip" | "handoff";

/** How to handle elements that may cause destructive actions. */
export type DestructiveActionPolicy = "skip" | "confirm" | "allow";
/** How to handle stateful form-entry branches (create/add/manage/select address-like flows). */
export type StatefulFormPolicy = "skip" | "confirm" | "allow";

/** Target platform for the exploration session. */
export type ExplorerPlatform =
  | "ios-simulator"
  | "ios-device"
  | "android-emulator"
  | "android-device";

/**
 * Main configuration for the explorer engine.
 * SPEC §3.1 — all fields from the config schema.
 */
export interface ExplorerConfig {
  /** Exploration depth mode. */
  mode: ExplorationMode;
  /** Optional scope filter for 'scoped' mode. */
  scope?: ExplorationScope;
  /** Authentication strategy. */
  auth: AuthConfig;
  /** How to handle tap failures. */
  failureStrategy: FailureStrategy;
  /** Maximum depth to traverse (default: 8). */
  maxDepth: number;
  /** Maximum unique pages to visit (derived from timeout / avgPageTime). */
  maxPages: number;
  /** Total timeout in milliseconds. */
  timeoutMs: number;
  /** Run ID to diff against, or null for no comparison. */
  compareWith: string | null;
  /** Target platform. */
  platform: ExplorerPlatform;
  /** How to handle destructive elements (SPEC §4.4, R1-#1). */
  destructiveActionPolicy: DestructiveActionPolicy;
  /** How to handle stateful form-entry branches that are risky but not strictly destructive. */
  statefulFormPolicy?: StatefulFormPolicy;
  /** Bundle ID / package name of the target app. */
  appId: string;
  /** Base output directory for reports. */
  reportDir: string;
  /** Sampling rules for high-fanout collection pages (smoke mode). */
  samplingRules?: SamplingRule[];
  /** Maximum depth for external app exploration (default: 1).
   * 
   * When an external link (e.g., "Learn more") opens another app like Safari,
   * this limits how deep the explorer goes in the external app.
   * Configurable so users can increase it later if needed.
   */
  externalLinkMaxDepth?: number;
}

// ---------------------------------------------------------------------------
// §4.2 Page Snapshot
// ---------------------------------------------------------------------------

/**
 * UiHierarchy — raw output from inspect_ui MCP tool.
 *
 * Currently typed as a flexible shape because the exact structure from
 * InspectUiNode may vary. The `children` property is a placeholder —
 * actual child nesting depends on the MCP tool's tree serialization.
 *
 * After 25-00 spike: this matches InspectUiNode from contracts.
 */
export interface UiHierarchy {
  index?: number;
  depth?: number;
  text?: string;
  resourceId?: string;
  className?: string;
  packageName?: string;
  contentDesc?: string;
  clickable: boolean;
  enabled: boolean;
  scrollable: boolean;
  bounds?: string;
  /** Child nodes in the UI tree. */
  children?: UiHierarchy[];
  /** iOS-specific: accessibility label. */
  accessibilityLabel?: string;
  /** iOS-specific: accessibility traits. */
  accessibilityTraits?: string[];
  /** iOS-specific: accessibility role. */
  accessibilityRole?: string;
  /** Visible text content in this node. */
  visibleTexts?: string[];
  /** Frame/bounds as a structured object. */
  frame?: { x: number; y: number; width: number; height: number };
  /** iOS AXUniqueId for stable targeting. */
  AXUniqueId?: string;
  /** iOS AXValue for toggle state (e.g., "0"/"1", "On"/"Off"). */
  AXValue?: string;
  /** Element type label (className alias for classification). */
  elementType?: string;
  /** Human-readable label (alias for contentDesc/text). */
  label?: string;
  /** Any additional properties from the MCP tool. */
  [key: string]: unknown;
}

/** Selector for targeting a UI element. */
export interface ElementSelector {
  /** Resource ID / AXUniqueId (most stable, works on both iOS and Android). */
  resourceId?: string;
  /** Content description / accessibilityLabel. */
  contentDesc?: string;
  /** Visible text content. */
  text?: string;
  /** Element type/class name. */
  elementType?: string;
  /** Fallback coordinate-based position. */
  position?: { x: number; y: number };
}

/** A UI element that can be tapped during exploration. */
export interface ClickableTarget {
  /** Human-readable label for logging and reporting. */
  label: string;
  /** Selector for targeting the element. */
  selector: ElementSelector;
  /** Element type (e.g., "Button", "Cell", "CheckBox", "Link"). */
  elementType: string;
  /** Priority score for exploration ordering (higher = explore first). */
  priority?: number;
  /** Whether this element is likely to open an external app (e.g., "Learn more" links). */
  isExternalLink?: boolean;
}

/**
 * A snapshot of the current screen state.
 * SPEC §4.2 — captured after each navigation action.
 */
export interface PageSnapshot {
  /** Unique screen identifier (from structural hash). */
  screenId: string;
  /** Human-readable screen title (if detectable). */
  screenTitle?: string;
  /** Route name (if available from the framework). */
  routeName?: string;
  /** Full UI hierarchy tree. */
  uiTree: UiHierarchy;
  /** Clickable elements on this page (filtered and prioritized). */
  clickableElements: ClickableTarget[];
  /** Path to the screenshot image file. */
  screenshotPath: string;
  /** ISO timestamp when the snapshot was captured. */
  capturedAt: string;
  /** Screen ID of the parent page (null for root). */
  arrivedFrom: string | null;
  /** Label of the element that led to this page (null for root). */
  viaElement: string | null;
  /** Depth in the exploration tree (0 = root). */
  depth: number;
  /** Time in milliseconds for the page to load/stabilize. */
  loadTimeMs: number;
  /** Stability score from wait_for_ui_stable (1.0 = fully stable). */
  stabilityScore: number;
  /** Bundle ID of the app that owns this screen (for app switching detection). */
  appId?: string;
  /** Whether this screen belongs to an external app (e.g., Safari opened from link). */
  isExternalApp?: boolean;
  /** Whether this page was reached but intentionally not expanded further. */
  explorationStatus?: "expanded" | "reached-not-expanded";
  /** Policy or rule that stopped further exploration. */
  stoppedByPolicy?: string;
  /** Rule family responsible for classification. */
  ruleFamily?: string;
  /** Recovery or exit method after intentional stop. */
  recoveryMethod?: string;
}

// ---------------------------------------------------------------------------
// Dedup types
// ---------------------------------------------------------------------------

/** Result of the dedup check against previously visited pages. */
export interface DedupResult {
  /** Whether this page has already been visited. */
  alreadyVisited: boolean;
  /** ID of the matching page (if already visited). */
  matchedId?: string;
  /** Confidence level of the match. */
  confidence?: "text" | "structure" | "visual";
  /** Warning message for near-matches or edge cases. */
  warning?: string;
}

// ---------------------------------------------------------------------------
// Engine types — per-element immediate exploration DFS (SPEC §4.1 v3.0)
// ---------------------------------------------------------------------------

/** Opaque state held in a frame for page-change validation. */
export interface PageState {
  /** Screen ID for page identity checks (text-based hash). */
  screenId?: string;
  /** Human-readable screen title for iOS back button targeting. */
  screenTitle?: string;
  /** Structural hash of the UI tree (stable across dynamic text changes). */
  structureHash?: string;
}

/**
 * DFS stack frame with mutable element cursor.
 *
 * CRITICAL: Uses elementIndex as a mutable cursor (not pop+for loop).
 * This ensures each element is explored on the correct page.
 * SPEC §4.1, R2-A — fixes the sibling exploration bug.
 */
export interface Frame {
  /** Opaque page state for validation. */
  state: PageState;
  /** Depth in the exploration tree. */
  depth: number;
  /** Path of element labels leading to this frame. */
  path: string[];
  /** Mutable cursor: index of the next element to explore. */
  elementIndex: number;
  /** Pre-computed clickable elements on this page (prioritized). */
  elements: ClickableTarget[];
  /** Parent page title — used as iOS back button text. */
  parentTitle?: string;
  /** Bundle ID of the app that owns this page (for app switching detection). */
  appId?: string;
  /** Whether this page belongs to an external app (skip back navigation). */
  isExternalApp?: boolean;
}

/** Registry of visited pages with dedup capability. */
export interface PageRegistryContract {
  /** Check if a snapshot matches a previously visited page. */
  dedup(snapshot: PageSnapshot): Promise<DedupResult>;
  /** Register a new page in the registry. */
  register(result: DedupResult, snapshot: PageSnapshot, path: string[]): void;
  /** Get all registered page entries. */
  getEntries(): PageEntry[];
  /** Number of unique pages registered. */
  count: number;
}

/** Circuit breaker state for per-page failure tracking. */
export interface CircuitBreakerState {
  /** Number of consecutive pages with zero successful navigations. */
  consecutiveFailedPages: number;
  /** Failure count for the current page. */
  currentPageFailures: number;
  /** Configurable threshold (default 3 failures per page). */
  threshold: number;
}

// ---------------------------------------------------------------------------
// Exploration result types
// ---------------------------------------------------------------------------

/** Failure entry logged when an element tap fails. */
export interface FailureEntry {
  /** Screen ID of the page where the failure occurred. */
  pageScreenId: string;
  /** Label of the element that failed. */
  elementLabel: string;
  /** Type of failure. */
  failureType:
    | "TAP_FAILED"
    | "TIMEOUT"
    | "CRASH"
    | "BACKTRACK_MISMATCH"
    | "INTERRUPTED";
  /** Number of retry attempts. */
  retryCount: number;
  /** Error message. */
  errorMessage: string;
  /** Depth in the exploration tree. */
  depth: number;
  /** Path of element labels leading to this failure. */
  path: string[];
}

/** Transition lifecycle event type. */
export type TransitionLifecycleEventType =
  | "action_sent"
  | "post_state_observed"
  | "transition_committed"
  | "transition_rejected";

/** Transition lifecycle counters for observability. */
export interface TransitionLifecycleSummary {
  actionSent: number;
  postStateObserved: number;
  transitionCommitted: number;
  transitionRejected: number;
}

export type TransitionKind = "forward" | "back" | "cancel" | "home" | "relaunch";

export interface StateGraphSummary {
  nodeCount: number;
  edgeCount: number;
  committedEdgeCount: number;
  rejectedEdgeCount: number;
}

/** Complete result of an exploration session. */
export interface ExplorationResult {
  /** Registry of all visited pages. */
  visited: PageRegistryContract;
  /** Log of all failures. */
  failed: FailureLogContract;
  /** Whether the exploration was aborted early. */
  aborted?: boolean;
  /** Reason for abortion (if aborted). */
  abortReason?: string;
  /** Sampling metadata for high-fanout collection pages. */
  sampling?: {
    /** Pages where sampling was applied (screenId set). */
    appliedPages: string[];
    /** Total children skipped due to sampling. */
    skippedChildren: number;
    /** Per-page sampling details for report rendering. */
    details?: Record<string, {
      screenTitle?: string;
      totalChildren: number;
      exploredChildren: number;
      skippedChildren: number;
      exploredLabels: string[];
      skippedLabels: string[];
    }>;
  };
  /** Transition lifecycle summary for auditing navigation progress. */
  transitionLifecycle?: TransitionLifecycleSummary;
  /** StateGraph summary metrics for this run. */
  stateGraph?: StateGraphSummary;
}

/** Failure log collection. */
export interface FailureLogContract {
  /** Record a new failure entry. */
  record(entry: FailureEntry): void;
  /** Get all failure entries. */
  getEntries(): FailureEntry[];
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

/** A page entry in the exploration report. */
export interface PageEntry {
  /** Unique page ID (sequential, e.g., "page-001"). */
  id: string;
  /** Screen identifier. */
  screenId: string;
  /** Human-readable screen title. */
  screenTitle?: string;
  /** Depth in the exploration tree. */
  depth: number;
  /** Path of element labels leading to this page. */
  path: string[];
  /** Screen ID of the parent page. */
  arrivedFrom: string | null;
  /** Label of the element that led to this page. */
  viaElement: string | null;
  /** Page load time in milliseconds. */
  loadTimeMs: number;
  /** Number of clickable elements found. */
  clickableCount: number;
  /** Whether this page had any failures. */
  hasFailure: boolean;
  /** The original snapshot (for report generation). */
  snapshot?: PageSnapshot;
  /** Whether this page was fully expanded or intentionally not expanded. */
  explorationStatus?: "expanded" | "reached-not-expanded";
  /** Policy or rule that stopped further exploration. */
  stoppedByPolicy?: string;
  /** Rule family responsible for classification. */
  ruleFamily?: string;
  /** Recovery or exit method after intentional stop. */
  recoveryMethod?: string;
}

/** Action to take on failure. */
export type Action = "abort" | "retry" | "skip" | "handoff";

// ---------------------------------------------------------------------------
// Backtrack types
// ---------------------------------------------------------------------------

/** Result of a backtracking operation. */
export interface BacktrackResult {
  /** Whether the back navigation succeeded. */
  success: boolean;
  /** Screen ID after backtracking (for validation). */
  screenId?: string;
  /** Error message if backtracking failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Re-export McpToolInterface for consumers that need it
// ---------------------------------------------------------------------------

export type { McpToolInterface, InvokableServer } from "./mcp-adapter.js";
