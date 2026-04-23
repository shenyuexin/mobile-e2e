import assert from "node:assert/strict";
import test from "node:test";
import * as diagnosticsPull from "../src/diagnostics-pull.js";
import { setExecuteRunnerForTesting } from "../src/runtime-shared.js";
import type { CommandExecution } from "../src/runtime-shared.js";

// ── Teardown ────────────────────────────────────────────────────────────────

// Per-test cleanup: prevents mock state leakage between tests (M3)
test.afterEach(() => {
  setExecuteRunnerForTesting(null);
});

// Shared mock helper: all parameters declared to match executeRunner signature (M2)
function mockRunner(fn: (command: string[]) => CommandExecution) {
  setExecuteRunnerForTesting(async (_command: string[], _repoRoot: string, _env: NodeJS.ProcessEnv, _options?: unknown): Promise<CommandExecution> => {
    return fn(_command);
  });
}

// ── boundedRemoteFileRead (mocked) ──────────────────────────────────────────

test("boundedRemoteFileRead returns success via shell_cat when cat succeeds", async () => {
  mockRunner(() => ({
    exitCode: 0,
    stdout: "file content line 1\nfile content line 2\n",
    stderr: "",
  }));

  const result = await diagnosticsPull.boundedRemoteFileRead("/repo", {
    deviceId: "emulator-5554",
    remotePath: "/data/anr/traces.txt",
  });

  assert.equal(result.status, "success");
  assert.equal(result.readMethod, "shell_cat");
  assert.ok(result.content.includes("file content line 1"));
  assert.ok(result.bytesRead > 0);
});

test("boundedRemoteFileRead returns read_failed when cat fails and pull fallback disabled", async () => {
  mockRunner(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "cat: /data/anr/traces.txt: Permission denied",
  }));

  const result = await diagnosticsPull.boundedRemoteFileRead("/repo", {
    deviceId: "emulator-5554",
    remotePath: "/data/anr/traces.txt",
    allowPullFallback: false,
  });

  assert.equal(result.status, "permission_denied");
  assert.equal(result.readMethod, "shell_cat");
  assert.ok(result.errorMessage?.includes("Permission denied"));
});

test("boundedRemoteFileRead returns permission_denied when cat fails with No such file and pull fallback disabled", async () => {
  mockRunner(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "cat: /data/nonexistent.txt: No such file or directory",
  }));

  const result = await diagnosticsPull.boundedRemoteFileRead("/repo", {
    deviceId: "emulator-5554",
    remotePath: "/data/nonexistent.txt",
    allowPullFallback: false,
  });

  assert.equal(result.status, "permission_denied");
  assert.equal(result.readMethod, "shell_cat");
  assert.ok(result.errorMessage?.includes("No such file"));
});

test("boundedRemoteFileRead returns timeout when shell cat times out", async () => {
  mockRunner(() => ({
    exitCode: null,
    stdout: "",
    stderr: "Command timed out after 100ms",
  }));

  const result = await diagnosticsPull.boundedRemoteFileRead("/repo", {
    deviceId: "emulator-5554",
    remotePath: "/data/anr/traces.txt",
    allowPullFallback: false,
  });

  assert.equal(result.status, "timeout");
});

// ── boundedRemoteFileReadBatch (mocked) ─────────────────────────────────────

test("boundedRemoteFileReadBatch returns empty array for empty paths", async () => {
  const results = await diagnosticsPull.boundedRemoteFileReadBatch("/repo", {
    deviceId: "emulator-5554",
    remotePaths: [],
  });
  assert.deepEqual(results, []);
});

test("boundedRemoteFileReadBatch reads multiple files with mocked executeRunner", async () => {
  let callCount = 0;
  mockRunner((command: string[]) => {
    callCount++;
    if (command.some((c) => c.includes("stat") || c.includes("wc"))) {
      return { exitCode: 0, stdout: "100", stderr: "" };
    }
    if (command.some((c) => c.includes("cat"))) {
      return { exitCode: 0, stdout: `content of file ${callCount}`, stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: "unknown command" };
  });

  const results = await diagnosticsPull.boundedRemoteFileReadBatch("/repo", {
    deviceId: "emulator-5554",
    remotePaths: ["/data/anr/a.txt", "/data/anr/b.txt"],
    totalBudgetMs: 5000,
    timeoutMs: 2000,
  });

  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.status === "success"));
});

test("boundedRemoteFileReadBatch respects maxFiles limit", async () => {
  mockRunner((command: string[]) => {
    if (command.some((c) => c.includes("stat") || c.includes("wc"))) {
      return { exitCode: 0, stdout: "50", stderr: "" };
    }
    return { exitCode: 0, stdout: "content", stderr: "" };
  });

  const results = await diagnosticsPull.boundedRemoteFileReadBatch("/repo", {
    deviceId: "emulator-5554",
    remotePaths: ["/a.txt", "/b.txt", "/c.txt", "/d.txt", "/e.txt"],
    maxFiles: 2,
    totalBudgetMs: 5000,
    timeoutMs: 2000,
  });

  assert.ok(results.length <= 2, `Expected at most 2 results, got ${results.length}`);
});

