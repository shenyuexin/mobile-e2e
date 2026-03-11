import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyDoctorOutcome, isPerfettoShellProbeAvailable, measureAndroidPerformanceWithMaestro, measureIosPerformanceWithMaestro, runDoctor } from "../src/index.ts";
import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";
import { buildCapabilityProfile } from "../src/capability-model.ts";
import { buildAndroidPerformancePlan, buildIosPerformancePlan, resolveAndroidPerformancePlanStrategy, resolveTraceProcessorPath } from "../src/performance-runtime.ts";
import { buildPerformanceNextSuggestions, parseTraceProcessorTsv, summarizeAndroidPerformance, summarizeIosPerformance } from "../src/performance-model.ts";
import { buildFailureReason } from "../src/runtime-shared.ts";

const fixtureRoot = path.resolve(import.meta.dirname, "fixtures", "performance");

test("isPerfettoShellProbeAvailable rejects missing sentinel output", () => {
  assert.equal(isPerfettoShellProbeAvailable({ exitCode: 0, stdout: "missing\n", stderr: "" }), false);
  assert.equal(isPerfettoShellProbeAvailable({ exitCode: 0, stdout: "/system/bin/perfetto\n", stderr: "" }), true);
});

test("parseTraceProcessorTsv strips shell headers and separators", () => {
  const rows = parseTraceProcessorTsv("name\n--------------------\nsched\nthread\n");
  assert.deepEqual(rows, [["sched"], ["thread"]]);
});

