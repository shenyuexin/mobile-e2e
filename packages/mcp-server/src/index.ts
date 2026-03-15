import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { appendSessionTimelineEvent, loadSessionRecord, recoverStaleLeases, runExclusive } from "@mobile-e2e-mcp/core";
import type {
  PerformActionWithEvidenceInput,
  Platform,
  ToolResult,
  DetectInterruptionInput,
  ClassifyInterruptionInput,
  ResolveInterruptionInput,
  ResumeInterruptedActionInput,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { MobileE2EMcpServer } from "./server.js";
import { enforcePolicyForTool } from "./policy-guard.js";
import { captureJsConsoleLogs } from "./tools/capture-js-console-logs.js";
import { captureJsNetworkEvents } from "./tools/capture-js-network-events.js";
import { compareAgainstBaseline } from "./tools/compare-against-baseline.js";
import { collectDebugEvidence } from "./tools/collect-debug-evidence.js";
import { collectDiagnostics } from "./tools/collect-diagnostics.js";
import { describeCapabilities } from "./tools/describe-capabilities.js";
import { doctor } from "./tools/doctor.js";
import { detectInterruption } from "./tools/detect-interruption.js";
import { classifyInterruption } from "./tools/classify-interruption.js";
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
import { listJsDebugTargets } from "./tools/list-js-debug-targets.js";
import { launchApp } from "./tools/launch-app.js";
import { listDevices } from "./tools/list-devices.js";
import { measureAndroidPerformance } from "./tools/measure-android-performance.js";
import { measureIosPerformance } from "./tools/measure-ios-performance.js";
import { queryUi } from "./tools/query-ui.js";
import { recordScreen } from "./tools/record-screen.js";
import { recoverToKnownState } from "./tools/recover-to-known-state.js";
import { performActionWithEvidence } from "./tools/perform-action-with-evidence.js";
import { performActionWithAutoRemediation } from "./tools/perform-action-with-auto-remediation.js";
import { resetAppState } from "./tools/reset-app-state.js";
import { resolveUiTarget } from "./tools/resolve-ui-target.js";
import { rankFailureCandidates } from "./tools/rank-failure-candidates.js";
import { replayLastStablePath } from "./tools/replay-last-stable-path.js";
import { resolveInterruption } from "./tools/resolve-interruption.js";
import { resumeInterruptedAction } from "./tools/resume-interrupted-action.js";
import { runFlow } from "./tools/run-flow.js";
import { scrollAndResolveUiTarget } from "./tools/scroll-and-resolve-ui-target.js";
import { scrollAndTapElement } from "./tools/scroll-and-tap-element.js";
import { startSession } from "./tools/start-session.js";
import { takeScreenshot } from "./tools/take-screenshot.js";
import { tapElement } from "./tools/tap-element.js";
import { tap } from "./tools/tap.js";
import { terminateApp } from "./tools/terminate-app.js";
import { typeText } from "./tools/type-text.js";
import { typeIntoElement } from "./tools/type-into-element.js";
import { waitForUi } from "./tools/wait-for-ui.js";
import { suggestKnownRemediation } from "./tools/suggest-known-remediation.js";
import { persistSessionEvidenceCapture } from "./tools/persist-session-evidence.js";

export function createServer(): MobileE2EMcpServer {
  const withPolicy = <TInput, TOutput>(toolName: string, handler: (input: TInput) => Promise<TOutput>) => {
    return async (input: TInput): Promise<TOutput> => {
      const denied = await enforcePolicyForTool(toolName, input);
      if (denied) {
        return denied as TOutput;
      }
      return handler(input);
    };
  };
  const withPolicyAndAudit = <TInput extends { sessionId?: string }, TOutput extends { artifacts: string[]; data: unknown }>(
    toolName: string,
    handler: (input: TInput) => Promise<TOutput>,
  ) => withPolicy(toolName, async (input: TInput): Promise<TOutput> => {
    const result = await handler(input);
    await persistSessionEvidenceCapture({
      toolName,
      sessionId: input.sessionId,
      result: result as unknown as import("@mobile-e2e-mcp/contracts").ToolResult,
    });
    return result;
  });
  const withSessionExecution = <
    TInput extends { sessionId?: string; platform?: Platform; deviceId?: string },
    TOutput extends ToolResult,
  >(
    toolName: string,
    handler: (input: TInput) => Promise<TOutput>,
  ) => {
    return async (input: TInput): Promise<TOutput> => {
      const asOutput = (result: ToolResult): TOutput => result as unknown as TOutput;
      const sessionId = input.sessionId;
      if (!sessionId) {
        return handler(input);
      }

      const repoRoot = resolveRepoPath();
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
        return handler(input);
      }

      if (input.platform && input.platform !== sessionRecord.session.platform) {
        return asOutput({
          status: "failed",
          reasonCode: REASON_CODES.configurationError,
          sessionId,
          durationMs: 0,
          attempts: 1,
          artifacts: [],
          data: {
            expectedPlatform: sessionRecord.session.platform,
            receivedPlatform: input.platform,
          },
          nextSuggestions: ["Use the same platform as the active session for session-bound tools."],
        });
      }

      if (input.deviceId && input.deviceId !== sessionRecord.session.deviceId) {
        return asOutput({
          status: "failed",
          reasonCode: REASON_CODES.configurationError,
          sessionId,
          durationMs: 0,
          attempts: 1,
          artifacts: [],
          data: {
            expectedDeviceId: sessionRecord.session.deviceId,
            receivedDeviceId: input.deviceId,
          },
          nextSuggestions: ["Use the same deviceId as the active session for session-bound tools."],
        });
      }

      const normalizedInput = {
        ...input,
        sessionId,
        platform: sessionRecord.session.platform,
        deviceId: sessionRecord.session.deviceId,
      } as TInput;

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
        ...staleRecovered.recovered.map((lease: { platform: string; deviceId: string }) => `artifacts/leases/${lease.platform}-${lease.deviceId}.json`),
      ];

      const resultData = typeof result.data === "object" && result.data !== null
        ? result.data as Record<string, unknown>
        : {};

      return {
        ...result,
        artifacts: Array.from(new Set(artifacts)),
        data: {
          ...resultData,
          queueWaitMs: exclusive.queueWaitMs,
        },
      };
    };
  };
  const captureJsConsoleLogsHandler = withPolicyAndAudit("capture_js_console_logs", captureJsConsoleLogs);
  const captureJsNetworkEventsHandler = withPolicyAndAudit("capture_js_network_events", captureJsNetworkEvents);
  const compareAgainstBaselineHandler = withPolicy("compare_against_baseline", compareAgainstBaseline);
  const collectDebugEvidenceHandler = withPolicyAndAudit("collect_debug_evidence", collectDebugEvidence);
  const collectDiagnosticsHandler = withPolicyAndAudit("collect_diagnostics", collectDiagnostics);
  const describeCapabilitiesHandler = withPolicy("describe_capabilities", describeCapabilities);
  const doctorHandler = withPolicy("doctor", doctor);
  const detectInterruptionHandler = withSessionExecution("detect_interruption", withPolicy("detect_interruption", (input: DetectInterruptionInput) => detectInterruption(input)));
  const classifyInterruptionHandler = withSessionExecution("classify_interruption", withPolicy("classify_interruption", (input: ClassifyInterruptionInput) => classifyInterruption(input)));
  const explainLastFailureHandler = withPolicy("explain_last_failure", explainLastFailure);
  const findSimilarFailuresHandler = withPolicy("find_similar_failures", findSimilarFailures);
  const getActionOutcomeHandler = withPolicy("get_action_outcome", getActionOutcome);
  const getCrashSignalsHandler = withSessionExecution("get_crash_signals", withPolicyAndAudit("get_crash_signals", getCrashSignals));
  const getLogsHandler = withSessionExecution("get_logs", withPolicyAndAudit("get_logs", getLogs));
  const getScreenSummaryHandler = withPolicy("get_screen_summary", getScreenSummary);
  const getSessionStateHandler = withSessionExecution("get_session_state", withPolicy("get_session_state", getSessionState));
  const inspectUiHandler = withPolicy("inspect_ui", inspectUi);
  const queryUiHandler = withPolicy("query_ui", queryUi);
  const recoverToKnownStateHandler = withSessionExecution("recover_to_known_state", withPolicy("recover_to_known_state", recoverToKnownState));
  const resolveUiTargetHandler = withPolicy("resolve_ui_target", resolveUiTarget);
  const replayLastStablePathHandler = withSessionExecution("replay_last_stable_path", withPolicy("replay_last_stable_path", replayLastStablePath));
  const resolveInterruptionHandler = withSessionExecution("resolve_interruption", withPolicy("resolve_interruption", (input: ResolveInterruptionInput) => resolveInterruption(input)));
  const resumeInterruptedActionHandler = withSessionExecution("resume_interrupted_action", withPolicy("resume_interrupted_action", (input: ResumeInterruptedActionInput) => resumeInterruptedAction(input)));
  const scrollAndResolveUiTargetHandler = withPolicy("scroll_and_resolve_ui_target", scrollAndResolveUiTarget);
  const scrollAndTapElementHandler = withPolicy("scroll_and_tap_element", scrollAndTapElement);
  const installAppHandler = withPolicy("install_app", installApp);
  const listJsDebugTargetsHandler = withPolicy("list_js_debug_targets", listJsDebugTargets);
  const launchAppHandler = withPolicy("launch_app", launchApp);
  const listDevicesHandler = withPolicy("list_devices", listDevices);
  const measureAndroidPerformanceHandler = withSessionExecution("measure_android_performance", withPolicyAndAudit("measure_android_performance", measureAndroidPerformance));
  const measureIosPerformanceHandler = withSessionExecution("measure_ios_performance", withPolicyAndAudit("measure_ios_performance", measureIosPerformance));
  const rankFailureCandidatesHandler = withPolicy("rank_failure_candidates", rankFailureCandidates);
  const recordScreenHandler = withSessionExecution("record_screen", withPolicyAndAudit("record_screen", recordScreen));
  const runFlowHandler = withSessionExecution("run_flow", withPolicy("run_flow", runFlow));
  const resetAppStateHandler = withPolicy("reset_app_state", resetAppState);
  const takeScreenshotHandler = withPolicy("take_screenshot", takeScreenshot);
  const tapHandler = withPolicy("tap", tap);
  const tapElementHandler = withPolicy("tap_element", tapElement);
  const terminateAppHandler = withPolicy("terminate_app", terminateApp);
  const typeTextHandler = withPolicy("type_text", typeText);
  const typeIntoElementHandler = withPolicy("type_into_element", typeIntoElement);
  const waitForUiHandler = withPolicy("wait_for_ui", waitForUi);
  const suggestKnownRemediationHandler = withPolicy("suggest_known_remediation", suggestKnownRemediation);
  const performActionWithEvidenceHandler = withSessionExecution("perform_action_with_evidence", withPolicy(
    "perform_action_with_evidence",
    (input: PerformActionWithEvidenceInput) => performActionWithAutoRemediation(input, {
      performAction: performActionWithEvidence,
      explainLastFailure: explainLastFailureHandler,
      rankFailureCandidates: rankFailureCandidatesHandler,
      suggestKnownRemediation: suggestKnownRemediationHandler,
      recoverToKnownState: recoverToKnownStateHandler,
      replayLastStablePath: replayLastStablePathHandler,
    }),
  ));

  return new MobileE2EMcpServer({
    capture_js_console_logs: captureJsConsoleLogsHandler,
    capture_js_network_events: captureJsNetworkEventsHandler,
    compare_against_baseline: compareAgainstBaselineHandler,
    collect_debug_evidence: collectDebugEvidenceHandler,
    collect_diagnostics: collectDiagnosticsHandler,
    describe_capabilities: describeCapabilitiesHandler,
    doctor: doctorHandler,
    detect_interruption: detectInterruptionHandler,
    classify_interruption: classifyInterruptionHandler,
    explain_last_failure: explainLastFailureHandler,
    find_similar_failures: findSimilarFailuresHandler,
    get_action_outcome: getActionOutcomeHandler,
    get_crash_signals: getCrashSignalsHandler,
    get_logs: getLogsHandler,
    get_screen_summary: getScreenSummaryHandler,
    get_session_state: getSessionStateHandler,
    inspect_ui: inspectUiHandler,
    query_ui: queryUiHandler,
    recover_to_known_state: recoverToKnownStateHandler,
    resolve_interruption: resolveInterruptionHandler,
    resume_interrupted_action: resumeInterruptedActionHandler,
    resolve_ui_target: resolveUiTargetHandler,
    replay_last_stable_path: replayLastStablePathHandler,
    scroll_and_resolve_ui_target: scrollAndResolveUiTargetHandler,
    scroll_and_tap_element: scrollAndTapElementHandler,
    install_app: installAppHandler,
    list_js_debug_targets: listJsDebugTargetsHandler,
    launch_app: launchAppHandler,
    list_devices: listDevicesHandler,
    measure_android_performance: measureAndroidPerformanceHandler,
    measure_ios_performance: measureIosPerformanceHandler,
    perform_action_with_evidence: performActionWithEvidenceHandler,
    rank_failure_candidates: rankFailureCandidatesHandler,
    record_screen: recordScreenHandler,
    start_session: async (input) => startSession(input),
    reset_app_state: resetAppStateHandler,
    run_flow: runFlowHandler,
    take_screenshot: takeScreenshotHandler,
    tap: tapHandler,
    tap_element: tapElementHandler,
    terminate_app: terminateAppHandler,
    type_text: typeTextHandler,
    type_into_element: typeIntoElementHandler,
    wait_for_ui: waitForUiHandler,
    suggest_known_remediation: suggestKnownRemediationHandler,
    end_session: endSession,
  });
}
