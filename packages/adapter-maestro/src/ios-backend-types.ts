// ios-backend-types.ts - iOS backend interface definitions
// No runtime dependencies - pure types only

/** Result of probing whether a specific iOS backend CLI is available and functional. */
export interface BackendProbeResult {
  available: boolean;
  /** Version string when available, e.g. "15.0" for Xcode version. */
  version?: string;
  /** Human-readable error when probing fails. */
  error?: string;
}

/**
 * Core abstraction for an iOS execution backend.
 *
 * Implementations provide command builders that return `string[]` arrays.
 * Execution is delegated to the ui-tools layer via `executeUiActionCommand`.
 * This separation keeps probing, command construction, and execution concerns distinct.
 */
export interface IosExecutionBackend {
  /** Canonical backend identifier used for routing and logging. */
  readonly backendId: "axe" | "simctl" | "devicectl" | "maestro" | "idb";
  /** Human-readable backend name, e.g. "Xcode simctl", "Apple devicectl". */
  readonly backendName: string;

  /** Probe whether this backend's CLI is installed and functional. */
  probeAvailability(repoRoot: string): Promise<BackendProbeResult>;

  // -- Command builders (return string[], do NOT execute) --

  /** Build a tap command for the given device and coordinates. */
  buildTapCommand(deviceId: string, x: number, y: number): string[];
  /** Build a type-text command for the given device and text content. */
  buildTypeTextCommand(deviceId: string, text: string): string[];
  /** Build a swipe command with start/end coordinates and duration. */
  buildSwipeCommand(
    deviceId: string,
    swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number },
  ): string[];
  /** Build a hierarchy capture command that returns JSON/XML hierarchy data. */
  buildHierarchyCaptureCommand(deviceId: string): string[];
  /** Build a screenshot command writing output to the given path. */
  buildScreenshotCommand(deviceId: string, outputPath: string): string[];

  /** Per-action support level indicating how well each action is supported. */
  readonly supportLevel: Record<"tap" | "typeText" | "swipe" | "hierarchy" | "screenshot", "full" | "partial" | "none">;

  /** Return a human-readable suggestion for diagnosing a failed action. */
  buildFailureSuggestion(action: string, deviceId: string): string;
}

/** Summary of probe results across all candidate iOS backends. */
export interface BackendProbeSummary {
  axe: BackendProbeResult;
  simctl: BackendProbeResult;
  devicectl: BackendProbeResult;
  maestro: BackendProbeResult;
  /** Deprecated backend; only present when explicitly requested. */
  idb?: BackendProbeResult;
}
