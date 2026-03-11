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

function matchesAndroidAppProcess(processName: string, appId: string | undefined): boolean {
  if (!appId) {
    return false;
  }
  return processName === appId || processName.startsWith(`${appId}:`) || processName.endsWith(appId) || processName.includes(appId);
}

function isLikelySystemProcessName(processName: string | undefined): boolean {
  if (!processName) {
    return true;
  }
  return processName === "<unknown>"
    || processName === "system_server"
    || processName.startsWith("/system/")
    || processName.startsWith("surfaceflinger")
    || processName.startsWith("kworker")
    || processName.startsWith("swapper")
    || processName.startsWith("traced");
}

function classifyAndroidHotspotAffinity(processName: string | undefined, appId: string | undefined): "target_app" | "system" | "unknown" {
  if (matchesAndroidAppProcess(processName ?? "", appId)) {
    return "target_app";
  }
  if (isLikelySystemProcessName(processName)) {
    return processName ? "system" : "unknown";
  }
  return "unknown";
}

function summarizeMemoryPressureSignal(allocationRowCount: number | undefined, totalAllocatedKb: number | undefined, largestAllocationKb: number | undefined): "growth_spike" | "steady" | "unknown" {
  if (largestAllocationKb !== undefined && largestAllocationKb >= 8192) {
    return "growth_spike";
  }
  if ((allocationRowCount ?? 0) >= 10 || (totalAllocatedKb ?? 0) >= 16384) {
    return "steady";
  }
  return "unknown";
}

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

function splitTraceProcessorRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.includes(String.fromCharCode(9))) {
    return trimmed.split(String.fromCharCode(9)).map((part) => part.trim()).filter(Boolean);
  }
  return trimmed.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
}

function normalizeRightAnchoredRow(row: string[], numericColumnCount: number): string[] {
  if (row.length <= numericColumnCount + 1) {
    return row;
  }
  return [row.slice(0, row.length - numericColumnCount).join(" "), ...row.slice(row.length - numericColumnCount)];
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

function extractXmlFmtEntries(fragment: string): Array<{ tagName: string; value: string }> {
  return [...fragment.matchAll(/<([a-zA-Z0-9_:-]+)\b[^>]*\bfmt="([^"]+)"/g)].map((match) => ({
    tagName: match[1] ?? "",
    value: match[2] ?? "",
  }));
}

function toMaybeFormattedNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? toMaybeNumber(match[0]) : undefined;
}

function toMaybeSizeKb(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const numberValue = toMaybeFormattedNumber(value);
  if (numberValue === undefined) {
    return undefined;
  }
  const lowered = value.toLowerCase();
  if (lowered.includes("gb")) {
    return Number((numberValue * 1024 * 1024).toFixed(2));
  }
  if (lowered.includes("mb")) {
    return Number((numberValue * 1024).toFixed(2));
  }
  if (lowered.includes("kb")) {
    return Number(numberValue.toFixed(2));
  }
  if (lowered.includes("bytes") || lowered.endsWith("b")) {
    return Number((numberValue / 1024).toFixed(2));
  }
  return undefined;
}

function looksLikeProcessName(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return value === "<unknown>"
    || value.includes(".")
    || value.includes("/")
    || value.includes(":")
    || value.includes("(")
    || value.toLowerCase().includes("server")
    || value.toLowerCase().includes("renderthread");
}

function buildIosTemplateRowSignals(exportXml: string): Array<{ rowText: string; processName: string; fmtEntries: Array<{ tagName: string; value: string }> }> {
  return parseXmlRows(exportXml).map((row) => ({
    rowText: decodeXmlEntities(row).toLowerCase(),
    processName: normalizeIosProcessName(extractXmlAttributeValue(row, "process", "fmt")),
    fmtEntries: extractXmlFmtEntries(row),
  }));
}

