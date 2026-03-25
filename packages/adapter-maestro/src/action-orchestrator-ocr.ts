import type {
  GetScreenSummaryData,
  OcrEvidence,
  PerformActionWithEvidenceInput,
  Platform,
  ReasonCode,
  RunnerProfile,
  ScreenshotData,
  ScreenshotInput,
  StateSummary,
  TapData,
  TapInput,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_OCR_FALLBACK_POLICY,
  MacVisionOcrProvider,
  minimumConfidenceForOcrAction,
  resolveTextTarget,
  shouldUseOcrFallback,
  type OcrFallbackActionType,
  verifyOcrAction,
} from "@mobile-e2e-mcp/adapter-vision";
import path from "node:path";
import { resolveRepoPath } from "./harness-config.js";

export interface OcrFallbackExecutionResult {
  attempted: boolean;
  used: boolean;
  status: ToolResult["status"];
  reasonCode: ReasonCode;
  artifacts: string[];
  attempts: number;
  retryCount: number;
  nextSuggestions: string[];
  ocrEvidence?: OcrEvidence;
  postStateResult?: ToolResult<GetScreenSummaryData>;
}

export interface OcrFallbackExecutionDeps {
  createProvider?: () => Pick<MacVisionOcrProvider, "extractTextRegions">;
  takeScreenshot: (input: ScreenshotInput) => Promise<ToolResult<ScreenshotData>>;
  tap: (input: TapInput) => Promise<ToolResult<TapData>>;
  getScreenSummary: (input: {
    sessionId: string;
    platform: Platform;
    runnerProfile: RunnerProfile;
    harnessConfigPath?: string;
    deviceId?: string;
    appId?: string;
    includeDebugSignals?: boolean;
    dryRun?: boolean;
  }) => Promise<ToolResult<GetScreenSummaryData>>;
  now?: () => string;
}

export function mapIntentToOcrActionKind(action: PerformActionWithEvidenceInput["action"]): OcrFallbackActionType | undefined {
  if (action.actionType === "tap_element") return "tap";
  if (action.actionType === "wait_for_ui") return "assertText";
  return undefined;
}

export function buildOcrTargetText(action: PerformActionWithEvidenceInput["action"]): string | undefined {
  return action.text?.trim() || action.contentDesc?.trim();
}

export function canAttemptOcrFallback(
  action: PerformActionWithEvidenceInput["action"],
  deterministicResult: ToolResult<unknown>,
): boolean {
  if (deterministicResult.status === "success") return false;
  if (action.actionType !== "tap_element" && action.actionType !== "wait_for_ui") return false;
  return Boolean(buildOcrTargetText(action));
}

