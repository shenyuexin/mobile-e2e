import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildActionRecordRelativePath, buildDeviceLeaseRecordRelativePath, buildRecordEventsRelativePath, buildRecordedStepsRelativePath, buildRecordSessionRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath, persistActionRecord } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function buildTestDeviceId(sessionId: string): string {
  return `${sessionId}-device`;
}

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", buildTestDeviceId(sessionId))), { force: true });
}

async function cleanupActionArtifact(actionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildActionRecordRelativePath(actionId)), { force: true });
}

async function cleanupRecordSessionArtifacts(recordSessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildRecordSessionRelativePath(recordSessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildRecordEventsRelativePath(recordSessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildRecordedStepsRelativePath(recordSessionId)), { force: true });
}

test("createServer lists newly added UI tools", () => {
  const server = createServer();
  const tools = server.listTools();

  assert.ok(tools.includes("collect_debug_evidence"));
  assert.ok(tools.includes("detect_interruption"));
  assert.ok(tools.includes("classify_interruption"));
  assert.ok(tools.includes("capture_js_console_logs"));
  assert.ok(tools.includes("capture_js_network_events"));
  assert.ok(tools.includes("collect_diagnostics"));
  assert.ok(tools.includes("describe_capabilities"));
  assert.ok(tools.includes("execute_intent"));
  assert.ok(tools.includes("complete_task"));
  assert.ok(tools.includes("start_record_session"));
  assert.ok(tools.includes("get_record_session_status"));
  assert.ok(tools.includes("end_record_session"));
  assert.ok(tools.includes("cancel_record_session"));
  assert.ok(tools.includes("export_session_flow"));
  assert.ok(tools.includes("record_task_flow"));
  assert.ok(tools.includes("request_manual_handoff"));
  assert.ok(tools.includes("compare_against_baseline"));
  assert.ok(tools.includes("explain_last_failure"));
  assert.ok(tools.includes("find_similar_failures"));
  assert.ok(tools.includes("get_action_outcome"));
  assert.ok(tools.includes("get_crash_signals"));
  assert.ok(tools.includes("list_js_debug_targets"));
  assert.ok(tools.includes("measure_android_performance"));
  assert.ok(tools.includes("measure_ios_performance"));
  assert.ok(tools.includes("perform_action_with_evidence"));
  assert.ok(tools.includes("rank_failure_candidates"));
  assert.ok(tools.includes("record_screen"));
  assert.ok(tools.includes("recover_to_known_state"));
  assert.ok(tools.includes("resolve_interruption"));
  assert.ok(tools.includes("resume_interrupted_action"));
  assert.ok(tools.includes("replay_last_stable_path"));
  assert.ok(tools.includes("reset_app_state"));
  assert.ok(tools.includes("suggest_known_remediation"));
  assert.ok(tools.includes("get_screen_summary"));
  assert.ok(tools.includes("get_session_state"));
  assert.ok(tools.includes("query_ui"));
  assert.ok(tools.includes("resolve_ui_target"));
  assert.ok(tools.includes("wait_for_ui"));
  assert.ok(tools.includes("scroll_and_resolve_ui_target"));
  assert.ok(tools.includes("scroll_and_tap_element"));
  assert.ok(tools.includes("tap_element"));
  assert.ok(tools.includes("type_into_element"));
});

