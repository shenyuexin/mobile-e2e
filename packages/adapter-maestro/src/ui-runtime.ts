import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type {
  InspectUiNode,
  InspectUiSummary,
  QueryUiInput,
  QueryUiMatch,
  QueryUiSelector,
  ReasonCode,
  UiTargetResolution,
  WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildInspectUiSummary,
  buildNonExecutedUiTargetResolution,
  buildUiTargetResolution,
  isWaitConditionMet,
  parseAndroidUiHierarchyNodes,
  parseIosInspectNodes,
  queryUiNodes,
  shouldAbortWaitForUiAfterReadFailure,
} from "./ui-model.js";
import { resolveIdbCliPath, resolveIdbCompanionPath } from "./toolchain-runtime.js";
import {
  executeRunner,
  type CommandExecution,
  buildFailureReason,
} from "./runtime-shared.js";

export { resolveIdbCliPath, resolveIdbCompanionPath };

export interface AndroidUiSnapshot {
  command: string[];
  readCommand: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  readExecution: CommandExecution;
  nodes: InspectUiNode[];
  summary?: InspectUiSummary;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}

export interface AndroidUiSnapshotFailure {
  reasonCode: ReasonCode;
  exitCode: number | null;
  outputPath: string;
  command: string[];
  message: string;
}

export interface IosUiSnapshot {
  command: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  execution: CommandExecution;
  nodes: InspectUiNode[];
  summary?: InspectUiSummary;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}

export interface IosUiSnapshotFailure {
  reasonCode: ReasonCode;
  exitCode: number | null;
  outputPath: string;
  command: string[];
  message: string;
}

export function isDegenerateIosSnapshot(nodes: InspectUiNode[]): boolean {
  if (nodes.length !== 1) {
    return false;
  }
  const root = nodes[0];
  return root?.className === "Application"
    && !root.text
    && !root.contentDesc
    && root.bounds === "[0,0][0,0]";
}

export interface UiActionExecutionResult {
  command: string[];
  execution?: CommandExecution;
  probeExecution?: CommandExecution;
}

export interface UiRuntimeSnapshot {
  command: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  nodes: InspectUiNode[];
  summary?: InspectUiSummary;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}

export interface UiWaitPollingState {
  outputPath: string;
  command: string[];
  exitCode: number | null;
  result: { query: QueryUiSelector; totalMatches: number; matches: QueryUiMatch[] };
  absoluteOutputPath?: string;
  content?: string;
  summary?: InspectUiSummary;
}

export type UiWaitPollingOutcome =
  | {
    outcome: "matched";
    polls: number;
    state: UiWaitPollingState;
  }
  | {
    outcome: "timeout";
    polls: number;
    state: UiWaitPollingState;
  }
  | {
    outcome: "failure";
    polls: number;
    reasonCode: ReasonCode;
    message: string;
    state: UiWaitPollingState;
  };

export interface UiScrollResolutionState {
  outputPath: string;
  commandHistory: string[][];
  exitCode: number | null;
  result: { query: QueryUiSelector; totalMatches: number; matches: QueryUiMatch[] };
  resolution: UiTargetResolution;
  swipesPerformed: number;
  attempts: number;
  absoluteOutputPath?: string;
  content?: string;
  summary?: InspectUiSummary;
}

export type UiScrollResolutionOutcome =
  | {
    outcome: "resolved";
    state: UiScrollResolutionState;
  }
  | {
    outcome: "stopped";
    state: UiScrollResolutionState;
  }
  | {
    outcome: "max_swipes";
    state: UiScrollResolutionState;
  }
  | {
    outcome: "failure";
    reasonCode: ReasonCode;
    message: string;
    state: UiScrollResolutionState;
  };

interface RunUiWaitPollingLoopOptions {
  query: QueryUiSelector;
  waitUntil: WaitForUiMode;
  timeoutMs: number;
  intervalMs: number;
  defaultOutputPath: string;
  previewCommand: string[];
  captureSnapshot: () => Promise<UiRuntimeSnapshot | AndroidUiSnapshotFailure | IosUiSnapshotFailure>;
  buildRetryableSnapshotFailure?: (snapshot: UiRuntimeSnapshot) => {
    reasonCode: ReasonCode;
    message: string;
  } | undefined;
  buildCaptureFailureAbortMessage?: (
    consecutiveFailures: number,
    failure: AndroidUiSnapshotFailure | IosUiSnapshotFailure,
  ) => string;
  maxConsecutiveRetryableFailures?: number;
  now?: () => number;
  delayMs?: (ms: number) => Promise<void>;
}

