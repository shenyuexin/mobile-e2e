/**
 * wait_for_ui_stable tool implementation.
 *
 * Polls the UI hierarchy until consecutive snapshots produce the same
 * structural hash, indicating the UI has stopped animating/transitioning.
 */

import {
  WaitForUiStableData,
  WaitForUiStableInput,
  REASON_CODES,
  RunnerProfile,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import {
  captureIosUiSnapshot,
  captureAndroidUiSnapshot,
} from "./ui-runtime.js";
import { resolveRepoPath } from "./harness-config.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 300;
const DEFAULT_CONSECUTIVE_STABLE = 2;

/**
 * Flatten the UI hierarchy into an array of node signatures suitable for hashing.
 * Only includes visible nodes with text content.
 */
export function flattenNodeSignatures(
  nodes: Array<Record<string, unknown>>,
  output: string[] = [],
): string[] {
  for (const node of nodes) {
    const visible = node.visible !== false;
    const text = typeof node.text === "string" ? node.text : "";
    const type = typeof node.type === "string" ? node.type : "";
    const bounds = typeof node.bounds === "string" ? node.bounds : "";

    if (visible && text) {
      output.push(`${type}|${text.slice(0, 60)}|${bounds}`);
    }

    const children = node.children as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(children)) {
      flattenNodeSignatures(children, output);
    }
  }
  return output;
}

/**
 * Compute a structural hash of the visible UI tree.
 * Used to detect when the UI has stopped changing.
 */
export function computeUiTreeHash(
  rawJson: string,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return "parse_error";
  }

  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  const signatures = flattenNodeSignatures(nodes as Array<Record<string, unknown>>);
  const content = signatures.join("\n");

  // Simple hash: we use a rolling hash approach since crypto may not be available
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }

  // Convert to hex string, take first 16 chars
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 16);
}

export async function waitForUiStableWithMaestro(
  input: WaitForUiStableInput,
): Promise<ToolResult<WaitForUiStableData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? "phase1" as RunnerProfile;
  const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0
    ? Math.floor(input.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const intervalMs = typeof input.intervalMs === "number" && input.intervalMs > 0
    ? Math.floor(input.intervalMs)
    : DEFAULT_INTERVAL_MS;
  const consecutiveStable = typeof input.consecutiveStable === "number" && input.consecutiveStable > 0
    ? Math.floor(input.consecutiveStable)
    : DEFAULT_CONSECUTIVE_STABLE;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        stable: false,
        polls: 0,
        stableAfterMs: 0,
        stableFingerprint: "",
        confidence: 0,
        stabilityBasis: "visible-tree",
        timeoutMs,
        intervalMs,
        consecutiveStable,
      },
      nextSuggestions: ["Provide platform explicitly."],
    };
  }

  const deviceId = input.deviceId ?? "";
  let stableCount = 0;
  let lastHash: string | null = null;
  let polls = 0;
  let lastRawJson = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    polls++;

    // Capture UI hierarchy
    let rawJson: string;
    let nodes: Array<Record<string, unknown>>;

    if (platform === "ios") {
      const snapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, undefined, { sessionId: input.sessionId, platform, runnerProfile, deviceId, text: "" });
      if ("message" in snapshot) {
        // Retryable: hierarchy capture can fail during animations
        stableCount = 0;
        lastHash = null;
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      rawJson = snapshot.execution.stdout;
      nodes = snapshot.nodes as unknown as Array<Record<string, unknown>>;
    } else {
      const snapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, undefined, { sessionId: input.sessionId, platform, runnerProfile, deviceId, text: "" });
      if ("message" in snapshot) {
        stableCount = 0;
        lastHash = null;
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      rawJson = snapshot.readExecution.stdout;
      nodes = snapshot.nodes as unknown as Array<Record<string, unknown>>;
    }

    const hash = computeUiTreeHash(rawJson);

    if (hash === lastHash && hash !== null) {
      stableCount++;
      if (stableCount >= consecutiveStable) {
        // UI is stable
        const elapsed = Date.now() - startTime;
        return {
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: elapsed,
          attempts: 1,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            stable: true,
            polls,
            stableAfterMs: elapsed,
            stableFingerprint: hash,
            confidence: 0.95,
            stabilityBasis: "visible-tree",
            timeoutMs,
            intervalMs,
            consecutiveStable,
          },
          nextSuggestions: [],
        };
      }
    } else {
      stableCount = 0;
      lastHash = hash;
      lastRawJson = rawJson;
    }

    if (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Timeout: UI did not stabilize
  const elapsed = Date.now() - startTime;
  return {
    status: "partial",
    reasonCode: REASON_CODES.stabilityTimeout,
    sessionId: input.sessionId,
    durationMs: elapsed,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      stable: false,
      polls,
      stableAfterMs: elapsed,
      stableFingerprint: lastHash ?? "",
      lastDiffSignals: ["ui-tree-changed-between-polls"],
      confidence: 0.2,
      stabilityBasis: "visible-tree",
      timeoutMs,
      intervalMs,
      consecutiveStable,
    },
    nextSuggestions: [
      "The UI continued changing beyond the timeout. Consider increasing timeoutMs or checking for animated content.",
    ],
  };
}
