import { spawn } from "node:child_process";
import path from "node:path";
import type { ExecutionEvidence, ReasonCode } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

export interface CommandExecution {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CommandExecutionOptions {
  timeoutMs?: number;
}

export function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

export function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function countNonEmptyLines(content: string): number {
  return content
    .replaceAll(String.fromCharCode(13), "")
    .split(String.fromCharCode(10))
    .filter((line) => line.length > 0)
    .length;
}

export function buildExecutionEvidence(kind: ExecutionEvidence["kind"], pathValue: string, supportLevel: "full" | "partial", description: string): ExecutionEvidence {
  return { kind, path: pathValue, supportLevel, description };
}

export function toRelativePath(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

export function buildFailureReason(stderr: string, exitCode: number | null): ReasonCode {
  const combined = stderr.toLowerCase();
  if (combined.includes("install_failed_version_downgrade") || combined.includes("failed to install")) {
    return REASON_CODES.configurationError;
  }
  if (combined.includes("maestro") && combined.includes("not found")) {
    return REASON_CODES.adapterError;
  }
  if (combined.includes("adb") || combined.includes("simctl") || combined.includes("device")) {
    return REASON_CODES.deviceUnavailable;
  }
  if (exitCode === 0) {
    return REASON_CODES.flowFailed;
  }
  return REASON_CODES.adapterError;
}

export async function executeRunner(command: string[], repoRoot: string, env: NodeJS.ProcessEnv, options: CommandExecutionOptions = {}): Promise<CommandExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options.timeoutMs;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      child.removeAllListeners();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.disconnect?.();
      if (timeout) {
        clearTimeout(timeout);
      }
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    if (typeof timeoutMs === "number") {
      timeout = setTimeout(() => {
        stderr += `${stderr.endsWith("\n") || stderr.length === 0 ? "" : "\n"}Command timed out after ${String(timeoutMs)}ms`;
        try {
          child.kill("SIGKILL");
        } catch {
        }
        finish(() => resolve({ exitCode: null, stdout, stderr }));
      }, timeoutMs);
      unrefTimer(timeout);
    }

    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (exitCode) => finish(() => resolve({ exitCode, stdout, stderr })));
  });
}
