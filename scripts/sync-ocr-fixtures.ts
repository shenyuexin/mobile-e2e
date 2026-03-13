import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeMacVisionOcr } from "../packages/adapter-vision/src/index.ts";

interface OcrFixtureManifestEntry {
  name: string;
  targetText: string;
  expectedObservationCount: number;
  expectedTexts: string[];
}

interface OcrFixtureManifest {
  fixtures: OcrFixtureManifestEntry[];
}

interface SyncCliOptions {
  dryRun: boolean;
  check: boolean;
  names: string[];
}

interface SyncPlan {
  name: string;
  changed: boolean;
  reasons: string[];
  nextPayload: string;
}

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function sha256(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

function readPngDimensions(png: Buffer): { width: number; height: number } {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function parseCliOptions(argv: string[]): SyncCliOptions {
  const names: string[] = [];
  let dryRun = false;
  let check = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    names.push(arg);
  }

  return { dryRun, check, names };
}

async function runSips(svgPath: string, pngPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("sips", ["-s", "format", "png", svgPath, "--out", pngPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `sips exited with code ${String(code)}`));
    });
  });
}

async function loadManifest(root: string): Promise<OcrFixtureManifest> {
  return JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as OcrFixtureManifest;
}

async function buildSyncPlan(root: string, fixture: OcrFixtureManifestEntry): Promise<SyncPlan> {
  const svgPath = path.join(root, `${fixture.name}.svg`);
  const pngPath = path.join(root, `${fixture.name}.png`);
  const observationsPath = path.join(root, `${fixture.name}.observations.json`);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-ocr-fixture-"));

  try {
    const renderedPngPath = path.join(tempRoot, `${fixture.name}.png`);
    await runSips(svgPath, renderedPngPath);
    const execution = await executeMacVisionOcr({ screenshotPath: renderedPngPath, platform: "ios", languageHints: ["en-US"] });
    const svg = await readFile(svgPath);
    const renderedPng = await readFile(renderedPngPath);
    const currentPayload = await readFile(observationsPath, "utf8");

    const payload = {
      durationMs: Math.max(0, Math.round(execution.durationMs ?? 0)),
      model: execution.model ?? "VNRecognizeTextRequest.accurate",
      observations: execution.observations ?? [],
      metadata: {
        svgSha256: sha256(svg),
        pngSha256: sha256(renderedPng),
        dimensions: readPngDimensions(renderedPng),
        sourceSvg: path.basename(svgPath),
        sourcePng: path.basename(pngPath),
      },
    };

    const nextPayload = `${JSON.stringify(payload, null, 2)}\n`;
    const reasons: string[] = [];

    if (currentPayload !== nextPayload) {
      const current = JSON.parse(currentPayload) as { metadata?: { svgSha256?: string; pngSha256?: string; dimensions?: { width?: number; height?: number } } };
      if (current.metadata?.svgSha256 !== payload.metadata.svgSha256) {
        reasons.push("svg hash changed");
      }
      if (current.metadata?.pngSha256 !== payload.metadata.pngSha256) {
        reasons.push("png hash changed");
      }
      if (JSON.stringify(current.metadata?.dimensions) !== JSON.stringify(payload.metadata.dimensions)) {
        reasons.push("png dimensions changed");
      }
      if (reasons.length === 0) {
        reasons.push("ocr observations changed");
      }
    }

    return {
      name: fixture.name,
      changed: currentPayload !== nextPayload,
      reasons,
      nextPayload,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function syncFixture(root: string, fixture: OcrFixtureManifestEntry, options: Pick<SyncCliOptions, "dryRun">): Promise<SyncPlan> {
  const plan = await buildSyncPlan(root, fixture);
  if (!options.dryRun && plan.changed) {
    const svgPath = path.join(root, `${fixture.name}.svg`);
    const pngPath = path.join(root, `${fixture.name}.png`);
    const observationsPath = path.join(root, `${fixture.name}.observations.json`);
    await runSips(svgPath, pngPath);
    await writeFile(observationsPath, plan.nextPayload, "utf8");
  }
  return plan;
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("OCR fixture sync requires macOS because it uses sips and Mac Vision OCR.");
  }

  const fixtureRoot = path.join(repoRootFromScript(), "tests", "fixtures", "ocr");
  const manifest = await loadManifest(fixtureRoot);
  const options = parseCliOptions(process.argv.slice(2));
  const requested = new Set(options.names);
  const validNames = new Set(manifest.fixtures.map((fixture) => fixture.name));
  const unknownNames = Array.from(requested).filter((name) => !validNames.has(name));
  if (unknownNames.length > 0) {
    throw new Error(`Unknown OCR fixture name(s): ${unknownNames.join(", ")}. Valid names: ${Array.from(validNames).join(", ")}.`);
  }

  let syncedCount = 0;
  const changedPlans: SyncPlan[] = [];
  for (const fixture of manifest.fixtures) {
    if (requested.size > 0 && !requested.has(fixture.name)) {
      continue;
    }
    const plan = await syncFixture(fixtureRoot, fixture, { dryRun: options.dryRun || options.check });
    syncedCount += 1;
    if (plan.changed) {
      changedPlans.push(plan);
    }
  }

  if (syncedCount === 0) {
    throw new Error("No OCR fixtures were synced.");
  }

  if (options.check) {
    if (changedPlans.length > 0) {
      throw new Error(`OCR fixtures are out of sync: ${changedPlans.map((plan) => `${plan.name} (${plan.reasons.join(", ")})`).join("; ")}. Run \`pnpm fixtures:ocr:sync\` on macOS.`);
    }
    console.log(`Verified ${String(syncedCount)} OCR fixture(s); no changes needed.`);
    return;
  }

  if (options.dryRun) {
    if (changedPlans.length === 0) {
      console.log(`Dry run checked ${String(syncedCount)} OCR fixture(s); no changes needed.`);
      return;
    }
    console.log(`Dry run would update ${String(changedPlans.length)} OCR fixture(s): ${changedPlans.map((plan) => `${plan.name} (${plan.reasons.join(", ")})`).join("; ")}.`);
    return;
  }

  console.log(`Synced ${String(syncedCount)} OCR fixture(s)${requested.size > 0 ? `: ${Array.from(requested).join(", ")}` : ""}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
