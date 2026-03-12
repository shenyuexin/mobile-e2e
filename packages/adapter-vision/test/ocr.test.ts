import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("MacVisionOcrProvider normalizes screenshot fixture observations", async () => {
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

test("OcrService executes assertText against a screenshot fixture after deterministic miss", async () => {
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

test("OcrService executes tap verification flow from a screenshot fixture", async () => {
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

test("OcrService fails safely on low-confidence screenshot fixtures", async () => {
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

test("OcrService fails safely on ambiguous screenshot fixtures", async () => {
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
