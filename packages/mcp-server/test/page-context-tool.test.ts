import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadSessionRecord } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(`${repoRoot}/artifacts/sessions/${sessionId}.json`, { force: true });
}

function buildTestDeviceId(sessionId: string): string {
  return `android-${sessionId}`;
}

test("get_page_context returns structured page context for a dry-run session", async () => {
  const sessionId = `page-context-tool-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  const server = createServer();
  const genericServer = server as unknown as {
    invoke(name: string, input: unknown): Promise<{
      status: string;
      data: {
        sessionRecordFound: boolean;
        pageContext?: { type?: string };
      };
    }>;
  };

  try {
    await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId: buildTestDeviceId(sessionId),
      profile: "phase1",
    });

    const result = await genericServer.invoke("get_page_context", {
      sessionId,
      dryRun: true,
    });

    assert.equal(result.status, "success");
    assert.equal(result.data.sessionRecordFound, true);
    assert.ok(result.data.pageContext);

    const stored = await loadSessionRecord(repoRoot, sessionId);
    assert.ok(stored);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});