test("server invoke returns capability discovery profiles", async () => {
  const server = createServer();
  const result = await server.invoke("describe_capabilities", {
    sessionId: "server-capabilities",
    platform: "ios",
    runnerProfile: "phase1",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.capabilities.platform, "ios");
  assert.equal(result.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "full");
  assert.equal(result.data.capabilities.ocrFallback?.deterministicFirst, true);
  assert.equal(result.data.capabilities.ocrFallback?.hostRequirement, "darwin");
  assert.equal(Array.isArray(result.data.capabilities.ocrFallback?.configuredProviders), true);
});

test("server invoke records manual handoff checkpoints into session timeline", async () => {
  const server = createServer();
  const sessionId = `server-handoff-${Date.now()}`;
  try {
    const started = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      appId: "com.example.app",
      profile: "phase1",
    });
    assert.equal(started.status, "success");

    const result = await server.invoke("request_manual_handoff", {
      sessionId,
      platform: "android",
      reason: "otp_required",
      summary: "OTP input requires a human operator.",
      suggestedOperatorActions: ["Enter the code directly on-device."],
      resumeHints: ["Re-run get_screen_summary after the code is submitted."],
      blocking: true,
      stateSummary: {
        appPhase: "authentication",
        readiness: "interrupted",
        blockingSignals: ["verification_prompt"],
      },
    });

    assert.equal(result.status, "success");
    assert.equal(result.reasonCode, "OK");
    assert.equal(result.data.reason, "otp_required");
    assert.equal(result.data.blocking, true);
    assert.equal(result.data.requested, true);

    const persisted = JSON.parse(
      await readFile(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), "utf8"),
    ) as {
      session: {
        latestStateSummary?: { appPhase?: string; readiness?: string; manualHandoff?: { reason?: string; required?: boolean } };
        timeline: Array<{ type?: string; eventType?: string; detail?: string }>;
      };
    };
    assert.equal(persisted.session.timeline.some((event) => event.type === "manual_handoff_requested" && event.eventType === "manual_handoff"), true);
    assert.equal(persisted.session.latestStateSummary?.appPhase, "authentication");
    assert.equal(persisted.session.latestStateSummary?.readiness, "interrupted");
    assert.equal(persisted.session.latestStateSummary?.manualHandoff?.reason, "otp_required");
    assert.equal(persisted.session.latestStateSummary?.manualHandoff?.required, true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("server invoke keeps resolve_ui_target Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("resolve_ui_target", {
    sessionId: "server-resolve-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
  assert.equal(result.nextSuggestions[0]?.includes("resolve_ui_target dry-run"), true);
});

test("server invoke keeps query_ui Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("query_ui", {
    sessionId: "server-query-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.result.totalMatches, 0);
  assert.equal(result.data.evidence?.[0]?.kind, "ui_dump");
  assert.equal(result.data.evidence?.[0]?.supportLevel, "full");
});

test("server invoke supports get_screen_summary Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("get_screen_summary", {
    sessionId: "server-screen-summary-dry-run",
    platform: "android",
    includeDebugSignals: true,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.summarySource, "ui_and_debug_signals");
  assert.equal(result.data.screenSummary.appPhase, "unknown");
  assert.equal(typeof result.data.screenSummary.stateConfidence, "number");
  assert.equal(Array.isArray(result.data.screenSummary.derivedSignals), true);
  assert.equal(result.data.supportLevel, "full");
});

test("server invoke supports get_session_state Android dry-run without persisted session", async () => {
  const server = createServer();
  const result = await server.invoke("get_session_state", {
    sessionId: "server-session-state-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.sessionRecordFound, false);
  assert.equal(result.data.platform, "android");
  assert.equal(result.data.state.appPhase, "unknown");
  assert.equal(typeof result.data.state.stateConfidence, "number");
  assert.equal(result.data.latestKnownStateDelta, undefined);
});

test("server invoke supports perform_action_with_evidence Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("perform_action_with_evidence", {
    sessionId: "server-action-evidence-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      contentDesc: "View products",
    },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.outcome.actionType, "tap_element");
  assert.equal(typeof result.data.outcome.actionId, "string");
  assert.equal(result.data.outcome.failureCategory, "unsupported");
  assert.equal(result.data.outcome.progressMarker, "none");
  assert.equal(result.data.outcome.postconditionStatus, "not_met");
  assert.equal(result.data.outcome.stateChangeCategory, "no_material_change");
  assert.equal(result.data.outcome.stateChangeConfidence, "weak");
  assert.equal(Array.isArray(result.data.actionabilityReview), true);
  assert.equal(result.data.retryRecommendationTier, "inspect_only");
  assert.equal(result.nextSuggestions[0]?.includes("Inspect the returned pre/post state summaries"), true);
});

test("server invoke supports execute_intent Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("execute_intent", {
    sessionId: "server-execute-intent-dry-run",
    platform: "android",
    dryRun: true,
    intent: "tap view products",
    actionType: "tap_element",
    contentDesc: "View products",
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.selectedAction.actionType, "tap_element");
  assert.equal(typeof result.data.decision, "string");
});

