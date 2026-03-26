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
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  appendSessionTimelineEvent,
  loadSessionRecord,
  recoverStaleLeases,
  runExclusive,
} from "@mobile-e2e-mcp/core";
import { enforcePolicyForTool } from "./policy-guard.js";
import {
  MobileE2EMcpServer,
  type MobileE2EMcpToolContractMap,
  type MobileE2EMcpToolName,
  type MobileE2EMcpToolRegistry,
} from "./server.js";
import { captureJsConsoleLogs } from "./tools/capture-js-console-logs.js";
import { captureJsNetworkEvents } from "./tools/capture-js-network-events.js";
import { classifyInterruption } from "./tools/classify-interruption.js";
import { collectDebugEvidence } from "./tools/collect-debug-evidence.js";
import { collectDiagnostics } from "./tools/collect-diagnostics.js";
import { compareAgainstBaseline } from "./tools/compare-against-baseline.js";
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
import { performActionWithAutoRemediation } from "./tools/perform-action-with-auto-remediation.js";
import { performActionWithEvidence } from "./tools/perform-action-with-evidence.js";
import { persistSessionEvidenceCapture } from "./tools/persist-session-evidence.js";
import { queryUi } from "./tools/query-ui.js";
import { rankFailureCandidates } from "./tools/rank-failure-candidates.js";
import { recordScreen } from "./tools/record-screen.js";
import { requestManualHandoff } from "./tools/request-manual-handoff.js";
import { recoverToKnownState } from "./tools/recover-to-known-state.js";
import { replayLastStablePath } from "./tools/replay-last-stable-path.js";
import { resetAppState } from "./tools/reset-app-state.js";
import { resolveInterruption } from "./tools/resolve-interruption.js";
import { resolveUiTarget } from "./tools/resolve-ui-target.js";
import { resumeInterruptedAction } from "./tools/resume-interrupted-action.js";
import { runFlow } from "./tools/run-flow.js";
import { scrollAndResolveUiTarget } from "./tools/scroll-and-resolve-ui-target.js";
import { scrollAndTapElement } from "./tools/scroll-and-tap-element.js";
import { startSession } from "./tools/start-session.js";
import { suggestKnownRemediation } from "./tools/suggest-known-remediation.js";
import { takeScreenshot } from "./tools/take-screenshot.js";
import { tap } from "./tools/tap.js";
import { tapElement } from "./tools/tap-element.js";
import { terminateApp } from "./tools/terminate-app.js";
import { typeIntoElement } from "./tools/type-into-element.js";
import { typeText } from "./tools/type-text.js";
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