interface RunUiScrollResolveLoopOptions {
  query: QueryUiSelector;
  maxSwipes: number;
  defaultOutputPath: string;
  captureSnapshot: () => Promise<UiRuntimeSnapshot | AndroidUiSnapshotFailure | IosUiSnapshotFailure>;
  buildSwipeCommand: (nodes: InspectUiNode[]) => string[];
  executeSwipeCommand: (command: string[]) => Promise<CommandExecution>;
  scrollFailureMessage: string;
  buildRetryableSnapshotFailure?: (snapshot: UiRuntimeSnapshot) => {
    reasonCode: ReasonCode;
    message: string;
  } | undefined;
}

function buildEmptyQueryResult(query: QueryUiSelector): {
  query: QueryUiSelector;
  totalMatches: number;
  matches: QueryUiMatch[];
} {
  return {
    query,
    totalMatches: 0,
    matches: [],
  };
}

function normalizeAndroidUiSnapshot(snapshot: AndroidUiSnapshot): UiRuntimeSnapshot {
  return {
    command: snapshot.command,
    relativeOutputPath: snapshot.relativeOutputPath,
    absoluteOutputPath: snapshot.absoluteOutputPath,
    exitCode: snapshot.readExecution.exitCode,
    stdout: snapshot.readExecution.stdout,
    stderr: snapshot.readExecution.stderr,
    nodes: snapshot.nodes,
    summary: snapshot.summary,
    queryResult: snapshot.queryResult,
  };
}

function normalizeIosUiSnapshot(snapshot: IosUiSnapshot): UiRuntimeSnapshot {
  return {
    command: snapshot.command,
    relativeOutputPath: snapshot.relativeOutputPath,
    absoluteOutputPath: snapshot.absoluteOutputPath,
    exitCode: snapshot.execution.exitCode,
    stdout: snapshot.execution.stdout,
    stderr: snapshot.execution.stderr,
    nodes: snapshot.nodes,
    summary: snapshot.summary,
    queryResult: snapshot.queryResult,
  };
}

function isUiRuntimeSnapshotFailure(
  value: UiRuntimeSnapshot | AndroidUiSnapshotFailure | IosUiSnapshotFailure,
): value is AndroidUiSnapshotFailure | IosUiSnapshotFailure {
  return "message" in value;
}

function buildWaitPollingStateFromSnapshot(
  query: QueryUiSelector,
  snapshot: UiRuntimeSnapshot,
): UiWaitPollingState {
  return {
    outputPath: snapshot.relativeOutputPath,
    command: snapshot.command,
    exitCode: snapshot.exitCode,
    result: { query, ...snapshot.queryResult },
    absoluteOutputPath: snapshot.absoluteOutputPath,
    content: snapshot.stdout,
    summary: snapshot.summary,
  };
}

function buildWaitPollingFailureStateFromSnapshot(
  query: QueryUiSelector,
  snapshot: UiRuntimeSnapshot,
): UiWaitPollingState {
  return {
    outputPath: snapshot.relativeOutputPath,
    command: snapshot.command,
    exitCode: snapshot.exitCode,
    result: buildEmptyQueryResult(query),
  };
}

function buildWaitPollingStateFromFailure(
  query: QueryUiSelector,
  failure: AndroidUiSnapshotFailure | IosUiSnapshotFailure,
): UiWaitPollingState {
  return {
    outputPath: failure.outputPath,
    command: failure.command,
    exitCode: failure.exitCode,
    result: buildEmptyQueryResult(query),
  };
}

function buildDefaultWaitPollingState(
  query: QueryUiSelector,
  outputPath: string,
  previewCommand: string[],
): UiWaitPollingState {
  return {
    outputPath,
    command: previewCommand,
    exitCode: null,
    result: buildEmptyQueryResult(query),
  };
}

function buildScrollResolutionStateFromSnapshot(
  query: QueryUiSelector,
  snapshot: UiRuntimeSnapshot,
  commandHistory: string[][],
  swipesPerformed: number,
): UiScrollResolutionState {
  const result = { query, ...snapshot.queryResult };
  return {
    outputPath: snapshot.relativeOutputPath,
    commandHistory,
    exitCode: snapshot.exitCode,
    result,
    resolution: buildUiTargetResolution(query, result, "full"),
    swipesPerformed,
    attempts: swipesPerformed + 1,
    absoluteOutputPath: snapshot.absoluteOutputPath,
    content: snapshot.stdout,
    summary: snapshot.summary,
  };
}