test("server invoke supports complete_task Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("complete_task", {
    sessionId: "server-complete-task-dry-run",
    platform: "android",
    dryRun: true,
    goal: "run one wait step",
    steps: [
      {
        intent: "wait for login email",
        actionType: "wait_for_ui",
        resourceId: "login_email",
      },
    ],
  });

  assert.equal(result.status, "partial");
  assert.equal(result.data.totalSteps, 1);
  assert.equal(result.data.outcomes.length, 1);
});

test("server invoke supports record session lifecycle in dry-run", async () => {
  const server = createServer();
  const sessionId = `server-record-session-${Date.now()}`;
  const recordSessionIdHolder: { value?: string } = {};
  const flowPathHolder: { value?: string } = {};
  try {
    const start = await server.invoke("start_record_session", {
      sessionId,
      platform: "android",
      dryRun: true,
      deviceId: "emulator-5554",
      appId: "com.example.app",
    });
    recordSessionIdHolder.value = start.data.recordSessionId;

    assert.equal(start.status, "success");
    assert.equal(start.reasonCode, "OK");
    assert.equal(start.data.status, "running");

    const status = await server.invoke("get_record_session_status", {
      recordSessionId: start.data.recordSessionId,
    });
    assert.equal(status.status, "success");
    assert.equal(status.data.recordSessionId, start.data.recordSessionId);

    const ended = await server.invoke("end_record_session", {
      recordSessionId: start.data.recordSessionId,
      autoExport: true,
      runReplayDryRun: true,
      dryRun: true,
    });
    assert.equal(ended.status, "success");
    assert.equal(ended.data.status, "ended");
    assert.equal(typeof ended.data.report.stepCount, "number");
    assert.equal(typeof ended.data.report.flowPath, "string");
    assert.equal(ended.data.report.flowPath?.endsWith(".yaml"), true);
    assert.equal(typeof ended.data.report.replayDryRun?.status, "string");
    assert.equal(typeof ended.data.report.replayDryRun?.reasonCode, "string");
    flowPathHolder.value = ended.data.report.flowPath;
    if (flowPathHolder.value) {
      const exportedFlow = await readFile(path.resolve(repoRoot, flowPathHolder.value), "utf8");
      assert.equal(exportedFlow.includes("artifacts/record-snapshots/"), false);
    }

    const cancelled = await server.invoke("cancel_record_session", {
      recordSessionId: start.data.recordSessionId,
    });
    assert.equal(cancelled.status, "success");
    assert.equal(cancelled.data.cancelled, true);
  } finally {
    if (recordSessionIdHolder.value) {
      await cleanupRecordSessionArtifacts(recordSessionIdHolder.value);
    }
    if (flowPathHolder.value) {
      await rm(path.resolve(repoRoot, flowPathHolder.value), { force: true });
    }
  }
});

test("server invoke supports iOS record session lifecycle in dry-run", async () => {
  const server = createServer();
  const sessionId = `server-record-session-ios-${Date.now()}`;
  const recordSessionIdHolder: { value?: string } = {};
  const flowPathHolder: { value?: string } = {};
  try {
    const start = await server.invoke("start_record_session", {
      sessionId,
      platform: "ios",
      dryRun: true,
      deviceId: "00000000-0000-0000-0000-000000000000",
      appId: "com.example.ios",
    });
    recordSessionIdHolder.value = start.data.recordSessionId;

    assert.equal(start.status, "success");
    assert.equal(start.reasonCode, "OK");
    assert.equal(start.data.platform, "ios");
    assert.equal(start.data.status, "running");

    const status = await server.invoke("get_record_session_status", {
      recordSessionId: start.data.recordSessionId,
    });
    assert.equal(status.status, "success");
    assert.equal(status.data.platform, "ios");

    const ended = await server.invoke("end_record_session", {
      recordSessionId: start.data.recordSessionId,
      autoExport: true,
      runReplayDryRun: true,
      dryRun: true,
    });
    assert.equal(ended.status, "success");
    assert.equal(ended.data.status, "ended");
    assert.equal(typeof ended.data.report.flowPath, "string");
    assert.equal(ended.data.report.flowPath?.endsWith(".yaml"), true);
    flowPathHolder.value = ended.data.report.flowPath;
    if (flowPathHolder.value) {
      const exportedFlow = await readFile(path.resolve(repoRoot, flowPathHolder.value), "utf8");
      assert.equal(exportedFlow.includes("- tapOn:"), true);
      assert.equal(exportedFlow.includes("- inputText:"), true);
      assert.equal(exportedFlow.includes("artifacts/record-snapshots/"), false);
    }

    const cancelled = await server.invoke("cancel_record_session", {
      recordSessionId: start.data.recordSessionId,
    });
    assert.equal(cancelled.status, "success");
    assert.equal(cancelled.data.cancelled, true);
  } finally {
    if (recordSessionIdHolder.value) {
      await cleanupRecordSessionArtifacts(recordSessionIdHolder.value);
    }
    if (flowPathHolder.value) {
      await rm(path.resolve(repoRoot, flowPathHolder.value), { force: true });
    }
  }
});