type ToolPolicyRequirement =
  | "none"
  | "read"
  | "write"
  | "diagnostics"
  | "interrupt"
  | "interrupt-high-risk";

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

    const resultData =
      typeof result.data === "object" && result.data !== null
        ? (result.data as Record<string, unknown>)
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
    name: "capture_js_console_logs",
    description: "Capture one-shot React Native or Expo JS console events through the Metro inspector WebSocket.",
    handler: captureJsConsoleLogs,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "capture_js_network_events",
    description: "Capture one-shot React Native or Expo JS network events through the Metro inspector WebSocket.",
    handler: captureJsNetworkEvents,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "compare_against_baseline",
    description: "Compare the current action outcome against a previously successful local baseline.",
    handler: compareAgainstBaseline,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "collect_debug_evidence",
    description: "Capture AI-friendly summarized debug evidence from logs and crash signals, with optional diagnostics escalation.",
    handler: collectDebugEvidence,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "collect_diagnostics",
    description: "Capture an Android bugreport bundle or an iOS simulator diagnostics bundle.",
    handler: collectDiagnostics,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "detect_interruption",
    description: "Detect interruption signals from current state summary and UI evidence.",
    handler: (input: DetectInterruptionInput) => detectInterruption(input),
    policy: { enforced: true, requiredScopes: ["interrupt"] },
    session: { required: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "classify_interruption",
    description: "Classify interruption type and confidence from structured interruption signals.",
    handler: (input: ClassifyInterruptionInput) => classifyInterruption(input),
    policy: { enforced: true, requiredScopes: ["interrupt"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "describe_capabilities",
    description: "Return the current platform capability profile before invoking platform-specific tools.",
    handler: describeCapabilities,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "doctor",
    description: "Check command availability and device readiness.",
    handler: doctor,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "execute_intent",
    description: "Execute a high-level intent by planning a bounded mobile action with evidence.",
    handler: executeIntent,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "complete_task",
    description: "Execute a bounded multi-step task plan and return per-step outcomes.",
    handler: completeTask,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "start_record_session",
    description: "Start passive Android recording for manual on-device interactions.",
    handler: startRecordSession,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "get_record_session_status",
    description: "Get passive recording session status, counts, and warnings.",
    handler: getRecordSessionStatus,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "end_record_session",
    description: "Stop passive recording, map captured events, and export replayable flow.",
    handler: endRecordSession,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "cancel_record_session",
    description: "Cancel an active passive recording session.",
    handler: cancelRecordSession,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "export_session_flow",
    description: "Export persisted session action records to a replayable Maestro flow YAML.",
    handler: exportSessionFlow,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "record_task_flow",
    description: "Export a task-oriented flow snapshot from persisted session actions.",
    handler: recordTaskFlow,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "request_manual_handoff",
    description: "Record an explicit operator handoff checkpoint for OTP, consent, captcha, or protected-page workflows.",
    handler: (input: RequestManualHandoffInput) => requestManualHandoff(input),
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "explain_last_failure",
    description: "Explain the most recent action failure using deterministic attribution heuristics.",
    handler: explainLastFailure,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "find_similar_failures",
    description: "Find locally indexed failures that resemble the current failure signature.",
    handler: findSimilarFailures,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "get_action_outcome",
    description: "Load a previously recorded action outcome by actionId.",
    handler: getActionOutcome,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "get_crash_signals",
    description: "Capture recent Android crash or ANR evidence and inspect the iOS simulator crash reporter tree.",
    handler: getCrashSignals,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "get_logs",
    description: "Capture recent Android logcat output or recent iOS simulator logs.",
    handler: getLogs,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "get_screen_summary",
    description: "Capture a compact current-screen summary with actionable targets and blocking signals.",
    handler: getScreenSummary,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "get_session_state",
    description: "Return compact AI-first session state with latest screen, readiness, and recent failure signals.",
    handler: getSessionState,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "inspect_ui",
    description: "Capture a device UI hierarchy dump; iOS still relies on idb-backed hierarchy artifacts.",
    handler: inspectUi,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "query_ui",
    description: "Query Android or iOS hierarchy dumps by selector fields and return structured matches.",
    handler: queryUi,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "resolve_ui_target",
    description: "Resolve a UI selector to a single actionable Android or iOS target or report ambiguity.",
    handler: resolveUiTarget,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "scroll_and_resolve_ui_target",
    description: "Scroll Android or iOS UI containers while trying to resolve a selector to a single actionable target.",
    handler: scrollAndResolveUiTarget,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "scroll_and_tap_element",
    description: "Scroll Android or iOS UI containers until a target resolves, then tap the resolved element.",
    handler: scrollAndTapElement,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "install_app",
    description: "Install a native or flutter artifact onto a target device/simulator.",
    handler: installApp,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "list_js_debug_targets",
    description: "Discover React Native or Expo JS debug targets from the Metro inspector endpoint.",
    handler: listJsDebugTargets,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "launch_app",
    description: "Launch the selected app or Expo URL on a target device/simulator.",
    handler: launchApp,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "list_devices",
    description: "List Android devices and iOS simulators.",
    handler: listDevices,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "measure_android_performance",
    description: "Capture an Android Perfetto time window and return a lightweight AI-friendly performance summary.",
    handler: measureAndroidPerformance,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "measure_ios_performance",
    description: "Capture an iOS xctrace time window and return a lightweight AI-friendly performance summary.",
    handler: measureIosPerformance,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "perform_action_with_evidence",
    description: "Execute one bounded action and automatically capture pre/post state plus outcome evidence.",
    createHandler: (registry) => {
      const explainLastFailureHandler =
        registry.explain_last_failure
        ?? withPolicy("explain_last_failure", explainLastFailure);
      const compareAgainstBaselineHandler =
        registry.compare_against_baseline
        ?? withPolicy("compare_against_baseline", compareAgainstBaseline);
      const rankFailureCandidatesHandler =
        registry.rank_failure_candidates
        ?? withPolicy("rank_failure_candidates", rankFailureCandidates);
      const suggestKnownRemediationHandler =
        registry.suggest_known_remediation
        ?? withPolicy("suggest_known_remediation", suggestKnownRemediation);
      const recoverToKnownStateHandler =
        registry.recover_to_known_state
        ?? withSessionExecution(
          "recover_to_known_state",
          withPolicy("recover_to_known_state", recoverToKnownState),
          { requireResolvedSessionContext: true },
        );
      const replayLastStablePathHandler =
        registry.replay_last_stable_path
        ?? withSessionExecution(
          "replay_last_stable_path",
          withPolicy("replay_last_stable_path", replayLastStablePath),
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
    name: "rank_failure_candidates",
    description: "Rank likely failure layers for the latest attributed action window.",
    handler: rankFailureCandidates,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "record_screen",
    description: "Record screen output on Android (adb) or iOS simulator (simctl) for a bounded duration.",
    handler: recordScreen,
    policy: { enforced: true, requiredScopes: ["diagnostics"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: true },
  }),
  defineToolDescriptor({
    name: "recover_to_known_state",
    description: "Attempt a bounded deterministic recovery such as wait-ready or app relaunch.",
    handler: recoverToKnownState,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "resolve_interruption",
    description: "Resolve interruption with policy-aware signature matching and bounded actions.",
    handler: (input: ResolveInterruptionInput) => resolveInterruption(input),
    policy: { enforced: true, requiredScopes: ["interrupt", "interrupt-high-risk"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "resume_interrupted_action",
    description: "Replay interrupted action from checkpoint with drift detection.",
    handler: (input: ResumeInterruptedActionInput) => resumeInterruptedAction(input),
    policy: { enforced: true, requiredScopes: ["interrupt"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "replay_last_stable_path",
    description: "Replay the latest successful bounded action recorded for this session.",
    handler: replayLastStablePath,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "reset_app_state",
    description: "Reset app state using clear_data, uninstall_reinstall, or keychain_reset strategy.",
    handler: resetAppState,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "take_screenshot",
    description: "Capture a screenshot from a target device or simulator.",
    handler: takeScreenshot,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "tap",
    description: "Perform a coordinate tap on Android or on iOS simulators through idb.",
    handler: tap,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "tap_element",
    description: "Resolve a UI selector to a single Android or iOS target and tap only when the match is unambiguous.",
    handler: tapElement,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "terminate_app",
    description: "Terminate the selected app on a target device or simulator.",
    handler: terminateApp,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "type_text",
    description: "Perform direct text input on Android or on iOS simulators through idb.",
    handler: typeText,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "type_into_element",
    description: "Resolve a UI selector, focus the matched Android or iOS element, and type text.",
    handler: typeIntoElement,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "wait_for_ui",
    description: "Poll the Android or iOS hierarchy until a selector matches or timeout is reached.",
    handler: waitForUi,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "start_session",
    description: "Create a typed mobile execution session.",
    handler: startSession,
    policy: { enforced: true, requiredScopes: ["none"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "run_flow",
    description: "Run the selected flow through the Maestro adapter.",
    handler: runFlow,
    policy: { enforced: true, requiredScopes: ["write"] },
    session: { required: true, requireResolvedSessionContext: true },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "suggest_known_remediation",
    description: "Suggest remediation based on similar failures and local successful baselines.",
    handler: suggestKnownRemediation,
    policy: { enforced: true, requiredScopes: ["read"] },
    session: { required: false },
    audit: { captureResultEvidence: false },
  }),
  defineToolDescriptor({
    name: "end_session",
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
