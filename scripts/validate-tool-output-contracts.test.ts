import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("validate-tool-output-contracts accepts navigate_back schema payload", async () => {
  const { stdout } = await execFileAsync(
    "pnpm",
    ["validate:tool-output-contracts"],
    { cwd: repoRoot },
  );

  assert.match(stdout, /\[PASS\] navigate_back/);
  assert.match(stdout, /Tool output contract validation passed\./);
});