function buildEmptyScrollResolutionState(
  query: QueryUiSelector,
  outputPath: string,
  commandHistory: string[][],
  swipesPerformed: number,
  exitCode: number | null,
): UiScrollResolutionState {
  return {
    outputPath,
    commandHistory,
    exitCode,
    result: buildEmptyQueryResult(query),
    resolution: buildNonExecutedUiTargetResolution(query, "full"),
    swipesPerformed,
    attempts: swipesPerformed + 1,
  };
}

function shouldContinueScrollResolution(status: UiTargetResolution["status"]): boolean {
  return status === "no_match" || status === "off_screen";
}

export function buildIdbCommand(baseArgs: string[]): string[] {
  const idbCliPath = resolveIdbCliPath() ?? "idb";
  const companionPath = resolveIdbCompanionPath();
  return companionPath ? [idbCliPath, "--companion-path", companionPath, ...baseArgs] : [idbCliPath, ...baseArgs];
}

export async function probeIdbAvailability(repoRoot: string): Promise<CommandExecution | undefined> {
  return executeRunner(buildIdbCommand(["--help"]), repoRoot, process.env).catch(() => undefined);
}

export async function executeUiActionCommand(options: {
  repoRoot: string;
  command: string[];
  requiresProbe: boolean;
  probeRuntimeAvailability?: (repoRoot: string) => Promise<CommandExecution | undefined>;
}): Promise<UiActionExecutionResult> {
  const result: UiActionExecutionResult = {
    command: options.command,
  };

  if (options.requiresProbe) {
    result.probeExecution = await options.probeRuntimeAvailability?.(options.repoRoot);
    if (!result.probeExecution || result.probeExecution.exitCode !== 0) {
      return result;
    }
  }

  result.execution = await executeRunner(options.command, options.repoRoot, process.env);
  return result;
}

export function buildAndroidUiDumpCommands(deviceId: string): { dumpCommand: string[]; readCommand: string[] } {
  return {
    dumpCommand: ["adb", "-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/view.xml"],
    readCommand: ["adb", "-s", deviceId, "shell", "cat", "/sdcard/view.xml"],
  };
}

export function buildIosUiDescribeCommand(deviceId: string): string[] {
  return buildIdbCommand(["ui", "describe-all", "--udid", deviceId, "--json", "--nested"]);
}

export function buildIosUiDescribePointCommand(deviceId: string, x: number, y: number): string[] {
  return buildIdbCommand(["ui", "describe-point", String(x), String(y), "--udid", deviceId, "--json", "--nested"]);
}

export function buildIosSwipeCommand(deviceId: string, swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number }): string[] {
  return buildIdbCommand(["ui", "swipe", String(swipe.start.x), String(swipe.start.y), String(swipe.end.x), String(swipe.end.y), "--duration", String(swipe.durationMs / 1000), "--udid", deviceId]);
}

export function isAndroidUiSnapshotFailure(value: AndroidUiSnapshot | AndroidUiSnapshotFailure): value is AndroidUiSnapshotFailure {
  return "message" in value;
}

export function isIosUiSnapshotFailure(value: IosUiSnapshot | IosUiSnapshotFailure): value is IosUiSnapshotFailure {
  return "message" in value;
}

