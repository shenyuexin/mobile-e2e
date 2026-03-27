import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildDeviceLeaseRecordRelativePath,
  buildActionRecordRelativePath,
  buildSessionAuditRelativePath,
  buildSessionRecordRelativePath,
  loadFailureIndex,
  loadSessionAuditRecord,
  loadSessionRecord,
  persistActionRecord,
  persistSessionState,
  recordFailureSignature,
} from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function buildTestDeviceId(sessionId: string): string {
  return `${sessionId}-device`;
}

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  const absolutePath = path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId));
  const auditPath = path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId));
  const androidLeasePath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", buildTestDeviceId(sessionId)));
  const iosLeasePath = path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("ios", `ios-${buildTestDeviceId(sessionId)}`));
  await rm(absolutePath, { force: true });
  await rm(auditPath, { force: true });
  await rm(androidLeasePath, { force: true });
  await rm(iosLeasePath, { force: true });
}

async function cleanupActionArtifact(actionId: string): Promise<void> {
  const absolutePath = path.resolve(repoRoot, buildActionRecordRelativePath(actionId));
  await rm(absolutePath, { force: true });
}

test("start_session persists a recoverable session record", async () => {
  const sessionId = "persisted-session-start-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    const result = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    assert.equal(result.status, "success");
    assert.equal(result.artifacts.includes(buildSessionRecordRelativePath(sessionId)), true);

    const stored = await loadSessionRecord(repoRoot, sessionId);
    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.ok(audit);
    assert.equal(stored.closed, false);
    assert.equal(stored.session.sessionId, sessionId);
    assert.equal(stored.session.platform, "android");
    assert.equal(stored.session.timeline[0]?.type, "session_started");
    assert.equal(audit?.session_id, sessionId);
    assert.equal(audit?.result, "in_progress");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("end_session finalizes an existing persisted session record", async () => {
  const sessionId = "persisted-session-end-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    const result = await server.invoke("end_session", {
      sessionId,
      artifacts: ["artifacts/demo/output.txt"],
    });

    assert.equal(result.status, "success");
    assert.equal(result.data.closed, true);
    assert.equal(result.artifacts.includes(buildSessionRecordRelativePath(sessionId)), true);

    const stored = await loadSessionRecord(repoRoot, sessionId);
    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.ok(audit);
    assert.equal(stored.closed, true);
    assert.equal(stored.endedAt !== undefined, true);
    assert.deepEqual(stored.artifacts, ["artifacts/demo/output.txt"]);
    assert.equal(stored.session.timeline.some((event) => event.type === "session_ended"), true);
    assert.equal(stored.session.timeline.some((event) => event.type === "lease_released"), true);
    assert.equal(audit?.result, "completed");
    assert.equal(audit?.artifact_paths[0]?.category, "debug-output");
    assert.equal(Array.isArray(audit?.schema_required_fields), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("end_session stays successful even when no persisted session exists", async () => {
  const sessionId = "persisted-session-missing-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  const result = await server.invoke("end_session", {
    sessionId,
    artifacts: ["artifacts/demo/output.txt"],
  });

  assert.equal(result.status, "success");
  assert.equal(result.artifacts.includes(buildSessionRecordRelativePath(sessionId)), false);
  assert.equal(result.nextSuggestions[0]?.includes("No persisted session record was found"), true);
});


test("end_session returns the persisted endedAt timestamp and stays idempotent", async () => {
  const sessionId = "persisted-session-idempotent-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    const firstResult = await server.invoke("end_session", {
      sessionId,
      artifacts: ["artifacts/demo/output.txt"],
    });
    const secondResult = await server.invoke("end_session", {
      sessionId,
      artifacts: ["artifacts/demo/output.txt"],
    });

    assert.equal(firstResult.data.closed, true);
    assert.equal(secondResult.data.closed, true);
    assert.equal(firstResult.data.endedAt, secondResult.data.endedAt);

    const stored = await loadSessionRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.equal(stored.session.timeline.filter((event) => event.type === "session_ended").length, 1);
    assert.equal(stored.endedAt, firstResult.data.endedAt);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("session audit redacts sensitive artifact paths and interruption details", async () => {
  const server = createServer();
  const sessionId = `persist-session-redaction-${Date.now()}`;

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });
    await persistSessionState(
      repoRoot,
      sessionId,
      {
        appPhase: "unknown",
        readiness: "interrupted",
        blockingSignals: ["permission_prompt"],
        topVisibleTexts: ["reset password"],
      },
      {
        timestamp: new Date().toISOString(),
        type: "dialog_interrupt",
        detail: "password=hunter2 token=abc123 phone +86 138 0013 8000",
      },
      [],
    );
    const ended = await server.invoke("end_session", {
      sessionId,
      artifacts: ["artifacts/debug/token-secret-password-reset-+86 138 0013 8000.txt"],
    });

    assert.equal(ended.status, "success");

    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(audit);
    assert.equal(audit.artifact_paths[0]?.path.includes("token-secret"), false);
    assert.equal(audit.artifact_paths[0]?.path.includes("password-reset"), false);
    assert.equal(audit.artifact_paths[0]?.path.includes("138 0013 8000"), false);
    assert.equal(audit.interruption_events.length >= 1, true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("get_session_state persists latest known state into the session record", async () => {
  const sessionId = "persisted-session-state-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    const result = await server.invoke("get_session_state", {
      sessionId,
      dryRun: true,
    });

    assert.equal(result.status, "success");

    const stored = await loadSessionRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.equal(stored.session.latestStateSummary?.appPhase, "unknown");
    assert.equal(stored.session.timeline[stored.session.timeline.length - 1]?.type, "state_summary_captured");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("get_session_state reports delta from the previously persisted state", async () => {
  const sessionId = `persisted-session-state-delta-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    await persistSessionState(
      repoRoot,
      sessionId,
      {
        appPhase: "loading",
        readiness: "waiting_ui",
        blockingSignals: ["loading_indicator"],
        screenTitle: "Loading",
      },
      {
        timestamp: new Date().toISOString(),
        type: "state_summary_captured",
        detail: "seeded old state",
      },
      [],
    );

    const result = await server.invoke("get_session_state", {
      sessionId,
      dryRun: true,
    });

    assert.equal(result.status, "success");
    const latestKnownStateDelta = result.data.latestKnownStateDelta ?? [];
    assert.equal(Array.isArray(latestKnownStateDelta), true);
    assert.equal(latestKnownStateDelta.some((item: string) => item.startsWith("appPhase:")), true);
    assert.equal(latestKnownStateDelta.some((item: string) => item.startsWith("readiness:")), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("perform_action_with_evidence appends an action event to the persisted session", async () => {
  const sessionId = "persisted-action-event-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    const actionResult = await server.invoke("perform_action_with_evidence", {
      sessionId,
      dryRun: true,
      action: {
        actionType: "tap_element",
        contentDesc: "View products",
      },
    });

    assert.equal(actionResult.status, "partial");

    const stored = await loadSessionRecord(repoRoot, sessionId);
    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.ok(audit);
    const actionEvent = [...stored.session.timeline].reverse().find((event) => event.type === "action_outcome_recorded");
    assert.equal(actionEvent?.type, "action_outcome_recorded");
    assert.equal(actionEvent?.actionId, actionResult.data.outcome.actionId);
    assert.equal((audit?.artifact_paths.length ?? 0) > 0, true);
    assert.equal(audit?.artifact_paths.some((entry) => typeof entry.retention === "string" || entry.retention === undefined), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("get_logs appends evidence capture artifacts into the session audit", async () => {
  const sessionId = `persisted-logs-evidence-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    const result = await server.invoke("get_logs", {
      sessionId,
      platform: "android",
      dryRun: true,
      lines: 25,
    });

    assert.equal(result.status, "success");

    const stored = await loadSessionRecord(repoRoot, sessionId);
    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.ok(audit);
    assert.equal(stored.session.timeline.some((event) => event.type === "get_logs_captured"), true);
    assert.equal(audit.artifact_paths.some((entry) => entry.path.includes("artifacts/logs")), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("measure_ios_performance appends planned performance artifacts into the session audit", async () => {
  const sessionId = `persisted-ios-performance-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "ios",
      deviceId: `ios-${buildTestDeviceId(sessionId)}`,
      profile: "native_ios",
    });

    const result = await server.invoke("measure_ios_performance", {
      sessionId,
      runnerProfile: "native_ios",
      dryRun: true,
      durationMs: 2000,
    });

    assert.equal(result.status, "success");

    const stored = await loadSessionRecord(repoRoot, sessionId);
    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.ok(audit);
    assert.equal(stored.session.timeline.some((event) => event.type === "measure_ios_performance_captured"), true);
    assert.equal(audit.artifact_paths.some((entry) => entry.path.includes("artifacts/performance")), true);
    assert.equal(audit.artifact_paths.some((entry) => entry.category === "reports" || entry.category === "debug-output"), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("run_flow step preview appends replay timeline events into the session record", async () => {
  const sessionId = `persisted-replay-preview-${Date.now()}`;
  const actionId = `persisted-replay-action-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  await cleanupActionArtifact(actionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

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

    assert.ok(["success", "partial"].includes(replay.status));

    const stored = await loadSessionRecord(repoRoot, sessionId);
    const audit = await loadSessionAuditRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.ok(audit);
    assert.equal(stored.session.timeline.some((event) => event.type === "replay_started"), true);
    assert.equal(stored.session.timeline.some((event) => event.type === "replay_completed" || event.type === "replay_stopped"), true);
    assert.equal(stored.session.timeline.some((event) => event.type === "replay_summary_persisted"), true);
    assert.equal(audit.artifact_paths.some((entry) => entry.path.includes("replay-summary.json")), true);
  } finally {
    await cleanupActionArtifact(actionId);
    await cleanupSessionArtifact(sessionId);
    await rm(path.resolve(repoRoot, `flows/samples/generated/${sessionId}.yaml`), { force: true });
  }
});

test("recordFailureSignature tolerates a truncated failure index and rewrites it", async () => {
  const failureIndexPath = path.resolve(repoRoot, "artifacts/ai-first/failure-index.json");
  await rm(failureIndexPath, { force: true });

  try {
    await writeFile(failureIndexPath, "[\n  {\n", "utf8");
    await recordFailureSignature(repoRoot, {
      actionId: "action-corrupt-index-test",
      sessionId: "session-corrupt-index-test",
      signature: {
        actionType: "tap_element",
        affectedLayer: "runtime",
        readiness: "ready",
        progressMarker: "none",
        stateChangeCategory: "no_material_change",
      },
      causalSignals: ["state_unchanged"],
      replayValue: "low",
      checkpointDivergence: "outcome_mismatch",
      remediation: ["Inspect runtime output"],
      updatedAt: new Date().toISOString(),
    });

    const index = await loadFailureIndex(repoRoot);
    assert.equal(index.some((entry) => entry.actionId === "action-corrupt-index-test"), true);
    const rewritten = index.find((entry) => entry.actionId === "action-corrupt-index-test");
    assert.equal(rewritten?.signature.readiness, "ready");
    assert.equal(rewritten?.causalSignals?.includes("state_unchanged"), true);
    assert.equal(rewritten?.replayValue, "low");
    assert.equal(rewritten?.checkpointDivergence, "outcome_mismatch");
  } finally {
    await rm(failureIndexPath, { force: true });
  }
});
