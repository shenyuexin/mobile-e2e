import type {
  IosPerformanceTemplate,
  MeasureAndroidPerformanceData,
  MeasureIosPerformanceData,
  PerformanceArtifactBundle,
  PerformanceCpuSummary,
  PerformanceHotspot,
  PerformanceJankSummary,
  PerformanceMemorySummary,
  PerformanceProcessSignal,
  PerformanceStructuredSummary,
} from "@mobile-e2e-mcp/contracts";

function clampSeverity(value: number | undefined, medium: number, high: number): "none" | "low" | "moderate" | "high" | "unknown" {
  if (value === undefined || Number.isNaN(value)) {
    return "unknown";
  }
  if (value <= 0) {
    return "none";
  }
  if (value >= high) {
    return "high";
  }
  if (value >= medium) {
    return "moderate";
  }
  return "low";
}

function toMaybeNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSeparatorRow(row: string[]): boolean {
  const flattened = row.join("").replaceAll(" ", "").replaceAll("\t", "");
  return flattened.length > 0 && flattened.replaceAll("-", "") === "";
}

function parseXmlRows(xml: string): string[] {
  return [...xml.matchAll(/<row>([\s\S]*?)<\/row>/g)].map((match) => match[1] ?? "");
}

function extractXmlAttributeValue(fragment: string, tagName: string, attributeName: string): string | undefined {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*\\b${attributeName}="([^"]+)"`, "i");
  return tagPattern.exec(fragment)?.[1];
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function stripProcessDisplaySuffix(value: string): string {
  return value.replace(/ \([^)]*\)$/, "").trim();
}

function normalizeIosProcessName(value: string | undefined): string {
  if (!value) {
    return "<unknown>";
  }
  return stripProcessDisplaySuffix(decodeXmlEntities(value));
}

function buildIosHotspotsFromRows(exportXml: string): PerformanceHotspot[] {
  const totals = new Map<string, { totalDurMs: number; occurrences: number }>();
  for (const row of parseXmlRows(exportXml)) {
    const weightRaw = extractXmlAttributeValue(row, "weight", "fmt");
    const frameName = extractXmlAttributeValue(row, "frame", "name");
    if (!weightRaw || !frameName) {
      continue;
    }
    const weightMs = toMaybeNumber(weightRaw.replace(/[^0-9.]/g, ""));
    if (weightMs === undefined) {
      continue;
    }
    const key = decodeXmlEntities(frameName).trim();
    const previous = totals.get(key) ?? { totalDurMs: 0, occurrences: 0 };
    previous.totalDurMs += weightMs;
    previous.occurrences += 1;
    totals.set(key, previous);
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, totalDurMs: Number(value.totalDurMs.toFixed(2)), occurrences: value.occurrences }))
    .sort((left, right) => (right.totalDurMs ?? 0) - (left.totalDurMs ?? 0))
    .slice(0, 5);
}

function buildIosTopProcessesFromRows(exportXml: string, durationMs: number): PerformanceProcessSignal[] {
  const totals = new Map<string, { scheduledMs: number }>();
  for (const row of parseXmlRows(exportXml)) {
    const weightRaw = extractXmlAttributeValue(row, "weight", "fmt");
    const processName = normalizeIosProcessName(extractXmlAttributeValue(row, "process", "fmt"));
    if (!weightRaw) {
      continue;
    }
    const weightMs = toMaybeNumber(weightRaw.replace(/[^0-9.]/g, ""));
    if (weightMs === undefined) {
      continue;
    }
    const previous = totals.get(processName) ?? { scheduledMs: 0 };
    previous.scheduledMs += weightMs;
    totals.set(processName, previous);
  }
  return [...totals.entries()]
    .map(([name, value]) => ({
      name,
      scheduledMs: Number(value.scheduledMs.toFixed(2)),
      cpuPercent: durationMs > 0 ? Number(((value.scheduledMs / durationMs) * 100).toFixed(1)) : undefined,
    }))
    .sort((left, right) => (right.scheduledMs ?? 0) - (left.scheduledMs ?? 0))
    .slice(0, 5);
}

