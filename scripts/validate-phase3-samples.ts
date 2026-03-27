import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHarnessConfig } from "../packages/adapter-maestro/src/harness-config.ts";
import { buildSessionAuditRelativePath, buildSessionRecordRelativePath } from "../packages/core/src/index.ts";

type Platform = "android" | "ios";

interface HarnessPhase3Validation {
  runnerProfile: string;
  platform: Platform;
  sampleName: string;
  runnerScript: string;
  artifactRoot: string;
  appId: string;
  flows: string[];
}

interface ProfileRecord {
  status: string;
  sample: string;
  platforms: string[];
}

interface MatrixRow {
  profile: string;
  status: string;
  sample: string;
  ios: string;
  android: string;
}

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string for ${key}.`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Expected non-empty string array for ${key}.`);
  }
  return value as string[];
}

async function runCli(cliArgs: string[]): Promise<unknown> {
  const repoRoot = repoRootFromScript();
  const commandArgs = [
    "--filter",
    "@shenyuexin/mobile-e2e-mcp",
    "exec",
    "tsx",
    "src/dev-cli.ts",
    ...cliArgs,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("pnpm", commandArgs, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`CLI command failed (${String(code)}): ${stderr || stdout}`));
    });
  });

  const trimmed = output.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const jsonPayload = firstBrace >= 0 && lastBrace >= firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
  return JSON.parse(jsonPayload);
}

async function loadHarnessPhase3Validations(repoRoot: string): Promise<HarnessPhase3Validation[]> {
  const parsed: unknown = await parseHarnessConfig(repoRoot, "configs/harness/sample-harness.yaml");
  if (!isRecord(parsed) || !isRecord(parsed.phase3_validations)) {
    throw new Error("Invalid sample-harness.yaml: missing phase3_validations.");
  }

  return Object.entries(parsed.phase3_validations)
    .filter(([, value]) => isRecord(value) && value.enabled !== false)
    .map(([runnerProfile, value]) => {
      const record = value as Record<string, unknown>;
      const platform = runnerProfile.endsWith("_ios") ? "ios" : "android";
      return {
        runnerProfile,
        platform,
        sampleName: readString(record, "sample_name"),
        runnerScript: readString(record, "runner_script"),
        artifactRoot: readString(record, "artifact_root"),
        appId: readString(record, "app_id"),
        flows: readStringArray(record, "flows"),
      } satisfies HarnessPhase3Validation;
    });
}

async function loadProfileRecord(repoRoot: string, profileName: string): Promise<ProfileRecord> {
  const raw = await readFile(path.join(repoRoot, `configs/profiles/${profileName}.yaml`), "utf8");
  const status = raw.match(/^status:\s*(.+)$/m)?.[1]?.trim();
  const sample = raw.match(/^\s+sample:\s*(.+)$/m)?.[1]?.trim();
  const platforms = Array.from(raw.matchAll(/^\s+-\s+(.+)$/gm)).map((match) => match[1]?.trim() ?? "").filter(Boolean);
  if (!status || !sample || platforms.length === 0) {
    throw new Error(`Invalid profile config for ${profileName}.`);
  }
  return {
    status,
    sample,
    platforms,
  };
}

async function loadMatrixRows(repoRoot: string): Promise<Map<string, MatrixRow>> {
  const raw = await readFile(path.join(repoRoot, "configs/matrices/framework-profile-matrix.md"), "utf8");
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.startsWith("|---"))
    .slice(1);

  const matrix = new Map<string, MatrixRow>();
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) {
      continue;
    }
    matrix.set(cells[0] ?? "", {
      profile: cells[0] ?? "",
      status: cells[1] ?? "",
      sample: cells[2] ?? "",
      ios: cells[3] ?? "",
      android: cells[4] ?? "",
    });
  }
  return matrix;
}

function expectedArtifactsRoot(validation: HarnessPhase3Validation, sessionId: string): string {
  return path.posix.join(validation.artifactRoot, sessionId);
}

async function cleanupSessionArtifacts(repoRoot: string, sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
}

async function validatePhase3CliCase(repoRoot: string, validation: HarnessPhase3Validation): Promise<void> {
  const sessionId = `phase3-${validation.runnerProfile}-${Date.now()}`;
  const isolatedDryRunDeviceId = `${validation.platform}-dryrun-${sessionId}`;

  try {
    const output = await runCli([
      "--platform", validation.platform,
      "--runner-profile", validation.runnerProfile,
      "--session-id", sessionId,
      "--device-id", isolatedDryRunDeviceId,
      "--run-count", "1",
      "--dry-run",
    ]) as {
      startResult: { status: string; data: { sampleName: string; artifactsRoot: string; profile?: string | null; appId: string } };
      runResult: { status: string; data: { dryRun: boolean; runnerProfile: string; runnerScript: string; configuredFlows: string[]; flowPath: string; artifactsDir: string }; nextSuggestions: string[] };
      endResult: { status: string };
    };

    assert.equal(output.startResult.status, "success");
    assert.equal(output.startResult.data.sampleName, validation.sampleName);
    assert.equal(output.startResult.data.profile, validation.runnerProfile);
    assert.equal(output.startResult.data.appId, validation.appId);
    assert.equal(output.startResult.data.artifactsRoot, expectedArtifactsRoot(validation, sessionId));

    assert.equal(output.runResult.status, "success");
    assert.equal(output.runResult.data.dryRun, true);
    assert.equal(output.runResult.data.runnerProfile, validation.runnerProfile);
    assert.equal(output.runResult.data.runnerScript, validation.runnerScript);
    assert.deepEqual(output.runResult.data.configuredFlows, validation.flows);
    assert.equal(output.runResult.data.flowPath, validation.flows[0]);
    assert.equal(output.runResult.data.artifactsDir, expectedArtifactsRoot(validation, sessionId));
    if (validation.flows.length > 1) {
      assert.equal(output.runResult.nextSuggestions.some((item) => item.includes("bundled validation set")), true);
    }

    assert.equal(output.endResult.status, "success");
  } finally {
    await cleanupSessionArtifacts(repoRoot, sessionId);
  }
}

