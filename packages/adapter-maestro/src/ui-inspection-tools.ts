import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import type {
  InspectUiData,
  InspectUiInput,
  QueryUiData,
  QueryUiInput,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  ToolResult,
  WaitForUiData,
  WaitForUiInput,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  buildNonExecutedUiTargetResolution,
  buildUiTargetResolution,
  hasQueryUiSelector,
  parseInspectUiSummary,
  parseIosInspectSummary,
  reasonCodeForResolutionStatus,
} from "./ui-model.js";
import {
  buildAndroidUiDumpCommands,
  captureAndroidUiSnapshot,
  captureAndroidUiRuntimeSnapshot,
  captureIosUiSnapshot,
  captureIosUiRuntimeSnapshot,
  isAndroidUiSnapshotFailure,
  isIosUiSnapshotFailure,
  runUiWaitPollingLoop,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import {
  buildExecutionEvidence,
  buildFailureReason,
  toRelativePath,
} from "./runtime-shared.js";
import {
  buildMissingPlatformSuggestion,
  buildPlatformUiDumpOutputPath,
  buildUiQuery,
  buildUnknownUiDumpOutputPath,
} from "./ui-tool-shared.js";
import {
  buildResolutionNextSuggestions,
  DEFAULT_WAIT_INTERVAL_MS,
  DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
  DEFAULT_WAIT_TIMEOUT_MS,
  normalizeWaitForUiMode,
  reasonCodeForWaitTimeout,
} from "./ui-tool-utils.js";

export async function inspectUiWithMaestroTool(
  input: InspectUiInput,
): Promise<ToolResult<InspectUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
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
        outputPath,
        command: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("inspect_ui")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const relativeOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
  });
  if (platform === "ios") {
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

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
          command: idbCommand,
          exitCode: 0,
          supportLevel: "partial",
          evidence: [
            buildExecutionEvidence(
              "ui_dump",
              relativeOutputPath,
              "partial",
              "Planned iOS UI hierarchy artifact path.",
            ),
          ],
          platformSupportNote:
            "iOS inspect_ui captures hierarchy through axe (simulators) or WDA (physical devices); query and action parity remain partial.",
        },
        nextSuggestions: [
          "Run inspect_ui without dryRun to capture an actual iOS hierarchy dump through axe or WDA.",
        ],
      };
    }

    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      input.outputPath,
      {
        sessionId: input.sessionId,
        platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: input.outputPath,
        dryRun: false,
      },
    );
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "partial",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          command: idbCommand,
          exitCode: snapshot.exitCode,
          supportLevel: "partial",
          platformSupportNote:
            "iOS inspect_ui depends on axe (simulators) or WDA (physical devices) availability.",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    return {
      status: snapshot.execution.exitCode === 0 ? "success" : "partial",
      reasonCode:
        snapshot.execution.exitCode === 0
          ? REASON_CODES.ok
          : REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts:
        snapshot.execution.exitCode === 0
          ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
          : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        supportLevel: "partial",
        evidence:
          snapshot.execution.exitCode === 0
            ? [
                buildExecutionEvidence(
                  "ui_dump",
                  snapshot.relativeOutputPath,
                  "partial",
                  "Captured iOS UI hierarchy artifact.",
                ),
              ]
            : undefined,
        platformSupportNote:
          "iOS inspect_ui can capture hierarchy artifacts, but downstream query/action tooling is still partial compared with Android.",
        content:
          snapshot.execution.exitCode === 0
            ? snapshot.execution.stdout
            : undefined,
        summary:
          snapshot.execution.exitCode === 0
            ? parseIosInspectSummary(snapshot.execution.stdout)
            : undefined,
      },
      nextSuggestions:
        snapshot.execution.exitCode === 0
          ? []
          : [
              "Ensure axe CLI is available for the selected simulator and retry inspect_ui.",
            ],
    };
  }

  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);

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
        command: [...dumpCommand, ...readCommand],
        exitCode: 0,
        supportLevel: "full",
        evidence: [
          buildExecutionEvidence(
            "ui_dump",
            relativeOutputPath,
            "full",
            "Planned Android UI hierarchy artifact path.",
          ),
        ],
      },
      nextSuggestions: [
        "Run inspect_ui without dryRun to capture an actual Android hierarchy dump.",
      ],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(
    repoRoot,
    deviceId,
    input.sessionId,
    runnerProfile,
    input.outputPath,
    {
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId,
      outputPath: input.outputPath,
      dryRun: false,
    },
  );
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
          command: dumpCommand,
          exitCode: snapshot.exitCode,
          supportLevel: "full",
        },
      nextSuggestions: [snapshot.message],
      };
    }

  return {
    status: snapshot.readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      snapshot.readExecution.exitCode === 0
        ? REASON_CODES.ok
        : buildFailureReason(
            snapshot.readExecution.stderr,
            snapshot.readExecution.exitCode,
          ),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts:
      snapshot.readExecution.exitCode === 0
        ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
        : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: snapshot.relativeOutputPath,
      command: snapshot.readCommand,
      exitCode: snapshot.readExecution.exitCode,
      supportLevel: "full",
      evidence:
        snapshot.readExecution.exitCode === 0
          ? [
              buildExecutionEvidence(
                "ui_dump",
                snapshot.relativeOutputPath,
                "full",
                "Captured Android UI hierarchy artifact.",
              ),
            ]
          : undefined,
      content:
        snapshot.readExecution.exitCode === 0
          ? snapshot.readExecution.stdout
          : undefined,
      summary:
        snapshot.readExecution.exitCode === 0
          ? parseInspectUiSummary(snapshot.readExecution.stdout)
          : undefined,
    },
    nextSuggestions:
      snapshot.readExecution.exitCode === 0
        ? []
        : ["Check Android device state before retrying inspect_ui."],
  };
}