function extractXmlAttributes(xml: string, attribute: string): string[] {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, "g");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  do {
    match = pattern.exec(xml);
    if (match?.[1]) {
      results.push(match[1]);
    }
  } while (match);
  return results;
}

export function buildBasePerformanceSummary(durationMs: number, supportLevel: "full" | "partial"): PerformanceStructuredSummary {
  return {
    captureMode: "time_window",
    durationMs,
    supportLevel,
    performanceProblemLikely: "unknown",
    likelyCategory: "unknown",
    confidence: "low",
    cpu: {
      status: "unknown",
      note: "CPU evidence is not available yet.",
      topProcesses: [],
      topHotspots: [],
    },
    jank: {
      status: "unknown",
      note: "Frame or hitch evidence is not available yet.",
    },
    memory: {
      status: "unknown",
      note: "Memory evidence is not available yet.",
    },
  };
}

export function parseTraceProcessorTsv(stdout: string): string[][] {
  const rows = stdout
    .replaceAll(String.fromCharCode(13), "")
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(String.fromCharCode(9)));
  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    return rows.slice(2);
  }
  return rows.filter((row) => !isSeparatorRow(row));
}

export function summarizeAndroidPerformance(params: {
  durationMs: number;
  appId?: string;
  tableNames: string[];
  cpuRows?: string[][];
  hotspotRows?: string[][];
  frameRows?: string[][];
  memoryRows?: string[][];
  cpuSource?: "sched" | "thread_state";
  frameSource?: "actual_frame_timeline_slice" | "slice_name_heuristic";
  memorySource?: "process_counter_track" | "counter_track_heuristic";
}): PerformanceStructuredSummary {
  const summary = buildBasePerformanceSummary(params.durationMs, "full");
  const topProcesses: PerformanceProcessSignal[] = (params.cpuRows ?? []).map((row) => {
    const scheduledMs = toMaybeNumber(row[1]);
    const cpuPercent = scheduledMs !== undefined ? Number(((scheduledMs / params.durationMs) * 100).toFixed(1)) : undefined;
    return {
      name: row[0] ?? "<unknown>",
      scheduledMs,
      cpuPercent,
    };
  });
  const topHotspots: PerformanceHotspot[] = (params.hotspotRows ?? []).map((row) => ({
    name: row[0] ?? "<unknown>",
    totalDurMs: toMaybeNumber(row[1]),
    occurrences: toMaybeNumber(row[2]),
  }));
  const topCpu = topProcesses[0];
  const cpuSeverity = clampSeverity(topCpu?.cpuPercent, 35, 70);
  const cpuNote = topCpu?.cpuPercent !== undefined
    ? `Top scheduled process is ${topCpu.name} at roughly ${String(topCpu.cpuPercent)}% of the sampled window.`
    : params.cpuSource === "thread_state"
      ? "CPU pressure was inferred from running thread-state durations rather than sched slices."
    : params.tableNames.includes("sched")
      ? "CPU scheduling tables were available, but no dominant scheduled process was found."
      : "Perfetto sched data was not available for CPU summarization.";
  const cpu: PerformanceCpuSummary = {
    status: cpuSeverity,
    note: cpuNote,
    topProcess: topCpu?.name,
    topProcessCpuPercent: topCpu?.cpuPercent,
    topProcesses,
    topHotspots,
  };

  const frameRow = params.frameRows?.[0];
  const slowFrameCount = toMaybeNumber(frameRow?.[0]);
  const frozenFrameCount = toMaybeNumber(frameRow?.[1]);
  const avgFrameTimeMs = toMaybeNumber(frameRow?.[2]);
  const worstFrameTimeMs = toMaybeNumber(frameRow?.[3]);
  const jankSeverity = worstFrameTimeMs !== undefined
    ? clampSeverity(worstFrameTimeMs, 24, 48)
    : slowFrameCount !== undefined
      ? clampSeverity(slowFrameCount, 3, 12)
      : "unknown";
  const jank: PerformanceJankSummary = {
    status: jankSeverity,
    note: avgFrameTimeMs !== undefined || slowFrameCount !== undefined
      ? params.frameSource === "slice_name_heuristic"
        ? `Heuristic frame-like slices show ${String(slowFrameCount ?? 0)} slow frame(s) with average duration ${String(avgFrameTimeMs ?? "unknown")}ms.`
        : `Frame timeline shows ${String(slowFrameCount ?? 0)} slow frame(s) with average frame time ${String(avgFrameTimeMs ?? "unknown")}ms.`
      : params.tableNames.includes("actual_frame_timeline_slice")
        ? "Frame timeline data was present but did not yield stable jank counters."
        : "Frame timeline tables were not present in the sampled trace.",
    slowFrameCount,
    frozenFrameCount,
    avgFrameTimeMs,
    worstFrameTimeMs,
  };

  const memoryRow = params.memoryRows?.[0];
  const peakRssKb = toMaybeNumber(memoryRow?.[1]);
  const rssDeltaKb = toMaybeNumber(memoryRow?.[2]);
  const memorySeverity = clampSeverity(rssDeltaKb, 25600, 102400);
  const memory: PerformanceMemorySummary = {
    status: memorySeverity,
    note: rssDeltaKb !== undefined
      ? params.memorySource === "counter_track_heuristic"
        ? `Heuristic memory counters changed by about ${String(rssDeltaKb)} units during the window; confirm the backing track before treating this as RSS.`
        : `${params.appId ? `App ${params.appId}` : "The sampled process"} RSS changed by about ${String(rssDeltaKb)} KB during the window.`
      : params.tableNames.includes("process_counter_track")
        ? "Memory counter tables were present, but no RSS series was confidently associated with the target scope."
        : "Memory counter tables were not present in the sampled trace.",
    rssDeltaKb,
    peakRssKb,
  };

  summary.cpu = cpu;
  summary.jank = jank;
  summary.memory = memory;

  const candidates = [
    { category: "cpu" as const, rank: topCpu?.cpuPercent ?? -1 },
    { category: "jank" as const, rank: worstFrameTimeMs ?? slowFrameCount ?? -1 },
    { category: "memory" as const, rank: rssDeltaKb ?? -1 },
  ].sort((left, right) => right.rank - left.rank);
  const strongest = candidates[0];
  summary.likelyCategory = strongest && strongest.rank > 0 ? strongest.category : "unknown";
  summary.performanceProblemLikely = summary.likelyCategory === "unknown"
    ? "unknown"
    : [cpu.status, jank.status, memory.status].some((status) => status === "moderate" || status === "high")
      ? "yes"
      : "no";
  summary.confidence = [summary.cpu.status, summary.jank.status, summary.memory.status].some((status) => status === "moderate" || status === "high")
    ? "high"
    : summary.jank.status !== "unknown" || summary.cpu.status !== "unknown" || summary.memory.status !== "unknown"
      ? "medium"
      : "low";
  return summary;
}

