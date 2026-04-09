import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_OCR_FALLBACK_POLICY,
  MacVisionOcrProvider,
  OcrProviderExecutionError,
  OcrService,
  minimumConfidenceForOcrAction,
  normalizeOcrText,
  resolveTextTarget,
  shouldUseOcrFallback,
  verifyOcrAction,
  type MacVisionExecutionResult,
} from "../src/index.ts";

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

function screenshotFixturePath(name: string): string {
  return path.join(ocrFixtureRoot, `${name}.png`);
}

async function readObservationFixture(name: string): Promise<MacVisionExecutionResult> {
  return JSON.parse(await readFile(path.join(ocrFixtureRoot, `${name}.observations.json`), "utf8")) as MacVisionExecutionResult;
}

test("normalizeOcrText collapses whitespace and case", () => {
  assert.equal(normalizeOcrText("  Sign   In  "), "sign in");
});

test("resolveTextTarget matches exact text", () => {
  const result = resolveTextTarget({
    targetText: "Sign In",
    blocks: [{ text: "Sign In", confidence: 0.91, bounds: { left: 1, top: 1, right: 10, bottom: 10, width: 9, height: 9, center: { x: 5.5, y: 5.5 } } }],
  });
  assert.equal(result.matched, true);
});

test("shouldUseOcrFallback enforces deterministic-first", () => {
  const decision = shouldUseOcrFallback({
    action: "tap",
    deterministicFailed: true,
    semanticFailed: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.minimumConfidence, DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap);
});

test("minimumConfidenceForOcrAction returns tap threshold", () => {
  assert.equal(minimumConfidenceForOcrAction("tap"), DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap);
});

test("verifyOcrAction succeeds when state changes", () => {
  const result = verifyOcrAction({
    preState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Login" },
    postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Home" },
  });
  assert.equal(result.verified, true);
});

test("MacVisionOcrProvider normalizes screenshot fixture observations", async (t) => {
  if (!(await hasOcrFixtureManifest())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const screenshotPath = screenshotFixturePath("signin-success");
  const provider = new MacVisionOcrProvider({
    execute: async (input) => {
      assert.equal(input.screenshotPath, screenshotPath);
      return readObservationFixture("signin-success");
    },
  });
  const result = await provider.extractTextRegions({ screenshotPath, platform: "ios" });
  assert.equal(result.blocks[0]?.text, "Welcome back");
  assert.equal(result.blocks[result.blocks.length - 1]?.text, "Sign In");
});

test("MacVisionOcrProvider maps executor failures", async () => {
  const provider = new MacVisionOcrProvider({
    execute: async () => { throw new OcrProviderExecutionError("execution_failed", "Vision failed", REASON_CODES.ocrProviderError); },
  });
  await assert.rejects(provider.extractTextRegions({ screenshotPath: screenshotFixturePath("signin-success"), platform: "ios" }));
});

test("OcrService executes assertText against a screenshot fixture after deterministic miss", async (t) => {
  if (!(await hasOcrFixtureManifest())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const screenshotPath = screenshotFixturePath("signin-success");
  const service = new OcrService({
    provider: new MacVisionOcrProvider({ execute: async () => readObservationFixture("signin-success") }),
  });

  const result = await service.executeTextAction({
    action: "assertText",
    targetText: "Sign In",
    screenshotPath,
    platform: "ios",
    deterministicFailed: true,
    semanticFailed: true,
    screenshotCapturedAt: new Date().toISOString(),
    executeAction: async () => ({ asserted: true }),
  });

  assert.equal(result.status, "executed");
  assert.equal(result.allowed, true);
  assert.equal(result.matchedTarget?.text, "Sign In");
  assert.equal(result.evidence?.screenshotPath, screenshotPath);
});

test("OcrService executes tap verification flow from a screenshot fixture", async (t) => {
  if (!(await hasOcrFixtureManifest())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const screenshotPath = screenshotFixturePath("continue-success");
  const service = new OcrService({
    provider: new MacVisionOcrProvider({ execute: async () => readObservationFixture("continue-success") }),
  });

  const result = await service.executeTextAction({
    action: "tap",
    targetText: "Continue",
    expectedText: "Thanks",
    screenshotPath,
    platform: "ios",
    deterministicFailed: true,
    semanticFailed: true,
    screenshotCapturedAt: new Date().toISOString(),
    executeAction: async ({ target }) => ({ tappedCenter: target.bounds.center }),
    buildVerificationInput: async ({ ocr }) => ({
      beforeOcr: ocr,
      afterOcr: {
        ...ocr,
        blocks: [
          ocr.blocks[0]!,
          {
            text: "Thanks",
            confidence: 0.99,
            bounds: { left: 126, top: 620, right: 249, bottom: 648, width: 123, height: 28, center: { x: 187.5, y: 634 } },
          },
        ],
      },
      targetText: "Continue",
      expectedText: "Thanks",
      preState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Shipping" },
      postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Confirmation" },
    }),
  });

  assert.equal(result.status, "executed");
  assert.equal(result.allowed, true);
  assert.equal(result.verification?.verified, true);
  assert.equal(result.matchedTarget?.text, "Continue");
});

test("OcrService fails safely on low-confidence screenshot fixtures", async (t) => {
  if (!(await hasOcrFixtureManifest())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const screenshotPath = screenshotFixturePath("continue-low-confidence");
  const service = new OcrService({
    provider: new MacVisionOcrProvider({ execute: async () => readObservationFixture("continue-low-confidence") }),
  });

  const result = await service.executeTextAction({
    action: "tap",
    targetText: "Continue",
    screenshotPath,
    platform: "ios",
    deterministicFailed: true,
    semanticFailed: true,
    screenshotCapturedAt: new Date().toISOString(),
  });

  assert.equal(result.status, "low_confidence");
  assert.equal(result.allowed, false);
  assert.equal(result.evidence?.ocrConfidence !== undefined && result.evidence.ocrConfidence < DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap, true);
});

test("OcrService fails safely on ambiguous screenshot fixtures", async (t) => {
  if (!(await hasOcrFixtureManifest())) {
    t.skip("OCR fixtures are not tracked in this repository profile.");
    return;
  }

  const screenshotPath = screenshotFixturePath("continue-ambiguous");
  const service = new OcrService({
    provider: new MacVisionOcrProvider({ execute: async () => readObservationFixture("continue-ambiguous") }),
  });

  const result = await service.executeTextAction({
    action: "tap",
    targetText: "Continue",
    screenshotPath,
    platform: "ios",
    deterministicFailed: true,
    semanticFailed: true,
    screenshotCapturedAt: new Date().toISOString(),
  });

  assert.equal(result.status, "ambiguous");
  assert.equal(result.allowed, false);
  assert.equal(result.resolution?.rejectionReason, "ambiguous");
});

test("resolveTextTarget returns invalid_input for empty query", () => {
  // Empty query should not throw -- should return invalid_input status
  const result = resolveTextTarget({
    targetText: "",
    blocks: [
      { text: "Hello World", confidence: 0.9, bounds: { left: 100, top: 100, right: 300, bottom: 150, width: 200, height: 50, center: { x: 200, y: 125 } } },
    ],
  });
  assert.equal(result.matched, false);
  assert.equal(result.status, "invalid_input");
  assert.equal(result.rejectionReason, "empty_target");
});

test("resolveTextTarget returns ambiguous for identical text with same bounds", () => {
  // Two text items with identical text and overlapping bounds -- triggers ambiguity detection
  const result = resolveTextTarget({
    targetText: "Submit",
    blocks: [
      { text: "Submit", confidence: 0.7, bounds: { left: 100, top: 100, right: 200, bottom: 140, width: 100, height: 40, center: { x: 150, y: 120 } } },
      { text: "Submit", confidence: 0.9, bounds: { left: 100, top: 100, right: 200, bottom: 140, width: 100, height: 40, center: { x: 150, y: 120 } } },
    ],
  });
  // Both blocks have identical normalized text and match type, so duplicateTopText triggers ambiguity
  assert.equal(result.matched, false);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.rejectionReason, "ambiguous");
  assert.ok(result.candidates.length >= 2, "Should have multiple candidates");
});