function buildIosAnimationMetrics(exportXml: string): {
  slowFrameCount?: number;
  frozenFrameCount?: number;
  avgFrameTimeMs?: number;
  worstFrameTimeMs?: number;
  dominantProcess?: string;
} {
  const rowSignals = buildIosTemplateRowSignals(exportXml);
  const durations: number[] = [];
  const processCounts = new Map<string, number>();
  for (const signal of rowSignals) {
    if (!(signal.rowText.includes("hitch") || signal.rowText.includes("frame"))) {
      continue;
    }
    processCounts.set(signal.processName, (processCounts.get(signal.processName) ?? 0) + 1);
    for (const entry of signal.fmtEntries) {
      const tagName = entry.tagName.toLowerCase();
      const value = entry.value.toLowerCase();
      if (!(tagName.includes("duration") || tagName.includes("time") || tagName.includes("frame") || tagName.includes("hitch"))) {
        continue;
      }
      if (!value.includes("ms")) {
        continue;
      }
      const durationMs = toMaybeFormattedNumber(entry.value);
      if (durationMs !== undefined) {
        durations.push(durationMs);
      }
    }
  }
  const dominantProcess = [...processCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (durations.length === 0) {
    return { dominantProcess };
  }
  const slowFrameCount = durations.filter((duration) => duration > 16.67).length;
  const frozenFrameCount = durations.filter((duration) => duration > 700).length;
  const avgFrameTimeMs = Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2));
  const worstFrameTimeMs = Number(Math.max(...durations).toFixed(2));
  return { slowFrameCount, frozenFrameCount, avgFrameTimeMs, worstFrameTimeMs, dominantProcess };
}

function buildIosAllocationMetrics(exportXml: string): {
  allocationRowCount: number;
  largestAllocationKb?: number;
  totalAllocatedKb?: number;
  dominantProcess?: string;
  topAllocationCategories: string[];
  allocationCountByProcess: Record<string, number>;
} {
  const rowSignals = buildIosTemplateRowSignals(exportXml);
  const sizeValuesKb: number[] = [];
  const processCounts = new Map<string, number>();
  const processAllocatedKb = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  let allocationRowCount = 0;
  for (const signal of rowSignals) {
    if (!(signal.rowText.includes("alloc") || signal.rowText.includes("malloc") || signal.rowText.includes("vm:"))) {
      continue;
    }
    allocationRowCount += 1;
    processCounts.set(signal.processName, (processCounts.get(signal.processName) ?? 0) + 1);
    for (const entry of signal.fmtEntries) {
      if (entry.tagName.toLowerCase().includes("category") || entry.tagName.toLowerCase().includes("type") || entry.tagName.toLowerCase().includes("string")) {
        const label = decodeXmlEntities(entry.value).trim();
        if (label.length > 0 && (label.toLowerCase().includes("alloc") || label.toLowerCase().includes("malloc") || label.toLowerCase().includes("vm:"))) {
          categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
        }
      }
      const tagName = entry.tagName.toLowerCase();
      const sizeKb = tagName.includes("size") || tagName.includes("bytes") || tagName.includes("dirty") || tagName.includes("resident")
        ? toMaybeSizeKb(entry.value)
        : undefined;
      if (sizeKb !== undefined) {
        sizeValuesKb.push(sizeKb);
        processAllocatedKb.set(signal.processName, (processAllocatedKb.get(signal.processName) ?? 0) + sizeKb);
      }
    }
  }
  const totalAllocatedKb = sizeValuesKb.length > 0 ? Number(sizeValuesKb.reduce((sum, value) => sum + value, 0).toFixed(2)) : undefined;
  const dominantProcess = [...processCounts.entries()].sort((left, right) => {
    const rightKb = processAllocatedKb.get(right[0]) ?? 0;
    const leftKb = processAllocatedKb.get(left[0]) ?? 0;
    if (rightKb !== leftKb) {
      return rightKb - leftKb;
    }
    return right[1] - left[1];
  })[0]?.[0];
  return {
    allocationRowCount,
    largestAllocationKb: sizeValuesKb.length > 0 ? Number(Math.max(...sizeValuesKb).toFixed(2)) : undefined,
    totalAllocatedKb,
    dominantProcess,
    topAllocationCategories: [...categoryCounts.entries()].sort((left, right) => right[1] - left[1]).map(([name]) => name).slice(0, 5),
    allocationCountByProcess: Object.fromEntries([...processCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)),
  };
}

