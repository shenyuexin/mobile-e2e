import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MacVisionOcrProvider } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const screenshotPath = path.join(repoRoot, "tests", "fixtures", "ocr", "signin-success.png");

async function hasSmokeFixture(): Promise<boolean> {
  try {
    await access(screenshotPath);
    return true;
  } catch {
    return false;
  }
}

test("MacVisionOcrProvider smoke test recognizes text from screenshot fixture", { skip: process.platform !== "darwin" }, async (t) => {
  if (!(await hasSmokeFixture())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const provider = new MacVisionOcrProvider();
  const result = await provider.extractTextRegions({ screenshotPath, platform: "ios", languageHints: ["en-US"] });

  assert.equal(result.blocks.length > 0, true);
  assert.equal(result.blocks.some((block) => /sign in/i.test(block.text)), true);
});
