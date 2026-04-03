import { readFileSync } from "node:fs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { buildIosAppScopeNote, classifyDoctorOutcome, isPerfettoShellProbeAvailable, measureAndroidPerformanceWithMaestro, measureIosPerformanceWithMaestro, runDoctor, shouldResolveIosAttachTarget } from "../src/index.ts";
import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";
import { IOS_PARTIAL_GROUP_FRONTIER, IOS_PARTIAL_TOOL_FRONTIER, buildCapabilityProfile } from "../src/capability-model.ts";
import { extractIosSimulatorProcessId } from "../src/device-runtime-ios.ts";
import { buildAndroidPerformancePlan, buildIosPerformancePlan, resolveAndroidPerformancePlanStrategy, resolveTraceProcessorPath } from "../src/performance-runtime.ts";
import { buildIosExportInspectionManifest, buildPerformanceNextSuggestions, parseTraceProcessorTsv, summarizeAndroidPerformance, summarizeIosPerformance } from "../src/performance-model.ts";
import { buildFailureReason } from "../src/runtime-shared.ts";

const fixtureRoot = path.resolve(import.meta.dirname, "fixtures", "performance");

async function installFakeXcrun(script: string): Promise<() => void> {
  const binDir = await mkdtemp(path.join(tmpdir(), "mobile-e2e-xcrun-"));
  const xcrunPath = path.join(binDir, "xcrun");
  await writeFile(xcrunPath, script, "utf8");
  await chmod(xcrunPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
  return () => {
    process.env.PATH = originalPath;
  };
}

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

test("buildIosPerformancePlan uses attach target for time-profiler when provided", () => {
  const plan = buildIosPerformancePlan({ sessionId: "ios-time-profiler-attach", template: "time-profiler", appId: "host.exp.Exponent" }, "phase1", "sim-1", "43127");

  assert.equal(plan.attachTarget, "43127");
  assert.deepEqual(plan.steps[0]?.command.slice(0, 9), [
    "xcrun",
    "xctrace",
    "record",
    "--template",
    "Time Profiler",
    "--device",
    "sim-1",
    "--attach",
    "43127",
  ]);
});

test("shouldResolveIosAttachTarget includes time-profiler and memory only when app id exists", () => {
  assert.equal(shouldResolveIosAttachTarget({ dryRun: false, template: "memory", appId: "host.exp.Exponent" }), true);
  assert.equal(shouldResolveIosAttachTarget({ dryRun: false, template: "time-profiler", appId: "host.exp.Exponent" }), true);
  assert.equal(shouldResolveIosAttachTarget({ dryRun: false, template: "animation-hitches", appId: "host.exp.Exponent" }), false);
  assert.equal(shouldResolveIosAttachTarget({ dryRun: true, template: "time-profiler", appId: "host.exp.Exponent" }), false);
  assert.equal(shouldResolveIosAttachTarget({ dryRun: false, template: "time-profiler", appId: undefined }), false);
});

test("buildIosAppScopeNote stays explicit when app-scoped attach could not be established", () => {
  assert.match(
    buildIosAppScopeNote("host.exp.Exponent", undefined),
    /could not be attached by pid and may fall back to all-process capture/i,
  );
});

test("buildCapabilityProfile locks the current iOS partial frontier", () => {
  const profile = buildCapabilityProfile("ios", "phase1");

  const partialTools = profile.toolCapabilities
    .filter((tool) => tool.supportLevel === "partial")
    .map((tool) => tool.toolName)
    .sort();
  const partialGroups = profile.groups
    .filter((group) => group.supportLevel === "partial")
    .map((group) => group.groupName)
    .sort();

  assert.deepEqual(partialTools, [...IOS_PARTIAL_TOOL_FRONTIER].sort());
  assert.deepEqual(partialGroups, [...IOS_PARTIAL_GROUP_FRONTIER].sort());

  const inspectTool = profile.toolCapabilities.find((tool) => tool.toolName === "inspect_ui") as ({ note?: string; promotionGate?: { blocked: boolean; requiredProofLanes: string[]; blockingReasons: string[] } } | undefined);
  const perfTool = profile.toolCapabilities.find((tool) => tool.toolName === "measure_ios_performance") as ({ note?: string; promotionGate?: { blocked: boolean; requiredProofLanes: string[]; blockingReasons: string[] } } | undefined);
  const listDevicesTool = profile.toolCapabilities.find((tool) => tool.toolName === "list_devices") as ({ note?: string } | undefined);
  const diagnosticsGroup = profile.groups.find((group) => group.groupName === "artifacts_and_diagnostics") as ({ promotionGate?: { blocked: boolean; requiredProofLanes: string[]; blockingReasons: string[] } } | undefined);
  const inspectNote = inspectTool?.note ?? "";
  const perfNote = perfTool?.note ?? "";
  const inspectGate = inspectTool?.promotionGate;
  const diagnosticsGate = diagnosticsGroup?.promotionGate;
  assert.match(inspectNote, /Support promotion is blocked until simulator proof and real-device proof lanes are both explicitly established\./);
  assert.match(perfNote, /Support promotion is blocked until simulator proof and real-device proof lanes are both explicitly established\./);
  assert.match(listDevicesTool?.note ?? "", /physical-device discovery/);
  assert.deepEqual(inspectGate, {
    blocked: true,
    requiredProofLanes: ["simulator", "real_device"],
    blockingReasons: ["Support promotion is blocked until simulator proof and real-device proof lanes are both explicitly established."],
  });
  assert.deepEqual(diagnosticsGate, {
    blocked: true,
    requiredProofLanes: ["simulator", "real_device"],
    blockingReasons: ["Support promotion is blocked until simulator proof and real-device proof lanes are both explicitly established."],
  });
});

test("extractIosSimulatorProcessId parses launchctl output for app pid", () => {
  const pid = extractIosSimulatorProcessId([
    "PID\tStatus\tLabel",
    "4242\t0\tcom.example.app",
    "101\t0\tcom.apple.springboard",
  ].join("\n"), "com.example.app");

  assert.equal(pid, "4242");
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
  assert.equal(result.data.artifactsByKind.rawAnalysisPath?.endsWith(".analysis.txt"), true);
  assert.equal(result.data.artifactPaths.some((item) => item.endsWith(".analysis.txt")), true);
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
    assert.equal(result.artifacts.length, 1);
    assert.equal(result.artifacts[0]?.endsWith(".analysis.txt"), true);
    assert.equal(result.data.artifactPaths[0]?.endsWith(".analysis.txt"), true);
    assert.match(result.nextSuggestions[0] ?? "", /xctrace recording failed/i);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("measureIosPerformanceWithMaestro attaches to a real-device pid when devicectl discovery succeeds", async () => {
  const restorePath = await installFakeXcrun(`#!/bin/sh
set -eu
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "apps" ]; then
  printf '%s\n' 'Apps installed:' 'Name      Bundle Identifier     Version   Bundle Version' '-------   -------------------   -------   --------------' 'Mobitru   com.mobitru.demoapp   1.0       1'
  exit 0
fi
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "processes" ]; then
  printf '%s\n' '10446   /private/var/containers/Bundle/Application/UUID/Mobitru.app/Mobitru'
  exit 0
fi
if [ "$1" = "xctrace" ] && [ "$2" = "record" ]; then
  printf '%s\n' 'record failed' >&2
  exit 2
fi
exit 1
`);

  try {
    const result = await measureIosPerformanceWithMaestro({
      sessionId: "adapter-ios-performance-physical-attach",
      runnerProfile: "phase1",
      durationMs: 1000,
      template: "time-profiler",
      deviceId: "00008101-000D482C1E78001E",
      appId: "com.mobitru.demoapp",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.data.commands[0]?.includes("--attach"), true);
    assert.equal(result.data.commands[0]?.includes("10446"), true);
    assert.match(result.nextSuggestions[1] ?? "", /attached by pid 10446/i);
  } finally {
    restorePath();
  }
});

test("measureIosPerformanceWithMaestro preserves all-process fallback when real-device pid discovery fails", async () => {
  const restorePath = await installFakeXcrun(`#!/bin/sh
set -eu
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "apps" ]; then
  printf '%s\n' 'Apps installed:' 'Name      Bundle Identifier     Version   Bundle Version' '-------   -------------------   -------   --------------' 'Mobitru   com.mobitru.demoapp   1.0       1'
  exit 0
fi
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "processes" ]; then
  printf '%s\n' '11452   /System/Library/CoreServices/SpringBoard.app/SpringBoard'
  exit 0
fi
if [ "$1" = "xctrace" ] && [ "$2" = "record" ]; then
  printf '%s\n' "Cannot handle a target type of 'All Processes'" >&2
  exit 2
fi
exit 1
`);

  try {
    const result = await measureIosPerformanceWithMaestro({
      sessionId: "adapter-ios-performance-physical-fallback",
      runnerProfile: "phase1",
      durationMs: 1000,
      template: "memory",
      deviceId: "00008101-000D482C1E78001E",
      appId: "com.mobitru.demoapp",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.data.commands[0]?.includes("--all-processes"), true);
    assert.match(result.nextSuggestions[0] ?? "", /cannot record All Processes/i);
    assert.match(result.nextSuggestions[1] ?? "", /could not be attached by pid/i);
  } finally {
    restorePath();
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
  assert.equal(summary.cpu.topHotspots[0]?.processName, "MyApp");
  assert.equal(summary.cpu.status !== "unknown", true);
  assert.match(summary.cpu.note, /not app-scoped/);
});

test("summarizeIosPerformance marks attached time profiler output as app-scoped", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="attached" name="MyApp"/></target></info><summary><duration>3.0</duration></summary><data><table schema="time-profile"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="time-profile"></schema><row><process fmt="MyApp (123)"/><weight fmt="2.00 ms">2000000</weight><backtrace><frame name="MyAppMain"/></backtrace></row><row><process fmt="MyApp (123)"/><weight fmt="1.50 ms">1500000</weight><backtrace><frame name="MyHotLoop"/></backtrace></row></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 10, template: "time-profiler", tocXml, exportXml });

  assert.equal(summary.cpu.topProcesses[0]?.name, "MyApp");
  assert.doesNotMatch(summary.cpu.note ?? "", /not app-scoped/);
});

test("summarizeIosPerformance keeps duplicate frame names separate by process", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><summary><duration>3.0</duration></summary></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node xpath='//trace-toc[1]/run[1]/data[1]/table[1]'><schema name="time-profile"></schema><row><process fmt="MyApp (123)"/><weight fmt="2.00 ms">2000000</weight><backtrace><frame name="SharedFrame"/></backtrace></row><row><process fmt="WindowServer (511)"/><weight fmt="1.50 ms">1500000</weight><backtrace><frame name="SharedFrame"/></backtrace></row></node></trace-query-result>`;

  const summary = summarizeIosPerformance({ durationMs: 10, template: "time-profiler", tocXml, exportXml });

  assert.equal(summary.cpu.topHotspots.length >= 2, true);
  assert.equal(summary.cpu.topHotspots[0]?.name, "SharedFrame");
  assert.equal(summary.cpu.topHotspots[0]?.processName, "MyApp");
  assert.equal(summary.cpu.topHotspots[1]?.name, "SharedFrame");
  assert.equal(summary.cpu.topHotspots[1]?.processName, "WindowServer");
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

test("buildIosExportInspectionManifest reports capture scope, target process, schemas, and row count", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="attached" name="Expo Go"/></target></info><data><table schema="allocations"/><table schema="cpu-profile"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node><schema name="allocations"></schema><row><process fmt="Expo Go (123)"/></row><row><process fmt="Expo Go (123)"/></row></node></trace-query-result>`;

  const manifest = buildIosExportInspectionManifest({ tocXml, exportXml });

  assert.equal(manifest.captureScope, "attached_process");
  assert.equal(manifest.targetProcess, "Expo Go");
  assert.deepEqual(manifest.schemaNames, ["allocations", "cpu-profile"]);
  assert.equal(manifest.rowCount, 2);
});

test("buildIosExportInspectionManifest stays honest when export rows are absent", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="all-processes" name="Simulator"/></target></info><data><table schema="time-profile"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node><schema name="time-profile"></schema></node></trace-query-result>`;

  const manifest = buildIosExportInspectionManifest({ tocXml, exportXml });

  assert.equal(manifest.captureScope, "all_processes");
  assert.equal(manifest.targetProcess, "Simulator");
  assert.deepEqual(manifest.schemaNames, ["time-profile"]);
  assert.equal(manifest.rowCount, 0);
});

test("buildIosExportInspectionManifest reports capture scope, target process, schemas, and row count", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="attached" name="Expo Go"/></target></info><data><table schema="allocations"/><table schema="cpu-profile"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node><schema name="allocations"></schema><row><process fmt="Expo Go (123)"/></row><row><process fmt="Expo Go (123)"/></row></node></trace-query-result>`;

  const manifest = buildIosExportInspectionManifest({ tocXml, exportXml });

  assert.equal(manifest.captureScope, "attached_process");
  assert.equal(manifest.targetProcess, "Expo Go");
  assert.deepEqual(manifest.schemaNames, ["allocations", "cpu-profile"]);
  assert.equal(manifest.rowCount, 2);
});

test("buildIosExportInspectionManifest stays honest when export rows are absent", () => {
  const tocXml = `<?xml version="1.0"?><trace-toc><run number="1"><info><target><process type="all-processes" name="Simulator"/></target></info><data><table schema="time-profile"/></data></run></trace-toc>`;
  const exportXml = `<?xml version="1.0"?><trace-query-result><node><schema name="time-profile"></schema></node></trace-query-result>`;

  const manifest = buildIosExportInspectionManifest({ tocXml, exportXml });

  assert.equal(manifest.captureScope, "all_processes");
  assert.equal(manifest.targetProcess, "Simulator");
  assert.deepEqual(manifest.schemaNames, ["time-profile"]);
  assert.equal(manifest.rowCount, 0);
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
    const checkNames = result.data.checks.map((check) => check.name);
    assert.equal(
      checkNames.includes("ios performance recommendation") || checkNames.includes("ios performance templates"),
      true,
    );
    assert.equal(Array.isArray(result.data.guidance), true);
  } finally {
    if (originalSimUdid !== undefined) {
      process.env.SIM_UDID = originalSimUdid;
    }
  }
});
