import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { prepareRunArtifacts } from "../src/run-artifacts.js";

describe("prepareRunArtifacts", () => {
  it("reuses EXPLORER_RUN_ID and creates run/log paths", () => {
    const dir = join(tmpdir(), `explorer-run-artifacts-${Date.now()}`);
    const previousRunId = process.env.EXPLORER_RUN_ID;
    process.env.EXPLORER_RUN_ID = "2026-04-28T12-34-56";

    try {
      const artifacts = prepareRunArtifacts(dir);

      assert.equal(artifacts.runId, "2026-04-28T12-34-56");
      assert.equal(artifacts.runDir, join(dir, "2026-04-28T12-34-56"));
      assert.equal(artifacts.logPath, join(dir, "2026-04-28T12-34-56", "log.txt"));
      assert.ok(existsSync(artifacts.runDir));
      assert.equal(process.env.EXPLORER_RUN_ID, "2026-04-28T12-34-56");
    } finally {
      if (previousRunId === undefined) {
        delete process.env.EXPLORER_RUN_ID;
      } else {
        process.env.EXPLORER_RUN_ID = previousRunId;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generates a fresh runId when EXPLORER_RUN_ID is unset", () => {
    const dir = join(tmpdir(), `explorer-run-artifacts-fresh-${Date.now()}`);
    const previousRunId = process.env.EXPLORER_RUN_ID;
    delete process.env.EXPLORER_RUN_ID;

    try {
      const artifacts = prepareRunArtifacts(dir);

      assert.match(artifacts.runId, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
      assert.equal(process.env.EXPLORER_RUN_ID, artifacts.runId);
      assert.ok(existsSync(artifacts.runDir));
    } finally {
      if (previousRunId === undefined) {
        delete process.env.EXPLORER_RUN_ID;
      } else {
        process.env.EXPLORER_RUN_ID = previousRunId;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
