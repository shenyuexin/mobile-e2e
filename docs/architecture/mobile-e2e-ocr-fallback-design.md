# Mobile E2E OCR Fallback Design

## 1. Objective

Define a **deterministic-first, policy-governed OCR fallback subsystem** for `mobile-e2e-mcp` that:

1. Preserves deterministic automation as the primary path.
2. Provides bounded OCR fallback for low-risk actions when tree/semantic resolution fails.
3. Defaults to a local macOS implementation via `MacVisionOcrProvider`.
4. Supports future pluggable OCR providers behind a unified contract, while only implementing the macOS local provider in the first phase.
5. Produces evidence-rich, auditable results aligned with the platform's structured tool contracts.

---

## 2. Background

The current project architecture is explicitly **deterministic-first**:

- accessibility tree first
- stable ID / testID / resource-id first
- semantic resolution before probabilistic fallback
- evidence-rich execution and reproducible session state

However, real mobile E2E flows still contain bounded failure modes where deterministic automation cannot fully resolve targets:

- text is visible to the user but absent from the automation tree
- Flutter / custom canvas / hybrid webview screens expose poor locator semantics
- campaign or gray-release surfaces lack stable test instrumentation
- human-visible text is the only practical interaction anchor

To cover these cases without degrading the platform into OCR-first automation, the system needs a **controlled OCR fallback path**.

---

## 3. Design Goals

### 3.1 Goals

1. Provide OCR fallback only after deterministic and semantic resolution fail.
2. Default to macOS local OCR with no required external API dependency.
3. Keep OCR providers pluggable, while implementing only the default local provider in the first phase.
4. Normalize all provider outputs into a single standard contract.
5. Ensure every OCR-driven action passes through:
   - fallback policy
   - target resolution
   - post-action verification
   - telemetry and artifacts

### 3.2 Non-Goals

- Replacing deterministic locators with OCR as the primary path.
- Allowing high-risk actions to default to OCR execution.
- Implementing icon/template CV fallback in the first phase.
- Implementing AI rerank in the first phase.
- Implementing remote OCR MCP / HTTP provider integration in the first phase.
- Using VLMs as the only visual locator in the first phase.
- Building a document-processing OCR platform.

---

## 4. Core Decision

The project will adopt:

> **A unified OCR provider capability, with `MacVisionOcrProvider` as the first and only in-scope implementation, plus standardized output and shared policy / resolver / verification orchestration. Future providers remain extension points.**

### Why this design

- `MacVisionOcrProvider` gives the project an immediate, local-first default on macOS.
- Provider abstraction preserves future extensibility without forcing unnecessary first-phase integrations.
- Standardized output keeps orchestration logic independent from backend-specific response formats.
- Policy and verification are required to make OCR fallback safe rather than merely available.

---

## 5. High-Level Architecture

```text
perform_action_with_evidence
  -> deterministic / semantic resolution
  -> if failed:
       fallback policy check
       take screenshot
       OcrService
         -> OcrProvider (default: MacVisionOcrProvider)
         -> normalize to OcrOutput
       OcrTargetResolver
       confidence / action policy gate
       adapter coordinate action
       post-action verification
       telemetry + artifacts
```

---

## 6. Layered Design

### 6.1 Orchestration Layer

**Location**
- `packages/mcp-server/src/tools/perform-action-with-evidence.ts`

**Responsibilities**
- decide when OCR fallback is eligible
- drive screenshot -> OCR -> resolve -> action -> verify flow
- write structured outcome fields:
  - `resolutionStrategy`
  - `fallbackUsed`
  - `confidence`
  - `artifacts`
  - `reasonCode`

**Must not do**
- directly depend on engine-specific OCR SDK logic
- parse provider-specific raw response formats inline
- hardcode AI/VLM-specific behavior into tool orchestration

---

### 6.2 OCR Service Layer

**Recommended location**
- `packages/adapter-vision/`

Alternative:
- `packages/core/src/vision/`

**Responsibilities**
- expose a single OCR entry point
- manage provider selection and lifecycle
- normalize provider outputs to the shared contract

---

### 6.3 Provider Layer

**Responsibilities**
- run OCR on screenshots
- return text regions, confidence, and coordinates
- isolate backend-specific implementation details

**Provider types**
- `MacVisionOcrProvider` (default)
- `LocalOcrProvider`
- `RemoteMcpOcrProvider` (future extension)
- `RemoteHttpOcrProvider` (future extension)

**Default decision**
- First implementation uses `MacVisionOcrProvider`.

---

### 6.4 Resolver Layer

**Responsibilities**
- convert OCR blocks into an actionable target
- perform exact / normalized / fuzzy matching
- return best candidate and match confidence
- optionally support AI rerank in later phases