test("boundedRemoteFileReadBatch reads 3 files successfully with mocked executeRunner", async () => {
  let callIndex = 0;
  mockRunner((command: string[]) => {
    callIndex++;
    // Size check commands (stat/wc) return small sizes
    if (command.some((c) => c.includes("stat") || c.includes("wc"))) {
      return { exitCode: 0, stdout: `${100 + callIndex}`, stderr: "" };
    }
    // Cat commands return distinct content per file
    if (command.some((c) => c.includes("cat"))) {
      return { exitCode: 0, stdout: `content-${callIndex}`, stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: "unknown" };
  });

  const results = await diagnosticsPull.boundedRemoteFileReadBatch("/repo", {
    deviceId: "emulator-5554",
    remotePaths: ["/data/anr/one.txt", "/data/anr/two.txt", "/data/anr/three.txt"],
    totalBudgetMs: 10000,
    timeoutMs: 3000,
  });

  assert.equal(results.length, 3, `Expected 3 results, got ${results.length}`);
  assert.ok(results.every((r) => r.status === "success"), "All 3 files should succeed");
  assert.ok(results.every((r) => r.bytesRead > 0), "All results should have bytesRead > 0");
});

// ── checkRemoteFileSize (mocked) ────────────────────────────────────────────

test("checkRemoteFileSize returns number when stat succeeds", async () => {
  mockRunner(() => ({
    exitCode: 0,
    stdout: "12345\n",
    stderr: "",
  }));

  const result = await diagnosticsPull.checkRemoteFileSize("emulator-5554", "/data/anr/traces.txt", 5000);
  assert.equal(result, 12345);
});

test("checkRemoteFileSize returns too_large when size exceeds limit", async () => {
  mockRunner(() => ({
    exitCode: 0,
    stdout: "99999999999\n",
    stderr: "",
  }));

  const result = await diagnosticsPull.checkRemoteFileSize("emulator-5554", "/data/anr/traces.txt", 5000);
  assert.equal(result, "too_large");
});

test("checkRemoteFileSize falls through stat to wc -c when stat fails", async () => {
  let callCount = 0;
  mockRunner(() => {
    callCount++;
    // First call (stat) fails, second call (wc -c) succeeds
    if (callCount === 1) {
      return { exitCode: 1, stdout: "", stderr: "stat: not found" };
    }
    return { exitCode: 0, stdout: "4096\n", stderr: "" };
  });

  const result = await diagnosticsPull.checkRemoteFileSize("emulator-5554", "/data/anr/traces.txt", 5000);
  assert.equal(result, 4096);
});

test("checkRemoteFileSize falls through all 3 levels and returns check_failed", async () => {
  mockRunner(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "command failed",
  }));

  const result = await diagnosticsPull.checkRemoteFileSize("emulator-5554", "/data/anr/traces.txt", 5000);
  assert.equal(result, "check_failed");
});

// ── parseAnrTraceMetadata (already good — keep existing tests) ──────────────

test("parseAnrTraceMetadata extracts pid from ANR trace header", () => {
  const content = `----- pid 12345 at 2026-04-05 10:30:00 -----
Cmd line: com.example.app
Some ANR content`;
  const result = diagnosticsPull.parseAnrTraceMetadata(content);
  assert.equal(result.pid, "12345");
});

test("parseAnrTraceMetadata extracts process name from Cmd line", () => {
  const content = `----- pid 12345 at 2026-04-05 10:30:00 -----
Cmd line: com.example.app

"main" prio=5 tid=1 Native`;
  const result = diagnosticsPull.parseAnrTraceMetadata(content);
  assert.equal(result.processName, "com.example.app");
});

test("parseAnrTraceMetadata extracts signal from Input dispatching timed out", () => {
  const content = `----- pid 12345 at 2026-04-05 10:30:00 -----
Cmd line: com.example.app
Input dispatching timed out (waiting to send non-pointer event)`;
  const result = diagnosticsPull.parseAnrTraceMetadata(content);
  assert.ok(result.signal?.includes("Input dispatching timed out"));
});

test("parseAnrTraceMetadata returns empty object for non-ANR content", () => {
  const result = diagnosticsPull.parseAnrTraceMetadata("just some random text");
  assert.equal(result.pid, undefined);
  assert.equal(result.processName, undefined);
  assert.equal(result.signal, undefined);
});

test("parseAnrTraceMetadata handles Key dispatching timed out", () => {
  const content = `----- pid 999 at 2026-04-05 10:30:00 -----
Cmd line: com.test.app
Key dispatching timed out (waiting because no window)`;
  const result = diagnosticsPull.parseAnrTraceMetadata(content);
  assert.ok(result.signal?.includes("Key dispatching timed out"));
  assert.equal(result.pid, "999");
});

test("parseAnrTraceMetadata handles multiple threads but only extracts header info", () => {
  const content = `----- pid 5432 at 2026-04-05 11:00:00 -----
Cmd line: com.myapp.main

"main" prio=5 tid=1 Native
  | group="main" sCount=1
  at android.view.ViewRootImpl.handleMessage(ViewRootImpl.java:5546)

"Binder:5432_1" prio=5 tid=2 Runnable
  at com.myapp.NetworkClient.fetchData(NetworkClient.java:42)`;
  const result = diagnosticsPull.parseAnrTraceMetadata(content);
  assert.equal(result.pid, "5432");
  assert.equal(result.processName, "com.myapp.main");
  assert.equal(result.signal, undefined);
});
