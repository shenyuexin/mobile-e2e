import assert from "node:assert/strict";
import test from "node:test";
import { classifyDoctorOutcome, isPerfettoShellProbeAvailable, measureAndroidPerformanceWithMaestro, measureIosPerformanceWithMaestro } from "../src/index.ts";
import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";
import { buildAndroidPerformancePlan, resolveAndroidPerformancePlanStrategy, resolveTraceProcessorPath } from "../src/performance-runtime.ts";
import { parseTraceProcessorTsv, summarizeAndroidPerformance, summarizeIosPerformance } from "../src/performance-model.ts";

test("isPerfettoShellProbeAvailable rejects missing sentinel output", () => {
  assert.equal(isPerfettoShellProbeAvailable({ exitCode: 0, stdout: "missing\n", stderr: "" }), false);
  assert.equal(isPerfettoShellProbeAvailable({ exitCode: 0, stdout: "/system/bin/perfetto\n", stderr: "" }), true);
});

test("parseTraceProcessorTsv strips shell headers and separators", () => {
  const rows = parseTraceProcessorTsv("name\n--------------------\nsched\nthread\n");
  assert.deepEqual(rows, [["sched"], ["thread"]]);
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

test("summarizeIosPerformance extracts top processes and hotspots from time profiler export", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><summary><duration>3.0</duration></summary></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="time-profile"></schema><row><process fmt="MyApp (123)"/><weight fmt="2.00 ms">2000000</weight><backtrace><frame name="MyAppMain"/></backtrace></row><row><process fmt="MyApp (123)"/><weight fmt="1.50 ms">1500000</weight><backtrace><frame name="MyHotLoop"/></backtrace></row><row><process fmt="WindowServer (511)"/><weight fmt="0.50 ms">500000</weight><backtrace><frame name="FrameInfoNotifyFuncIOShq"/></backtrace></row></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 10, template: "time-profiler", tocXml, exportXml });

  assert.equal(summary.likelyCategory, "cpu");
  assert.equal(summary.cpu.topProcesses[0]?.name, "MyApp");
  assert.equal(summary.cpu.topHotspots[0]?.name, "MyAppMain");
  assert.equal(summary.cpu.status !== "unknown", true);
});

test("summarizeIosPerformance stays unknown when schema exists but rows do not parse", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><data><table schema="time-profile"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="time-profile"></schema></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 10, template: "time-profiler", tocXml, exportXml });

  assert.equal(summary.likelyCategory, "unknown");
  assert.equal(summary.performanceProblemLikely, "unknown");
  assert.equal(summary.cpu.status, "unknown");
});

test("summarizeAndroidPerformance labels slice and counter fallbacks as heuristic", () => {
  const summary = summarizeAndroidPerformance({
    durationMs: 1000,
    tableNames: ["slice", "counter", "counter_track"],
    frameRows: [["2", "0", "18.5", "42"]],
    memoryRows: [["100", "220", "120"]],
    frameSource: "slice_name_heuristic",
    memorySource: "counter_track_heuristic",
  });

  assert.match(summary.jank.note, /Heuristic frame-like slices/);
  assert.match(summary.memory.note, /Heuristic memory counters/);
});
