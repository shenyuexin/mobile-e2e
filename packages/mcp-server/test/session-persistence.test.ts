import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSessionRecordRelativePath, loadSessionRecord } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  const absolutePath = path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId));
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
      profile: "phase1",
    });

    assert.equal(result.status, "success");
    assert.equal(result.artifacts.includes(buildSessionRecordRelativePath(sessionId)), true);

    const stored = await loadSessionRecord(repoRoot, sessionId);
    assert.ok(stored);
    assert.equal(stored.closed, false);
    assert.equal(stored.session.sessionId, sessionId);
    assert.equal(stored.session.platform, "android");
    assert.equal(stored.session.timeline[0]?.type, "session_started");
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
    assert.ok(stored);
    assert.equal(stored.closed, true);
    assert.equal(stored.endedAt !== undefined, true);
    assert.deepEqual(stored.artifacts, ["artifacts/demo/output.txt"]);
    assert.equal(stored.session.timeline[stored.session.timeline.length - 1]?.type, "session_ended");
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

test("get_session_state persists latest known state into the session record", async () => {
  const sessionId = "persisted-session-state-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
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

test("perform_action_with_evidence appends an action event to the persisted session", async () => {
  const sessionId = "persisted-action-event-test";
  await cleanupSessionArtifact(sessionId);
  const server = createServer();

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
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
    assert.ok(stored);
    const lastEvent = stored.session.timeline[stored.session.timeline.length - 1];
    assert.equal(lastEvent?.type, "action_outcome_recorded");
    assert.equal(lastEvent?.actionId, actionResult.data.outcome.actionId);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});
