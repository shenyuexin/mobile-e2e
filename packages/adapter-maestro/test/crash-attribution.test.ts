import assert from "node:assert/strict";
import test from "node:test";
import { buildCrashAttribution, detectCrashTypes, selectPrimaryCrashType } from "../src/crash-attribution.js";

test("detectCrashTypes returns anr for ANR content", () => {
  const types = detectCrashTypes("ANR in com.example.app: Input dispatching timed out", "android");
  assert.ok(types.includes("anr"));
});

test("detectCrashTypes returns native_crash for SIGSEGV", () => {
  const types = detectCrashTypes("FATAL EXCEPTION: main\nSIGSEGV: fault addr 0x0", "android");
  assert.ok(types.includes("native_crash"));
});

test("detectCrashTypes returns oom for jetsam", () => {
  const types = detectCrashTypes("lowmemorykiller: Kill process\njetsam event", "ios");
  assert.ok(types.includes("oom"));
});

test("detectCrashTypes returns multiple types for hybrid crash", () => {
  const types = detectCrashTypes("ANR in com.app: dispatching timed out\nkilled due to memory pressure", "android");
  assert.ok(types.includes("anr"));
  assert.ok(types.includes("oom"));
});

test("selectPrimaryCrashType prioritizes anr over native_crash", () => {
  const primary = selectPrimaryCrashType(["native_crash", "anr"]);
  assert.equal(primary, "anr");
});

test("selectPrimaryCrashType prioritizes native_crash over oom", () => {
  const primary = selectPrimaryCrashType(["oom", "native_crash"]);
  assert.equal(primary, "native_crash");
});

test("buildCrashAttribution returns undefined for clean logs", () => {
  const result = buildCrashAttribution("Just some normal log output\nNo signals here", "android");
  assert.equal(result, undefined);
});

test("buildCrashAttribution extracts process name from ANR", () => {
  const content = `Cmd line: com.example.app
Input dispatching timed out (waiting to send non-pointer event)`;
  const result = buildCrashAttribution(content, "android");
  assert.ok(result);
  assert.equal(result?.processName, "com.example.app");
  assert.equal(result?.primaryCrashType, "anr");
  assert.ok(result?.signal?.includes("Input dispatching timed out"));
});

test("buildCrashAttribution extracts exception type for iOS", () => {
  const content = `Process: MyApp [1234]
Exception Type: EXC_BAD_ACCESS (SIGSEGV)
Exception Codes: KERN_INVALID_ADDRESS at 0x0000000000000010
Thread 0 Crashed:`;
  const result = buildCrashAttribution(content, "ios");
  assert.ok(result);
  assert.equal(result?.primaryCrashType, "native_crash");
  assert.equal(result?.confidence, "high");
});

test("buildCrashAttribution includes suggested actions", () => {
  const content = "ANR in com.app: Input dispatching timed out\nViewRootImpl.handleMessage";
  const result = buildCrashAttribution(content, "android");
  assert.ok(result);
  assert.ok(result!.suggestedActions.length > 0);
  // The cause heuristic for ANR + ViewRootImpl maps to "UI thread blocked"
  assert.ok(result!.suspectedCause?.toLowerCase().includes("ui thread") ||
            result!.suspectedCause?.toLowerCase().includes("blocked"));
});

test("buildCrashAttribution returns undefined when no crash signals", () => {
  const content = "Some weird output but no crash signals";
  const result = buildCrashAttribution(content, "android");
  assert.equal(result, undefined);
});

test("buildCrashAttribution extracts crashedThread from Android FATAL EXCEPTION", () => {
  const content = `FATAL EXCEPTION: main
Process: com.example.app, PID: 1234
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0
Abort message: 'java.lang.NullPointerException: Attempt to invoke virtual method on a null object reference'
  at com.example.app.MyClass.crashMethod(MyClass.java:42)
  at com.example.app.MyClass.otherMethod(MyClass.java:56)
  at android.app.ActivityThread.main(ActivityThread.java:1234)
"main" prio=5 tid=1 Runnable
  | group="main" sCount=0 dsCount=0 flags=0 obj=0x12345678 self=0x7f00000000
  | sysTid=1234 nice=-10 cgrp=default sched=0/0 handle=0x7f00001000
  | state=R schedstat=( 12345678 1234567 123 ) utm=123 stm=45 core=0 HZ=100`;
  const result = buildCrashAttribution(content, "android");
  assert.ok(result);
  assert.equal(result?.primaryCrashType, "native_crash");
  assert.ok(result?.crashedThread !== undefined, "crashedThread should be defined");
  assert.equal(result?.crashedThread?.name, "main");
  assert.ok(result?.crashedThread?.topFrames !== undefined, "crashedThread should have topFrames");
  assert.ok(result?.crashedThread!.topFrames.length > 0, "crashedThread topFrames should not be empty");
});
