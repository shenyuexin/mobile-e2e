import { readdir } from "node:fs/promises";
import path from "node:path";
import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import type {
  ClassifyInterruptionInput,
  DetectInterruptionInput,
  PerformActionWithEvidenceInput,
  Platform,
  RequestManualHandoffInput,
  ResolveInterruptionInput,
  ResumeInterruptedActionInput,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES, TOOL_NAMES } from "@mobile-e2e-mcp/contracts";
import {
  appendSessionTimelineEvent,
  loadSessionRecord,
  recoverStaleLeases,
  runExclusive,
} from "@mobile-e2e-mcp/core";
import { enforcePolicyForTool } from "./policy-guard.js";
import { POLICY_SCOPES, type ToolPolicyRequirement } from "./constants/policy-scopes.js";
import {
  MobileE2EMcpServer,
  type MobileE2EMcpToolContractMap,
  type MobileE2EMcpToolName,
  type MobileE2EMcpToolRegistry,
} from "./server.js";
import { captureJsConsoleLogs } from "./tools/capture-js-console-logs.js";
import { captureJsNetworkEvents } from "./tools/capture-js-network-events.js";
import { captureElementScreenshot } from "./tools/capture-element-screenshot.js";
import { classifyInterruption } from "./tools/classify-interruption.js";
import { collectDebugEvidence } from "./tools/collect-debug-evidence.js";
import { collectDiagnostics } from "./tools/collect-diagnostics.js";
import { compareAgainstBaseline } from "./tools/compare-against-baseline.js";
import { compareVisualBaselineTool } from "./tools/compare-visual-baseline.js";
import { describeCapabilities } from "./tools/describe-capabilities.js";
import { detectInterruption } from "./tools/detect-interruption.js";
import { doctor } from "./tools/doctor.js";
import { executeIntent } from "./tools/execute-intent.js";
import { completeTask } from "./tools/complete-task.js";
import { startRecordSession } from "./tools/start-record-session.js";
import { getRecordSessionStatus } from "./tools/get-record-session-status.js";
import { endRecordSession } from "./tools/end-record-session.js";
import { cancelRecordSession } from "./tools/cancel-record-session.js";
import { exportSessionFlow } from "./tools/export-session-flow.js";
import { recordTaskFlow } from "./tools/record-task-flow.js";
import { endSession } from "./tools/end-session.js";
import { explainLastFailure } from "./tools/explain-last-failure.js";
import { findSimilarFailures } from "./tools/find-similar-failures.js";
import { getActionOutcome } from "./tools/get-action-outcome.js";
import { getCrashSignals } from "./tools/get-crash-signals.js";
import { getLogs } from "./tools/get-logs.js";
import { getScreenSummary } from "./tools/get-screen-summary.js";
import { getSessionState } from "./tools/get-session-state.js";
import { inspectUi } from "./tools/inspect-ui.js";
import { installApp } from "./tools/install-app.js";
import { launchApp } from "./tools/launch-app.js";
import { listDevices } from "./tools/list-devices.js";
import { listJsDebugTargets } from "./tools/list-js-debug-targets.js";
import { measureAndroidPerformance } from "./tools/measure-android-performance.js";
import { measureIosPerformance } from "./tools/measure-ios-performance.js";
import { navigateBack } from "./tools/navigate-back.js";
import { performActionWithAutoRemediation } from "./tools/perform-action-with-auto-remediation.js";
import { performActionWithEvidence } from "./tools/perform-action-with-evidence.js";
import { persistSessionEvidenceCapture } from "./tools/persist-session-evidence.js";
import { queryUi } from "./tools/query-ui.js";
import { rankFailureCandidates } from "./tools/rank-failure-candidates.js";
import { recordScreen } from "./tools/record-screen.js";
import { requestManualHandoff } from "./tools/request-manual-handoff.js";
import { recoverToKnownState } from "./tools/recover-to-known-state.js";
import { replayLastStablePath } from "./tools/replay-last-stable-path.js";
import { replayCheckpointChainTool } from "./tools/replay-checkpoint-chain.js";
import { resetAppState } from "./tools/reset-app-state.js";
import { resolveInterruption } from "./tools/resolve-interruption.js";
import { resolveUiTarget } from "./tools/resolve-ui-target.js";
import { resumeInterruptedAction } from "./tools/resume-interrupted-action.js";
import { runFlow } from "./tools/run-flow.js";
import { scrollAndResolveUiTarget } from "./tools/scroll-and-resolve-ui-target.js";
import { scrollOnly } from "./tools/scroll-only.js";
import { scrollAndTapElement } from "./tools/scroll-and-tap-element.js";
import { startSession } from "./tools/start-session.js";
import { suggestKnownRemediation } from "./tools/suggest-known-remediation.js";
import { takeScreenshot } from "./tools/take-screenshot.js";
import { tap } from "./tools/tap.js";
import { tapElement } from "./tools/tap-element.js";
import { terminateApp } from "./tools/terminate-app.js";
import { typeIntoElement } from "./tools/type-into-element.js";
import { typeText } from "./tools/type-text.js";
import { validateFlowTool } from "./tools/validate-flow.js";
import { probeNetworkReadinessTool } from "./tools/probe-network-readiness.js";
import { waitForUi } from "./tools/wait-for-ui.js";

