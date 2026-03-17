import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeOcrText, type MacVisionExecutionResult } from "../src/index.ts";

interface OcrFixtureManifestEntry {
  name: string;
  targetText: string;
  expectedObservationCount: number;
  expectedTexts: string[];
}

interface OcrFixtureManifest {
  fixtures: OcrFixtureManifestEntry[];
}

interface OcrObservationFixture extends MacVisionExecutionResult {
  metadata?: {
    svgSha256: string;
    pngSha256: string;
    dimensions: { width: number; height: number };
    sourceSvg: string;
    sourcePng: string;
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ocrFixtureRoot = path.join(repoRoot, "tests", "fixtures", "ocr");
const manifestPath = path.join(ocrFixtureRoot, "manifest.json");

async function hasOcrFixtureManifest(): Promise<boolean> {
  try {
    await access(manifestPath);
    return true;
  } catch {
    return false;
  }
}

async function loadManifest(): Promise<OcrFixtureManifest> {
  return JSON.parse(await readFile(path.join(ocrFixtureRoot, "manifest.json"), "utf8")) as OcrFixtureManifest;
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

test("OCR fixture manifest stays in sync with screenshot observation triads", async (t) => {
  if (!(await hasOcrFixtureManifest())) {
    t.skip("OCR fixture manifest is not tracked in this repository profile.");
    return;
  }

  const manifest = await loadManifest();
  assert.equal(manifest.fixtures.length >= 4, true);

  for (const fixture of manifest.fixtures) {
    const pngPath = path.join(ocrFixtureRoot, `${fixture.name}.png`);
    const svgPath = path.join(ocrFixtureRoot, `${fixture.name}.svg`);
    const observationsPath = path.join(ocrFixtureRoot, `${fixture.name}.observations.json`);

    await access(pngPath);
    await access(svgPath);
    await access(observationsPath);

    const pngStats = await stat(pngPath);
    const png = await readFile(pngPath);
    const svg = await readFile(svgPath);
    const observations = JSON.parse(await readFile(observationsPath, "utf8")) as OcrObservationFixture;
    assert.equal(pngStats.size > 0, true, `${fixture.name}.png should be non-empty`);
    assert.equal(svg.toString("utf8").includes(fixture.targetText), true, `${fixture.name}.svg should contain target text`);
    assert.equal(observations.observations?.length, fixture.expectedObservationCount, `${fixture.name} should keep expected observation count`);

    assert.ok(observations.metadata, `${fixture.name} should include hash-linked metadata`);
    assert.equal(observations.metadata?.sourceSvg, `${fixture.name}.svg`);
    assert.equal(observations.metadata?.sourcePng, `${fixture.name}.png`);
    assert.equal(observations.metadata?.svgSha256, sha256(svg), `${fixture.name} svg hash should match metadata`);
    assert.equal(observations.metadata?.pngSha256, sha256(png), `${fixture.name} png hash should match metadata`);
    assert.deepEqual(observations.metadata?.dimensions, readPngDimensions(png), `${fixture.name} png dimensions should match metadata`);

    const observationTexts = (observations.observations ?? []).map((item) => normalizeOcrText(item.text ?? ""));
    assert.deepEqual(observationTexts, fixture.expectedTexts.map((value) => normalizeOcrText(value)), `${fixture.name} observation texts should match manifest`);
    assert.equal(observationTexts.includes(normalizeOcrText(fixture.targetText)), true, `${fixture.name} observations should include target text`);
  }
});
