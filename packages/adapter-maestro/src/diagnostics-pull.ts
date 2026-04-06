import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeRunner, shellEscape } from "./runtime-shared.js";

const DEFAULT_MAX_LINES = 20_000;
const DEFAULT_MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024; // 80MB
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_TOTAL_BUDGET_MS = 180_000;

export interface BoundedReadOptions {
  deviceId: string;
  remotePath: string;
  /** Max lines to read via shell cat. Default: 2000 (~100-200KB) */
  maxLines?: number;
  /** Fallback to adb pull if shell cat fails. Default: true */
  allowPullFallback?: boolean;
  /** Max file size in bytes for pull fallback. Default: 2MB */
  maxFileSizeBytes?: number;
  /** Timeout per operation in ms. Default: 10000 */
  timeoutMs?: number;
}

export interface BoundedReadResult {
  content: string;
  status: "success" | "timeout" | "too_large" | "not_found" | "permission_denied" | "read_failed";
  readMethod: "shell_cat" | "adb_pull";
  bytesRead: number;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Read a remote file with bounded guardrails.
 * Primary: adb shell "cat <escaped> | head -N" (natural size limit)
 * Fallback: adb pull with timeout + size guardrails
 */
export async function boundedRemoteFileRead(
  repoRoot: string,
  options: BoundedReadOptions,
): Promise<BoundedReadResult> {
  const {
    deviceId,
    remotePath,
    maxLines = DEFAULT_MAX_LINES,
    allowPullFallback = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const startTime = Date.now();

  // Step 1: Shell cat with head limit (natural size guard)
  const escapedPath = shellEscape(remotePath);
  const catResult = await executeRunner(
    ["adb", "-s", deviceId, "shell", `cat ${escapedPath} | head -n ${maxLines}`],
    repoRoot,
    process.env,
    { timeoutMs },
  );

  // executeRunner returns exitCode: null on timeout
  if (catResult.exitCode !== null && catResult.exitCode === 0 && catResult.stdout.trim().length > 0) {
    return {
      content: catResult.stdout,
      status: "success",
      readMethod: "shell_cat",
      bytesRead: Buffer.byteLength(catResult.stdout, "utf8"),
      durationMs: Date.now() - startTime,
    };
  }

  // Step 2: If cat failed and pull fallback is allowed
  if (!allowPullFallback) {
    return {
      content: "",
      status: catResult.exitCode === null ? "timeout" : "permission_denied",
      readMethod: "shell_cat",
      bytesRead: 0,
      errorMessage: catResult.stderr || "shell cat failed",
      durationMs: Date.now() - startTime,
    };
  }

  // Step 3: Bounded adb pull fallback
  return boundedAdbPullFallback({
    deviceId,
    remotePath,
    startTime,
    remainingBudgetMs: timeoutMs,
    timeoutMs,
  });
}

async function boundedAdbPullFallback(params: {
  deviceId: string;
  remotePath: string;
  startTime: number;
  remainingBudgetMs: number;
  timeoutMs?: number;
}): Promise<BoundedReadResult> {
  if (params.remainingBudgetMs <= 0) {
    return { content: "", status: "timeout", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
  }

  const sizeCheckTimeout = Math.min(5000, params.remainingBudgetMs * 0.3);
  const pullTimeout = Math.min(params.timeoutMs ?? DEFAULT_TIMEOUT_MS, params.remainingBudgetMs * 0.7);

  // Size check (best-effort)
  const size = await checkRemoteFileSize(params.deviceId, params.remotePath, sizeCheckTimeout);
  if (size === "not_found") {
    return { content: "", status: "not_found", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
  }
  if (size === "too_large") {
    return { content: "", status: "too_large", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
  }
  // "check_failed" — proceed with pull, timeout will act as guardrail

  // Pull with timeout
  const escapedPath = shellEscape(params.remotePath);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "m2e-diagnostics-"));
  try {
    const pullResult = await executeRunner(
      ["adb", "-s", params.deviceId, "pull", escapedPath, tempDir],
      process.cwd(),
      process.env,
      { timeoutMs: pullTimeout },
    );

    if (pullResult.exitCode === null) {
      return { content: "", status: "timeout", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
    }
    if (pullResult.exitCode !== 0) {
      return { content: "", status: "read_failed", readMethod: "adb_pull", bytesRead: 0, errorMessage: pullResult.stderr, durationMs: Date.now() - params.startTime };
    }

    const fileName = path.basename(params.remotePath);
    const content = await readFile(path.join(tempDir, fileName), "utf8");
    return {
      content,
      status: "success",
      readMethod: "adb_pull",
      bytesRead: Buffer.byteLength(content, "utf8"),
      durationMs: Date.now() - params.startTime,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type FileSizeResult = number | "not_found" | "too_large" | "check_failed";

/**
 * Check remote file size with 3-level fallback.
 * Level 1: stat -c %s (Android 8.0+)
 * Level 2: wc -c < file (most Android versions, O(1) via fstat)
 * Level 3: cat file | wc -c (O(n), best-effort, expected to timeout for large files)
 */
export async function checkRemoteFileSize(
  deviceId: string,
  remotePath: string,
  timeoutMs: number,
): Promise<FileSizeResult> {
  const maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES;
  const escapedPath = shellEscape(remotePath);

  // Level 1: stat -c %s
  let result = await executeRunner(
    ["adb", "-s", deviceId, "shell", `stat -c %s ${escapedPath}`],
    process.cwd(),
    process.env,
    { timeoutMs },
  );
  if (result.exitCode !== null && result.exitCode === 0) {
    const size = parseInt(result.stdout.trim(), 10);
    if (!Number.isFinite(size)) return "check_failed";
    if (size > maxBytes) return "too_large";
    return size;
  }

  // Level 2: wc -c < file
  result = await executeRunner(
    ["adb", "-s", deviceId, "shell", `wc -c < ${escapedPath}`],
    process.cwd(),
    process.env,
    { timeoutMs },
  );
  if (result.exitCode !== null && result.exitCode === 0) {
    const size = parseInt(result.stdout.trim(), 10);
    if (!Number.isFinite(size)) return "check_failed";
    if (size > maxBytes) return "too_large";
    return size;
  }

  // Level 3: cat | wc -c — O(n), streams entire file. Best-effort only.
  result = await executeRunner(
    ["adb", "-s", deviceId, "shell", `cat ${escapedPath} | wc -c`],
    process.cwd(),
    process.env,
    { timeoutMs },
  );
  if (result.exitCode !== null && result.exitCode === 0) {
    const size = parseInt(result.stdout.trim(), 10);
    if (!Number.isFinite(size)) return "check_failed";
    if (size > maxBytes) return "too_large";
    return size;
  }

  return "check_failed";
}

/**
 * Read multiple remote files sequentially with dynamic remaining budget.
 */
export async function boundedRemoteFileReadBatch(
  repoRoot: string,
  params: {
    deviceId: string;
    remotePaths: string[];
    maxFiles?: number;
    maxLines?: number;
    totalBudgetMs?: number;
    timeoutMs?: number;
  },
): Promise<BoundedReadResult[]> {
  const startTime = Date.now();
  const totalBudget = params.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const maxFiles = params.maxFiles ?? 3;
  const results: BoundedReadResult[] = [];

  for (const remotePath of params.remotePaths.slice(0, maxFiles)) {
    const elapsed = Date.now() - startTime;
    const remainingBudget = totalBudget - elapsed;
    if (remainingBudget <= 0) break;

    const result = await boundedRemoteFileRead(repoRoot, {
      deviceId: params.deviceId,
      remotePath,
      maxLines: params.maxLines,
      timeoutMs: Math.min(params.timeoutMs ?? DEFAULT_TIMEOUT_MS, remainingBudget),
      allowPullFallback: true,
    });
    results.push(result);
  }

  return results;
}

/**
 * Parse minimal ANR trace metadata from raw content.
 * Extracts processName, pid, signal — no over-structured thread parsing.
 */
export function parseAnrTraceMetadata(content: string): {
  processName?: string;
  pid?: string;
  signal?: string;
} {
  const result: { processName?: string; pid?: string; signal?: string } = {};

  // PID: "----- pid 12345 at 2026-04-05 10:30:00 -----"
  const pidMatch = content.match(/-----\s*pid\s+(\d+)\s+at\s/);
  if (pidMatch) {
    result.pid = pidMatch[1];
  }

  // Process name: "Cmd line: com.example.app"
  const cmdMatch = content.match(/Cmd line:\s*(.+)/);
  if (cmdMatch) {
    result.processName = cmdMatch[1].trim().split(/\s/)[0];
  }

  // Signal: "Input dispatching timed out" or "Key dispatching timed out"
  const timeoutMatch = content.match(/((?:Input|Key)\s+dispatching\s+timed\s+out[^)]*)/);
  if (timeoutMatch) {
    result.signal = timeoutMatch[1].trim();
  }

  return result;
}