interface ActiveSessionCandidate {
  sessionId: string;
  session: NonNullable<
    Awaited<ReturnType<typeof loadSessionRecord>>
  >["session"];
}

type ToolName = MobileE2EMcpToolName;
type ToolInput<TName extends ToolName> = MobileE2EMcpToolContractMap[TName]["input"];
type ToolOutputData<TName extends ToolName> = MobileE2EMcpToolContractMap[TName]["outputData"];
type ToolOutput<TName extends ToolName> = ToolResult<ToolOutputData<TName>>;
type ToolHandler<TName extends ToolName> = (input: ToolInput<TName>) => Promise<ToolOutput<TName>>;
type AnyToolHandler = { bivarianceHack(input: unknown): Promise<ToolResult<unknown>> }["bivarianceHack"];

// ToolPolicyRequirement is imported from ./constants/policy-scopes.js

interface ToolDescriptor {
  name: ToolName;
  description: string;
  handler?: AnyToolHandler;
  createHandler?: (registry: Partial<MobileE2EMcpToolRegistry>) => AnyToolHandler;
  policy: {
    enforced: boolean;
    requiredScopes: readonly ToolPolicyRequirement[];
  };
  session: {
    required: boolean;
    requireResolvedSessionContext?: boolean;
  };
  audit: {
    captureResultEvidence: boolean;
  };
  typing: {
    inputType: string;
    outputType: string;
  };
}

type SessionScopedInput = {
  sessionId?: string;
  platform?: Platform;
  deviceId?: string;
  appId?: string;
  runnerProfile?: string | null;
};

export type ToolListItem = {
  name: ToolName;
  description: string;
};

function defineToolDescriptor<TName extends ToolName>(
  descriptor: Omit<ToolDescriptor, "typing"> & { name: TName },
): ToolDescriptor {
  return {
    ...descriptor,
    typing: {
      inputType: "typed",
      outputType: "typed_tool_result",
    },
  };
}

async function listActiveSessionCandidates(
  repoRoot: string,
): Promise<ActiveSessionCandidate[]> {
  const sessionsDir = path.resolve(repoRoot, "artifacts", "sessions");
  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });
    const candidates: ActiveSessionCandidate[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const sessionId = entry.name.slice(0, -".json".length);
      const record = await loadSessionRecord(repoRoot, sessionId);
      if (!record || record.closed) {
        continue;
      }
      candidates.push({ sessionId, session: record.session });
    }
    return candidates;
  } catch {
    return [];
  }
}