async function main(): Promise<void> {
  const repoRoot = repoRootFromScript();
  const matrixPath = path.resolve(repoRoot, "configs/matrices/framework-profile-matrix.md");
  if (!existsSync(matrixPath)) {
    throw new Error(
      [
        "CFG-02 required input missing: configs/matrices/framework-profile-matrix.md",
        "guidance:",
        "- This validation requires the tracked framework/profile compatibility matrix.",
        "- Restore the file from git history or switch to a branch/worktree where it exists.",
        "- Re-run: pnpm test:smoke",
      ].join("\n"),
    );
  }

  const validations = await loadHarnessPhase3Validations(repoRoot);
  assert.equal(validations.length > 0, true);

  for (const validation of validations) {
    assert.equal(existsSync(path.resolve(repoRoot, validation.runnerScript)), true, `${validation.runnerScript} should exist`);
    for (const flow of validation.flows) {
      assert.equal(existsSync(path.resolve(repoRoot, flow)), true, `${flow} should exist`);
    }
  }

  const nativeProfile = await loadProfileRecord(repoRoot, "native");
  const reactNativeProfile = await loadProfileRecord(repoRoot, "react-native");
  const flutterProfile = await loadProfileRecord(repoRoot, "flutter");
  assert.equal(nativeProfile.status, "validated-sample-baseline");
  assert.equal(nativeProfile.sample, "mobitru-native");
  assert.equal(nativeProfile.platforms.includes("ios"), true);
  assert.equal(nativeProfile.platforms.includes("android"), true);
  assert.equal(reactNativeProfile.status, "validated-sample-baseline");
  assert.equal(reactNativeProfile.sample, "rn-login-demo");
  assert.equal(reactNativeProfile.platforms.includes("ios"), true);
  assert.equal(reactNativeProfile.platforms.includes("android"), true);
  assert.equal(flutterProfile.status, "validated-sample-baseline");
  assert.equal(flutterProfile.sample, "mobitru-flutter");
  assert.equal(flutterProfile.platforms.includes("android"), true);

  const matrixRows = await loadMatrixRows(repoRoot);
  const nativeRow = matrixRows.get("Native");
  const reactNativeRow = matrixRows.get("React Native");
  const flutterRow = matrixRows.get("Flutter");
  assert.ok(nativeRow);
  assert.ok(reactNativeRow);
  assert.ok(flutterRow);
  assert.equal(nativeRow?.status, "validated-sample-baseline");
  assert.equal(nativeRow?.sample, "mobitru-native");
  assert.equal(nativeRow?.ios, "yes");
  assert.equal(nativeRow?.android, "yes");
  assert.equal(reactNativeRow?.status, "validated-sample-baseline");
  assert.equal(reactNativeRow?.sample, "rn-login-demo");
  assert.equal(reactNativeRow?.ios, "yes");
  assert.equal(reactNativeRow?.android, "yes");
  assert.equal(flutterRow?.status, "validated-sample-baseline");
  assert.equal(flutterRow?.sample, "mobitru-flutter");
  assert.equal(flutterRow?.ios, "no");
  assert.equal(flutterRow?.android, "yes");

  for (const validation of validations) {
    await validatePhase3CliCase(repoRoot, validation);
  }

  const validatedRunnerProfiles = validations.map((validation) => validation.runnerProfile).sort();
  const hasFlutterAndroidLane = validatedRunnerProfiles.includes("flutter_android");
  const flutterLaneSummary = hasFlutterAndroidLane
    ? "framework sample lane proof includes Flutter Android"
    : "framework sample lane proof does not include Flutter Android";

  console.log("Phase3 sample dry-run contract validation passed.");
  console.log(
      [
        "Evidence contract: smoke-level dry-run validation only (not real-device acceptance evidence).",
        "Profile truth: Native + React Native + Flutter remain validated-sample-baseline per configs/profiles/*.yaml and framework-profile matrix.",
        `Shared runner/report dry-run lanes checked: ${validatedRunnerProfiles.join(", ")}.`,
        `Framework lane note: ${flutterLaneSummary}; Flutter iOS remains outside the shared runner/report path.`,
        "Acceptance evidence lane is .github/workflows/real-device-acceptance.yml (self-hosted real-run artifacts + quality gate).",
    ].join(" "),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