test("server invoke returns bounded auto-remediation stop details for allowlist misses", async () => {
  const server = createServer();
  const sessionId = `server-auto-remediation-stop-${Date.now()}`;

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });
    const result = await server.invoke("perform_action_with_evidence", {
      sessionId,
      platform: "android",
      dryRun: true,
      autoRemediate: true,
      action: {
        actionType: "tap_element",
        contentDesc: "View products",
      },
    });

    assert.equal(result.status, "partial");
    assert.equal(typeof result.data.autoRemediation?.stopReason, "string");
    assert.equal(result.data.autoRemediation?.stopReason === "allowlist_miss" || result.data.autoRemediation?.stopReason === "weak_attribution", true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("server invoke supports get_action_outcome after perform_action_with_evidence", async () => {
  const server = createServer();
  const actionResult = await server.invoke("perform_action_with_evidence", {
    sessionId: "server-action-outcome-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "wait_for_ui",
      contentDesc: "View products",
    },
  });
  const outcomeResult = await server.invoke("get_action_outcome", {
    actionId: actionResult.data.outcome.actionId,
  });

  assert.equal(outcomeResult.status, "success");
  assert.equal(outcomeResult.reasonCode, "OK");
  assert.equal(outcomeResult.data.found, true);
  assert.equal(outcomeResult.data.outcome?.actionType, "wait_for_ui");
  assert.equal(outcomeResult.data.outcome?.postconditionStatus, "not_met");
  assert.equal(outcomeResult.data.outcome?.progressMarker, "none");
  assert.equal(outcomeResult.data.diagnosisPacket?.strongestSuspectLayer, "ui_locator");
  assert.equal(outcomeResult.data.diagnosisPacket?.confidence, "moderate");
});

test("server invoke supports explain_last_failure after perform_action_with_evidence", async () => {
  const server = createServer();
  await server.invoke("start_session", {
    sessionId: "server-explain-failure-dry-run",
    platform: "android",
    deviceId: buildTestDeviceId("server-explain-failure-dry-run"),
    profile: "phase1",
  });
  await server.invoke("perform_action_with_evidence", {
    sessionId: "server-explain-failure-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      contentDesc: "View products",
    },
  });
  const result = await server.invoke("explain_last_failure", {
    sessionId: "server-explain-failure-dry-run",
  });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.found, true);
  assert.equal(typeof result.data.attribution?.affectedLayer, "string");
  assert.equal(result.data.diagnosisPacket?.strongestSuspectLayer, "ui_locator");
  assert.equal(result.data.diagnosisPacket?.confidence, "moderate");
  assert.equal(typeof result.data.diagnosisPacket?.strongestCausalSignal, "string");
  assert.equal(typeof result.data.diagnosisPacket?.recommendedNextProbe, "string");
  assert.equal(typeof result.data.diagnosisPacket?.recommendedRecovery, "string");
  assert.equal(
    result.nextSuggestions.some((item) => item.includes("Inspect the action packet"))
      || result.data.retryRecommendation?.suggestedAction.includes("Inspect the action packet") === true,
    true,
  );
});