function pickImplicitSessionId(
  input: {
    platform?: Platform;
    deviceId?: string;
    appId?: string;
    runnerProfile?: string | null;
  },
  candidates: ActiveSessionCandidate[],
): { selectedSessionId?: string; ambiguity: boolean } {
  const filtered = candidates.filter((candidate) => {
    if (input.platform && candidate.session.platform !== input.platform) {
      return false;
    }
    if (input.deviceId && candidate.session.deviceId !== input.deviceId) {
      return false;
    }
    if (input.appId && candidate.session.appId !== input.appId) {
      return false;
    }
    if (
      input.runnerProfile
      && candidate.session.profile !== input.runnerProfile
    ) {
      return false;
    }
    return true;
  });

  if (filtered.length === 1) {
    return { selectedSessionId: filtered[0].sessionId, ambiguity: false };
  }
  if (filtered.length > 1) {
    return { ambiguity: true };
  }
  if (candidates.length === 1) {
    return { selectedSessionId: candidates[0].sessionId, ambiguity: false };
  }
  return { ambiguity: candidates.length > 1 };
}

function withPolicy<TName extends ToolName>(
  toolName: TName,
  handler: ToolHandler<TName>,
): ToolHandler<TName> {
  return async (input: ToolInput<TName>): Promise<ToolOutput<TName>> => {
    const denied = await enforcePolicyForTool(toolName, input);
    if (denied) {
      return denied as unknown as ToolOutput<TName>;
    }
    return handler(input);
  };
}

function withPolicyAndAudit<TName extends ToolName>(
  toolName: TName,
  handler: ToolHandler<TName>,
): ToolHandler<TName> {
  return withPolicy(toolName, async (input: ToolInput<TName>) => {
    const result = await handler(input);
    await persistSessionEvidenceCapture({
      toolName,
      sessionId:
        typeof input === "object" && input !== null && "sessionId" in input
          ? ((input as { sessionId?: unknown }).sessionId as string | undefined)
          : undefined,
      result,
    });
    return result;
  });
}