function buildEmptyIosAllocationMetrics(): {
  allocationRowCount: number;
  largestAllocationKb?: number;
  totalAllocatedKb?: number;
  dominantProcess?: string;
  topAllocationCategories: string[];
  allocationCountByProcess: Record<string, number>;
} {
  return {
    allocationRowCount: 0,
    largestAllocationKb: undefined,
    totalAllocatedKb: undefined,
    dominantProcess: undefined,
    topAllocationCategories: [],
    allocationCountByProcess: {},
  };
}

function extractIosTocTargetProcess(tocXml: string | undefined): string | undefined {
  if (!tocXml) {
    return undefined;
  }
  return extractXmlAttributeValue(tocXml, "process", "name");
}

function extractIosTocCaptureScope(tocXml: string | undefined): "attached_process" | "all_processes" | "unknown" {
  if (!tocXml) {
    return "unknown";
  }
  const processType = extractXmlAttributeValue(tocXml, "process", "type")?.toLowerCase();
  if (processType === "attached" || processType === "launched") {
    return "attached_process";
  }
  if (processType === "all-processes") {
    return "all_processes";
  }
  return "unknown";
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

function selectPreferredProcessName(primary: string | undefined, fallback: string | undefined): string | undefined {
  if (primary && primary !== "<unknown>") {
    return primary;
  }
  return fallback;
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
    .map((line) => line.replace(/\s+$/g, ""))
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith("Query executed in "))
    .map((line) => splitTraceProcessorRow(line))
    .filter((row) => row.length > 0);
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
  const parsedTopProcesses: PerformanceProcessSignal[] = (params.cpuRows ?? []).map((rawRow) => {
    const row = normalizeRightAnchoredRow(rawRow, 1);
    const scheduledMs = toMaybeNumber(row[1]);
    const cpuPercent = scheduledMs !== undefined ? Number(((scheduledMs / params.durationMs) * 100).toFixed(1)) : undefined;
    return {
      name: row[0] ?? "<unknown>",
      scheduledMs,
      cpuPercent,
    };
  });
  const topProcesses = [...parsedTopProcesses].sort((left, right) => {
    const leftMatches = matchesAndroidAppProcess(left.name, params.appId) ? 1 : 0;
    const rightMatches = matchesAndroidAppProcess(right.name, params.appId) ? 1 : 0;
    if (leftMatches !== rightMatches) {
      return rightMatches - leftMatches;
    }
    return (right.scheduledMs ?? 0) - (left.scheduledMs ?? 0);
  });
  const topHotspots: PerformanceHotspot[] = (params.hotspotRows ?? []).map((rawRow) => {
    const row = normalizeRightAnchoredRow(rawRow, rawRow.length >= 4 ? 3 : 2);
    const treatAsProcessAware = rawRow.length >= 4 && looksLikeProcessName(row[0]);
    const processName = treatAsProcessAware ? row[0] : undefined;
    const nameIndex = treatAsProcessAware ? 1 : 0;
    const durationIndex = treatAsProcessAware ? 2 : 2;
    const occurrencesIndex = treatAsProcessAware ? 3 : 3;
    const hotspotName = treatAsProcessAware ? row[nameIndex] : `${row[0] ?? ""} ${row[1] ?? ""}`.trim();
    return {
      processName,
      name: hotspotName || "<unknown>",
      totalDurMs: toMaybeNumber(row[durationIndex]),
      occurrences: toMaybeNumber(row[occurrencesIndex]),
    };
  }).sort((left, right) => {
    const leftAffinity = classifyAndroidHotspotAffinity(left.processName, params.appId);
    const rightAffinity = classifyAndroidHotspotAffinity(right.processName, params.appId);
    const rank = { target_app: 0, unknown: 1, system: 2 } as const;
    if (rank[leftAffinity] !== rank[rightAffinity]) {
      return rank[leftAffinity] - rank[rightAffinity];
    }
    return (right.totalDurMs ?? 0) - (left.totalDurMs ?? 0);
  }).slice(0, 5);
  const topCpu = topProcesses[0];
  const targetAppCpu = params.appId ? parsedTopProcesses.find((item) => matchesAndroidAppProcess(item.name, params.appId)) : undefined;
  const highestOverallCpu = parsedTopProcesses[0];
  const cpuSeverity = clampSeverity(topCpu?.cpuPercent, 35, 70);
  const cpuNote = targetAppCpu?.cpuPercent !== undefined
    ? highestOverallCpu && highestOverallCpu.name !== targetAppCpu.name
      ? `Target app ${targetAppCpu.name} used about ${String(targetAppCpu.cpuPercent)}% of the sampled CPU window; highest overall process was ${highestOverallCpu.name} at ${String(highestOverallCpu.cpuPercent ?? "unknown")}%.`
      : `Target app ${targetAppCpu.name} used about ${String(targetAppCpu.cpuPercent)}% of the sampled CPU window.`
    : topCpu?.cpuPercent !== undefined
      ? `Top scheduled process is ${topCpu.name} at roughly ${String(topCpu.cpuPercent)}% of the sampled window.`
    : params.cpuSource === "thread_state"
      ? "CPU pressure was inferred from running thread-state durations rather than sched slices."
    : params.tableNames.includes("sched")
      ? "CPU scheduling tables were available, but no dominant scheduled process was found."
      : "Perfetto sched data was not available for CPU summarization.";
  const cpu: PerformanceCpuSummary = {
    status: cpuSeverity,
    note: cpuNote,
    topProcess: (targetAppCpu ?? topCpu)?.name,
    topProcessCpuPercent: (targetAppCpu ?? topCpu)?.cpuPercent,
    topProcesses,
    topHotspots,
  };

  const frameRow = params.frameRows?.[0] ? normalizeRightAnchoredRow(params.frameRows[0], 4) : undefined;
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

  const memoryRow = params.memoryRows?.[0] ? normalizeRightAnchoredRow(params.memoryRows[0], 3) : undefined;
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
    dominantProcess: params.appId,
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
  const animationMetrics = params.template === "animation-hitches" && params.exportXml ? buildIosAnimationMetrics(params.exportXml) : {};
  const allocationMetrics = params.template === "memory" && params.exportXml ? buildIosAllocationMetrics(params.exportXml) : buildEmptyIosAllocationMetrics();
  const topProcesses = params.template === "time-profiler" && params.exportXml ? buildIosTopProcessesFromRows(params.exportXml, params.durationMs) : [];
  const topHotspots = params.template === "time-profiler" && params.exportXml ? buildIosHotspotsFromRows(params.exportXml) : [];
  const topCpu = topProcesses[0];
  const hasCpuSignal = topProcesses.length > 0 || topHotspots.length > 0;
  const tocTargetProcess = extractIosTocTargetProcess(params.tocXml);
  const captureScope = extractIosTocCaptureScope(params.tocXml);

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
    status: params.template === "animation-hitches" && (hasJankSignal || animationMetrics.avgFrameTimeMs !== undefined)
      ? clampSeverity(animationMetrics.worstFrameTimeMs ?? animationMetrics.slowFrameCount ?? (hitchMentions || frameMentions), 24, 48)
      : "unknown",
    note: params.template === "animation-hitches"
      ? animationMetrics.avgFrameTimeMs !== undefined
        ? `Animation Hitches export shows ${String(animationMetrics.slowFrameCount ?? 0)} slow frame(s) with average duration ${String(animationMetrics.avgFrameTimeMs)}ms${animationMetrics.dominantProcess ? `, concentrated in ${animationMetrics.dominantProcess}` : ""}.`
        : `Animation/Hitch export contains ${String(hitchMentions)} hitch-related token(s) and ${String(frameMentions)} frame token(s).`
      : "Animation hitch parsing was not requested by the selected template.",
    slowFrameCount: animationMetrics.slowFrameCount ?? (hitchMentions > 0 ? hitchMentions : undefined),
    frozenFrameCount: animationMetrics.frozenFrameCount,
    avgFrameTimeMs: animationMetrics.avgFrameTimeMs,
    worstFrameTimeMs: animationMetrics.worstFrameTimeMs,
  };
  const memory: PerformanceMemorySummary = {
    status: params.template === "memory" && (hasMemorySignal || allocationMetrics.allocationRowCount > 0)
      ? clampSeverity(allocationMetrics.largestAllocationKb ?? allocationMetrics.allocationRowCount, 1024, 8192)
      : "unknown",
    note: params.template === "memory"
      ? allocationMetrics.largestAllocationKb !== undefined
        ? `Allocations export highlights about ${String(allocationMetrics.allocationRowCount)} allocation-heavy row(s); the largest parsed allocation is roughly ${String(allocationMetrics.largestAllocationKb)} KB${allocationMetrics.totalAllocatedKb !== undefined ? ` with about ${String(allocationMetrics.totalAllocatedKb)} KB total parsed allocation volume` : ""}${allocationMetrics.dominantProcess ? ` in ${allocationMetrics.dominantProcess}` : tocTargetProcess ? ` in ${tocTargetProcess}` : ""}.`
        : tocTargetProcess
          ? `Allocations trace attached to ${tocTargetProcess} (${captureScope === "attached_process" ? "attached process" : "unknown scope"}), but the export did not contain allocation-sized rows this parser could summarize.`
          : `Allocations export contains ${String(allocationMentions)} allocation-related token(s); this is a lightweight signal, not a full heap analysis.`
      : "Memory parsing was not requested by the selected template.",
    dominantProcess: selectPreferredProcessName(allocationMetrics.dominantProcess, tocTargetProcess),
    allocationRowCount: allocationMetrics.allocationRowCount,
    largestAllocationKb: allocationMetrics.largestAllocationKb,
    totalAllocatedKb: allocationMetrics.totalAllocatedKb,
    topAllocationCategories: allocationMetrics.topAllocationCategories,
    allocationCountByProcess: allocationMetrics.allocationCountByProcess,
    memoryPressureSignal: summarizeMemoryPressureSignal(allocationMetrics.allocationRowCount, allocationMetrics.totalAllocatedKb, allocationMetrics.largestAllocationKb),
    captureScope,
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
  summary.confidence = topProcesses.length > 0 || topHotspots.length > 0 || animationMetrics.avgFrameTimeMs !== undefined || allocationMetrics.largestAllocationKb !== undefined
    ? "medium"
    : schemaNames.length > 0 ? "low" : "low";
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
    if (summary.cpu.topProcess && summary.cpu.topProcess !== "<unknown>") {
      suggestions.push(`Prioritize hotspot slices owned by ${summary.cpu.topProcess} before chasing system-wide CPU noise.`);
    }
    const dominantHotspot = summary.cpu.topHotspots[0];
    if (dominantHotspot?.processName) {
      suggestions.push(`Start with hotspot '${dominantHotspot.name}' in process ${dominantHotspot.processName}; it currently ranks highest among captured slices.`);
    }
  }
  if (summary.likelyCategory === "memory") {
    suggestions.push(`Inspect ${artifacts.summaryPath} for RSS or allocation signals before deeper trace exploration.`);
    if (summary.memory.captureScope === "attached_process" && summary.memory.dominantProcess) {
      suggestions.push(`Focus first on allocation categories owned by ${summary.memory.dominantProcess}; this capture was attached directly to that process.`);
    }
    if ((summary.memory.topAllocationCategories?.length ?? 0) > 0) {
      suggestions.push(`Inspect allocation category '${summary.memory.topAllocationCategories?.[0]}' first; it is currently the strongest parsed memory category.`);
    }
    if (summary.memory.memoryPressureSignal === "growth_spike") {
      suggestions.push(`The parsed memory shape looks spiky; inspect the largest allocation category and compare it against the exact user action window.`);
    } else if (summary.memory.memoryPressureSignal === "steady") {
      suggestions.push(`The parsed memory shape looks steady rather than spiky; compare allocation categories across repeated runs to check for persistent growth.`);
    }
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
