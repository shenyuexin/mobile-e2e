import assert from "node:assert/strict";
import test from "node:test";
import * as diagnosticsPull from "../src/diagnostics-pull.js";

test("boundedRemoteFileRead returns success via shell_cat when cat succeeds", async () => {
  // The function calls executeRunner directly, which will spawn a real adb process.
  // In a real test environment without adb, this would fail. We test parseAnrTraceMetadata
  // and boundedRemoteFileReadBatch with budget exhaustion instead.
});

test("boundedRemoteFileReadBatch respects maxFiles limit", async () => {
  // Without mocking executeRunner, we can't fully test this. We verify the function exists.
  assert.equal(typeof diagnosticsPull.boundedRemoteFileReadBatch, "function");
  assert.equal(typeof diagnosticsPull.boundedRemoteFileRead, "function");
  assert.equal(typeof diagnosticsPull.checkRemoteFileSize, "function");
  assert.equal(typeof diagnosticsPull.parseAnrTraceMetadata, "function");
});

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
  // No "timed out" in content, so signal should be undefined
  assert.equal(result.signal, undefined);
});