function withSessionExecution<TName extends ToolName>(
  toolName: TName,
  handler: ToolHandler<TName>,
  options?: { requireResolvedSessionContext?: boolean },
): ToolHandler<TName> {
  return async (input: ToolInput<TName>): Promise<ToolOutput<TName>> => {
    const asOutput = (result: ToolResult<unknown>): ToolOutput<TName> =>
      result as ToolOutput<TName>;
    const sessionInput = input as SessionScopedInput;
    let sessionId = sessionInput.sessionId;
    const repoRoot = resolveRepoPath();

    if (!sessionId) {
      const activeCandidates = await listActiveSessionCandidates(repoRoot);
      const picked = pickImplicitSessionId(sessionInput, activeCandidates);
      if (picked.selectedSessionId) {
        sessionId = picked.selectedSessionId;
      } else if (
        picked.ambiguity
        && options?.requireResolvedSessionContext
      ) {
        return asOutput({
          status: "failed",
          reasonCode: REASON_CODES.configurationError,
          sessionId: `session-auto-resolve-${Date.now()}`,
          durationMs: 0,
          attempts: 1,
          artifacts: [],
          data: {
            activeSessionCount: activeCandidates.length,
          },
          nextSuggestions: [
            "Multiple active sessions were found; pass sessionId explicitly to disambiguate.",
            "Or provide platform/deviceId to narrow the session context.",
          ],
        });
      }
    }

    if (!sessionId) {
      return handler(input);
    }

    const staleRecovered = await recoverStaleLeases(repoRoot, 5 * 60 * 1000);
    for (const lease of staleRecovered.recovered) {
      await appendSessionTimelineEvent(repoRoot, lease.sessionId, {
        timestamp: new Date().toISOString(),
        type: "lease_recovered_stale",
        detail: `Recovered stale lease for ${lease.platform}/${lease.deviceId}.`,
      });
    }
    const sessionRecord = await loadSessionRecord(repoRoot, sessionId);
    if (!sessionRecord || sessionRecord.closed) {
      if (options?.requireResolvedSessionContext && !sessionInput.platform) {
        return asOutput({
          status: "failed",
          reasonCode: REASON_CODES.configurationError,
          sessionId,
          durationMs: 0,
          attempts: 1,
          artifacts: [],
          data: {
            sessionFound: Boolean(sessionRecord),
            sessionClosed: Boolean(sessionRecord?.closed),
          },
          nextSuggestions: [
            "Start an active session first (start_session) before calling this lifecycle tool with sessionId-only arguments.",
          ],
        });
      }
      return handler(input);
    }

    if (sessionInput.platform && sessionInput.platform !== sessionRecord.session.platform) {
      return asOutput({
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: [],
        data: {
          expectedPlatform: sessionRecord.session.platform,
          receivedPlatform: sessionInput.platform,
        },
        nextSuggestions: [
          "Use the same platform as the active session for session-bound tools.",
        ],
      });
    }

    if (sessionInput.deviceId && sessionInput.deviceId !== sessionRecord.session.deviceId) {
      return asOutput({
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: [],
        data: {
          expectedDeviceId: sessionRecord.session.deviceId,
          receivedDeviceId: sessionInput.deviceId,
        },
        nextSuggestions: [
          "Use the same deviceId as the active session for session-bound tools.",
        ],
      });
    }

    if (sessionInput.appId && sessionInput.appId !== sessionRecord.session.appId) {
      return asOutput({
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: [],
        data: {
          expectedAppId: sessionRecord.session.appId,
          receivedAppId: sessionInput.appId,
        },
        nextSuggestions: [
          "Use the same appId as the active session for session-bound tools.",
        ],
      });
    }

    if (
      sessionRecord.session.profile
      && sessionInput.runnerProfile
      && sessionInput.runnerProfile !== sessionRecord.session.profile
    ) {
      return asOutput({
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: [],
        data: {
          expectedRunnerProfile: sessionRecord.session.profile,
          receivedRunnerProfile: sessionInput.runnerProfile,
        },
        nextSuggestions: [
          "Use the same runnerProfile as the active session for session-bound tools.",
        ],
      });
    }

    const normalizedInput = {
      ...(input as Record<string, unknown>),
      sessionId,
      platform: sessionRecord.session.platform,
      deviceId: sessionRecord.session.deviceId,
      appId: sessionInput.appId ?? sessionRecord.session.appId,
      runnerProfile:
        sessionInput.runnerProfile ?? sessionRecord.session.profile ?? undefined,
    } as ToolInput<TName>;

    const exclusive = await runExclusive(
      {
        repoRoot,
        sessionId,
        platform: sessionRecord.session.platform,
        deviceId: sessionRecord.session.deviceId,
        toolName,
      },
      async () => handler(normalizedInput),
    );

    const result = exclusive.value;
    if (result.status !== "success" && result.status !== "partial") {
      return result;
    }

    const artifacts = [
      ...result.artifacts,
      ...staleRecovered.recovered.map(
        (lease: { platform: string; deviceId: string }) =>
          `artifacts/leases/${lease.platform}-${lease.deviceId}.json`,
      ),
    ];

    // Phase 12-08: This cast is unavoidable because TypeScript cannot infer the exact
    // ToolOutputData<TName> type from a generic union at runtime. The union of all
    // possible data shapes does not overlap cleanly with Record<string, unknown>.
    const resultData =
      typeof result.data === "object" && result.data !== null
        ? (result.data as unknown as Record<string, unknown>)
        : {};

    return {
      ...result,
      artifacts: Array.from(new Set(artifacts)),
      data: {
        ...resultData,
        queueWaitMs: exclusive.queueWaitMs,
      } as unknown as ToolOutputData<TName>,
    };
  };
}

function composeToolHandler(
  descriptor: ToolDescriptor,
  registry: Partial<MobileE2EMcpToolRegistry>,
): AnyToolHandler {
  const base = descriptor.handler ?? descriptor.createHandler?.(registry);
  if (!base) {
    throw new Error(`Descriptor '${descriptor.name}' is missing a handler.`);
  }

  let wrapped = base;
  if (descriptor.audit.captureResultEvidence) {
    wrapped = withPolicyAndAudit(descriptor.name as ToolName, wrapped as ToolHandler<ToolName>) as AnyToolHandler;
  } else if (descriptor.policy.enforced) {
    wrapped = withPolicy(descriptor.name as ToolName, wrapped as ToolHandler<ToolName>) as AnyToolHandler;
  }
  if (descriptor.session.required) {
    wrapped = withSessionExecution(descriptor.name as ToolName, wrapped as ToolHandler<ToolName>, {
      requireResolvedSessionContext: descriptor.session.requireResolvedSessionContext,
    }) as AnyToolHandler;
  }
  return wrapped;
}

