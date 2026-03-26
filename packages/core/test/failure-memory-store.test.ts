import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBaselineIndex, loadFailureIndex, recordBaselineEntry, recordFailureSignature } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const aiFirstDir = path.resolve(repoRoot, "artifacts", "ai-first");

async function cleanupIndexes(): Promise<void> {
  await rm(path.resolve(aiFirstDir, "failure-index.json"), { force: true });
  await rm(path.resolve(aiFirstDir, "baseline-index.json"), { force: true });
}

test("failure memory persists richer causal metadata", async () => {
  const actionId = `failure-memory-${Date.now()}`;
  try {
    await cleanupIndexes();

    await recordFailureSignature(repoRoot, {
      actionId,
      sessionId: `session-${Date.now()}`,
      signature: {
        actionType: "tap_element",
        screenId: "catalog",
        affectedLayer: "ui_state",
        readiness: "ready",
        progressMarker: "none",
        stateChangeCategory: "no_material_change",
      },
      causalSignals: ["state_unchanged"],
      replayValue: "low",
      checkpointDivergence: "signal_mismatch",
      fallbackUsed: false,
      evidenceFingerprint: "ui:nochange|runtime:none",
      baselineRelation: "drifted_checkpoint",
      remediation: ["Wait for a more stable screen before retrying."],
      updatedAt: new Date().toISOString(),
    });

    await recordBaselineEntry(repoRoot, {
      actionId: `baseline-${Date.now()}`,
      sessionId: `session-${Date.now()}`,
      actionType: "tap_element",
      screenId: "catalog",
      readiness: "ready",
      progressMarker: "full",
      stateChangeCategory: "screen_transition",
      replayValue: "high",
      fallbackUsed: false,
      evidenceFingerprint: "ui:transition|runtime:none",
      baselineRelation: "same_checkpoint",
      updatedAt: new Date().toISOString(),
    });

    const failures = await loadFailureIndex(repoRoot);
    const baselines = await loadBaselineIndex(repoRoot);

    assert.equal(failures[0]?.fallbackUsed, false);
    assert.equal(failures[0]?.evidenceFingerprint, "ui:nochange|runtime:none");
    assert.equal(failures[0]?.baselineRelation, "drifted_checkpoint");
    assert.equal(baselines[0]?.fallbackUsed, false);
    assert.equal(baselines[0]?.evidenceFingerprint, "ui:transition|runtime:none");
    assert.equal(baselines[0]?.baselineRelation, "same_checkpoint");
  } finally {
    await cleanupIndexes();
  }
});