---

### 6.5 Policy Layer

**Responsibilities**
- control when OCR fallback is allowed
- restrict eligible actions
- define confidence thresholds by action type
- block risky actions from OCR fallback

---

### 6.6 Verification Layer

**Responsibilities**
- validate that OCR-driven actions produced the intended result
- prevent false-positive clicks from being reported as success

---

### 6.7 Telemetry & Audit Layer

**Responsibilities**
- record the full OCR fallback evidence chain
- support debugging, auditability, and reliability analysis

---

## 7. Provider Contract

```ts
export type OcrInput = {
  screenshotPath: string;
  platform: "ios" | "android";
  languageHints?: string[];
  crop?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
};

export type OcrTextBlock = {
  text: string;
  confidence: number;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
};

export type OcrOutput = {
  provider: string;
  engine: string;
  model?: string;
  durationMs: number;
  screenshotPath: string;
  blocks: OcrTextBlock[];
};

export interface OcrProvider {
  extractTextRegions(input: OcrInput): Promise<OcrOutput>;
}
```

### 7.1 Default Provider: `MacVisionOcrProvider`

**Purpose**
- Use local macOS OCR as the out-of-the-box default.

**Why**
- local execution
- no API key required
- suitable for screenshot text extraction
- aligns with open-source default usability

**Constraints**
- macOS-only
- does not solve Linux CI by itself
- accuracy may degrade on tiny or noisy text

### 7.2 Future Extensible Providers

#### `RemoteMcpOcrProvider`
Reserved for future external OCR MCP integrations.

**Use cases**
- existing OCR MCP infrastructure
- PaddleOCR MCP or other OCR MCP integrations

**Requirement**
- must normalize remote results into `OcrOutput`

#### `RemoteHttpOcrProvider`
Reserved for future HTTP-based OCR services.

#### `LocalOcrProvider`
Reserved for future non-macOS local OCR implementations.

---

## 8. Unified Output Contract

Upper layers consume only the normalized contract.

**Required fields**
- `provider`
- `engine`
- `durationMs`
- `screenshotPath`
- `blocks[].text`
- `blocks[].confidence`
- `blocks[].bounds`

**Rationale**
- supports text assertion
- supports coordinate tapping
- supports confidence gating
- supports evidence-rich debugging

---

## 9. OCR Fallback Policy

```ts
export type OcrFallbackPolicy = {
  enabled: boolean;
  allowedActions: Array<"tap" | "assertText" | "longPress">;
  blockedActions: Array<"delete" | "purchase" | "confirmPayment">;
  minConfidenceForAssert: number;
  minConfidenceForTap: number;
  minConfidenceForRiskyAction: number;
  maxCandidatesBeforeFail: number;
};
```

### 9.1 Default Policy

- `enabled = true`
- `allowedActions = ["tap", "assertText"]`
- `blockedActions = ["delete", "purchase", "confirmPayment"]`
- `minConfidenceForAssert = 0.70`
- `minConfidenceForTap = 0.82`
- `minConfidenceForRiskyAction = 0.93` or block entirely
- `maxCandidatesBeforeFail = 5`

### 9.2 Fallback Entry Conditions

OCR fallback is allowed only when all of the following are true:

1. deterministic resolution failed
2. semantic resolution failed or is unavailable
3. action type is allowed by policy
4. screenshot is fresh
5. screen is not in loading or transition state

### 9.3 Fallback Block Conditions

OCR fallback is blocked when any of the following is true:

- risky action
- stale screenshot
- active UI transition
- OCR confidence below threshold
- candidate ambiguity above threshold
- no clear text target in the action context

---

## 10. Target Resolution

```ts
export type ResolveTextTargetInput = {
  targetText: string;
  blocks: OcrTextBlock[];
  exact?: boolean;
  fuzzy?: boolean;
};

export type ResolveTextTargetResult = {
  matched: boolean;
  confidence: number;
  bestCandidate?: OcrTextBlock;
  candidates: OcrTextBlock[];
  matchType?: "exact" | "normalized" | "fuzzy" | "ai-reranked";
};
```

### 10.1 Matching Order

1. exact match
2. normalized match
3. fuzzy match
4. fail safe on ambiguity; optional AI rerank is reserved for future enhancement

### 10.2 Normalization Rules

- trim whitespace
- lowercase
- collapse repeated spaces
- normalize punctuation variants when needed

### 10.3 AI Usage

AI is a future enhancement layer, not a first-phase requirement. It is suitable for:

- ambiguous candidate reranking
- OCR typo correction
- phrase-level semantic disambiguation

---

## 11. Post-Action Verification

