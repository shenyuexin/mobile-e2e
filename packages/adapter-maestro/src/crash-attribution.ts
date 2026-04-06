import type { CrashAttribution, CrashType, Platform } from "@mobile-e2e-mcp/contracts";

const CHEAP_CRASH_SIGNALS = ["FATAL", "SIGSEGV", "SIGABRT", "SIGBUS", "SIGKILL", "EXC_", "Exception", "ANR in", "dispatching timed out", "lowmemorykiller", "jetsam", "watchdog"];

const CRASH_TYPE_PRIORITY: CrashType[] = [
  "anr",
  "native_crash",
  "watchdog",
  "oom",
  "uncaught_exception",
  "unknown",
];

interface CauseHeuristic {
  pattern: RegExp;
  cause: string;
  confidence: "high" | "medium" | "low";
}

const CAUSE_HEURISTICS: CauseHeuristic[] = [
  { pattern: /ANR[\s\S]*?ViewRootImpl|ANR[\s\S]*?Choreographer|dispatching timed out.*main/i, cause: "UI thread blocked in ViewRootImpl/Choreographer", confidence: "high" },
  { pattern: /dispatching timed out/i, cause: "UI thread blocked (ANR)", confidence: "medium" },
  { pattern: /ANR.*Binder|ANR.*IPC|dispatching timed out.*Binder/i, cause: "Slow IPC/Binder call", confidence: "medium" },
  { pattern: /SIGSEGV.*0x0{2,}|KERN_INVALID_ADDRESS at 0x0{2,}/i, cause: "Null pointer dereference", confidence: "high" },
  { pattern: /SIGABRT.*abort|EXC_CRASH.*abort/i, cause: "Assertion failure or explicit abort", confidence: "medium" },
  { pattern: /EXC_BAD_ACCESS.*KERN_INVALID_ADDRESS/i, cause: "Dangling pointer or null memory access", confidence: "high" },
  { pattern: /EXC_CRASH.*SIGKILL.*jetsam|EXC_CRASH.*SIGKILL.*memory/i, cause: "Memory pressure kill (jetsam)", confidence: "high" },
  { pattern: /FATAL EXCEPTION.*java\.lang\./i, cause: "Uncaught Java exception", confidence: "medium" },
  { pattern: /unrecognized selector sent to instance/i, cause: "Objective-C unrecognized selector", confidence: "medium" },
  { pattern: /watchdog.*terminated|hung.*process/i, cause: "Watchdog killed unresponsive process", confidence: "high" },
];

const SUGGESTED_ACTIONS: Record<string, string[]> = {
  "UI thread": [
    "Check for long-running operations on main thread",
    "Profile with StrictMode enabled",
    "Search for synchronous I/O in ViewRootImpl call chain",
  ],
  "Slow IPC": [
    "Check Binder thread pool saturation",
    "Profile cross-process calls with systrace",
    "Look for synchronous content provider queries on main thread",
  ],
  "Null pointer": [
    "Check native crash logs for exact fault address",
    "Review recent native code changes for null checks",
    "Run with AddressSanitizer enabled",
  ],
  "Assertion": [
    "Check abort() call sites in native code",
    "Review recent assert conditions",
    "Run with debug symbols for exact location",
  ],
  "Memory pressure": [
    "Profile memory usage with Xcode Instruments / Android Profiler",
    "Check for memory leaks in image loading",
    "Review large bitmap allocations",
  ],
  "Uncaught Java": [
    "Check top frames for the exception source",
    "Add global exception handler for crash reporting",
    "Review recent code changes for null safety",
  ],
  "Watchdog": [
    "Check main thread responsiveness",
    "Profile for deadlocks or long-held locks",
    "Review background thread synchronization",
  ],
  "UI thread blocked": [
    "Check for long-running operations on main thread",
    "Profile with StrictMode enabled",
    "Search for synchronous I/O in ViewRootImpl call chain",
  ],
};