test("server invoke supports rank_failure_candidates after perform_action_with_evidence", async () => {
  const server = createServer();
  await server.invoke("start_session", {
    sessionId: "server-rank-failure-dry-run",
    platform: "android",
    deviceId: buildTestDeviceId("server-rank-failure-dry-run"),
    profile: "phase1",
  });
  await server.invoke("perform_action_with_evidence", {
    sessionId: "server-rank-failure-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      contentDesc: "View products",
    },
  });
  const result = await server.invoke("rank_failure_candidates", {
    sessionId: "server-rank-failure-dry-run",
  });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.found, true);
  assert.equal(result.data.candidates.length >= 1, true);
});

test("server invoke supports recover_to_known_state", async () => {
  const server = createServer();
  const result = await server.invoke("recover_to_known_state", {
    sessionId: "server-recover-state-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.reasonCode, "OK");
  assert.equal(typeof result.data.summary.strategy, "string");
});

test("server invoke supports replay_last_stable_path after a stable action", async () => {
  const server = createServer();
  await server.invoke("perform_action_with_evidence", {
    sessionId: "server-replay-stable-dry-run",
    platform: "android",
    dryRun: true,
    action: {
      actionType: "launch_app",
      appId: "host.exp.exponent",
    },
  });
  const result = await server.invoke("replay_last_stable_path", {
    sessionId: "server-replay-stable-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.summary.strategy, "replay_last_successful_action");
});

test("server invoke blocks replay_last_stable_path for high-risk persisted actions", async () => {
  const server = createServer();
  const sessionId = `server-replay-blocked-${Date.now()}`;

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });
    await persistActionRecord(repoRoot, {
      actionId: "action-high-risk-replay",
      sessionId,
      intent: {
        actionType: "tap_element",
        contentDesc: "Pay now",
      },
      outcome: {
        actionId: "action-high-risk-replay",
        actionType: "tap_element",
        resolutionStrategy: "deterministic",
        preState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
        postState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        confidence: 0.9,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
      updatedAt: new Date().toISOString(),
    });

    const result = await server.invoke("replay_last_stable_path", {
      sessionId,
      platform: "android",
      dryRun: true,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.reasonCode, "REPLAY_REFUSED_HIGH_RISK_BOUNDARY");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("server invoke supports Phase F lookup tools", async () => {
  const server = createServer();
  const sessionId = "server-phase-f-dry-run";
  await server.invoke("perform_action_with_evidence", {
    sessionId,
    platform: "android",
    dryRun: true,
    action: {
      actionType: "launch_app",
      appId: "host.exp.exponent",
    },
  });
  await server.invoke("perform_action_with_evidence", {
    sessionId,
    platform: "android",
    dryRun: true,
    action: {
      actionType: "tap_element",
      contentDesc: "View products",
    },
  });

  const similar = await server.invoke("find_similar_failures", { sessionId });
  const baseline = await server.invoke("compare_against_baseline", { sessionId });
  const remediation = await server.invoke("suggest_known_remediation", { sessionId });

  assert.equal(similar.reasonCode, "OK");
  assert.equal(typeof similar.data.found, "boolean");
  assert.equal(baseline.reasonCode, "OK");
  assert.equal(typeof baseline.data.found, "boolean");
  if (similar.data.similarFailures[0]) {
    assert.equal(Array.isArray(similar.data.similarFailures[0].matchedSignals), true);
  }
  if (baseline.data.comparison) {
    assert.equal(typeof baseline.data.comparison.replayValue, "string");
    assert.equal(typeof baseline.data.comparison.checkpointDivergence, "string");
  }
  assert.equal(remediation.reasonCode, "OK");
  assert.equal(Array.isArray(remediation.data.remediation), true);
});

test("server invoke keeps wait_for_ui iOS partial semantics", async () => {
  const server = createServer();
  const result = await server.invoke("wait_for_ui", {
    sessionId: "server-wait-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
});

test("server invoke keeps scroll_and_resolve_ui_target Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("scroll_and_resolve_ui_target", {
    sessionId: "server-scroll-dry-run",
    platform: "android",
    contentDesc: "View products",
    maxSwipes: 2,
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
  assert.equal(result.data.maxSwipes, 2);
});

test("server invoke previews iOS scroll_and_resolve_ui_target dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("scroll_and_resolve_ui_target", {
    sessionId: "server-scroll-ios-dry-run",
    platform: "ios",
    contentDesc: "View products",
    maxSwipes: 2,
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string }; commandHistory: string[][] } };

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
  assert.equal(result.data.commandHistory[1]?.includes("swipe"), true);
});

test("server invoke keeps scroll_and_tap_element Android dry-run semantics", async () => {
  const server = createServer();
  const result = await server.invoke("scroll_and_tap_element", {
    sessionId: "server-scroll-tap-dry-run",
    platform: "android",
    contentDesc: "View products",
    maxSwipes: 2,
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolveResult.resolution.status, "not_executed");
});

test("server invoke keeps type_into_element iOS partial semantics", async () => {
  const server = createServer();
  const result = await server.invoke("type_into_element", {
    sessionId: "server-type-ios",
    platform: "ios",
    contentDesc: "View products",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("server invoke keeps tap_element iOS partial semantics", async () => {
  const server = createServer();
  const result = await server.invoke("tap_element", {
    sessionId: "server-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution?.status, "not_executed");
});

test("server invoke supports run_flow Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("run_flow", {
    sessionId: "server-run-flow-dry-run",
    platform: "android",
    dryRun: true,
    runCount: 1,
  }) as {
    status: string;
    reasonCode: string;
    data: {
      dryRun: boolean;
      runnerProfile: string;
      executionMode?: string;
      replayProgress?: { completedSteps: number[] };
      stepOutcomes?: unknown[];
    };
  };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.runnerProfile, "phase1");
  assert.equal(result.data.executionMode, "runner_compat");
  assert.deepEqual(result.data.replayProgress?.completedSteps ?? [], []);
  assert.deepEqual(result.data.stepOutcomes ?? [], []);
});

test("server invoke supports export_session_flow with persisted actions", async () => {
  const server = createServer();
  const sessionId = `server-export-flow-${Date.now()}`;
  const actionId = `action-export-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: {
        actionType: "tap_element",
        contentDesc: "View products",
      },
      outcome: {
        actionId,
        actionType: "tap_element",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
      updatedAt: new Date().toISOString(),
    });

    const result = await server.invoke("export_session_flow", {
      sessionId,
      outputPath: `flows/samples/generated/${sessionId}.yaml`,
    });

    assert.equal(result.status, "success");
    assert.equal(result.reasonCode, "OK");
    assert.equal(result.data.stepCount >= 1, true);
    const exported = await readFile(path.resolve(repoRoot, result.data.outputPath), "utf8");
    assert.equal(exported.includes("appId:"), true);
  } finally {
    await cleanupActionArtifact(actionId);
    await rm(path.resolve(repoRoot, `flows/samples/generated/${sessionId}.yaml`), { force: true });
  }
});

test("server invoke supports record_task_flow", async () => {
  const server = createServer();
  const sessionId = `server-record-flow-${Date.now()}`;
  const actionId = `action-record-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: {
        actionType: "wait_for_ui",
        resourceId: "login_email",
        timeoutMs: 5000,
      },
      outcome: {
        actionId,
        actionType: "wait_for_ui",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
      updatedAt: new Date().toISOString(),
    });

    const result = await server.invoke("record_task_flow", {
      sessionId,
      goal: "Login smoke",
      outputPath: `flows/samples/generated/${sessionId}.yaml`,
    });

    assert.equal(result.status, "success");
    assert.equal(result.reasonCode, "OK");
    assert.equal(result.data.goal, "Login smoke");
    assert.equal(result.data.outputPath.endsWith(".yaml"), true);
  } finally {
    await cleanupActionArtifact(actionId);
    await rm(path.resolve(repoRoot, `flows/samples/generated/${sessionId}.yaml`), { force: true });
  }
});

test("server invoke supports export_session_flow to run_flow dry-run closure", async () => {
  const server = createServer();
  const sessionId = `server-export-replay-${Date.now()}`;
  const actionId = `action-export-replay-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: {
        actionType: "tap_element",
        contentDesc: "View products",
      },
      outcome: {
        actionId,
        actionType: "tap_element",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
      updatedAt: new Date().toISOString(),
    });

    const exported = await server.invoke("export_session_flow", {
      sessionId,
      outputPath: `flows/samples/generated/${sessionId}.yaml`,
    });

    const replay = await server.invoke("run_flow", {
      sessionId,
      platform: "android",
      flowPath: exported.data.outputPath,
      dryRun: true,
      runCount: 1,
    });
    const typedReplay = replay as {
      status: string;
      artifacts: string[];
      data: { flowPath: string; executionMode?: string; stepOutcomes?: Array<{ stepNumber: number }>; replayProgress?: { totalSteps: number } };
    };

    assert.equal(exported.status, "success");
    assert.ok(["success", "partial"].includes(typedReplay.status));
    assert.equal(typeof typedReplay.data.flowPath, "string");
    assert.equal(typedReplay.data.executionMode, "step_orchestrated");
    assert.equal(Array.isArray(typedReplay.data.stepOutcomes), true);
    assert.equal(typeof typedReplay.data.replayProgress?.totalSteps, "number");
    assert.equal(typedReplay.artifacts.some((artifact) => artifact.endsWith("replay-summary.json")), true);
  } finally {
    await cleanupActionArtifact(actionId);
    await rm(path.resolve(repoRoot, `flows/samples/generated/${sessionId}.yaml`), { force: true });
  }
});

test("server invoke supports install_app Android dry-run when artifact path exists", async () => {
  const server = createServer();
  const result = await server.invoke("install_app", {
    sessionId: "server-install-app-dry-run",
    platform: "android",
    runnerProfile: "native_android",
    artifactPath: "package.json",
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { dryRun: boolean; installCommand: string[] } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.installCommand.some((item) => item.endsWith("package.json")), true);
});

test("server invoke supports launch_app Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("launch_app", {
    sessionId: "server-launch-app-dry-run",
    platform: "android",
    runnerProfile: "native_android",
    appId: "com.example.demo",
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { dryRun: boolean; launchCommand: string[] } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.launchCommand.includes("monkey"), true);
});

test("server invoke supports terminate_app iOS dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("terminate_app", {
    sessionId: "server-terminate-app-dry-run",
    platform: "ios",
    appId: "host.exp.Exponent",
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { dryRun: boolean; command: string[] } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.command[0], "xcrun");
});

test("server invoke supports record_screen Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("record_screen", {
    sessionId: "server-record-screen-dry-run",
    platform: "android",
    durationMs: 5000,
    bitrateMbps: 4,
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { dryRun: boolean; outputPath: string; durationMs: number; commands: string[][]; supportLevel: string } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.outputPath.endsWith(".mp4"), true);
  assert.equal(result.data.durationMs, 5000);
  assert.equal(result.data.commands[0]?.includes("screenrecord"), true);
  assert.equal(result.data.supportLevel, "full");
});

test("server invoke supports reset_app_state Android clear_data dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("reset_app_state", {
    sessionId: "server-reset-app-state-dry-run",
    platform: "android",
    appId: "com.example.demo",
    strategy: "clear_data",
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { dryRun: boolean; strategy: string; commands: string[][] } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.strategy, "clear_data");
  assert.equal(result.data.commands[0]?.includes("pm"), true);
  assert.equal(result.data.commands[0]?.includes("clear"), true);
});

test("server invoke supports iOS tap dry-run through idb", async () => {
  const server = createServer();
  const result = await server.invoke("tap", {
    sessionId: "server-ios-tap-dry-run",
    platform: "ios",
    x: 12,
    y: 34,
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { command: string[] } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.command.includes("ui"), true);
  assert.equal(result.data.command.includes("tap"), true);
  assert.equal(result.data.command.includes("12"), true);
  assert.equal(result.data.command.includes("34"), true);
  assert.equal(result.data.command.includes("--udid"), true);
  assert.equal(result.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
});

test("server invoke supports iOS type_text dry-run through idb", async () => {
  const server = createServer();
  const result = await server.invoke("type_text", {
    sessionId: "server-ios-type-text-dry-run",
    platform: "ios",
    text: "hello",
    dryRun: true,
  }) as { status: string; reasonCode: string; data: { command: string[] } };

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.command.includes("ui"), true);
  assert.equal(result.data.command.includes("text"), true);
  assert.equal(result.data.command.includes("hello"), true);
  assert.equal(result.data.command.includes("--udid"), true);
  assert.equal(result.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
});

test("server invoke denies tap under a read-only session policy", async () => {
  const server = createServer();
  const sessionId = `server-read-only-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  try {
    const startResult = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
      policyProfile: "read-only",
    });
    assert.equal(startResult.status, "success");

    const result = await server.invoke("tap", {
      sessionId,
      platform: "android",
      x: 10,
      y: 20,
      dryRun: true,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.reasonCode, "POLICY_DENIED");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("server invoke supports get_crash_signals Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("get_crash_signals", {
    sessionId: "server-crash-signals-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.signalCount, 0);
});

test("server invoke supports collect_diagnostics Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("collect_diagnostics", {
    sessionId: "server-collect-diagnostics-dry-run",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.artifactCount, 0);
});

test("server invoke supports collect_debug_evidence Android dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("collect_debug_evidence", {
    sessionId: "server-collect-debug-evidence-dry-run",
    platform: "android",
    dryRun: true,
    query: "error",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.evidenceCount, 0);
  assert.equal(result.data.jsDebugMetroBaseUrl, "http://127.0.0.1:8081");
  assert.equal(result.data.jsDebugTargetEndpoint, "http://127.0.0.1:8081/json/list");
  assert.equal(result.data.jsDebugTargetCandidateCount, 0);
  assert.equal(result.data.jsDebugTargetSelectionReason, undefined);
  assert.equal(result.data.logSummary?.query, "error");
  assert.equal(Array.isArray(result.data.suspectAreas), true);
  assert.equal(result.data.jsDebugTargetId, undefined);
  assert.equal(result.data.jsConsoleLogCount, 0);
  assert.equal(result.data.jsNetworkEventCount, 0);
  assert.equal(result.data.jsConsoleSummary?.totalLogs, 0);
  assert.equal(result.data.jsConsoleSummary?.exceptionCount, 0);
  assert.equal(result.data.jsNetworkSummary?.totalTrackedRequests, 0);
  assert.equal(result.data.jsNetworkSummary?.failedRequestCount, 0);
  assert.equal(result.data.diagnosisPacket?.strongestSuspectLayer, "environment");
  assert.equal(result.data.diagnosisPacket?.confidence, "moderate");
  assert.equal(result.data.diagnosisPacket?.escalationThreshold, "if_summary_inconclusive");
  assert.equal(result.data.evidence?.some((item) => item.kind === "log"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "crash_signal"), true);
});

test("server invoke supports measure_android_performance dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("measure_android_performance", {
    sessionId: "server-android-performance-dry-run",
    runnerProfile: "phase1",
    durationMs: 4000,
    preset: "interaction",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.captureMode, "time_window");
  assert.equal(result.data.preset, "interaction");
});