export async function executeOcrFallback(params: {
  input: PerformActionWithEvidenceInput;
  platform: Platform;
  runnerProfile: RunnerProfile;
  deviceId?: string;
  appId?: string;
  preStateSummary: StateSummary;
  deps: OcrFallbackExecutionDeps;
}): Promise<OcrFallbackExecutionResult> {
  if (params.input.dryRun && !params.deps.createProvider) {
    return { attempted: false, used: false, status: "failed", reasonCode: REASON_CODES.noMatch, artifacts: [], attempts: 0, retryCount: 0, nextSuggestions: [] };
  }
  const actionKind = mapIntentToOcrActionKind(params.input.action);
  const targetText = buildOcrTargetText(params.input.action);
  if (!actionKind || !targetText) {
    return { attempted: false, used: false, status: "failed", reasonCode: REASON_CODES.noMatch, artifacts: [], attempts: 0, retryCount: 0, nextSuggestions: [] };
  }

  const policyDecision = shouldUseOcrFallback({ action: actionKind, deterministicFailed: true, semanticFailed: true, state: params.preStateSummary }, DEFAULT_OCR_FALLBACK_POLICY);
  if (!policyDecision.allowed) {
    return {
      attempted: false,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.noMatch,
      artifacts: [],
      attempts: 0,
      retryCount: 0,
      nextSuggestions: policyDecision.reasons.length > 0 ? [`OCR fallback blocked: ${policyDecision.reasons.join(", ")}.`] : [],
    };
  }

  const screenshotInput: ScreenshotInput = {
    sessionId: params.input.sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    harnessConfigPath: params.input.harnessConfigPath,
    deviceId: params.deviceId,
    outputPath: path.posix.join("artifacts", "screenshots", params.input.sessionId, `${params.platform}-${params.runnerProfile}-ocr.png`),
    dryRun: params.input.dryRun,
  };
  const screenshotResult = await params.deps.takeScreenshot(screenshotInput);
  if (screenshotResult.status === "failed") {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: screenshotResult.reasonCode,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts,
      retryCount: 0,
      nextSuggestions: screenshotResult.nextSuggestions,
    };
  }

  const screenshotPath = path.resolve(resolveRepoPath(), screenshotResult.data.outputPath);
  const nowIsoString = params.deps.now?.() ?? new Date().toISOString();
  const screenshotFreshDecision = shouldUseOcrFallback({ action: actionKind, deterministicFailed: true, semanticFailed: true, state: params.preStateSummary, screenshotCapturedAt: nowIsoString }, DEFAULT_OCR_FALLBACK_POLICY);
  if (!screenshotFreshDecision.allowed) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrProviderError,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts,
      retryCount: 0,
      nextSuggestions: screenshotFreshDecision.reasons.length > 0 ? [`OCR fallback blocked: ${screenshotFreshDecision.reasons.join(", ")}.`] : [],
    };
  }

  const ocrProvider = params.deps.createProvider?.() ?? new MacVisionOcrProvider();
  let ocrOutput: Awaited<ReturnType<MacVisionOcrProvider["extractTextRegions"]>>;
  try {
    ocrOutput = await ocrProvider.extractTextRegions({ screenshotPath, platform: params.platform, languageHints: ["en-US", "zh-Hans"] });
  } catch (error) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrProviderError,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: [error instanceof Error ? error.message : "OCR provider execution failed."],
    };
  }

  let resolverResult = resolveTextTarget({ targetText, blocks: ocrOutput.blocks, maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail });
  if (!resolverResult.matched) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: resolverResult.candidates.length > 1 ? REASON_CODES.ocrAmbiguousTarget : REASON_CODES.ocrNoMatch,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: ["OCR fallback could not resolve a unique text target from the screenshot."],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        candidateCount: resolverResult.candidates.length,
        screenshotPath: screenshotResult.data.outputPath,
        fallbackReason: resolverResult.candidates.length > 1 ? REASON_CODES.ocrAmbiguousTarget : REASON_CODES.ocrNoMatch,
        postVerificationResult: "not_run",
      },
    };
  }

  const threshold = minimumConfidenceForOcrAction(actionKind, DEFAULT_OCR_FALLBACK_POLICY);
  const selectedConfidence = resolverResult.bestCandidate?.confidence ?? resolverResult.confidence;
  if (selectedConfidence < threshold) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrLowConfidence,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: ["OCR fallback found the target text but confidence did not pass the policy threshold."],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        matchedText: resolverResult.bestCandidate?.text,
        candidateCount: resolverResult.candidates.length,
        matchType: resolverResult.matchType,
        ocrConfidence: selectedConfidence,
        screenshotPath: screenshotResult.data.outputPath,
        selectedBounds: resolverResult.bestCandidate?.bounds,
        fallbackReason: REASON_CODES.ocrLowConfidence,
        postVerificationResult: "not_run",
      },
    };
  }

  if (actionKind === "assertText") {
    return {
      attempted: true,
      used: true,
      status: "success",
      reasonCode: REASON_CODES.ok,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: [],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        matchedText: resolverResult.bestCandidate?.text,
        candidateCount: resolverResult.candidates.length,
        matchType: resolverResult.matchType,
        ocrConfidence: selectedConfidence,
        screenshotPath: screenshotResult.data.outputPath,
        selectedBounds: resolverResult.bestCandidate?.bounds,
        postVerificationResult: "not_run",
      },
    };
  }

  let tapAttempts = 0;
  let performedTapAttempts = 0;
  let postStateResult: ToolResult<GetScreenSummaryData> | undefined;
  let verificationResult: ReturnType<typeof verifyOcrAction> | undefined;

  while (tapAttempts <= DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount && resolverResult.bestCandidate) {
    performedTapAttempts += 1;
    const tapResult = await params.deps.tap({
      sessionId: params.input.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.input.harnessConfigPath,
      deviceId: params.deviceId,
      x: Math.round((resolverResult.bestCandidate.bounds.left + resolverResult.bestCandidate.bounds.right) / 2),
      y: Math.round((resolverResult.bestCandidate.bounds.top + resolverResult.bestCandidate.bounds.bottom) / 2),
      dryRun: params.input.dryRun,
    });
    if (tapResult.status === "failed") {
      return {
        attempted: true,
        used: false,
        status: tapResult.status,
        reasonCode: tapResult.reasonCode,
        artifacts: screenshotResult.artifacts,
        attempts: screenshotResult.attempts + tapResult.attempts,
        retryCount: Math.max(0, performedTapAttempts - 1),
        nextSuggestions: tapResult.nextSuggestions,
      };
    }

    postStateResult = await params.deps.getScreenSummary({
      sessionId: params.input.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.input.harnessConfigPath,
      deviceId: params.deviceId,
      appId: params.appId,
      includeDebugSignals: params.input.includeDebugSignals ?? true,
      dryRun: params.input.dryRun,
    });
    verificationResult = verifyOcrAction({
      targetText,
      preState: params.preStateSummary,
      postState: postStateResult.data.screenSummary,
    });
    if (verificationResult.verified) {
      return {
        attempted: true,
        used: true,
        status: "success",
        reasonCode: REASON_CODES.ok,
        artifacts: Array.from(new Set([...screenshotResult.artifacts, ...postStateResult.artifacts])),
        attempts: screenshotResult.attempts + tapResult.attempts + postStateResult.attempts,
        retryCount: Math.max(0, performedTapAttempts - 1),
        nextSuggestions: [],
        postStateResult,
        ocrEvidence: {
          provider: ocrOutput.provider,
          engine: ocrOutput.engine,
          model: ocrOutput.model,
          durationMs: ocrOutput.durationMs,
          matchedText: resolverResult.bestCandidate.text,
          candidateCount: resolverResult.candidates.length,
          matchType: resolverResult.matchType,
          ocrConfidence: selectedConfidence,
          screenshotPath: screenshotResult.data.outputPath,
          selectedBounds: resolverResult.bestCandidate.bounds,
          postVerificationResult: "passed",
        },
      };
    }
    tapAttempts += 1;
    if (tapAttempts <= DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount) {
      resolverResult = resolveTextTarget({ targetText, blocks: ocrOutput.blocks, fuzzy: false, maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail });
    }
  }

  return {
    attempted: true,
    used: false,
    status: "failed",
    reasonCode: REASON_CODES.ocrPostVerifyFailed,
    artifacts: Array.from(new Set([...screenshotResult.artifacts, ...(postStateResult?.artifacts ?? [])])),
    attempts: screenshotResult.attempts + (postStateResult?.attempts ?? 0) + 1,
    retryCount: Math.max(0, performedTapAttempts - 1),
    nextSuggestions: [verificationResult?.summary ?? "OCR fallback tap did not produce the expected post-action state."],
    postStateResult,
    ocrEvidence: {
      provider: ocrOutput.provider,
      engine: ocrOutput.engine,
      model: ocrOutput.model,
      durationMs: ocrOutput.durationMs,
      matchedText: resolverResult.bestCandidate?.text,
      candidateCount: resolverResult.candidates.length,
      matchType: resolverResult.matchType,
      ocrConfidence: selectedConfidence,
      screenshotPath: screenshotResult.data.outputPath,
      selectedBounds: resolverResult.bestCandidate?.bounds,
      fallbackReason: REASON_CODES.ocrPostVerifyFailed,
      postVerificationResult: "failed",
    },
  };
}
