import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InspectUiNode, InspectUiSummary, Platform, QueryUiInput, QueryUiMatch, ReasonCode } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { buildInspectUiSummary, parseAndroidUiHierarchyNodes, parseIosInspectNodes, queryUiNodes } from "./ui-model.js";
import { executeRunner, type CommandExecution, buildFailureReason } from "./runtime-shared.js";

export interface AndroidUiSnapshot {
  command: string[];
  readCommand: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  readExecution: CommandExecution;
  nodes: InspectUiNode[];
  summary?: InspectUiSummary;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}

export interface AndroidUiSnapshotFailure {
  reasonCode: ReasonCode;
  exitCode: number | null;
  outputPath: string;
  command: string[];
  message: string;
}

export interface IosUiSnapshot {
  command: string[];
  relativeOutputPath: string;
  absoluteOutputPath: string;
  execution: CommandExecution;
  nodes: InspectUiNode[];
  summary?: InspectUiSummary;
  queryResult: { totalMatches: number; matches: QueryUiMatch[] };
}

export interface IosUiSnapshotFailure {
  reasonCode: ReasonCode;
  exitCode: number | null;
  outputPath: string;
  command: string[];
  message: string;
}

function resolveExecutableFromPath(executableName: string): string | undefined {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, executableName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolveConfiguredExecutable(configuredValue: string | undefined, fallbackExecutableName: string): string | undefined {
  if (configuredValue) {
    if (configuredValue.includes(path.sep)) {
      if (!existsSync(configuredValue)) {
        throw new Error(`Configured executable path does not exist: ${configuredValue}`);
      }
      return configuredValue;
    }
    const resolvedConfiguredValue = resolveExecutableFromPath(configuredValue);
    if (!resolvedConfiguredValue) {
      throw new Error(`Configured executable was not found on PATH: ${configuredValue}`);
    }
    return resolvedConfiguredValue;
  }
  return resolveExecutableFromPath(fallbackExecutableName);
}

export function resolveIdbCliPath(): string | undefined {
  return resolveConfiguredExecutable(process.env.IDB_CLI_PATH, "idb");
}

export function resolveIdbCompanionPath(): string | undefined {
  return resolveConfiguredExecutable(process.env.IDB_COMPANION_PATH, "idb_companion");
}

export function buildIdbCommand(baseArgs: string[]): string[] {
  const idbCliPath = resolveIdbCliPath() ?? "idb";
  const companionPath = resolveIdbCompanionPath();
  return companionPath ? [idbCliPath, "--companion-path", companionPath, ...baseArgs] : [idbCliPath, ...baseArgs];
}

export async function probeIdbAvailability(repoRoot: string): Promise<CommandExecution | undefined> {
  return executeRunner(buildIdbCommand(["--help"]), repoRoot, process.env).catch(() => undefined);
}

export function buildAndroidUiDumpCommands(deviceId: string): { dumpCommand: string[]; readCommand: string[] } {
  return {
    dumpCommand: ["adb", "-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/view.xml"],
    readCommand: ["adb", "-s", deviceId, "shell", "cat", "/sdcard/view.xml"],
  };
}

export function buildIosUiDescribeCommand(deviceId: string): string[] {
  return buildIdbCommand(["ui", "describe-all", "--udid", deviceId, "--json", "--nested"]);
}

export function buildIosSwipeCommand(deviceId: string, swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number }): string[] {
  return buildIdbCommand(["ui", "swipe", String(swipe.start.x), String(swipe.start.y), String(swipe.end.x), String(swipe.end.y), "--duration", String(swipe.durationMs / 1000), "--udid", deviceId]);
}

export function isAndroidUiSnapshotFailure(value: AndroidUiSnapshot | AndroidUiSnapshotFailure): value is AndroidUiSnapshotFailure {
  return "message" in value;
}

export function isIosUiSnapshotFailure(value: IosUiSnapshot | IosUiSnapshotFailure): value is IosUiSnapshotFailure {
  return "message" in value;
}

export async function captureAndroidUiSnapshot(repoRoot: string, deviceId: string, sessionId: string, runnerProfile: string, outputPath: string | undefined, query: QueryUiInput): Promise<AndroidUiSnapshot | AndroidUiSnapshotFailure> {
  const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "ui-dumps", sessionId, `android-${runnerProfile}.xml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return { reasonCode: buildFailureReason(dumpExecution.stderr, dumpExecution.exitCode), exitCode: dumpExecution.exitCode, outputPath: relativeOutputPath, command, message: "Check Android device state and ensure uiautomator dump is permitted before retrying UI resolution." };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }
  const nodes = readExecution.exitCode === 0 ? parseAndroidUiHierarchyNodes(readExecution.stdout) : [];
  const summary = readExecution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = readExecution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return { command, readCommand, relativeOutputPath, absoluteOutputPath, readExecution, nodes, summary, queryResult };
}

export async function captureIosUiSnapshot(repoRoot: string, deviceId: string, sessionId: string, runnerProfile: string, outputPath: string | undefined, query: QueryUiInput): Promise<IosUiSnapshot | IosUiSnapshotFailure> {
  const relativeOutputPath = outputPath ?? path.posix.join("artifacts", "ui-dumps", sessionId, `ios-${runnerProfile}.json`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);
  const command = buildIosUiDescribeCommand(deviceId);
  const idbProbe = await probeIdbAvailability(repoRoot);
  if (!idbProbe || idbProbe.exitCode !== 0) {
    return { reasonCode: REASON_CODES.configurationError, exitCode: idbProbe?.exitCode ?? null, outputPath: relativeOutputPath, command, message: "iOS hierarchy capture requires idb. Install fb-idb and idb_companion, or fix IDB_CLI_PATH/IDB_COMPANION_PATH before retrying." };
  }

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const execution = await executeRunner(command, repoRoot, process.env);
  if (execution.exitCode === 0) {
    await writeFile(absoluteOutputPath, execution.stdout, "utf8");
  }
  const nodes = execution.exitCode === 0 ? parseIosInspectNodes(execution.stdout) : [];
  const summary = execution.exitCode === 0 ? buildInspectUiSummary(nodes) : undefined;
  const queryResult = execution.exitCode === 0 ? queryUiNodes(nodes, query) : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return { command, relativeOutputPath, absoluteOutputPath, execution, nodes, summary, queryResult };
}
