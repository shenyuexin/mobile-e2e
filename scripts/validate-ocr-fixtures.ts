import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOcrText, type MacVisionExecutionResult } from "../packages/adapter-vision/src/index.ts";

interface OcrFixtureManifestEntry {
  name: string;
  targetText: string;
  expectedObservationCount: number;
  expectedTexts: string[];
}

interface OcrFixtureManifest {
  fixtures: OcrFixtureManifestEntry[];
}

interface OcrObservationMetadata {
  svgSha256: string;
  pngSha256: string;
  dimensions: { width: number; height: number };
  sourceSvg: string;
  sourcePng: string;
}

interface OcrObservationFixture extends MacVisionExecutionResult {
  metadata?: OcrObservationMetadata;
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

async function loadManifest(root: string): Promise<OcrFixtureManifest> {
  return JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as OcrFixtureManifest;
}

async function validateFixture(root: string, fixture: OcrFixtureManifestEntry): Promise<void> {
  const pngPath = path.join(root, `${fixture.name}.png`);
  const svgPath = path.join(root, `${fixture.name}.svg`);
  const observationsPath = path.join(root, `${fixture.name}.observations.json`);

  await access(pngPath);
  await access(svgPath);
  await access(observationsPath);

  const png = await readFile(pngPath);
  const svg = await readFile(svgPath);
  const observations = JSON.parse(await readFile(observationsPath, "utf8")) as OcrObservationFixture;
  const pngStats = await stat(pngPath);

  assert.equal(pngStats.size > 0, true, `${fixture.name}.png should be non-empty`);
  assert.equal(svg.toString("utf8").includes(fixture.targetText), true, `${fixture.name}.svg should contain target text`);
  assert.equal(observations.observations?.length, fixture.expectedObservationCount, `${fixture.name} should keep expected observation count`);

  const metadata = observations.metadata;
  assert.ok(metadata, `${fixture.name}.observations.json should include metadata`);
  assert.equal(metadata.sourceSvg, `${fixture.name}.svg`);
  assert.equal(metadata.sourcePng, `${fixture.name}.png`);
  assert.equal(metadata.svgSha256, sha256(svg), `${fixture.name} svg hash should match`);
  assert.equal(metadata.pngSha256, sha256(png), `${fixture.name} png hash should match`);
  assert.deepEqual(metadata.dimensions, readPngDimensions(png), `${fixture.name} png dimensions should match`);

  const observationTexts = (observations.observations ?? []).map((item) => normalizeOcrText(item.text ?? ""));
  assert.deepEqual(observationTexts, fixture.expectedTexts.map((value) => normalizeOcrText(value)), `${fixture.name} observation texts should match manifest`);
  assert.equal(observationTexts.includes(normalizeOcrText(fixture.targetText)), true, `${fixture.name} observations should include target text`);
}

async function main(): Promise<void> {
  const fixtureRoot = path.join(repoRootFromScript(), "tests", "fixtures", "ocr");
  const manifestPath = path.join(fixtureRoot, "manifest.json");

  try {
    await access(manifestPath);
  } catch {
    console.log("Skipped OCR fixture validation: tests/fixtures/ocr/manifest.json not found.");
    return;
  }

  const manifest = await loadManifest(fixtureRoot);
  for (const fixture of manifest.fixtures) {
    await validateFixture(fixtureRoot, fixture);
  }
  console.log(`Validated ${String(manifest.fixtures.length)} OCR fixture triads.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