export async function queryUiWithMaestroTool(
  input: QueryUiInput,
): Promise<ToolResult<QueryUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
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
        outputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("query_ui")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const query = buildUiQuery(input);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
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
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: [
        "Provide at least one query selector: resourceId, contentDesc, text, className, or clickable.",
      ],
    };
  }

  if (platform === "ios") {
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
          supportLevel: "full",
        },
        nextSuggestions: [
          "Run query_ui without dryRun to capture an iOS hierarchy artifact and evaluate structured selector matches.",
        ],
      };
    }

    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      input.outputPath,
      {
        sessionId: input.sessionId,
        platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: input.outputPath,
        dryRun: false,
        ...query,
      },
    );
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
        evidence: [
          buildExecutionEvidence(
            "ui_dump",
            snapshot.relativeOutputPath,
            "full",
            "Captured iOS hierarchy artifact for selector matching.",
          ),
        ],
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions:
        result.totalMatches === 0
          ? [
              "No iOS nodes matched the provided selectors. Broaden the query or inspect the captured hierarchy artifact.",
            ]
          : query.limit !== undefined && result.totalMatches > result.matches.length
            ? [
                "More iOS nodes matched than were returned. Increase query limit or narrow the selector.",
              ]
            : [],
    };
  }

  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

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
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
        evidence: [
          buildExecutionEvidence(
            "ui_dump",
            defaultOutputPath,
            "full",
            "Planned Android query_ui hierarchy artifact path.",
          ),
        ],
      },
      nextSuggestions: [
        "Run query_ui without dryRun to capture an Android hierarchy dump and return matched nodes.",
      ],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(
    repoRoot,
    deviceId,
    input.sessionId,
    runnerProfile,
    input.outputPath,
    {
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId,
      outputPath: input.outputPath,
      dryRun: false,
      ...query,
    },
  );
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
          command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

  const queryResult = { query, ...snapshot.queryResult };

  return {
    status: snapshot.readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      snapshot.readExecution.exitCode === 0
        ? REASON_CODES.ok
        : buildFailureReason(
            snapshot.readExecution.stderr,
            snapshot.readExecution.exitCode,
          ),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts:
      snapshot.readExecution.exitCode === 0
        ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
        : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: snapshot.relativeOutputPath,
      query,
      command,
      exitCode: snapshot.readExecution.exitCode,
      result: queryResult,
      supportLevel: "full",
      evidence:
        snapshot.readExecution.exitCode === 0
          ? [
              buildExecutionEvidence(
                "ui_dump",
                snapshot.relativeOutputPath,
                "full",
                "Captured Android query_ui hierarchy artifact.",
              ),
            ]
          : undefined,
      content:
        snapshot.readExecution.exitCode === 0
          ? snapshot.readExecution.stdout
          : undefined,
      summary: snapshot.summary,
    },
    nextSuggestions:
      snapshot.readExecution.exitCode !== 0
        ? ["Check Android device state before retrying query_ui."]
        : queryResult.totalMatches === 0
          ? [
              "No Android nodes matched the provided selectors. Broaden the query or run inspect_ui to review nearby nodes.",
            ]
          : query.limit !== undefined
              && queryResult.totalMatches > queryResult.matches.length
            ? [
                "More Android nodes matched than were returned. Increase query limit or narrow the selector.",
              ]
            : [],
  };
}