export async function captureAndroidUiSnapshot(repoRoot: string, deviceId: string, sessionId: string, runnerProfile: string, outputPath: string | undefined, query: QueryUiInput): Promise<AndroidUiSnapshot | AndroidUiSnapshotFailure> {
  const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "ui-dumps", sessionId, `android-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return { reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode), exitCode: dumpExecution.exitCode, outputPath: relativeOutputPath, command, message: "Check Android device state and ensure uiautomator dump is permitted before retrying UI resolution." };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }
  const nodes = readExecution.exitCode === 0 ? parseAndroidUiHierarchyNodes(readExecution.stdout) : [];
  const summary = readExecution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = readExecution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return { command, readCommand, relativeOutputPath, absoluteOutputPath, readExecution, nodes, summary, queryResult };
}

export async function captureIosUiSnapshot(repoRoot: string, deviceId: string, sessionId: string, runnerProfile: string, outputPath: string | undefined, query: QueryUiInput): Promise<IosUiSnapshot | IosUiSnapshotFailure> {
  const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "ui-dumps", sessionId, `ios-${runnerProfile}.json`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const command = buildIosUiDescribeCommand(deviceId);
  const idbProbe = await probeIdbAvailability(repoRoot);
  if (!idbProbe || idbProbe.exitCode !== 0) {
    return { reasonCode: REASON_CODES.configurationError, exitCode: idbProbe?.exitCode ?? null, outputPath: relativeOutputPath, command, message: "iOS hierarchy capture requires idb. Install fb-idb and idb_companion, or fix IDB_CLI_PATH/IDB_COMPANION_PATH before retrying." };
  }

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const execution = await executeRunner(command, repoRoot, process.env);
  if (execution.exitCode === 0) {
    await writeFile(absoluteOutputPath, execution.stdout, "utf8");
  }
  const nodes = execution.exitCode === 0 ? parseIosInspectNodes(execution.stdout) : [];
  if (execution.exitCode === 0 && isDegenerateIosSnapshot(nodes)) {
    return {
      reasonCode: REASON_CODES.deviceUnavailable,
      exitCode: execution.exitCode,
      outputPath: relativeOutputPath,
      command,
      message: "iOS hierarchy capture returned only a degenerate application root. The app may not be inspectable yet; retry after launch settles or verify the current simulator UI state.",
    };
  }
  const summary = execution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = execution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return { command, relativeOutputPath, absoluteOutputPath, execution, nodes, summary, queryResult };
}

export async function captureAndroidUiRuntimeSnapshot(
  repoRoot: string,
  deviceId: string,
  sessionId: string,
  runnerProfile: string,
  outputPath: string | undefined,
  query: QueryUiInput,
): Promise<UiRuntimeSnapshot | AndroidUiSnapshotFailure> {
  const snapshot = await captureAndroidUiSnapshot(
    repoRoot,
    deviceId,
    sessionId,
    runnerProfile,
    outputPath,
    query,
  );
  return isAndroidUiSnapshotFailure(snapshot)
    ? snapshot
    : normalizeAndroidUiSnapshot(snapshot);
}

export async function captureIosUiRuntimeSnapshot(
  repoRoot: string,
  deviceId: string,
  sessionId: string,
  runnerProfile: string,
  outputPath: string | undefined,
  query: QueryUiInput,
): Promise<UiRuntimeSnapshot | IosUiSnapshotFailure> {
  const snapshot = await captureIosUiSnapshot(
    repoRoot,
    deviceId,
    sessionId,
    runnerProfile,
    outputPath,
    query,
  );
  return isIosUiSnapshotFailure(snapshot) ? snapshot : normalizeIosUiSnapshot(snapshot);
}

export async function runUiWaitPollingLoop(
  options: RunUiWaitPollingLoopOptions,
): Promise<UiWaitPollingOutcome> {
  const now = options.now ?? (() => Date.now());
  const delayMs = options.delayMs ?? delay;
  const deadline = now() + options.timeoutMs;
  let polls = 0;
  let consecutiveRetryableFailures = 0;
  let lastSnapshot: UiRuntimeSnapshot | undefined;
  let lastCaptureFailure: AndroidUiSnapshotFailure | IosUiSnapshotFailure | undefined;

  while (now() <= deadline) {
    polls += 1;
    const capture = await options.captureSnapshot();

    if (isUiRuntimeSnapshotFailure(capture)) {
      lastCaptureFailure = capture;
      if (typeof options.maxConsecutiveRetryableFailures === "number") {
        consecutiveRetryableFailures += 1;
        if (
          shouldAbortWaitForUiAfterReadFailure({
            consecutiveFailures: consecutiveRetryableFailures,
            maxConsecutiveFailures: options.maxConsecutiveRetryableFailures,
          })
        ) {
          return {
            outcome: "failure",
            polls,
            reasonCode: capture.reasonCode,
            message:
              options.buildCaptureFailureAbortMessage?.(
                consecutiveRetryableFailures,
                capture,
              ) ?? capture.message,
            state: buildWaitPollingStateFromFailure(options.query, capture),
          };
        }
      }
    } else {
      lastSnapshot = capture;
      lastCaptureFailure = undefined;

      const retryableFailure = options.buildRetryableSnapshotFailure?.(capture);
      if (retryableFailure) {
        consecutiveRetryableFailures += 1;
        if (
          typeof options.maxConsecutiveRetryableFailures === "number"
          && shouldAbortWaitForUiAfterReadFailure({
            consecutiveFailures: consecutiveRetryableFailures,
            maxConsecutiveFailures: options.maxConsecutiveRetryableFailures,
          })
        ) {
          return {
            outcome: "failure",
            polls,
            reasonCode: retryableFailure.reasonCode,
            message: retryableFailure.message,
            state: buildWaitPollingFailureStateFromSnapshot(options.query, capture),
          };
        }
      } else {
        consecutiveRetryableFailures = 0;
        if (isWaitConditionMet({ query: options.query, ...capture.queryResult }, options.waitUntil)) {
          return {
            outcome: "matched",
            polls,
            state: buildWaitPollingStateFromSnapshot(options.query, capture),
          };
        }
      }
    }

    if (now() < deadline) {
      await delayMs(options.intervalMs);
    }
  }

  if (lastCaptureFailure) {
    return {
      outcome: "failure",
      polls,
      reasonCode: lastCaptureFailure.reasonCode,
      message: lastCaptureFailure.message,
      state: buildWaitPollingStateFromFailure(options.query, lastCaptureFailure),
    };
  }

  return {
    outcome: "timeout",
    polls,
    state: lastSnapshot
      ? buildWaitPollingStateFromSnapshot(options.query, lastSnapshot)
      : buildDefaultWaitPollingState(
          options.query,
          options.defaultOutputPath,
          options.previewCommand,
        ),
  };
}

export async function runUiScrollResolveLoop(
  options: RunUiScrollResolveLoopOptions,
): Promise<UiScrollResolutionOutcome> {
  let swipesPerformed = 0;
  const commandHistory: string[][] = [];

  while (swipesPerformed <= options.maxSwipes) {
    const capture = await options.captureSnapshot();
    if (isUiRuntimeSnapshotFailure(capture)) {
      return {
        outcome: "failure",
        reasonCode: capture.reasonCode,
        message: capture.message,
        state: buildEmptyScrollResolutionState(
          options.query,
          capture.outputPath,
          [...commandHistory, capture.command],
          swipesPerformed,
          capture.exitCode,
        ),
      };
    }

    commandHistory.push(capture.command);
    const retryableFailure = options.buildRetryableSnapshotFailure?.(capture);
    if (retryableFailure) {
      return {
        outcome: "failure",
        reasonCode: retryableFailure.reasonCode,
        message: retryableFailure.message,
        state: buildEmptyScrollResolutionState(
          options.query,
          capture.relativeOutputPath,
          [...commandHistory],
          swipesPerformed,
          capture.exitCode,
        ),
      };
    }

    const snapshotState = buildScrollResolutionStateFromSnapshot(
      options.query,
      capture,
      [...commandHistory],
      swipesPerformed,
    );
    if (!shouldContinueScrollResolution(snapshotState.resolution.status)) {
      return {
        outcome:
          snapshotState.resolution.status === "resolved" ? "resolved" : "stopped",
        state: snapshotState,
      };
    }

    if (swipesPerformed === options.maxSwipes) {
      return {
        outcome: "max_swipes",
        state: snapshotState,
      };
    }

    const swipeCommand = options.buildSwipeCommand(capture.nodes);
    commandHistory.push(swipeCommand);
    const swipeExecution = await options.executeSwipeCommand(swipeCommand);
    if (swipeExecution.exitCode !== 0) {
      return {
        outcome: "failure",
        reasonCode: REASON_CODES.actionScrollFailed,
        message: options.scrollFailureMessage,
        state: {
          ...snapshotState,
          commandHistory: [...commandHistory],
          exitCode: swipeExecution.exitCode,
        },
      };
    }

    swipesPerformed += 1;
  }

  return {
    outcome: "max_swipes",
    state: buildEmptyScrollResolutionState(
      options.query,
      options.defaultOutputPath,
      commandHistory,
      swipesPerformed,
      null,
    ),
  };
}

export const uiRuntimeInternals = {
  executeUiActionCommand,
  isDegenerateIosSnapshot,
  runUiWaitPollingLoop,
  runUiScrollResolveLoop,
};