export function summarizeIosPerformance(params: {
  durationMs: number;
  template: IosPerformanceTemplate;
  tocXml?: string;
  exportXml?: string;
}): PerformanceStructuredSummary {
  const summary = buildBasePerformanceSummary(params.durationMs, "partial");
  const schemaNames = params.tocXml ? [...new Set(extractXmlAttributes(params.tocXml, "schema"))] : [];
  const exportText = `${params.tocXml ?? ""}\n${params.exportXml ?? ""}`.toLowerCase();
  const hitchMentions = (exportText.match(/hitch/g) ?? []).length;
  const frameMentions = (exportText.match(/frame/g) ?? []).length;
  const allocationMentions = (exportText.match(/alloc|malloc|vm:/g) ?? []).length;
  const cpuMentions = (exportText.match(/sample|cpu|thread/g) ?? []).length;
  const hasJankSignal = hitchMentions > 0 || frameMentions > 0;
  const hasMemorySignal = allocationMentions > 0;
  const topProcesses = params.template === "time-profiler" && params.exportXml ? buildIosTopProcessesFromRows(params.exportXml, params.durationMs) : [];
  const topHotspots = params.template === "time-profiler" && params.exportXml ? buildIosHotspotsFromRows(params.exportXml) : [];
  const topCpu = topProcesses[0];
  const hasCpuSignal = topProcesses.length > 0 || topHotspots.length > 0;

  const cpu: PerformanceCpuSummary = {
    status: params.template === "time-profiler" && hasCpuSignal
      ? clampSeverity(topCpu?.cpuPercent ?? cpuMentions, 20, 45)
      : "unknown",
    note: params.template === "time-profiler"
      ? topCpu?.cpuPercent !== undefined
        ? `Time Profiler export suggests ${topCpu.name} consumed about ${String(topCpu.cpuPercent)}% of sampled CPU weight.`
        : `xctrace export exposed ${String(schemaNames.length)} table schema(s); CPU interpretation remains shallow in this MVP.`
      : "CPU-focused parsing was not requested by the selected template.",
    topProcess: topCpu?.name,
    topProcessCpuPercent: topCpu?.cpuPercent,
    topProcesses,
    topHotspots,
  };
  const jank: PerformanceJankSummary = {
    status: params.template === "animation-hitches" && hasJankSignal ? clampSeverity(hitchMentions || frameMentions, 3, 10) : "unknown",
    note: params.template === "animation-hitches"
      ? `Animation/Hitch export contains ${String(hitchMentions)} hitch-related token(s) and ${String(frameMentions)} frame token(s).`
      : "Animation hitch parsing was not requested by the selected template.",
    slowFrameCount: hitchMentions > 0 ? hitchMentions : undefined,
  };
  const memory: PerformanceMemorySummary = {
    status: params.template === "memory" && hasMemorySignal ? clampSeverity(allocationMentions, 10, 40) : "unknown",
    note: params.template === "memory"
      ? `Allocations export contains ${String(allocationMentions)} allocation-related token(s); this is a lightweight signal, not a full heap analysis.`
      : "Memory parsing was not requested by the selected template.",
  };

  summary.cpu = cpu;
  summary.jank = jank;
  summary.memory = memory;
  if (params.template === "time-profiler") {
    summary.likelyCategory = cpu.status === "unknown" ? "unknown" : "cpu";
  } else if (params.template === "animation-hitches") {
    summary.likelyCategory = jank.status === "unknown" ? "unknown" : "jank";
  } else {
    summary.likelyCategory = memory.status === "unknown" ? "unknown" : "memory";
  }
  summary.performanceProblemLikely = summary.likelyCategory === "unknown"
    ? "unknown"
    : [cpu.status, jank.status, memory.status].some((status) => status === "moderate" || status === "high")
      ? "yes"
      : "no";
  summary.confidence = topProcesses.length > 0 || topHotspots.length > 0 ? "medium" : schemaNames.length > 0 ? "low" : "low";
  return summary;
}