export async function resolveUiTargetWithMaestroTool(
  input: ResolveUiTargetInput,
): Promise<ToolResult<ResolveUiTargetData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
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
        outputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("resolve_ui_target")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = buildUiQuery(input);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
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
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(
          query,
          platform === "android" ? "full" : "partial",
        ),
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: [
        "Provide at least one selector field before calling resolve_ui_target.",
      ],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
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
        nextSuggestions: [
          "resolve_ui_target dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to resolve against the current simulator hierarchy.",
        ],
      };
    }

    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      input.outputPath,
      {
        sessionId: input.sessionId,
        platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: input.outputPath,
        dryRun: false,
        ...query,
      },
    );
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
      reasonCode:
        resolution.status === "resolved"
          ? REASON_CODES.ok
          : reasonCodeForResolutionStatus(resolution.status),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts:
        snapshot.execution.exitCode === 0
          ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
          : [],
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
      nextSuggestions:
        resolution.status === "resolved"
          ? []
          : buildResolutionNextSuggestions(
              resolution.status,
              "resolve_ui_target",
              resolution,
            ),
    };
  }

  const selection = await loadHarnessSelection(
    repoRoot,
    input.platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
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
      nextSuggestions: [
        "resolve_ui_target dry-run only previews the capture command. Run it without --dry-run to resolve against the live Android hierarchy.",
      ],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(
    repoRoot,
    deviceId,
    input.sessionId,
    runnerProfile,
    input.outputPath,
    {
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId,
      outputPath: input.outputPath,
      dryRun: false,
      ...query,
    },
  );
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
      reasonCode: buildFailureReason(
        snapshot.readExecution.stderr,
        snapshot.readExecution.exitCode,
      ),
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
      nextSuggestions: [
        "Could not read the Android UI hierarchy before resolving the target. Check device state and retry.",
      ],
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
    nextSuggestions:
      resolution.status === "resolved"
        ? []
        : buildResolutionNextSuggestions(
            resolution.status,
            "resolve_ui_target",
            resolution,
          ),
  };
}

