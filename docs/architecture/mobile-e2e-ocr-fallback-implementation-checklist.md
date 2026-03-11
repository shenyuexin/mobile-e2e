# Mobile E2E OCR Fallback Implementation Checklist

This checklist tracks implementation work for the first-phase OCR fallback design. It is intended to be execution-focused and may be deleted after the feature is fully delivered and stabilized.

Related design doc:
- [`mobile-e2e-ocr-fallback-design.md`](./mobile-e2e-ocr-fallback-design.md)

---

## A. Design & Contract Checklist

- [ ] Confirm OCR fallback remains a deterministic/semantic backup path only.
- [ ] Define allowed OCR action classes.
- [ ] Define blocked high-risk OCR action classes.
- [ ] Define `OcrInput`.
- [ ] Define `OcrTextBlock`.
- [ ] Define `OcrOutput`.
- [ ] Define `OcrProvider`.
- [ ] Define `ResolveTextTargetResult`.
- [ ] Define `OcrFallbackPolicy`.
- [ ] Define `OcrEvidence`.
- [ ] Add OCR-specific reason codes.
- [ ] Document `resolutionStrategy = "ocr"` recording rules.

---

## B. Package / Module Checklist

- [ ] Add `packages/adapter-vision/` or equivalent vision module.
- [ ] Add `ocr/types.ts`.
- [ ] Add `ocr/providers/mac-vision-ocr-provider.ts`.
- [ ] Add `ocr/resolver/resolve-text-target.ts`.
- [ ] Add `ocr/policy/fallback-policy.ts`.
- [ ] Add `ocr/verification/verify-ocr-action.ts`.
- [ ] Add `ocr/service/ocr-service.ts`.

---

## C. `MacVisionOcrProvider` Checklist

- [ ] Finalize Node/TypeScript bridge to macOS Vision capability.
- [ ] Support screenshot path input.
- [ ] Return text blocks + bounds + confidence.
- [ ] Return provider and engine metadata.
- [ ] Map provider failures into classifiable errors.
- [ ] Add provider contract tests.

---

## D. `mcp-server` Integration Checklist

- [ ] Add OCR fallback branch to `perform-action-with-evidence`.
- [ ] Trigger screenshot capture after deterministic failure.
- [ ] Feed OCR output into target resolver.
- [ ] Apply policy gate before OCR-driven action execution.
- [ ] Execute coordinate tap through adapter.
- [ ] Run post-action verification.
- [ ] Set `fallbackUsed = true` in outcome.
- [ ] Set `resolutionStrategy = "ocr"` in outcome.
- [ ] Attach OCR evidence to metadata / artifacts.

---

## E. Capability Exposure Checklist

- [ ] Update `describe-capabilities`.
- [ ] Expose whether OCR fallback is supported.
- [ ] Expose default OCR provider.
- [ ] Expose configured provider list.
- [ ] Expose OCR policy restrictions summary.

---

## F. Policy Checklist

- [ ] Implement `shouldUseOcrFallback()`.
- [ ] Implement action allowlist.
- [ ] Implement high-risk blocklist.
- [ ] Implement `minConfidenceForAssert`.
- [ ] Implement `minConfidenceForTap`.
- [ ] Implement stale screenshot guard.
- [ ] Implement max candidate rejection.
- [ ] Implement retry limit.

---

## G. Resolver Checklist

- [ ] Exact match.
- [ ] Normalized match.
- [ ] Fuzzy match.
- [ ] Ambiguous candidate rejection.
- [ ] Candidate ranking output.
- [ ] `matchType` reporting.

---

## H. Verification Checklist

- [ ] Target disappeared check.
- [ ] Expected text appeared check.
- [ ] Screen summary changed check.
- [ ] Deterministic locator became available check.
- [ ] Verification failure reason mapping.

---

## I. Telemetry Checklist

- [ ] Record provider.
- [ ] Record engine / model.
- [ ] Record duration.
- [ ] Record screenshot path.
- [ ] Record candidate count.
- [ ] Record selected text.
- [ ] Record confidence.
- [ ] Record `matchType`.
- [ ] Record post-verification result.
- [ ] Record fallback reason.

---

## J. Testing Checklist

### Unit Tests

- [ ] `MacVisionOcrProvider` returns normalized `OcrOutput`.
- [ ] Provider empty result handling.
- [ ] Provider low-confidence handling.
- [ ] Exact match resolver.
- [ ] Normalized match resolver.
- [ ] Fuzzy match resolver.
- [ ] Ambiguous candidate rejection.
- [ ] Policy allows low-risk action.
- [ ] Policy blocks risky action.

### Integration Tests

- [ ] Deterministic miss -> OCR assert success.
- [ ] Deterministic miss -> OCR tap success.
- [ ] OCR low confidence -> safe fail.
- [ ] OCR ambiguous target -> safe fail.
- [ ] OCR tap -> verification success.
- [ ] OCR tap wrong target simulation -> verification catches failure.

### Scenario Fixtures

- [ ] Visible text but no accessibility id.
- [ ] Multiple identical text candidates.
- [ ] Weak contrast text.
- [ ] Mixed Chinese / English text.
- [ ] Flutter / custom canvas text.
- [ ] Transient loading state blocked from OCR.

---

## K. Future Extension Notes

- [ ] Preserve provider extension points for future `RemoteMcpOcrProvider` support.
- [ ] Preserve provider extension points for future `RemoteHttpOcrProvider` support.
- [ ] Document that non-default providers are intentionally out of current scope.

---

## L. Future AI Enhancement Notes

- [ ] Keep target resolution design compatible with future AI rerank.
- [ ] Keep `matchType` extensible for future `ai-reranked` reporting.
- [ ] Document AI rerank as a later optimization, not a first-phase deliverable.

---

## Recommended Execution Order

### Milestone 1
- [ ] Complete contracts / interfaces / policy / reason codes.
- [ ] Add `adapter-vision` foundation.
- [ ] Implement `MacVisionOcrProvider`.

### Milestone 2
- [ ] Integrate with `perform-action-with-evidence`.
- [ ] Make `assertText` and `tap by text` work end-to-end.
- [ ] Add telemetry.

### Milestone 3
- [ ] Finish post-verification.
- [ ] Finish policy hardening.
- [ ] Finish integration tests.

### Optional Future Milestones
- [ ] Add remote provider support when needed.
- [ ] Open provider configuration when a second provider is introduced.
- [ ] Add AI rerank only if ambiguity rates justify it.
