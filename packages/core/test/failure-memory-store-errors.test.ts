import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFailureIndex, recordFailureSignature } from "../src/failure-memory-store.ts";
import type { PersistedFailureIndexEntry } from "../src/failure-memory-store.ts";

// Use an isolated temp directory so these tests do NOT interfere with the
// existing failure-memory-store.test.ts when both run in parallel.
const isolatedRepoRoot = path.resolve(await mkdtemp(path.join(os.tmpdir(), "m2e-failure-store-")));

async function cleanupFailureIndex(): Promise<void> {
  await rm(path.resolve(isolatedRepoRoot, "artifacts", "ai-first", "failure-index.json"), { force: true });
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
    await recordFailureSignature(isolatedRepoRoot, buildEntry(actionId, "-v1"));
    await recordFailureSignature(isolatedRepoRoot, buildEntry(actionId, "-v2"));
    const entries = await loadFailureIndex(isolatedRepoRoot);
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
      await recordFailureSignature(isolatedRepoRoot, buildEntry(`cap-action-${i}`));
    }
    const entries = await loadFailureIndex(isolatedRepoRoot);
    assert.equal(entries.length, 200, `Expected 200 entries, got ${entries.length}`);
  } finally {
    await cleanupFailureIndex();
  }
});

test("recordFailureSignature maintains newest-first ordering", async () => {
  await cleanupFailureIndex();
  try {
    for (let i = 0; i < 5; i++) {
      await recordFailureSignature(isolatedRepoRoot, buildEntry(`order-action-${i}`));
    }
    const entries = await loadFailureIndex(isolatedRepoRoot);
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
    await writeFile(path.resolve(isolatedRepoRoot, "artifacts", "ai-first", "failure-index.json"), "{bad json!!!", "utf8");
    const entries = await loadFailureIndex(isolatedRepoRoot);
    assert.deepEqual(entries, []);
  } finally {
    await cleanupFailureIndex();
  }
});
