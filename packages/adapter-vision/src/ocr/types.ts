import type { ActionResolutionStrategy, Platform, StateSummary } from "@mobile-e2e-mcp/contracts";

export type OcrResolutionStrategy = Extract<ActionResolutionStrategy, "ocr">;
export type OcrMatchType = "exact" | "normalized" | "fuzzy" | "ai-reranked";
export type OcrResolveStatus = "matched" | "no_match" | "ambiguous" | "invalid_input";
export type OcrVerificationStatus = "verified" | "not_verified" | "not_run";
export type OcrVerificationCheckName = "text_disappeared" | "expected_text_appeared" | "state_changed" | "deterministic_locator_available";
export type OcrFallbackActionType = "tap" | "assertText" | "longPress" | "delete" | "purchase" | "confirmPayment" | (string & {});
export type OcrFallbackBlockReason = "disabled" | "deterministic_not_failed" | "semantic_not_failed" | "action_not_allowed" | "action_blocked" | "screenshot_stale" | "loading" | "transition" | "too_many_candidates" | "retry_limit" | "low_confidence";
export type OcrProviderErrorCode = "unsupported_platform" | "execution_failed" | "invalid_response";
export interface OcrCropBounds { left: number; top: number; right: number; bottom: number; }
export interface OcrInput { screenshotPath: string; platform: Platform; languageHints?: string[]; crop?: OcrCropBounds; }
export interface OcrBounds { left: number; top: number; right: number; bottom: number; width: number; height: number; center: { x: number; y: number; }; }
export interface OcrTextBlock { text: string; confidence: number; bounds: OcrBounds; }
export interface OcrOutput { provider: string; engine: string; model?: string; durationMs: number; screenshotPath: string; blocks: OcrTextBlock[]; }
export interface OcrProvider { readonly providerName: string; readonly engineName: string; extractTextRegions(input: OcrInput): Promise<OcrOutput>; }
export interface RankedOcrCandidate { block: OcrTextBlock; normalizedText: string; matchType: OcrMatchType | "none"; similarity: number; matchScore: number; rankScore: number; }
export interface ResolveTextTargetInput { targetText: string; blocks: OcrTextBlock[]; exact?: boolean; fuzzy?: boolean; minFuzzyScore?: number; ambiguityThreshold?: number; maxCandidatesBeforeFail?: number; }
export interface ResolveTextTargetResult { status: OcrResolveStatus; matched: boolean; confidence: number; targetText: string; normalizedTargetText: string; bestCandidate?: OcrTextBlock; candidates: RankedOcrCandidate[]; matchType?: OcrMatchType; rejectionReason?: "empty_target" | "no_match" | "ambiguous"; }
export interface OcrFallbackPolicy { enabled: boolean; allowedActions: OcrFallbackActionType[]; blockedActions: OcrFallbackActionType[]; minConfidenceForAssert: number; minConfidenceForTap: number; minConfidenceForRiskyAction: number; maxCandidatesBeforeFail: number; screenshotMaxAgeMs: number; maxRetryCount: number; loadingTextPatterns: string[]; transitionTextPatterns: string[]; loadingBlockingSignals: string[]; transitionBlockingSignals: string[]; }
export interface OcrFallbackContext { action: OcrFallbackActionType; deterministicFailed?: boolean; semanticFailed?: boolean; screenshotCapturedAt?: string | number | Date; state?: StateSummary; candidateCount?: number; retryCount?: number; confidence?: number; nowMs?: number; }
export interface OcrFallbackDecision { allowed: boolean; reasons: OcrFallbackBlockReason[]; minimumConfidence: number; candidateLimit: number; retryLimit: number; }
export interface OcrVerificationCheckResult { check: OcrVerificationCheckName; passed: boolean; detail: string; }
export interface VerifyOcrActionInput { beforeOcr?: OcrOutput; afterOcr?: OcrOutput; targetText?: string; expectedText?: string | string[]; preState?: StateSummary; postState?: StateSummary; locatorAvailableBefore?: boolean; locatorAvailableAfter?: boolean; deterministicLocatorAvailable?: boolean; }
export interface VerifyOcrActionResult { verified: boolean; status: OcrVerificationStatus; summary: string; checks: OcrVerificationCheckResult[]; successfulChecks: OcrVerificationCheckName[]; failureReasons: string[]; }
export interface OcrEvidence { resolutionStrategy: OcrResolutionStrategy; provider: string; engine: string; model?: string; durationMs: number; matchedText?: string; candidateCount: number; matchType?: OcrMatchType; ocrConfidence?: number; screenshotPath?: string; fallbackReason?: string; verificationResult: OcrVerificationStatus; }
export class OcrProviderError extends Error { readonly code: OcrProviderErrorCode; readonly causeValue?: unknown; constructor(code: OcrProviderErrorCode, message: string, causeValue?: unknown) { super(message); this.name = "OcrProviderError"; this.code = code; this.causeValue = causeValue; } }
export function clampOcrConfidence(value: number | undefined): number { if (value === undefined || !Number.isFinite(value)) return 0; return Math.max(0, Math.min(1, value)); }
export function buildOcrBounds(bounds: OcrCropBounds): OcrBounds { const width = Math.max(0, bounds.right - bounds.left); const height = Math.max(0, bounds.bottom - bounds.top); return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width, height, center: { x: bounds.left + width / 2, y: bounds.top + height / 2 } }; }
export function intersectsOcrBounds(left: OcrCropBounds, right: OcrCropBounds): boolean { return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top; }
export function coerceScreenshotTimestamp(value: string | number | Date | undefined): number | undefined { if (value === undefined) return undefined; if (typeof value === "number") return Number.isFinite(value) ? value : undefined; if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : undefined; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined; }