export async function waitForUiWithMaestroTool(
  input: WaitForUiInput,
): Promise<ToolResult<WaitForUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const timeoutMs =
      typeof input.timeoutMs === "number" && input.timeoutMs > 0
        ? Math.floor(input.timeoutMs)
        : DEFAULT_WAIT_TIMEOUT_MS;
    const intervalMs =
      typeof input.intervalMs === "number" && input.intervalMs > 0
        ? Math.floor(input.intervalMs)
        : DEFAULT_WAIT_INTERVAL_MS;
    const waitUntil = normalizeWaitForUiMode(input.waitUntil);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
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
      nextSuggestions: [buildMissingPlatformSuggestion(ACTION_TYPES.waitForUi)],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = buildUiQuery(input);
  const timeoutMs =
    typeof input.timeoutMs === "number" && input.timeoutMs > 0
      ? Math.floor(input.timeoutMs)
      : DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs =
    typeof input.intervalMs === "number" && input.intervalMs > 0
      ? Math.floor(input.intervalMs)
      : DEFAULT_WAIT_INTERVAL_MS;
  const waitUntil = normalizeWaitForUiMode(input.waitUntil);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
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
      nextSuggestions: [
        "Provide at least one selector field before calling wait_for_ui.",
      ],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
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
        nextSuggestions: [
          "wait_for_ui dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to poll the current simulator hierarchy.",
        ],
      };
    }

    const waitOutcome = await runUiWaitPollingLoop({
      query,
      waitUntil,
      timeoutMs,
      intervalMs,
      defaultOutputPath,
      previewCommand: idbCommand,
      captureSnapshot: () =>
        captureIosUiRuntimeSnapshot(
          repoRoot,
          deviceId,
          input.sessionId,
          runnerProfile,
          input.outputPath,
          {
            sessionId: input.sessionId,
            platform,
            runnerProfile,
            harnessConfigPath: input.harnessConfigPath,
            deviceId,
            outputPath: input.outputPath,
            dryRun: false,
            ...query,
          },
        ),
    });

    if (waitOutcome.outcome === "failure") {
      return {
        status: "failed",
        reasonCode: waitOutcome.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: waitOutcome.polls,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: waitOutcome.state.outputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls: waitOutcome.polls,
          command: waitOutcome.state.command,
          exitCode: waitOutcome.state.exitCode,
          result: waitOutcome.state.result,
          supportLevel: "full",
        },
        nextSuggestions: [waitOutcome.message],
      };
    }

    if (waitOutcome.outcome === "matched") {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: waitOutcome.polls,
        artifacts: waitOutcome.state.absoluteOutputPath
          ? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
          : [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: waitOutcome.state.outputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls: waitOutcome.polls,
          command: waitOutcome.state.command,
          exitCode: waitOutcome.state.exitCode,
          result: waitOutcome.state.result,
          supportLevel: "full",
          content: waitOutcome.state.content,
          summary: waitOutcome.state.summary,
        },
        nextSuggestions: [],
      };
    }

    return {
      status: "partial",
      reasonCode: reasonCodeForWaitTimeout(waitUntil),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: waitOutcome.polls,
      artifacts: waitOutcome.state.absoluteOutputPath
        ? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
        : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: waitOutcome.state.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: waitOutcome.polls,
        command: waitOutcome.state.command,
        exitCode: waitOutcome.state.exitCode,
        result: waitOutcome.state.result,
        supportLevel: "full",
        content: waitOutcome.state.content,
        summary: waitOutcome.state.summary,
      },
      nextSuggestions: [
        `Timed out waiting for iOS UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`,
      ],
    };
  }

  const selection = await loadHarnessSelection(
    repoRoot,
    input.platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
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
      nextSuggestions: [
        "wait_for_ui dry-run only previews the capture command. Run it without --dry-run to poll the live Android hierarchy.",
      ],
    };
  }

  const waitOutcome = await runUiWaitPollingLoop({
    query,
    waitUntil,
    timeoutMs,
    intervalMs,
    defaultOutputPath,
    previewCommand: command,
    captureSnapshot: () =>
      captureAndroidUiRuntimeSnapshot(
        repoRoot,
        deviceId,
        input.sessionId,
        runnerProfile,
        input.outputPath,
        {
          sessionId: input.sessionId,
          platform: input.platform,
          runnerProfile,
          harnessConfigPath: input.harnessConfigPath,
          deviceId,
          outputPath: input.outputPath,
          dryRun: false,
          ...query,
        },
      ),
    buildRetryableSnapshotFailure: (snapshot) =>
      snapshot.exitCode !== 0
        ? {
            reasonCode: buildFailureReason(snapshot.stderr, snapshot.exitCode),
            message: `Android UI hierarchy reads failed ${String(DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`,
          }
        : undefined,
    buildCaptureFailureAbortMessage: (consecutiveFailures) =>
      `Android UI hierarchy capture failed ${String(consecutiveFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`,
    maxConsecutiveRetryableFailures:
      DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
  });

  if (waitOutcome.outcome === "failure") {
    return {
      status: "failed",
      reasonCode: waitOutcome.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: waitOutcome.polls,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: waitOutcome.state.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: waitOutcome.polls,
        command: waitOutcome.state.command,
        exitCode: waitOutcome.state.exitCode,
        result: waitOutcome.state.result,
        supportLevel: "full",
      },
      nextSuggestions: [waitOutcome.message],
    };
  }

  if (waitOutcome.outcome === "matched") {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: waitOutcome.polls,
      artifacts: waitOutcome.state.absoluteOutputPath
        ? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
        : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: waitOutcome.state.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: waitOutcome.polls,
        command: waitOutcome.state.command,
        exitCode: waitOutcome.state.exitCode,
        result: waitOutcome.state.result,
        supportLevel: "full",
        content: waitOutcome.state.content,
        summary: waitOutcome.state.summary,
      },
      nextSuggestions: [],
    };
  }

  return {
    status: "partial",
    reasonCode: reasonCodeForWaitTimeout(waitUntil),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: waitOutcome.polls,
    artifacts: waitOutcome.state.absoluteOutputPath
      ? [toRelativePath(repoRoot, waitOutcome.state.absoluteOutputPath)]
      : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: waitOutcome.state.outputPath,
      query,
      timeoutMs,
      intervalMs,
      waitUntil,
      polls: waitOutcome.polls,
      command: waitOutcome.state.command,
      exitCode: waitOutcome.state.exitCode,
      result: waitOutcome.state.result,
      supportLevel: "full",
      content: waitOutcome.state.content,
      summary: waitOutcome.state.summary,
    },
    nextSuggestions: [
      `Timed out waiting for Android UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`,
    ],
  };
}
