import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseHarnessConfig } from "../src/harness-config.ts";

test("parseHarnessConfig fails loudly when canonical harness config is missing", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "adapter-maestro-harness-config-"));

  await assert.rejects(
    () => parseHarnessConfig(repoRoot, "configs/harness/sample-harness.yaml"),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /configs\/harness\/sample-harness\.yaml/);
      assert.match((error as Error).message, /canonical harness config is required for the repository baseline/i);
      return true;
    },
  );
});
