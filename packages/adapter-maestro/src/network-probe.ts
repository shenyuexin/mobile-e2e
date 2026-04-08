import type {
  NetworkProbeInput,
  NetworkProbeData,
  NetworkReadinessProbe,
  NetworkRecoveryStrategy,
  Platform,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { isIosPhysicalDeviceId, resolveAndroidAppPid } from "./device-runtime.js";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";
import { executeRunner } from "./runtime-shared.js";

const DEFAULT_PING_TIMEOUT_MS = 3000;
const DEFAULT_BACKEND_TIMEOUT_MS = 5000;
const DEFAULT_PROBE_TOTAL_BUDGET_MS = 10000;

function parsePingLatency(stdout: string): number | undefined {
  // Android: "rtt min/avg/max/mdev = 12.345/23.456/34.567/5.678 ms"
  // iOS: "round-trip min/avg/max/stddev = 12.345/23.456/34.567/5.678 ms"
  const avgMatch = stdout.match(/(?:avg|mean)[=/](\d+(?:\.\d+)?)/);
  if (avgMatch) return parseFloat(avgMatch[1]);
  // Fallback: try to extract any "time=X.XX ms" pattern
  const timeMatch = stdout.match(/time[=<](\d+(?:\.\d+)?)/);
  if (timeMatch) return parseFloat(timeMatch[1]);
  return undefined;
}

function parseCurlBackendResult(stdout: string): { reachable: boolean; latencyMs?: number } {
  // Expected format: "200 0.123" (http_code time_total)
  const parts = stdout.trim().split(/\s+/);
  if (parts.length >= 2) {
    const httpCode = parseInt(parts[0], 10);
    const timeTotal = parseFloat(parts[1]);
    return {
      reachable: httpCode >= 200 && httpCode < 400,
      latencyMs: Number.isFinite(timeTotal) ? Math.round(timeTotal * 1000) : undefined,
    };
  }
  // If only http code
  if (parts.length === 1) {
    const httpCode = parseInt(parts[0], 10);
    return { reachable: httpCode >= 200 && httpCode < 400 };
  }
  return { reachable: false };
}

async function probeAndroidNetwork(
  repoRoot: string,
  deviceId: string,
  backendUrl?: string,
): Promise<NetworkReadinessProbe> {
  let dnsOk = true;
  let connected = true;
  let latencyMs: number | undefined;
  let networkType: "wifi" | "cellular" | "ethernet" | "unknown" = "unknown";
  let backendReachable = true;
  let backendLatencyMs: number | undefined;

  // Step a: DNS check
  try {
    const dnsResult = await executeRunner(
      ["adb", "-s", deviceId, "shell", "getprop", "net.dns1"],
      repoRoot,
      process.env,
      { timeoutMs: DEFAULT_PING_TIMEOUT_MS },
    );
    const dns1 = dnsResult.stdout.trim();
    dnsOk = dns1.length > 0 && dns1 !== "" && !dnsResult.stdout.toLowerCase().includes("not found");
  } catch {
    dnsOk = false;
  }

  // Step b: Ping check
  try {
    const pingResult = await executeRunner(
      ["adb", "-s", deviceId, "shell", "ping", "-c", "1", "-W", "3", "8.8.8.8"],
      repoRoot,
      process.env,
      { timeoutMs: DEFAULT_PING_TIMEOUT_MS },
    );
    if (pingResult.exitCode === 0) {
      connected = true;
      latencyMs = parsePingLatency(pingResult.stdout);
    } else {
      connected = false;
    }
  } catch {
    connected = false;
  }

  // Step c: Backend check (if backendUrl provided)
  if (backendUrl) {
    try {
      // Use wget as curl may not be available on all Android shells
      const backendResult = await executeRunner(
        ["adb", "-s", deviceId, "shell", "wget", "--spider", "--timeout=5", "-q", backendUrl],
        repoRoot,
        process.env,
        { timeoutMs: DEFAULT_BACKEND_TIMEOUT_MS },
      );
      backendReachable = backendResult.exitCode === 0;
    } catch {
      backendReachable = false;
    }
  }

  // Step d: Network type detection
  try {
    const netTypeResult = await executeRunner(
      ["adb", "-s", deviceId, "shell", "dumpsys", "connectivity"],
      repoRoot,
      process.env,
      { timeoutMs: DEFAULT_PING_TIMEOUT_MS },
    );
    const output = netTypeResult.stdout.toLowerCase();
    if (output.includes("wifi") && output.includes("state: connected")) {
      networkType = "wifi";
    } else if (output.includes("mobile") || output.includes("cellular")) {
      networkType = "cellular";
    } else if (output.includes("ethernet")) {
      networkType = "ethernet";
    }
  } catch {
    // Best-effort: fall back to unknown
  }

  return {
    connected,
    latencyMs,
    type: networkType,
    dnsOk,
    backendReachable,
    backendLatencyMs,
    platform: "android",
  };
}

async function probeIosSimulatorNetwork(
  repoRoot: string,
  deviceId: string,
  backendUrl?: string,
): Promise<NetworkReadinessProbe> {
  let connected = true;
  let latencyMs: number | undefined;
  let backendReachable = true;
  let backendLatencyMs: number | undefined;

  // Step a: Ping check via simctl
  try {
    const pingResult = await executeRunner(
      ["xcrun", "simctl", "spawn", deviceId, "ping", "-c", "1", "-W", "3", "8.8.8.8"],
      repoRoot,
      process.env,
      { timeoutMs: DEFAULT_PING_TIMEOUT_MS },
    );
    if (pingResult.exitCode === 0) {
      connected = true;
      latencyMs = parsePingLatency(pingResult.stdout);
    } else {
      connected = false;
    }
  } catch {
    connected = false;
  }

  // Backend check (host-side, since simctl spawn may not have curl/wget)
  if (backendUrl) {
    try {
      const backendResult = await executeRunner(
        ["xcrun", "simctl", "spawn", deviceId, "curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total}", backendUrl],
        repoRoot,
        process.env,
        { timeoutMs: DEFAULT_BACKEND_TIMEOUT_MS },
      );
      if (backendResult.exitCode === 0) {
        const parsed = parseCurlBackendResult(backendResult.stdout);
        backendReachable = parsed.reachable;
        backendLatencyMs = parsed.latencyMs;
      } else {
        backendReachable = false;
      }
    } catch {
      backendReachable = false;
    }
  }

  // Simulators always use WiFi
  return {
    connected,
    latencyMs,
    type: "wifi" as const,
    dnsOk: true, // Simulator inherits host DNS
    backendReachable,
    backendLatencyMs,
    platform: "ios",
  };
}

async function probeIosPhysicalDeviceNetwork(
  _repoRoot: string,
  _deviceId: string,
  _backendUrl?: string,
): Promise<NetworkReadinessProbe> {
  // Physical iOS devices have limited probing capabilities.
  // devicectl network info requires pairing and specific entitlements.
  // Return honest, limited capabilities.
  return {
    connected: true,
    type: "unknown",
    dnsOk: true,
    backendReachable: true,
    platform: "ios",
    probeNote: "Physical iOS device probing is limited — returning assumed healthy network state. Active probing requires device pairing and entitlements not available in this context.",
  };
}

export async function probeNetworkReadiness(input: NetworkProbeInput): Promise<ToolResult<NetworkProbeData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const platform = input.platform ?? "android";
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const deviceId = input.deviceId ?? "";
  const backendUrl = input.backendUrl;

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        probe: {
          connected: true,
          type: "unknown",
          dnsOk: true,
          backendReachable: true,
          platform,
          probeNote: "Dry run — no actual network probe was performed.",
        },
        durationMs: 0,
      },
      nextSuggestions: ["Remove dryRun flag to perform an actual network readiness probe."],
    };
  }

  if (!deviceId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        probe: {
          connected: false,
          type: "unknown",
          dnsOk: false,
          backendReachable: false,
          platform,
          probeNote: "Device ID is required for network probing.",
        },
        durationMs: Date.now() - startTime,
      },
      nextSuggestions: ["Provide deviceId explicitly or ensure the session context can resolve it."],
    };
  }

  let probe: NetworkReadinessProbe;

  if (platform === "android") {
    probe = await probeAndroidNetwork(repoRoot, deviceId, backendUrl);
  } else if (platform === "ios") {
    const isPhysical = isIosPhysicalDeviceId(deviceId);
    if (isPhysical) {
      probe = await probeIosPhysicalDeviceNetwork(repoRoot, deviceId, backendUrl);
    } else {
      probe = await probeIosSimulatorNetwork(repoRoot, deviceId, backendUrl);
    }
  } else {
    return {
      status: "failed",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        probe: {
          connected: false,
          type: "unknown",
          dnsOk: false,
          backendReachable: false,
          platform,
          probeNote: `Unsupported platform: ${platform}.`,
        },
        durationMs: Date.now() - startTime,
      },
      nextSuggestions: [`Network probing is only supported on Android and iOS. Received: ${platform}`],
    };
  }

  const durationMs = Date.now() - startTime;
  const recoveryStrategy = classifyNetworkRecoveryStrategy(probe);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs,
    attempts: 1,
    artifacts: [],
    data: {
      probe,
      recoveryStrategy,
      durationMs,
    },
    nextSuggestions: recoveryStrategy && recoveryStrategy.strategy !== "none"
      ? [
          `Network recovery suggestion: ${recoveryStrategy.strategy}. Reason: ${recoveryStrategy.reason}`,
          ...(recoveryStrategy.maxRetries ? [`Max retries: ${recoveryStrategy.maxRetries}`] : []),
          ...(recoveryStrategy.timeoutMs ? [`Timeout: ${recoveryStrategy.timeoutMs}ms`] : []),
        ]
      : ["Network appears healthy — no recovery action needed."],
  };
}