const TOOL_DESCRIPTORS: ReadonlyArray<ToolDescriptor> = [
  defineToolDescriptor({
    name: TOOL_NAMES.captureJsConsoleLogs,
    description: "Capture one-shot React Native or Expo JS console events through the Metro inspector WebSocket.",
    handler: captureJsConsoleLogs,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.captureJsNetworkEvents,
    description: "Capture one-shot React Native or Expo JS network events through the Metro inspector WebSocket.",
    handler: captureJsNetworkEvents,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.captureElementScreenshot,
    description: "Capture a screenshot cropped to a specific UI element's bounds for visual regression testing.",
    handler: captureElementScreenshot,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.compareAgainstBaseline,
    description: "Compare the current action outcome against a previously successful local baseline.",
    handler: compareAgainstBaseline,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.compareVisualBaseline,
    description: "Compare a current screenshot against a visual baseline image, returning pixel-diff percentage and pass/fail status.",
    handler: compareVisualBaselineTool,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.collectDebugEvidence,
    description: "Capture AI-friendly summarized debug evidence from logs and crash signals, with optional diagnostics escalation.",
    handler: collectDebugEvidence,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.collectDiagnostics,
    description: "Capture an Android bugreport bundle or an iOS simulator diagnostics bundle.",
    handler: collectDiagnostics,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.detectInterruption,
    description: "Detect interruption signals from current state summary and UI evidence.",
    handler: (input: DetectInterruptionInput) => detectInterruption(input),
    policy: { enforced: true, requiredScopes: ["interrupt"] },
    session: { required: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.classifyInterruption,
    description: "Classify interruption type and confidence from structured interruption signals.",
    handler: (input: ClassifyInterruptionInput) => classifyInterruption(input),
    policy: { enforced: true, requiredScopes: ["interrupt"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.describeCapabilities,
    description: "Return the current platform capability profile before invoking platform-specific tools.",
    handler: describeCapabilities,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.doctor,
    description: "Check command availability and device readiness.",
    handler: doctor,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.executeIntent,
    description: "Execute a high-level intent by planning a bounded mobile action with evidence.",
    handler: executeIntent,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.completeTask,
    description: "Execute a bounded multi-step task plan and return per-step outcomes.",
    handler: completeTask,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.startRecordSession,
    description: "Start passive recording for manual interactions on Android or iOS targets.",
    handler: startRecordSession,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.getRecordSessionStatus,
    description: "Get passive recording session status, counts, and warnings.",
    handler: getRecordSessionStatus,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.endRecordSession,
    description: "Stop passive recording, map captured events, and export replayable flow.",
    handler: endRecordSession,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.cancelRecordSession,
    description: "Cancel an active passive recording session.",
    handler: cancelRecordSession,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.exportSessionFlow,
    description: "Export persisted session action records to a replayable Maestro flow YAML.",
    handler: exportSessionFlow,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.recordTaskFlow,
    description: "Export a task-oriented flow snapshot from persisted session actions.",
    handler: recordTaskFlow,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.requestManualHandoff,
    description: "Record an explicit operator handoff checkpoint for OTP, consent, captcha, or protected-page workflows.",
    handler: (input: RequestManualHandoffInput) => requestManualHandoff(input),
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.explainLastFailure,
    description: "Explain the most recent action failure using deterministic attribution heuristics.",
    handler: explainLastFailure,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.findSimilarFailures,
    description: "Find locally indexed failures that resemble the current failure signature.",
    handler: findSimilarFailures,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.getActionOutcome,
    description: "Load a previously recorded action outcome by actionId.",
    handler: getActionOutcome,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.getCrashSignals,
    description: "Capture recent Android crash or ANR evidence and inspect the iOS simulator crash reporter tree.",
    handler: getCrashSignals,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.getLogs,
    description: "Capture recent Android logcat output or recent iOS simulator logs.",
    handler: getLogs,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.getScreenSummary,
    description: "Capture a compact current-screen summary with actionable targets and blocking signals.",
    handler: getScreenSummary,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.getSessionState,
    description: "Return compact AI-first session state with latest screen, readiness, and recent failure signals.",
    handler: getSessionState,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.inspectUi,
    description: "Capture a device UI hierarchy dump; iOS still relies on idb-backed hierarchy artifacts.",
    handler: inspectUi,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.queryUi,
    description: "Query Android or iOS hierarchy dumps by selector fields and return structured matches.",
    handler: queryUi,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.resolveUiTarget,
    description: "Resolve a UI selector to a single actionable Android or iOS target or report ambiguity.",
    handler: resolveUiTarget,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.scrollAndResolveUiTarget,
    description: "Scroll Android UI containers while trying to resolve a selector to a single actionable target. iOS: use scroll_only → wait_for_ui → resolve_ui_target instead.",
    handler: scrollAndResolveUiTarget,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.scrollOnly,
    description: "Perform scroll gestures without target resolution. Use with wait_for_ui and resolve_ui_target for explicit control.",
    handler: scrollOnly,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.scrollAndTapElement,
    description: "Scroll Android UI containers until a target resolves, then tap the resolved element. iOS: use scroll_only → wait_for_ui → tap_element instead.",
    handler: scrollAndTapElement,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.installApp,
    description: "Install a native or flutter artifact onto a target device/simulator.",
    handler: installApp,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.listJsDebugTargets,
    description: "Discover React Native or Expo JS debug targets from the Metro inspector endpoint.",
    handler: listJsDebugTargets,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.launchApp,
    description: "Launch the selected app or Expo URL on a target device/simulator.",
    handler: launchApp,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.listDevices,
    description: "List Android devices and iOS simulators/physical devices.",
    handler: listDevices,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.measureAndroidPerformance,
    description: "Capture an Android Perfetto time window and return a lightweight AI-friendly performance summary.",
    handler: measureAndroidPerformance,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.measureIosPerformance,
    description: "Capture an iOS xctrace time window and return a lightweight AI-friendly performance summary.",
    handler: measureIosPerformance,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.navigateBack,
    description: "Navigate back using platform-specific mechanisms: Android KEYEVENT_BACK or iOS app back button tap.",
    handler: navigateBack,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.performActionWithEvidence,
    description: "Execute one bounded action and automatically capture pre/post state plus outcome evidence.",
    createHandler: (registry) => {
      const explainLastFailureHandler =
        registry.explain_last_failure
        ?? withPolicy(TOOL_NAMES.explainLastFailure, explainLastFailure);
      const compareAgainstBaselineHandler =
        registry.compare_against_baseline
        ?? withPolicy(TOOL_NAMES.compareAgainstBaseline, compareAgainstBaseline);
      const rankFailureCandidatesHandler =
        registry.rank_failure_candidates
        ?? withPolicy(TOOL_NAMES.rankFailureCandidates, rankFailureCandidates);
      const suggestKnownRemediationHandler =
        registry.suggest_known_remediation
        ?? withPolicy(TOOL_NAMES.suggestKnownRemediation, suggestKnownRemediation);
      const recoverToKnownStateHandler =
        registry.recover_to_known_state
        ?? withSessionExecution(
          TOOL_NAMES.recoverToKnownState,
          withPolicy(TOOL_NAMES.recoverToKnownState, recoverToKnownState),
          { requireResolvedSessionContext: true },
        );
      const replayLastStablePathHandler =
        registry.replay_last_stable_path
        ?? withSessionExecution(
          TOOL_NAMES.replayLastStablePath,
          withPolicy(TOOL_NAMES.replayLastStablePath, replayLastStablePath),
          { requireResolvedSessionContext: true },
        );
      return async (input: PerformActionWithEvidenceInput) =>
        performActionWithAutoRemediation(input, {
          performAction: performActionWithEvidence,
          compareAgainstBaseline: compareAgainstBaselineHandler,
          explainLastFailure: explainLastFailureHandler,
          rankFailureCandidates: rankFailureCandidatesHandler,
          suggestKnownRemediation: suggestKnownRemediationHandler,
          recoverToKnownState: recoverToKnownStateHandler,
          replayLastStablePath: replayLastStablePathHandler,
        });
    },
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.rankFailureCandidates,
    description: "Rank likely failure layers for the latest attributed action window.",
    handler: rankFailureCandidates,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.recordScreen,
    description: "Record screen output on Android (adb) or iOS simulator (simctl) for a bounded duration.",
    handler: recordScreen,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.recoverToKnownState,
    description: "Attempt a bounded deterministic recovery such as wait-ready or app relaunch.",
    handler: recoverToKnownState,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.resolveInterruption,
    description: "Resolve interruption with policy-aware signature matching and bounded actions.",
    handler: (input: ResolveInterruptionInput) => resolveInterruption(input),
    policy: { enforced: true, requiredScopes: ["interrupt", "interrupt-high-risk"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.resumeInterruptedAction,
    description: "Replay interrupted action from checkpoint with drift detection.",
    handler: (input: ResumeInterruptedActionInput) => resumeInterruptedAction(input),
    policy: { enforced: true, requiredScopes: ["interrupt"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.replayLastStablePath,
    description: "Replay the latest successful bounded action recorded for this session.",
    handler: replayLastStablePath,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.replayCheckpointChain,
    description: "Replay a chain of low-risk actions from the last stable checkpoint in a session, with divergence detection.",
    handler: replayCheckpointChainTool,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.resetAppState,
    description: "Reset app state using clear_data, uninstall_reinstall, or keychain_reset strategy.",
    handler: resetAppState,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.takeScreenshot,
    description: "Capture a screenshot from a target device or simulator.",
    handler: takeScreenshot,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.tap,
    description: "Perform a coordinate tap on Android, iOS simulators through idb, or iOS physical devices through a generated Maestro action flow.",
    handler: tap,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.tapElement,
    description: "Resolve a UI selector to a single Android or iOS target and tap only when the match is unambiguous.",
    handler: tapElement,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.terminateApp,
    description: "Terminate the selected app on a target device or simulator.",
    handler: terminateApp,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.typeText,
    description: "Perform direct text input on Android, iOS simulators through idb, or iOS physical devices through a generated Maestro action flow.",
    handler: typeText,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.typeIntoElement,
    description: "Resolve a UI selector, focus the matched Android or iOS element, and type text.",
    handler: typeIntoElement,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.validateFlow,
    description: "Validate a Maestro flow or recorded session against the current app state without executing actions.",
    handler: validateFlowTool,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.waitForUi,
    description: "Poll the Android or iOS hierarchy until a selector matches or timeout is reached.",
    handler: waitForUi,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.probeNetworkReadiness,
    description: "Probe network readiness on Android or iOS device, returning connectivity status, latency, DNS health, backend reachability, and a recovery strategy recommendation.",
    handler: probeNetworkReadinessTool,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.startSession,
    description: "Create a typed mobile execution session.",
    handler: startSession,
    policy: { enforced: true, requiredScopes: ["none"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.runFlow,
    description: "Run the selected flow through the Maestro adapter.",
    handler: runFlow,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.suggestKnownRemediation,
    description: "Suggest remediation based on similar failures, local baselines, and built-in readiness skill routing.",
    handler: suggestKnownRemediation,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: TOOL_NAMES.endSession,
    description: "Close a session and return final metadata.",
    handler: endSession,
    policy: { enforced: false, requiredScopes: ["none"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
];

export function buildToolListMetadata(): ToolListItem[] {
  return TOOL_DESCRIPTORS.map((descriptor) => ({
    name: descriptor.name,
    description: descriptor.description,
  }));
}

export function createServer(): MobileE2EMcpServer {
  const registry: Record<ToolName, AnyToolHandler> = {} as Record<ToolName, AnyToolHandler>;

  for (const descriptor of TOOL_DESCRIPTORS) {
    registry[descriptor.name] = composeToolHandler(
      descriptor,
      registry as unknown as Partial<MobileE2EMcpToolRegistry>,
    );
  }

  return new MobileE2EMcpServer(registry as unknown as MobileE2EMcpToolRegistry);
}