test("parseTraceProcessorTsv parses fixed-width trace processor output and drops footer lines", () => {
  const rows = parseTraceProcessorTsv(
    "name                 value\n-------------------- --------------------\n<unknown>                     4386.020000\nsystem_server                  607.780000\n\nQuery executed in 12.169 ms\n",
  );
  assert.deepEqual(rows, [["<unknown>", "4386.020000"], ["system_server", "607.780000"]]);
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

test("buildCapabilityProfile explains the current iOS performance template matrix", () => {
  const profile = buildCapabilityProfile("ios", "phase1");
  const performanceTool = profile.toolCapabilities.find((tool) => tool.toolName === "measure_ios_performance");

  assert.equal(performanceTool?.supportLevel, "partial");
  assert.match(performanceTool?.note ?? "", /Time Profiler is real-validated/);
  assert.match(performanceTool?.note ?? "", /Allocations can be real-validated via attach-to-app/);
  assert.match(performanceTool?.note ?? "", /Animation Hitches remains platform-limited/);
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

test("buildIosPerformancePlan uses attach target when provided", () => {
  const plan = buildIosPerformancePlan({ sessionId: "ios-memory-attach", template: "memory", appId: "host.exp.Exponent" }, "phase1", "sim-1", "43127");

  assert.equal(plan.attachTarget, "43127");
  assert.deepEqual(plan.steps[0]?.command.slice(0, 9), [
    "xcrun",
    "xctrace",
    "record",
    "--template",
    "Allocations",
    "--device",
    "sim-1",
    "--attach",
    "43127",
  ]);
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

test("measureIosPerformanceWithMaestro returns configuration failure when xcrun is missing", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";

  try {
    const result = await measureIosPerformanceWithMaestro({
      sessionId: "adapter-ios-performance-missing-xcrun",
      runnerProfile: "phase1",
      durationMs: 1000,
      template: "time-profiler",
      deviceId: "missing-device",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(result.data.supportLevel, "partial");
    assert.equal(result.artifacts.length, 0);
    assert.match(result.nextSuggestions[0] ?? "", /xctrace recording failed/i);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("buildFailureReason maps unsupported platform template errors to device unavailable", () => {
  assert.equal(buildFailureReason("Hitches is not supported on this platform.", 2), "DEVICE_UNAVAILABLE");
});

test("buildFailureReason maps real animation-hitches simulator fixture to device unavailable", () => {
  const fixture = readFileSync(path.join(fixtureRoot, "ios-animation-hitches-unsupported.txt"), "utf8");
  assert.equal(buildFailureReason(fixture, 2), "DEVICE_UNAVAILABLE");
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

test("summarizeIosPerformance extracts animation hitch timing signals", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><data><table schema="animation-hitches"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="animation-hitches"></schema><row><process fmt="MyApp (123)"/><event fmt="Hitch detected"/><duration fmt="24.00 ms">24</duration></row><row><process fmt="MyApp (123)"/><event fmt="Frame presented"/><duration fmt="42.00 ms">42</duration></row><row><process fmt="WindowServer (511)"/><event fmt="Hitch detected"/><duration fmt="18.00 ms">18</duration></row></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 1000, template: "animation-hitches", tocXml, exportXml });

  assert.equal(summary.likelyCategory, "jank");
  assert.equal(summary.jank.status !== "unknown", true);
  assert.equal(summary.jank.slowFrameCount, 3);
  assert.equal(summary.jank.avgFrameTimeMs, 28);
  assert.match(summary.jank.note, /Animation Hitches export shows/);
});

test("summarizeIosPerformance extracts allocation-heavy memory hints", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><data><table schema="allocations"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="allocations"></schema><row><process fmt="MyApp (123)"/><category fmt="Malloc 16 KB"/><size fmt="16 KB">16384</size></row><row><process fmt="MyApp (123)"/><category fmt="VM: ImageIO 4 MB"/><size fmt="4 MB">4194304</size></row></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 1000, template: "memory", tocXml, exportXml });

  assert.equal(summary.likelyCategory, "memory");
  assert.equal(summary.memory.status !== "unknown", true);
  assert.match(summary.memory.note, /largest parsed allocation is roughly 4096 KB/);
});

test("summarizeIosPerformance uses real memory fixture to expose process and capture scope", () => {
  const tocXml = readFileSync(path.join(fixtureRoot, "ios-memory-real.toc.xml"), "utf8");
  const exportXml = readFileSync(path.join(fixtureRoot, "ios-memory-real.export.xml"), "utf8");

  const summary = summarizeIosPerformance({ durationMs: 3600, template: "memory", tocXml, exportXml });

  assert.equal(summary.memory.dominantProcess, "Expo Go");
  assert.equal(summary.memory.captureScope, "attached_process");
  assert.equal(summary.memory.allocationRowCount, 0);
  assert.match(summary.memory.note, /Allocations trace attached to Expo Go/);
});

test("summarizeIosPerformance includes aggregated allocation fields and pressure signal", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="attached" name="MyApp"/></target></info><data><table schema="allocations"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="allocations"></schema><row><process fmt="MyApp (123)"/><category fmt="Malloc 16 KB"/><size fmt="16 KB">16384</size></row><row><process fmt="MyApp (123)"/><category fmt="VM: ImageIO 4 MB"/><size fmt="4 MB">4194304</size></row><row><process fmt="MyApp (123)"/><category fmt="VM: ImageIO 4 MB"/><size fmt="8 MB">8388608</size></row></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 1000, template: "memory", tocXml, exportXml });

  assert.equal(summary.memory.dominantProcess, "MyApp");
  assert.equal(summary.memory.totalAllocatedKb, 12304);
  assert.equal(summary.memory.allocationCountByProcess?.MyApp, 3);
  assert.equal(summary.memory.memoryPressureSignal, "growth_spike");
  assert.equal(summary.memory.topAllocationCategories?.[0], "VM: ImageIO 4 MB");
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

test("summarizeAndroidPerformance keeps hotspot names intact when numeric columns trail the row", () => {
  const summary = summarizeAndroidPerformance({
    durationMs: 1000,
    tableNames: ["slice"],
    hotspotRows: [["Drawing", "0.00 371.00", "186.84", "57"]],
  });

  assert.equal(summary.cpu.topHotspots[0]?.name, "Drawing 0.00 371.00");
  assert.equal(summary.cpu.topHotspots[0]?.totalDurMs, 186.84);
  assert.equal(summary.cpu.topHotspots[0]?.occurrences, 57);
});

test("summarizeAndroidPerformance prioritizes the target app over noisier system processes", () => {
  const summary = summarizeAndroidPerformance({
    durationMs: 1000,
    appId: "com.example.app",
    tableNames: ["sched"],
    cpuRows: [["system_server", "800"], ["com.example.app", "350"], ["surfaceflinger", "500"]],
  });

  assert.equal(summary.cpu.topProcess, "com.example.app");
  assert.equal(summary.cpu.topProcesses[0]?.name, "com.example.app");
  assert.match(summary.cpu.note, /Target app com.example.app used about 35%/);
  assert.match(summary.cpu.note, /highest overall process was system_server/);
});

test("summarizeAndroidPerformance prioritizes target-app-owned hotspots", () => {
  const summary = summarizeAndroidPerformance({
    durationMs: 1000,
    appId: "com.example.app",
    tableNames: ["slice"],
    hotspotRows: [["system_server", "binder transaction", "300", "50"], ["com.example.app", "MyView draw", "140", "10"], ["surfaceflinger", "waitForever", "200", "30"]],
  });

  assert.equal(summary.cpu.topHotspots[0]?.processName, "com.example.app");
  assert.equal(summary.cpu.topHotspots[0]?.name, "MyView draw");
});

test("buildPerformanceNextSuggestions uses richer memory and hotspot guidance", () => {
  const summary = summarizeIosPerformance({
    durationMs: 1000,
    template: "memory",
    tocXml: `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="attached" name="MyApp"/></target></info><data><table schema="allocations"/></data></run></trace-toc>`,
    exportXml: `<?xml version="1.0"?><trace-query-result><node><schema name="allocations"></schema><row><process fmt="MyApp (123)"/><category fmt="VM: ImageIO 4 MB"/><size fmt="8 MB">8388608</size></row></node></trace-query-result>`,
  });
  const suggestions = buildPerformanceNextSuggestions(summary, {
    summaryPath: "summary.json",
    reportPath: "report.md",
    exportPath: "memory.xml",
  });

  assert.equal(suggestions.some((item) => item.includes("MyApp")), true);
  assert.equal(suggestions.some((item) => item.includes("VM: ImageIO 4 MB")), true);
  assert.equal(suggestions.some((item) => item.includes("spiky")), true);
});

test("runDoctor includes an explicit iOS performance recommendation check", async () => {
  const originalSimUdid = process.env.SIM_UDID;
  delete process.env.SIM_UDID;
  try {
    const result = await runDoctor({ includeUnavailable: true });
    assert.equal(result.data.checks.some((check) => check.name === "ios performance recommendation"), true);
  } finally {
    if (originalSimUdid !== undefined) {
      process.env.SIM_UDID = originalSimUdid;
    }
  }
});
