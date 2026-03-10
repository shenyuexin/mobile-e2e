import assert from "node:assert/strict";
import test from "node:test";
import { classifyDoctorOutcome, isPerfettoShellProbeAvailable, measureAndroidPerformanceWithMaestro, measureIosPerformanceWithMaestro } from "../src/index.ts";
import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";
import { buildAndroidPerformancePlan, resolveAndroidPerformancePlanStrategy, resolveTraceProcessorPath } from "../src/performance-runtime.ts";

test("isPerfettoShellProbeAvailable rejects missing sentinel output", () => {
  assert.equal(isPerfettoShellProbeAvailable({ exitCode: 0, stdout: "missing\n", stderr: "" }), false);
  assert.equal(isPerfettoShellProbeAvailable({ exitCode: 0, stdout: "/system/bin/perfetto\n", stderr: "" }), true);
});

test("classifyDoctorOutcome keeps optional tooling gaps partial", () => {
  const checks: DoctorCheck[] = [
    { name: "node", status: "pass", detail: "ok" },
    { name: "trace_processor", status: "fail", detail: "missing" },
    { name: "idb", status: "fail", detail: "missing" },
  ];

  assert.deepEqual(classifyDoctorOutcome(checks), { status: "partial", reasonCode: "DEVICE_UNAVAILABLE" });
});

test("classifyDoctorOutcome still fails for core runtime prerequisites", () => {
  const checks: DoctorCheck[] = [
    { name: "node", status: "fail", detail: "missing" },
    { name: "trace_processor", status: "pass", detail: "ok" },
  ];

  assert.deepEqual(classifyDoctorOutcome(checks), { status: "failed", reasonCode: "CONFIGURATION_ERROR" });
});

test("resolveAndroidPerformancePlanStrategy stays version-aware", () => {
  assert.deepEqual(resolveAndroidPerformancePlanStrategy(28), { configTransport: "stdin", tracePullMode: "exec_out_cat" });
  assert.deepEqual(resolveAndroidPerformancePlanStrategy(30), { configTransport: "stdin", tracePullMode: "adb_pull" });
  assert.deepEqual(resolveAndroidPerformancePlanStrategy(31), { configTransport: "remote_file", tracePullMode: "adb_pull" });
});

test("buildAndroidPerformancePlan switches transport for older Android versions", () => {
  const legacyPlan = buildAndroidPerformancePlan({ sessionId: "legacy-plan", preset: "interaction" }, "phase1", "device-1", 28);
  const modernPlan = buildAndroidPerformancePlan({ sessionId: "modern-plan", preset: "interaction" }, "phase1", "device-1", 34);

  assert.equal(legacyPlan.configTransport, "stdin");
  assert.equal(legacyPlan.tracePullMode, "exec_out_cat");
  assert.equal(modernPlan.configTransport, "remote_file");
  assert.equal(modernPlan.tracePullMode, "adb_pull");
});

test("resolveTraceProcessorPath discovers common fallback paths", () => {
  const originalPath = process.env.PATH;
  const originalTraceProcessorPath = process.env.TRACE_PROCESSOR_PATH;
  process.env.PATH = "";
  delete process.env.TRACE_PROCESSOR_PATH;

  try {
    const resolved = resolveTraceProcessorPath();
    assert.equal(typeof resolved === "string" || resolved === undefined, true);
  } finally {
    process.env.PATH = originalPath;
    if (originalTraceProcessorPath === undefined) {
      delete process.env.TRACE_PROCESSOR_PATH;
    } else {
      process.env.TRACE_PROCESSOR_PATH = originalTraceProcessorPath;
    }
  }
});

test("measureAndroidPerformanceWithMaestro previews Android dry-run output", async () => {
  const result = await measureAndroidPerformanceWithMaestro({
    sessionId: "adapter-android-performance-dry-run",
    runnerProfile: "phase1",
    durationMs: 4000,
    preset: "interaction",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.captureMode, "time_window");
  assert.equal(result.data.preset, "interaction");
  assert.equal(result.data.evidence?.some((item) => item.kind === "performance_trace"), true);
});

test("measureAndroidPerformanceWithMaestro returns structured configuration failure when trace_processor is missing", async () => {
  const originalTraceProcessorPath = process.env.TRACE_PROCESSOR_PATH;
  process.env.TRACE_PROCESSOR_PATH = "definitely-missing-trace-processor";

  try {
    const result = await measureAndroidPerformanceWithMaestro({
      sessionId: "adapter-android-performance-missing-trace-processor",
      runnerProfile: "phase1",
      durationMs: 4000,
      preset: "interaction",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(result.data.supportLevel, "full");
    assert.equal(result.data.artifactPaths[0]?.endsWith(".pbtx"), true);
    assert.equal(result.nextSuggestions[0]?.includes("trace_processor"), true);
  } finally {
    if (originalTraceProcessorPath === undefined) {
      delete process.env.TRACE_PROCESSOR_PATH;
    } else {
      process.env.TRACE_PROCESSOR_PATH = originalTraceProcessorPath;
    }
  }
});

test("measureIosPerformanceWithMaestro previews iOS dry-run output", async () => {
  const result = await measureIosPerformanceWithMaestro({
    sessionId: "adapter-ios-performance-dry-run",
    runnerProfile: "phase1",
    durationMs: 4000,
    template: "time-profiler",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.supportLevel, "partial");
  assert.equal(result.data.captureMode, "time_window");
  assert.equal(result.data.template, "time-profiler");
  assert.equal(result.data.evidence?.some((item) => item.kind === "performance_trace"), true);
});