export function detectCrashTypes(content: string, _platform: Platform): CrashType[] {
  const types: CrashType[] = [];
  if (/ANR in|dispatching timed out/i.test(content)) types.push("anr");
  if (/FATAL EXCEPTION|java\.lang\./i.test(content)) types.push("uncaught_exception");
  if (/SIGSEGV|SIGABRT|SIGBUS|signal \d|EXC_BAD_ACCESS/i.test(content)) types.push("native_crash");
  if (/lowmemorykiller|jetsam|EXC_CRASH.*SIGKILL|killed.*memory/i.test(content)) types.push("oom");
  if (/watchdog|hung (?:thread|process)/i.test(content)) types.push("watchdog");
  if (types.length === 0) types.push("unknown");
  return types;
}

export function selectPrimaryCrashType(types: CrashType[]): CrashType {
  for (const candidate of CRASH_TYPE_PRIORITY) {
    if (types.includes(candidate)) return candidate;
  }
  return "unknown";
}

export function buildCrashAttribution(content: string, platform: Platform): CrashAttribution | undefined {
  // Cheap pre-check: skip if no crash-like signals
  const hasAnyCrashSignal = CHEAP_CRASH_SIGNALS.some((s) => content.toLowerCase().includes(s.toLowerCase()));
  if (!hasAnyCrashSignal) return undefined;

  const crashTypes = detectCrashTypes(content, platform);
  const primaryCrashType = selectPrimaryCrashType(crashTypes);

  // Extract process name
  let processName: string | undefined;
  const androidProcMatch = content.match(/Cmd line:\s*(\S+)/);
  const iosProcMatch = content.match(/Process:\s*(.+?)\s*\[/);
  if (androidProcMatch) processName = androidProcMatch[1];
  else if (iosProcMatch) processName = iosProcMatch[1].trim();

  // Extract signal
  let signal: string | undefined;
  const anrSignal = content.match(/((?:Input|Key)\s+dispatching\s+timed\s+out[^)]*)/);
  const nativeSignal = content.match(/(SIGSEGV|SIGABRT|SIGBUS|EXC_BAD_ACCESS|EXC_CRASH)[^]*/);
  if (anrSignal) signal = anrSignal[1].trim();
  else if (nativeSignal) signal = nativeSignal[1];

  // Extract fault address
  let faultAddress: string | undefined;
  const addrMatch = content.match(/at (0x[0-9a-fA-F]+)/i);
  if (addrMatch) faultAddress = addrMatch[1];

  // Extract crashed thread info
  let crashedThread: CrashAttribution["crashedThread"];
  const threadMatch = content.match(/"(\w+)".*?(tid=\d+)\s+(\w+)/);
  if (threadMatch) {
    const topFrames = content
      .split("\n")
      .filter((l) => /^\s+at\s+/.test(l) || /^\s*\d+\s+\S+/.test(l))
      .map((l) => l.trim())
      .slice(0, 10);
    crashedThread = { name: threadMatch[1], state: threadMatch[3], topFrames };
  }

  // Determine suspected cause and confidence
  let suspectedCause: string | undefined;
  let confidence: "high" | "medium" | "low" = "low";
  for (const heuristic of CAUSE_HEURISTICS) {
    if (heuristic.pattern.test(content)) {
      suspectedCause = heuristic.cause;
      confidence = heuristic.confidence;
      break;
    }
  }

  // Build related signals
  const relatedSignals: string[] = [];
  const binderMatches = content.match(/Binder:\d+_\d+/g);
  if (binderMatches) relatedSignals.push(...binderMatches.slice(0, 3));

  // Build suggested actions
  const suggestedActions: string[] = [];
  const causeKey = Object.keys(SUGGESTED_ACTIONS).find((k) => suspectedCause?.toLowerCase().includes(k.toLowerCase()));
  if (causeKey) suggestedActions.push(...SUGGESTED_ACTIONS[causeKey]);
  if (suggestedActions.length === 0) {
    suggestedActions.push("Review crash log for top stack frames", "Check recent code changes for potential causes");
  }

  return {
    crashTypes,
    primaryCrashType,
    processName,
    signal,
    faultAddress,
    crashedThread,
    suspectedCause,
    confidence,
    relatedSignals,
    suggestedActions,
  };
}