export function buildPerformanceSuspectAreas(summary: PerformanceStructuredSummary): string[] {
  const suspects: string[] = [];
  if (summary.jank.status === "moderate" || summary.jank.status === "high") {
    suspects.push(`Performance suspect: frame pacing looks unstable; likely category is jank.`);
  }
  if (summary.cpu.status === "moderate" || summary.cpu.status === "high") {
    suspects.push(`Performance suspect: CPU scheduling pressure is elevated in the sampled window.`);
  }
  if (summary.memory.status === "moderate" || summary.memory.status === "high") {
    suspects.push(`Performance suspect: memory growth is non-trivial in the sampled window.`);
  }
  if (suspects.length === 0) {
    suspects.push("No single high-confidence hotspot stands out yet; inspect the generated summary artifact before escalating.");
  }
  return suspects.slice(0, 5);
}

export function buildPerformanceDiagnosisBriefing(summary: PerformanceStructuredSummary, subject: string): string[] {
  const briefing = [
    `Captured a ${subject} performance window for ${String(summary.durationMs)}ms in time-window mode.`,
    `Current AI read: performance problem likely = ${summary.performanceProblemLikely}, likely category = ${summary.likelyCategory}.`,
    summary.cpu.note,
    summary.jank.note,
    summary.memory.note,
  ];
  return briefing.slice(0, 5);
}

