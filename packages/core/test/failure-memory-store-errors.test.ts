import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFailureIndex, recordFailureSignature } from "../src/failure-memory-store.ts";
import type { PersistedFailureIndexEntry } from "../src/failure-memory-store.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const aiFirstDir = path.resolve(repoRoot, "artifacts", "ai-first");

async function cleanupFailureIndex(): Promise<void> {
  await rm(path.resolve(aiFirstDir, "failure-index.json"), { force: true });
}

function buildEntry(actionId: string, suffix = ""): PersistedFailureIndexEntry {
  return {
    actionId,
    sessionId: `session-${actionId}${suffix}`,
    signature: {
      actionType: "tap_element",
      screenId: "screen",
      affectedLayer: "ui_state",
      readiness: "ready",
      progressMarker: "none",
      stateChangeCategory: "no_material_change",
    },
    updatedAt: new Date().toISOString(),
  };
}

test("recordFailureSignature deduplicates by actionId (replaces not appends)", async () => {
  const actionId = `dedup-action-${Date.now()}`;
  await cleanupFailureIndex();
  try {
    await recordFailureSignature(repoRoot, buildEntry(actionId, "-v1"));
    await recordFailureSignature(repoRoot, buildEntry(actionId, "-v2"));
    const entries = await loadFailureIndex(repoRoot);
    // Same actionId should appear only once, with the latest version
    const matches = entries.filter((e) => e.actionId === actionId);
    assert.equal(matches.length, 1, `Expected 1 entry for ${actionId}, got ${matches.length}`);
    assert.ok(matches[0]?.sessionId.includes("-v2"), "Should have the latest version");
  } finally {
    await cleanupFailureIndex();
  }
});

test("recordFailureSignature caps at 200 entries", async () => {
  await cleanupFailureIndex();
  try {
    for (let i = 0; i < 210; i++) {
      await recordFailureSignature(repoRoot, buildEntry(`cap-action-${i}`));
    }
    const entries = await loadFailureIndex(repoRoot);
    assert.equal(entries.length, 200, `Expected 200 entries, got ${entries.length}`);
  } finally {
    await cleanupFailureIndex();
  }
});

test("recordFailureSignature maintains newest-first ordering", async () => {
  await cleanupFailureIndex();
  try {
    for (let i = 0; i < 5; i++) {
      await recordFailureSignature(repoRoot, buildEntry(`order-action-${i}`));
    }
    const entries = await loadFailureIndex(repoRoot);
    // Newest (last written) should be first in the array
    assert.ok(entries[0]?.actionId.includes("order-action-4"), `Expected newest-first, got: ${entries[0]?.actionId}`);
    assert.ok(entries[entries.length - 1]?.actionId.includes("order-action-0"), `Expected oldest-last, got: ${entries[entries.length - 1]?.actionId}`);
  } finally {
    await cleanupFailureIndex();
  }
});

test("loadFailureIndex returns [] for corrupt JSON index file", async () => {
  await cleanupFailureIndex();
  try {
    await writeFile(path.resolve(aiFirstDir, "failure-index.json"), "{bad json!!!", "utf8");
    const entries = await loadFailureIndex(repoRoot);
    assert.deepEqual(entries, []);
  } finally {
    await cleanupFailureIndex();
  }
});