test("server invoke supports measure_ios_performance dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("measure_ios_performance", {
    sessionId: "server-ios-performance-dry-run",
    runnerProfile: "phase1",
    durationMs: 4000,
    template: "time-profiler",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "partial");
  assert.equal(result.data.captureMode, "time_window");
  assert.equal(result.data.template, "time-profiler");
});

test("server invoke supports measure_ios_performance animation-hitches dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("measure_ios_performance", {
    sessionId: "server-ios-performance-hitches-dry-run",
    runnerProfile: "phase1",
    durationMs: 4000,
    template: "animation-hitches",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.supportLevel, "partial");
  assert.equal(result.data.template, "animation-hitches");
});

test("server invoke supports list_js_debug_targets dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("list_js_debug_targets", {
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.targetCount, 0);
  assert.equal(result.data.endpoint, "http://127.0.0.1:8081/json/list");
});

test("server invoke supports capture_js_console_logs dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("capture_js_console_logs", {
    dryRun: true,
    targetId: "demo-target",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.collectedCount, 0);
  assert.equal(result.data.summary.totalLogs, 0);
  assert.equal(result.data.summary.exceptionCount, 0);
  assert.equal(result.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
});

test("server invoke supports capture_js_network_events dry-run", async () => {
  const server = createServer();
  const result = await server.invoke("capture_js_network_events", {
    dryRun: true,
    targetId: "demo-target",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.collectedCount, 0);
  assert.equal(result.data.failuresOnly, true);
  assert.equal(result.data.summary.totalTrackedRequests, 0);
  assert.equal(result.data.summary.failedRequestCount, 0);
  assert.equal(result.data.webSocketDebuggerUrl, "ws://127.0.0.1:8081/inspector/debug?target=demo-target");
});