### 11.1 Why It Is Mandatory

The biggest OCR click failure is not non-recognition. It is **wrong recognition followed by a false success signal**.

### 11.2 Verification Rules

After an OCR-driven `tap`, at least one of the following must hold:

- target text disappears
- expected next text appears
- screen summary changes as expected
- deterministic locator becomes available
- screen identity changes

### 11.3 Failure Handling

- retry at most once
- second attempt only with tighter matching or local crop refinement
- hard fail after bounded retry

---

## 12. Telemetry, Audit, and Artifacts

Every OCR fallback should record:

- provider
- engine
- model
- screenshot path
- OCR duration
- total block count
- matched text
- selected bounds
- OCR confidence
- match type
- fallback reason
- post-verification result

```ts
export type OcrEvidence = {
  provider: string;
  engine: string;
  model?: string;
  durationMs: number;
  matchedText?: string;
  candidateCount: number;
  matchType?: string;
  ocrConfidence?: number;
  screenshotPath?: string;
};
```

This evidence should be written into structured tool outcome metadata or artifacts.

---

## 13. Integration Points in This Repo

### 13.1 `packages/mcp-server`

#### `perform-action-with-evidence`
Add:
- OCR fallback branch
- policy gate
- target resolver
- post-action verification
- telemetry integration

#### `describe-capabilities`
Add:
- OCR fallback support status
- default provider
- configured provider list
- OCR policy restrictions summary

### 13.2 `packages/contracts`

Confirm or extend:

- `ActionResolutionStrategy = "deterministic" | "semantic" | "ocr" | "cv"`
- outcome metadata includes OCR evidence
- reason codes cover OCR failure modes

**New / extended reason codes**
- `ocr_no_match`
- `ocr_low_confidence`
- `ocr_ambiguous_target`
- `ocr_post_verify_failed`
- `ocr_provider_error`

### 13.3 `packages/adapter-maestro`

Must provide:
- screenshot capture
- coordinate tap
- screen summary / post-state inspection

Local crop and stronger verification helpers can be added later if needed.

---

## 14. Rollout Strategy

### Phase 0 — Design & Contracts

**Goal**
- Freeze boundaries and contracts before implementation.

**Deliverables**
- design doc / ADR
- provider interfaces
- policy spec
- telemetry spec
- reason codes

### Phase 1 — MVP OCR Fallback

**Goal**
- Prove the minimal OCR fallback path.

**Scope**
- `MacVisionOcrProvider`
- normalized `OcrOutput`
- `assertText`
- `tap by text`
- telemetry

**Out of scope**
- remote providers
- AI rerank
- CV fallback

### Phase 2 — Governance & Stability

**Goal**
- Make OCR fallback safe, bounded, and auditable.

**Scope**
- policy hardening
- stale screenshot checks
- retry limits
- richer verification
- debug traces

### Future Extensions

The following remain explicit extension points but are **not part of the current implementation target**:

- additional local providers for non-macOS environments
- `RemoteMcpOcrProvider`
- `RemoteHttpOcrProvider`
- provider config and health checks for non-default providers
- AI rerank
- typo correction
- semantic disambiguation

---

## 15. Risks and Mitigations

### 15.1 Overuse Risk

**Risk**
- OCR becomes the default path, degrading reliability and latency.

**Mitigation**
- deterministic-first hard policy
- explicit fallback gating
- fallback rate metrics

### 15.2 False Positive Click Risk

**Risk**
- OCR resolves the wrong region and still executes the action.

**Mitigation**
- confidence threshold
- ambiguity rejection
- mandatory post-verification

### 15.3 Platform Lock-in Risk

**Risk**
- default implementation depends on macOS.

**Mitigation**
- provider abstraction
- isolate `MacVisionOcrProvider`
- add non-mac providers later

### 15.4 External Provider Drift Risk

**Risk**
- future external OCR MCP/HTTP provider contracts may evolve incompatibly.

**Mitigation**
- normalize all outputs
- provider-specific adapters
- provider contract tests when remote providers are introduced

### 15.5 Privacy Risk

**Risk**
- remote providers may require screenshot upload.

**Mitigation**
- local provider by default
- explicit remote provider opt-in
- documentation of outbound screenshot handling

---

## 16. Final Recommendation

The value of this subsystem is not merely “adding OCR.” It is:

> **Integrating OCR into the platform's deterministic-first execution model as a policy-governed, evidence-rich fallback subsystem.**

`MacVisionOcrProvider` is the right first implementation.

Pluggable providers remain an intentional extension seam, but they do not need to be implemented in the first phase.

Standardized output is necessary, but **policy and verification are what make the fallback operationally safe**.