export function buildPerformanceNextSuggestions(summary: PerformanceStructuredSummary, artifacts: PerformanceArtifactBundle): string[] {
  const suggestions: string[] = [];
  if (summary.likelyCategory === "jank") {
    suggestions.push(`Inspect ${artifacts.tracePath ?? artifacts.traceBundlePath ?? artifacts.exportPath ?? artifacts.summaryPath} for frame timeline or hitch details next.`);
  }
  if (summary.likelyCategory === "cpu") {
    suggestions.push(`Inspect ${artifacts.summaryPath} for top scheduled process and hotspot slices first.`);
  }
  if (summary.likelyCategory === "memory") {
    suggestions.push(`Inspect ${artifacts.summaryPath} for RSS or allocation signals before deeper trace exploration.`);
  }
  if (summary.likelyCategory === "unknown") {
    suggestions.push(`Inspect ${artifacts.reportPath} first; the MVP summary is inconclusive and may require manual trace review.`);
  }
  if (artifacts.exportPath) {
    suggestions.push(`If the summary feels too shallow, inspect ${artifacts.exportPath} directly; iOS export parsing in this MVP is intentionally limited.`);
  }
  return [...new Set(suggestions)].slice(0, 5);
}

export function buildPerformanceMarkdownReport(params: {
  title: string;
  supportLevel: "full" | "partial";
  summary: PerformanceStructuredSummary;
  suspectAreas: string[];
  diagnosisBriefing: string[];
  artifactPaths: string[];
}): string {
  const lines = [
    `# ${params.title}`,
    "",
    `- supportLevel: ${params.supportLevel}`,
    `- performanceProblemLikely: ${params.summary.performanceProblemLikely}`,
    `- likelyCategory: ${params.summary.likelyCategory}`,
    `- confidence: ${params.summary.confidence}`,
    "",
    "## Artifact Paths",
    ...params.artifactPaths.map((artifactPath) => `- ${artifactPath}`),
    "",
    "## Diagnosis Briefing",
    ...params.diagnosisBriefing.map((item) => `- ${item}`),
    "",
    "## Suspect Areas",
    ...params.suspectAreas.map((item) => `- ${item}`),
    "",
    "## Structured Summary",
    `- cpu: ${params.summary.cpu.note}`,
    `- jank: ${params.summary.jank.note}`,
    `- memory: ${params.summary.memory.note}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function buildAndroidPerformanceData(params: Omit<MeasureAndroidPerformanceData, "suspectAreas" | "diagnosisBriefing">): MeasureAndroidPerformanceData {
  const suspectAreas = buildPerformanceSuspectAreas(params.summary);
  const diagnosisBriefing = buildPerformanceDiagnosisBriefing(params.summary, "Android");
  return { ...params, suspectAreas, diagnosisBriefing };
}

export function buildIosPerformanceData(params: Omit<MeasureIosPerformanceData, "suspectAreas" | "diagnosisBriefing">): MeasureIosPerformanceData {
  const suspectAreas = buildPerformanceSuspectAreas(params.summary);
  const diagnosisBriefing = buildPerformanceDiagnosisBriefing(params.summary, "iOS");
  return { ...params, suspectAreas, diagnosisBriefing };
}
