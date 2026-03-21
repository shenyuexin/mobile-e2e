import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type {
  InspectUiData,
  InspectUiInput,
  QueryUiData,
  QueryUiInput,
  QueryUiMatch,
  ReasonCode,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  ScrollAndResolveUiTargetData,
  ScrollAndResolveUiTargetInput,
  ScrollAndTapElementData,
  ScrollAndTapElementInput,
  TapData,
  TapElementData,
  TapElementInput,
  TapInput,
  ToolResult,
  TypeIntoElementData,
  TypeIntoElementInput,
  TypeTextData,
  TypeTextInput,
  UiOrchestrationStepResult,
  UiScrollDirection,
  UiTargetResolution,
  WaitForUiData,
  WaitForUiInput,
  WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildDefaultDeviceId,
  DEFAULT_ANDROID_DEVICE_ID,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_IOS_SIMULATOR_UDID,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  buildInspectUiSummary,
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  buildUiTargetResolution,
  hasQueryUiSelector,
  isWaitConditionMet,
  normalizeQueryUiSelector,
  parseAndroidUiHierarchyNodes,
  parseInspectUiSummary,
  parseIosInspectSummary,
  queryUiNodes,
  reasonCodeForResolutionStatus,
  shouldAbortWaitForUiAfterReadFailure,
} from "./ui-model.js";
import {
  type AndroidUiSnapshot,
  type AndroidUiSnapshotFailure,
  type IosUiSnapshot,
  type IosUiSnapshotFailure,
  buildAndroidUiDumpCommands,
  captureAndroidUiSnapshot,
  captureIosUiSnapshot,
  isAndroidUiSnapshotFailure,
  isIosUiSnapshotFailure,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import {
  buildExecutionEvidence,
  buildFailureReason,
  executeRunner,
  toRelativePath,
} from "./runtime-shared.js";

const DEFAULT_WAIT_UNTIL: WaitForUiMode = "visible";
const DEFAULT_SCROLL_DIRECTION: UiScrollDirection = "up";
const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const DEFAULT_WAIT_INTERVAL_MS = 500;
const DEFAULT_SCROLL_MAX_SWIPES = 3;
const DEFAULT_SCROLL_DURATION_MS = 250;
const DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES = 2;

function shouldContinueScrollResolution(status: string): boolean {
  return status === "no_match" || status === "off_screen";
}

export function buildResolutionNextSuggestions(status: "resolved" | "no_match" | "ambiguous" | "missing_bounds" | "disabled_match" | "off_screen" | "unsupported" | "not_executed", toolName: string, resolution?: Pick<UiTargetResolution, "bestCandidate" | "ambiguityDiff">): string[] {
  if (status === "resolved") return [];
  if (status === "no_match") return [`No UI nodes matched the provided selector for ${toolName}. Broaden the selector or inspect nearby nodes.`];
  if (status === "ambiguous") {
    const diffHint = resolution?.ambiguityDiff?.differingFields?.slice(0, 2).map((field) => field.field).join(", ");
    const selectorHint = resolution?.ambiguityDiff?.suggestedSelectors?.[0];
    const scoreDelta = resolution?.ambiguityDiff?.scoreDelta;
    return [
      `Multiple UI nodes matched the selector for ${toolName}. Narrow the selector before performing an element action${diffHint ? `; top differing fields: ${diffHint}` : ""}${typeof scoreDelta === "number" ? `; top score delta: ${scoreDelta}` : ""}.`,
      selectorHint ? `Suggested narrowing selector: ${JSON.stringify(selectorHint)}` : "Inspect the top candidates and add a more specific resourceId/contentDesc/text filter.",
    ];
  }
  if (status === "missing_bounds") return [`A matching UI node was found for ${toolName}, but its bounds were not parseable.`];
  if (status === "disabled_match") return [`A matching UI node was found for ${toolName}, but the best candidate is disabled. Wait for the UI to become actionable or refine the selector.`];
  if (status === "off_screen") return [`A matching UI node was found for ${toolName}, but it is currently outside the visible viewport. Scroll toward the candidate before retrying.`, resolution?.bestCandidate?.node.resourceId ? `Top off-screen candidate resourceId: ${resolution.bestCandidate.node.resourceId}` : "Consider scroll_and_resolve_ui_target or change swipe direction."];
  if (status === "not_executed") return [`${toolName} did not execute live UI resolution in this run. Re-run without dryRun or fix the upstream capture failure.`];
  return [`${toolName} is not fully supported for this platform in the current repository state.`];
}

export function normalizeWaitForUiMode(value: WaitForUiMode | undefined): WaitForUiMode {
  return value ?? DEFAULT_WAIT_UNTIL;
}

export function normalizeScrollDirection(value: UiScrollDirection | undefined): UiScrollDirection {
  return value ?? DEFAULT_SCROLL_DIRECTION;
}

export function reasonCodeForWaitTimeout(_waitUntil: WaitForUiMode): ReasonCode {
  return REASON_CODES.timeout;
}

export async function inspectUiWithMaestroTool(input: InspectUiInput): Promise<ToolResult<InspectUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const outputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `unknown-${runnerProfile}.json`);
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile, outputPath, command: [], exitCode: null, supportLevel: "partial" },
      nextSuggestions: ["Provide platform explicitly, or call inspect_ui with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  if (platform === "ios") {
    const iosRelativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.json`);
    const iosAbsoluteOutputPath = path.resolve(repoRoot, iosRelativeOutputPath);
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: true, runnerProfile, outputPath: iosRelativeOutputPath, command: idbCommand, exitCode: 0, supportLevel: "partial", evidence: [buildExecutionEvidence("ui_dump", iosRelativeOutputPath, "partial", "Planned iOS UI hierarchy artifact path.")], platformSupportNote: "iOS inspect_ui captures hierarchy through idb; query and action parity remain partial." },
        nextSuggestions: ["Run inspect_ui without dryRun to capture an actual iOS hierarchy dump through idb."],
      };
    }

    const idbProbe = await runtimeHooks.probeRuntimeAvailability?.(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: runtimeHooks.probeFailureReasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, outputPath: iosRelativeOutputPath, command: idbCommand, exitCode: idbProbe?.exitCode ?? null, supportLevel: "partial", platformSupportNote: "iOS inspect_ui depends on idb availability in the local environment." },
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion("inspect_ui")],
      };
    }

    await mkdir(path.dirname(iosAbsoluteOutputPath), { recursive: true });
    const idbExecution = await executeRunner(idbCommand, repoRoot, process.env);
    if (idbExecution.exitCode === 0) {
      await writeFile(iosAbsoluteOutputPath, idbExecution.stdout, "utf8");
    }

    return {
      status: idbExecution.exitCode === 0 ? "success" : "partial",
      reasonCode: idbExecution.exitCode === 0 ? REASON_CODES.ok : REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: idbExecution.exitCode === 0 ? [toRelativePath(repoRoot, iosAbsoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: iosRelativeOutputPath,
        command: idbCommand,
        exitCode: idbExecution.exitCode,
        supportLevel: "partial",
        evidence: idbExecution.exitCode === 0 ? [buildExecutionEvidence("ui_dump", iosRelativeOutputPath, "partial", "Captured iOS UI hierarchy artifact.")] : undefined,
        platformSupportNote: "iOS inspect_ui can capture hierarchy artifacts, but downstream query/action tooling is still partial compared with Android.",
        content: idbExecution.exitCode === 0 ? idbExecution.stdout : undefined,
        summary: idbExecution.exitCode === 0 ? parseIosInspectSummary(idbExecution.stdout) : undefined,
      },
      nextSuggestions: idbExecution.exitCode === 0 ? [] : ["Ensure idb companion is available for the selected simulator and retry inspect_ui."],
    };
  }

  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, outputPath: relativeOutputPath, command: [...dumpCommand, ...readCommand], exitCode: 0, supportLevel: "full", evidence: [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Planned Android UI hierarchy artifact path.")] },
      nextSuggestions: ["Run inspect_ui without dryRun to capture an actual Android hierarchy dump."],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: false, runnerProfile, outputPath: relativeOutputPath, command: dumpCommand, exitCode: dumpExecution.exitCode, supportLevel: "full" },
      nextSuggestions: ["Check Android device state and ensure uiautomator dump is permitted before retrying inspect_ui."],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: readExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: readExecution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      command: readCommand,
      exitCode: readExecution.exitCode,
      supportLevel: "full",
      evidence: readExecution.exitCode === 0 ? [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Captured Android UI hierarchy artifact.")] : undefined,
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary: readExecution.exitCode === 0 ? parseInspectUiSummary(readExecution.stdout) : undefined,
    },
    nextSuggestions: readExecution.exitCode === 0 ? [] : ["Check Android device state before retrying inspect_ui."],
  };
}

export async function queryUiWithMaestroTool(input: QueryUiInput): Promise<ToolResult<QueryUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    const outputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `unknown-${runnerProfile}.json`);
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call query_ui with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.${platform === "android" ? "xml" : "json"}`),
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one query selector: resourceId, contentDesc, text, className, or clickable."],
    };
  }

  if (platform === "ios") {
    const iosRelativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.json`);
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: iosRelativeOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: ["Run query_ui without dryRun to capture an iOS hierarchy artifact and evaluate structured selector matches."],
      };
    }

    const snapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          query,
          command: snapshot.command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    const result = { query, ...snapshot.queryResult };
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        result,
        supportLevel: "full",
        evidence: [buildExecutionEvidence("ui_dump", snapshot.relativeOutputPath, "full", "Captured iOS hierarchy artifact for selector matching.")],
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions: result.totalMatches === 0
        ? ["No iOS nodes matched the provided selectors. Broaden the query or inspect the captured hierarchy artifact."]
        : query.limit !== undefined && result.totalMatches > result.matches.length
          ? ["More iOS nodes matched than were returned. Increase query limit or narrow the selector."]
          : [],
    };
  }

  const relativeOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: relativeOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
        evidence: [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Planned Android query_ui hierarchy artifact path.")],
      },
      nextSuggestions: ["Run query_ui without dryRun to capture an Android hierarchy dump and return matched nodes."],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        query,
        command,
        exitCode: dumpExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["Check Android device state and ensure uiautomator dump is permitted before retrying query_ui."],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  const nodes = readExecution.exitCode === 0 ? parseAndroidUiHierarchyNodes(readExecution.stdout) : [];
  const summary = readExecution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = readExecution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode: readExecution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: readExecution.exitCode === 0 ? [toRelativePath(repoRoot, absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      query,
      command,
      exitCode: readExecution.exitCode,
      result: { query, ...queryResult },
      supportLevel: "full",
      evidence: readExecution.exitCode === 0 ? [buildExecutionEvidence("ui_dump", relativeOutputPath, "full", "Captured Android query_ui hierarchy artifact.")] : undefined,
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary,
    },
    nextSuggestions: readExecution.exitCode !== 0
      ? ["Check Android device state before retrying query_ui."]
      : queryResult.totalMatches === 0
        ? ["No Android nodes matched the provided selectors. Broaden the query or run inspect_ui to review nearby nodes."]
        : query.limit !== undefined && queryResult.totalMatches > queryResult.matches.length
          ? ["More Android nodes matched than were returned. Increase query limit or narrow the selector."]
          : [],
  };
}

export async function resolveUiTargetWithMaestroTool(input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    const outputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `unknown-${runnerProfile}.json`);
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call resolve_ui_target with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });

  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.${platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, platform === "android" ? "full" : "partial"),
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling resolve_ui_target."],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? DEFAULT_IOS_SIMULATOR_UDID;
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);
    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["resolve_ui_target dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to resolve against the current simulator hierarchy."],
      };
    }

    const snapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          query,
          command: snapshot.command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    const result = { query, ...snapshot.queryResult };
    const resolution = buildUiTargetResolution(query, result, "full");
    return {
      status: resolution.status === "resolved" ? "success" : "partial",
      reasonCode: resolution.status === "resolved" ? REASON_CODES.ok : reasonCodeForResolutionStatus(resolution.status),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: snapshot.execution.exitCode === 0 ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        result,
        resolution,
        supportLevel: "full",
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions: resolution.status === "resolved"
        ? []
        : buildResolutionNextSuggestions(resolution.status, "resolve_ui_target", resolution),
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? DEFAULT_ANDROID_DEVICE_ID;
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["resolve_ui_target dry-run only previews the capture command. Run it without --dry-run to resolve against the live Android hierarchy."],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
  if (isAndroidUiSnapshotFailure(snapshot)) {
    return {
      status: "failed",
      reasonCode: snapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.outputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [snapshot.message],
    };
  }

  if (snapshot.readExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(snapshot.readExecution.stderr, snapshot.readExecution.exitCode),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.readExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["Could not read the Android UI hierarchy before resolving the target. Check device state and retry."],
    };
  }

  const result = { query, ...snapshot.queryResult };
  const resolution = buildUiTargetResolution(query, result, "full");
  return {
    status: resolution.status === "resolved" ? "success" : "partial",
    reasonCode: reasonCodeForResolutionStatus(resolution.status),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: snapshot.relativeOutputPath,
      query,
      command: snapshot.command,
      exitCode: snapshot.readExecution.exitCode,
      result,
      resolution,
      supportLevel: "full",
      content: snapshot.readExecution.stdout,
      summary: snapshot.summary,
    },
    nextSuggestions: resolution.status === "resolved"
      ? []
      : buildResolutionNextSuggestions(resolution.status, "resolve_ui_target", resolution),
  };
}

export async function waitForUiWithMaestroTool(input: WaitForUiInput): Promise<ToolResult<WaitForUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? Math.floor(input.timeoutMs) : DEFAULT_WAIT_TIMEOUT_MS;
    const intervalMs = typeof input.intervalMs === "number" && input.intervalMs > 0 ? Math.floor(input.intervalMs) : DEFAULT_WAIT_INTERVAL_MS;
    const waitUntil = normalizeWaitForUiMode(input.waitUntil);
    const outputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `unknown-${runnerProfile}.json`);
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call wait_for_ui with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
  const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? Math.floor(input.timeoutMs) : DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs = typeof input.intervalMs === "number" && input.intervalMs > 0 ? Math.floor(input.intervalMs) : DEFAULT_WAIT_INTERVAL_MS;
  const waitUntil = normalizeWaitForUiMode(input.waitUntil);
  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.${platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling wait_for_ui."],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? DEFAULT_IOS_SIMULATOR_UDID;
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);
    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls: 0,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: ["wait_for_ui dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to poll the current simulator hierarchy."],
      };
    }

    let polls = 0;
    let lastSnapshot: IosUiSnapshot | IosUiSnapshotFailure | undefined;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      polls += 1;
      lastSnapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
      if (!isIosUiSnapshotFailure(lastSnapshot) && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)) {
        return {
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.execution.exitCode,
            result: { query, ...lastSnapshot.queryResult },
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: [],
        };
      }
      if (Date.now() < deadline) {
        await delay(intervalMs);
      }
    }

    if (lastSnapshot && isIosUiSnapshotFailure(lastSnapshot)) {
      return {
        status: "failed",
        reasonCode: lastSnapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.outputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [lastSnapshot.message],
      };
    }

    const timeoutSnapshot = lastSnapshot && !isIosUiSnapshotFailure(lastSnapshot) ? lastSnapshot : undefined;
    const result = timeoutSnapshot ? { query, ...timeoutSnapshot.queryResult } : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
    return {
      status: "partial",
      reasonCode: reasonCodeForWaitTimeout(waitUntil),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: timeoutSnapshot ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)] : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: timeoutSnapshot?.command ?? idbCommand,
        exitCode: timeoutSnapshot?.execution.exitCode ?? null,
        result,
        supportLevel: "full",
        content: timeoutSnapshot?.execution.stdout,
        summary: timeoutSnapshot?.summary,
      },
      nextSuggestions: [`Timed out waiting for iOS UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`],
    };
  }

  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? DEFAULT_ANDROID_DEVICE_ID;
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: ["wait_for_ui dry-run only previews the capture command. Run it without --dry-run to poll the live Android hierarchy."],
    };
  }

  let polls = 0;
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;
  let consecutiveCaptureFailures = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    polls += 1;
    lastSnapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      consecutiveCaptureFailures += 1;
      if (shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: consecutiveCaptureFailures, maxConsecutiveFailures: DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES })) {
        return {
          status: "failed",
          reasonCode: lastSnapshot.reasonCode,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.outputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [`Android UI hierarchy capture failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`],
        };
      }
    } else if (lastSnapshot.readExecution.exitCode !== 0) {
      consecutiveCaptureFailures += 1;
      if (shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: consecutiveCaptureFailures, maxConsecutiveFailures: DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES })) {
        return {
          status: "failed",
          reasonCode: buildFailureReason(lastSnapshot.readExecution.stderr, lastSnapshot.readExecution.exitCode),
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.readExecution.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [`Android UI hierarchy reads failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`],
        };
      }
    } else {
      consecutiveCaptureFailures = 0;
    }
    if (!isAndroidUiSnapshotFailure(lastSnapshot) && lastSnapshot.readExecution.exitCode === 0 && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, ...lastSnapshot.queryResult },
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: [],
      };
    }
    if (Date.now() < deadline) {
      await delay(intervalMs);
    }
  }

  if (lastSnapshot && isAndroidUiSnapshotFailure(lastSnapshot)) {
    return {
      status: "failed",
      reasonCode: lastSnapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: lastSnapshot.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: lastSnapshot.command,
        exitCode: lastSnapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: [lastSnapshot.message],
    };
  }

  const timeoutSnapshot = !lastSnapshot || isAndroidUiSnapshotFailure(lastSnapshot)
    ? undefined
    : lastSnapshot;
  const result = timeoutSnapshot ? { query, ...timeoutSnapshot.queryResult } : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
  return {
    status: "partial",
    reasonCode: reasonCodeForWaitTimeout(waitUntil),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: polls,
    artifacts: timeoutSnapshot ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)] : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
      query,
      timeoutMs,
      intervalMs,
      waitUntil,
      polls,
      command: timeoutSnapshot?.command ?? command,
      exitCode: timeoutSnapshot?.readExecution.exitCode ?? null,
      result,
      supportLevel: "full",
      content: timeoutSnapshot?.readExecution.stdout,
      summary: timeoutSnapshot?.summary,
    },
    nextSuggestions: [`Timed out waiting for Android UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`],
  };
}

export async function tapWithMaestroTool(input: TapInput): Promise<ToolResult<TapData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE, x: input.x, y: input.y, command: [], exitCode: null },
      nextSuggestions: ["Provide platform explicitly, or call tap with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(input.platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);

  const command = runtimeHooks.buildTapCommand(deviceId, input.x, input.y);
  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, x: input.x, y: input.y, command, exitCode: 0 },
      nextSuggestions: [runtimeHooks.tapDryRunSuggestion],
    };
  }

  if (runtimeHooks.requiresProbe) {
    const idbProbe = await runtimeHooks.probeRuntimeAvailability?.(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: runtimeHooks.probeFailureReasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, x: input.x, y: input.y, command, exitCode: idbProbe?.exitCode ?? null },
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion("tap")],
      };
    }
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, x: input.x, y: input.y, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : [runtimeHooks.tapFailureSuggestion],
  };
}

export async function typeTextWithMaestroTool(input: TypeTextInput): Promise<ToolResult<TypeTextData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE, text: input.text, command: [], exitCode: null },
      nextSuggestions: ["Provide platform explicitly, or call type_text with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(input.platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(input.platform);

  const command = runtimeHooks.buildTypeTextCommand(deviceId, input.text);
  if (input.dryRun) {
    return {
      status: runtimeHooks.platform === "ios" ? "success" : "partial",
      reasonCode: runtimeHooks.platform === "ios" ? REASON_CODES.ok : REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, runnerProfile, text: input.text, command, exitCode: 0 },
      nextSuggestions: [runtimeHooks.typeTextDryRunSuggestion],
    };
  }

  if (runtimeHooks.requiresProbe) {
    const idbProbe = await runtimeHooks.probeRuntimeAvailability?.(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: runtimeHooks.probeFailureReasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, runnerProfile, text: input.text, command, exitCode: idbProbe?.exitCode ?? null },
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion("type_text")],
      };
    }
  }

  const execution = await executeRunner(command, repoRoot, process.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { dryRun: false, runnerProfile, text: input.text, command, exitCode: execution.exitCode },
    nextSuggestions: execution.exitCode === 0 ? [] : [runtimeHooks.typeTextFailureSuggestion],
  };
}

export async function tapElementWithMaestroTool(input: TapElementInput): Promise<ToolResult<TapElementData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        command: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call tap_element with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const resolveResult = await resolveUiTargetWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  const query = resolveResult.data.query;

  if (resolveResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        matchCount: resolveResult.data.resolution.matchCount,
        resolution: resolveResult.data.resolution,
        matchedNode: resolveResult.data.resolution.matchedNode,
        resolvedBounds: resolveResult.data.resolution.resolvedBounds,
        resolvedX: resolveResult.data.resolution.resolvedPoint?.x,
        resolvedY: resolveResult.data.resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  const resolution = resolveResult.data.resolution;
  if (input.dryRun && (resolution.status === "unsupported" || resolution.status === "not_executed")) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: ["tap_element dry-run does not resolve live UI selectors. Run resolve_ui_target or tap_element without --dry-run to resolve against the current hierarchy."],
    };
  }
  if (resolveResult.status !== "success" || !resolution.resolvedPoint || !resolution.resolvedBounds || !resolution.matchedNode) {
    return {
      status: "partial",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        matchCount: resolution.matchCount,
        resolution,
        matchedNode: resolution.matchedNode,
        resolvedBounds: resolution.resolvedBounds,
        resolvedX: resolution.resolvedPoint?.x,
        resolvedY: resolution.resolvedPoint?.y,
        command: resolveResult.data.command,
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(resolution.status, "tap_element", resolution),
    };
  }

  const tapResult = await tapWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });
  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + tapResult.attempts,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query,
      matchCount: resolution.matchCount,
      resolution,
      matchedNode: resolution.matchedNode,
      resolvedBounds: resolution.resolvedBounds,
      resolvedX: resolution.resolvedPoint.x,
      resolvedY: resolution.resolvedPoint.y,
      command: tapResult.data.command,
      exitCode: tapResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}

export async function typeIntoElementWithMaestroTool(input: TypeIntoElementInput): Promise<ToolResult<TypeIntoElementData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        commands: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call type_into_element with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const resolveResult = await resolveUiTargetWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  const query = resolveResult.data.query;
  const resolution = resolveResult.data.resolution;

  if (resolveResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: resolveResult.data.command.length > 0 ? [resolveResult.data.command] : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  if (input.dryRun && (resolution.status === "unsupported" || resolution.status === "not_executed")) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: true,
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: resolveResult.data.command.length > 0 ? [resolveResult.data.command] : [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: ["type_into_element dry-run does not resolve live UI selectors. Run resolve_ui_target or type_into_element without --dry-run to resolve against the current hierarchy."],
    };
  }

  if (resolveResult.status !== "success" || !resolution.resolvedPoint) {
    return {
      status: "partial",
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands: [],
        exitCode: resolveResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: buildResolutionNextSuggestions(resolution.status, "type_into_element", resolution),
    };
  }

  const focusResult = await tapWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    x: resolution.resolvedPoint.x,
    y: resolution.resolvedPoint.y,
    dryRun: input.dryRun,
  });
  const typeResult = await typeTextWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    text: input.value,
    dryRun: input.dryRun,
  });
  const commands = [focusResult.data.command, typeResult.data.command];

  if (focusResult.status === "failed") {
    return {
      status: "failed",
      reasonCode: REASON_CODES.actionFocusFailed,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: resolveResult.attempts + focusResult.attempts,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        value: input.value,
        resolution,
        commands,
        exitCode: focusResult.data.exitCode,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: focusResult.nextSuggestions,
    };
  }

  return {
    status: typeResult.status,
    reasonCode: typeResult.status === "success" ? REASON_CODES.ok : REASON_CODES.actionTypeFailed,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + focusResult.attempts + typeResult.attempts,
    artifacts: resolveResult.artifacts,
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query,
      value: input.value,
      resolution,
      commands,
      exitCode: typeResult.data.exitCode,
      supportLevel: resolveResult.data.supportLevel,
    },
    nextSuggestions: typeResult.nextSuggestions,
  };
}

export async function scrollAndResolveUiTargetWithMaestroTool(input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    const maxSwipes = typeof input.maxSwipes === "number" && input.maxSwipes >= 0 ? Math.floor(input.maxSwipes) : DEFAULT_SCROLL_MAX_SWIPES;
    const swipeDurationMs = typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0 ? Math.floor(input.swipeDurationMs) : DEFAULT_SCROLL_DURATION_MS;
    const swipeDirection = normalizeScrollDirection(input.swipeDirection);
    const outputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `unknown-${runnerProfile}.json`);
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call scroll_and_resolve_ui_target with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const platform = input.platform;
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
  const maxSwipes = typeof input.maxSwipes === "number" && input.maxSwipes >= 0 ? Math.floor(input.maxSwipes) : DEFAULT_SCROLL_MAX_SWIPES;
  const swipeDurationMs = typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0 ? Math.floor(input.swipeDurationMs) : DEFAULT_SCROLL_DURATION_MS;
  const swipeDirection = normalizeScrollDirection(input.swipeDirection);
  const defaultOutputPath = input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `${platform}-${runnerProfile}.${platform === "android" ? "xml" : "json"}`);

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, platform === "android" ? "full" : "partial"),
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: ["Provide at least one selector field before calling scroll_and_resolve_ui_target."],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? DEFAULT_IOS_SIMULATOR_UDID;
    const previewSwipe = buildScrollSwipeCoordinates([], swipeDirection, swipeDurationMs);
    const previewSwipeCommand = runtimeHooks.buildSwipeCommand(deviceId, previewSwipe);

    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed: 0,
          commandHistory: [runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId), previewSwipeCommand],
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["scroll_and_resolve_ui_target dry-run only previews iOS hierarchy capture and swipe commands. Run it without --dry-run to resolve against the current simulator hierarchy."],
      };
    }

    let swipesPerformed = 0;
    const commandHistory: string[][] = [];
    let lastSnapshot: IosUiSnapshot | IosUiSnapshotFailure | undefined;

    while (swipesPerformed <= maxSwipes) {
      lastSnapshot = await captureIosUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
      if (isIosUiSnapshotFailure(lastSnapshot)) {
        return {
          status: "failed",
          reasonCode: lastSnapshot.reasonCode,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.outputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory: [...commandHistory, lastSnapshot.command],
            exitCode: lastSnapshot.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            resolution: buildNonExecutedUiTargetResolution(query, "full"),
            supportLevel: "full",
          },
          nextSuggestions: [lastSnapshot.message],
        };
      }

      commandHistory.push(lastSnapshot.command);
      const result = { query, ...lastSnapshot.queryResult };
      const resolution = buildUiTargetResolution(query, result, "full");
      if (!shouldContinueScrollResolution(resolution.status)) {
        return {
          status: resolution.status === "resolved" ? "success" : "partial",
          reasonCode: reasonCodeForResolutionStatus(resolution.status),
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory,
            exitCode: lastSnapshot.execution.exitCode,
            result,
            resolution,
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: resolution.status === "resolved" ? [] : buildResolutionNextSuggestions(resolution.status, "scroll_and_resolve_ui_target", resolution),
        };
      }

      if (swipesPerformed === maxSwipes) {
        return {
          status: "partial",
          reasonCode: REASON_CODES.noMatch,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory,
            exitCode: lastSnapshot.execution.exitCode,
            result,
            resolution,
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: resolution.status === "off_screen"
            ? ["Reached maxSwipes while the best iOS match stayed off-screen. Keep scrolling, change swipe direction, or refine the selector toward visible content."]
            : ["Reached maxSwipes without finding a matching iOS target. Narrow the selector or increase maxSwipes."],
        };
      }

      const swipe = buildScrollSwipeCoordinates(lastSnapshot.nodes, swipeDirection, swipeDurationMs);
      const swipeCommand = runtimeHooks.buildSwipeCommand(deviceId, swipe);
      commandHistory.push(swipeCommand);
      const swipeExecution = await executeRunner(swipeCommand, repoRoot, process.env);
      if (swipeExecution.exitCode !== 0) {
        return {
          status: "failed",
          reasonCode: REASON_CODES.actionScrollFailed,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: swipesPerformed + 1,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            maxSwipes,
            swipeDirection,
            swipeDurationMs,
            swipesPerformed,
            commandHistory,
            exitCode: swipeExecution.exitCode,
            result,
            resolution,
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: ["iOS swipe failed while searching for the target. Check simulator state and idb availability before retrying scroll_and_resolve_ui_target."],
        };
      }

      swipesPerformed += 1;
    }
  }

  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? DEFAULT_ANDROID_DEVICE_ID;
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const previewSwipe = buildScrollSwipeCoordinates([], swipeDirection, swipeDurationMs);
  const previewSwipeCommand = runtimeHooks.buildSwipeCommand(deviceId, previewSwipe);

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        maxSwipes,
        swipeDirection,
        swipeDurationMs,
        swipesPerformed: 0,
        commandHistory: [[...dumpCommand, ...readCommand], previewSwipeCommand],
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: ["scroll_and_resolve_ui_target dry-run only previews capture and swipe commands. Run it without --dry-run to resolve against the live Android hierarchy."],
    };
  }

  let swipesPerformed = 0;
  const commandHistory: string[][] = [];
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;

  while (swipesPerformed <= maxSwipes) {
    lastSnapshot = await captureAndroidUiSnapshot(repoRoot, deviceId, input.sessionId, runnerProfile, input.outputPath, { sessionId: input.sessionId, platform: input.platform, runnerProfile, harnessConfigPath: input.harnessConfigPath, deviceId, outputPath: input.outputPath, dryRun: false, ...query });
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      return {
        status: "failed",
        reasonCode: lastSnapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.outputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory: [...commandHistory, lastSnapshot.command],
          exitCode: lastSnapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [lastSnapshot.message],
      };
    }

    commandHistory.push(lastSnapshot.command);
    if (lastSnapshot.readExecution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(lastSnapshot.readExecution.stderr, lastSnapshot.readExecution.exitCode),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: ["Could not read the Android UI hierarchy while scrolling for target resolution. Check device state and retry."],
      };
    }

    const result = { query, ...lastSnapshot.queryResult };
    const resolution = buildUiTargetResolution(query, result, "full");
    if (!shouldContinueScrollResolution(resolution.status)) {
      return {
        status: resolution.status === "resolved" ? "success" : "partial",
        reasonCode: reasonCodeForResolutionStatus(resolution.status),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: resolution.status === "resolved" ? [] : buildResolutionNextSuggestions(resolution.status, "scroll_and_resolve_ui_target", resolution),
      };
    }

    if (swipesPerformed === maxSwipes) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.noMatch,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: lastSnapshot.readExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: resolution.status === "off_screen"
          ? ["Reached maxSwipes while the best Android match stayed off-screen. Keep scrolling, change swipe direction, or refine the selector toward visible content."]
          : ["Reached maxSwipes without finding a matching Android target. Narrow the selector or increase maxSwipes."],
      };
    }

    const swipe = buildScrollSwipeCoordinates(lastSnapshot.nodes, swipeDirection, swipeDurationMs);
    const swipeCommand = runtimeHooks.buildSwipeCommand(deviceId, swipe);
    commandHistory.push(swipeCommand);
    const swipeExecution = await executeRunner(swipeCommand, repoRoot, process.env);
    if (swipeExecution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.actionScrollFailed,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: swipesPerformed + 1,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          maxSwipes,
          swipeDirection,
          swipeDurationMs,
          swipesPerformed,
          commandHistory,
          exitCode: swipeExecution.exitCode,
          result,
          resolution,
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: ["Android swipe failed while searching for the target. Check device state and retry scroll_and_resolve_ui_target."],
      };
    }

    swipesPerformed += 1;
  }

  return {
    status: "partial",
    reasonCode: REASON_CODES.noMatch,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: swipesPerformed + 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: defaultOutputPath,
      query,
      maxSwipes,
      swipeDirection,
      swipeDurationMs,
      swipesPerformed,
      commandHistory,
      exitCode: null,
      result: { query, totalMatches: 0, matches: [] },
      resolution: buildUiTargetResolution(query, { query, totalMatches: 0, matches: [] }, "full"),
      supportLevel: "full",
    },
    nextSuggestions: ["Reached the end of scroll_and_resolve_ui_target without a resolvable Android match."],
  };
}

export async function scrollAndTapElementWithMaestroTool(input: ScrollAndTapElementInput): Promise<ToolResult<ScrollAndTapElementData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = normalizeQueryUiSelector({
      resourceId: input.resourceId,
      contentDesc: input.contentDesc,
      text: input.text,
      className: input.className,
      clickable: input.clickable,
      limit: input.limit,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query,
        maxSwipes: typeof input.maxSwipes === "number" && input.maxSwipes >= 0 ? Math.floor(input.maxSwipes) : DEFAULT_SCROLL_MAX_SWIPES,
        swipeDirection: normalizeScrollDirection(input.swipeDirection),
        swipeDurationMs: typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0 ? Math.floor(input.swipeDurationMs) : DEFAULT_SCROLL_DURATION_MS,
        stepResults: [],
        resolveResult: {
          dryRun: Boolean(input.dryRun),
          runnerProfile,
          outputPath: input.outputPath ?? path.posix.join("artifacts", "ui-dumps", input.sessionId, `unknown-${runnerProfile}.json`),
          query,
          maxSwipes: typeof input.maxSwipes === "number" && input.maxSwipes >= 0 ? Math.floor(input.maxSwipes) : DEFAULT_SCROLL_MAX_SWIPES,
          swipeDirection: normalizeScrollDirection(input.swipeDirection),
          swipeDurationMs: typeof input.swipeDurationMs === "number" && input.swipeDurationMs > 0 ? Math.floor(input.swipeDurationMs) : DEFAULT_SCROLL_DURATION_MS,
          swipesPerformed: 0,
          commandHistory: [],
          exitCode: null,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "partial"),
          supportLevel: "partial",
        },
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide platform explicitly, or call scroll_and_tap_element with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const stepResults: UiOrchestrationStepResult[] = [];
  const resolveResult = await scrollAndResolveUiTargetWithMaestroTool(input);

  stepResults.push({ step: "scroll_resolve", status: resolveResult.status, reasonCode: resolveResult.reasonCode, note: resolveResult.nextSuggestions[0] });
  if (resolveResult.status !== "success") {
    return {
      status: resolveResult.status,
      reasonCode: resolveResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: resolveResult.attempts,
      artifacts: resolveResult.artifacts,
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        query: resolveResult.data.query,
        maxSwipes: resolveResult.data.maxSwipes,
        swipeDirection: resolveResult.data.swipeDirection,
        swipeDurationMs: resolveResult.data.swipeDurationMs,
        stepResults,
        resolveResult: resolveResult.data,
        supportLevel: resolveResult.data.supportLevel,
      },
      nextSuggestions: resolveResult.nextSuggestions,
    };
  }

  const tapResult = await tapElementWithMaestroTool({
    sessionId: input.sessionId,
    platform,
    runnerProfile: input.runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
    dryRun: input.dryRun,
  });
  stepResults.push({ step: "tap", status: tapResult.status, reasonCode: tapResult.reasonCode, note: tapResult.nextSuggestions[0] });
  return {
    status: tapResult.status,
    reasonCode: tapResult.reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: resolveResult.attempts + tapResult.attempts,
    artifacts: [...resolveResult.artifacts, ...tapResult.artifacts],
    data: {
      dryRun: Boolean(input.dryRun),
      runnerProfile,
      query: resolveResult.data.query,
      maxSwipes: resolveResult.data.maxSwipes,
      swipeDirection: resolveResult.data.swipeDirection,
      swipeDurationMs: resolveResult.data.swipeDurationMs,
      stepResults,
      resolveResult: resolveResult.data,
      tapResult: tapResult.data,
      supportLevel: tapResult.data.supportLevel,
    },
    nextSuggestions: tapResult.nextSuggestions,
  };
}