export function classifyNetworkRecoveryStrategy(
  probe: NetworkReadinessProbe,
  _failureCategory?: string,
): NetworkRecoveryStrategy {
  // a. No network connectivity
  if (!probe.connected) {
    return {
      strategy: "toggle_airplane_mode",
      reason: "No network connectivity detected",
      maxRetries: 1,
    };
  }

  // b. High latency (> 1000ms)
  if (probe.latencyMs && probe.latencyMs > 1000) {
    return {
      strategy: "retry_extended_timeout",
      reason: "High latency detected",
      timeoutMs: 30000,
    };
  }

  // c. DNS resolution failed
  if (!probe.dnsOk) {
    return {
      strategy: "check_network_config",
      reason: "DNS resolution failed",
    };
  }

  // d. Backend unreachable but network is up
  if (!probe.backendReachable && probe.connected) {
    return {
      strategy: "wait_and_retry",
      reason: "Backend unreachable but network is up — likely server-side issue",
      maxRetries: 3,
    };
  }

  // e. Connected but slow (latency > 500ms)
  if (probe.connected && probe.latencyMs && probe.latencyMs > 500) {
    return {
      strategy: "bounded_wait_for_backend",
      reason: "Slow network, bounded wait recommended",
      timeoutMs: 15000,
    };
  }

  // f. Default: network is healthy
  return {
    strategy: "none",
    reason: "Network appears healthy",
  };
}
