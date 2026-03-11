import type { OcrMatchType, OcrTextBlock, RankedOcrCandidate, ResolveTextTargetInput, ResolveTextTargetResult } from "../types.js";

const DEFAULT_MIN_FUZZY_SCORE = 0.72;
const DEFAULT_AMBIGUITY_THRESHOLD = 0.03;

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const insertCost = (current[rightIndex - 1] ?? 0) + 1;
      const deleteCost = (previous[rightIndex] ?? 0) + 1;
      const replaceCost = (previous[rightIndex - 1] ?? 0) + substitutionCost;
      current[rightIndex] = Math.min(insertCost, deleteCost, replaceCost);
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function matchWeight(matchType: OcrMatchType | "none"): number {
  switch (matchType) {
    case "exact":
      return 1;
    case "normalized":
      return 0.97;
    case "fuzzy":
      return 0.9;
    case "ai-reranked":
      return 0.92;
    default:
      return 0;
  }
}

function buildCandidate(
  targetText: string,
  normalizedTarget: string,
  block: OcrTextBlock,
  fuzzyEnabled: boolean,
  minFuzzyScore: number,
): RankedOcrCandidate | undefined {
  const normalizedText = normalizeOcrText(block.text);
  if (!normalizedText) {
    return undefined;
  }

  let matchType: OcrMatchType | "none" = "none";
  let similarity = 0;

  if (block.text.trim() === targetText.trim()) {
    matchType = "exact";
    similarity = 1;
  } else if (normalizedText === normalizedTarget) {
    matchType = "normalized";
    similarity = 1;
  } else if (fuzzyEnabled) {
    similarity = computeTextSimilarity(normalizedTarget, normalizedText);
    if (similarity >= minFuzzyScore) {
      matchType = "fuzzy";
    }
  }

  if (matchType === "none") {
    return undefined;
  }

  const matchScore = matchType === "fuzzy"
    ? Math.max(matchWeight(matchType), similarity)
    : matchWeight(matchType);
  const rankScore = Number((matchScore * 0.85 + block.confidence * 0.15).toFixed(6));

  return {
    block,
    normalizedText,
    matchType,
    similarity,
    matchScore,
    rankScore,
  };
}

export function normalizeOcrText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u2033\u2036]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[-_/\\]+/g, " ")
    .replace(/[^\p{L}\p{N}\s'"]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function computeTextSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeOcrText(left);
  const normalizedRight = normalizeOcrText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const editDistance = levenshteinDistance(normalizedLeft, normalizedRight);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  const editScore = maxLength === 0 ? 0 : 1 - editDistance / maxLength;
  const containmentScore = normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
    ? Math.min(normalizedLeft.length, normalizedRight.length) / maxLength
    : 0;
  const overlapScore = tokenOverlap(normalizedLeft, normalizedRight);

  return Number(Math.max(editScore, (editScore + overlapScore + containmentScore) / 3).toFixed(6));
}

export function rankOcrCandidates(input: ResolveTextTargetInput): RankedOcrCandidate[] {
  const normalizedTarget = normalizeOcrText(input.targetText);
  if (!normalizedTarget) {
    return [];
  }

  const fuzzyEnabled = input.fuzzy ?? true;
  const minFuzzyScore = input.minFuzzyScore ?? DEFAULT_MIN_FUZZY_SCORE;

  return input.blocks
    .flatMap((block) => {
      const candidate = buildCandidate(input.targetText, normalizedTarget, block, fuzzyEnabled, minFuzzyScore);
      return candidate ? [candidate] : [];
    })
    .sort((left, right) => {
      return (right.rankScore ?? 0) - (left.rankScore ?? 0)
        || (right.matchScore ?? 0) - (left.matchScore ?? 0)
        || right.block.confidence - left.block.confidence
        || left.block.bounds.top - right.block.bounds.top
        || left.block.bounds.left - right.block.bounds.left;
    });
}

export function resolveTextTarget(input: ResolveTextTargetInput): ResolveTextTargetResult {
  const normalizedTargetText = normalizeOcrText(input.targetText);
  if (!normalizedTargetText) {
    return {
      status: "invalid_input",
      matched: false,
      confidence: 0,
      targetText: input.targetText,
      normalizedTargetText,
      candidates: [],
      rejectionReason: "empty_target",
    };
  }

  const candidates = rankOcrCandidates(input);
  if (candidates.length === 0) {
    return {
      status: "no_match",
      matched: false,
      confidence: 0,
      targetText: input.targetText,
      normalizedTargetText,
      candidates: [],
      rejectionReason: "no_match",
    };
  }

  const [best, next] = candidates;
  if (!best) {
    return {
      status: "no_match",
      matched: false,
      confidence: 0,
      targetText: input.targetText,
      normalizedTargetText,
      candidates: [],
      rejectionReason: "no_match",
    };
  }

  const ambiguityThreshold = input.ambiguityThreshold ?? DEFAULT_AMBIGUITY_THRESHOLD;
  const exactOnly = input.exact ?? false;
  const exactMatchRequired = exactOnly && best.matchType !== "exact";
  const duplicateTopText = candidates.filter((candidate) => candidate.normalizedText === best.normalizedText && candidate.matchType === best.matchType).length > 1;
  const scoreTooClose = next !== undefined
    && next.matchType === best.matchType
    && Math.abs((best.rankScore ?? 0) - (next.rankScore ?? 0)) <= ambiguityThreshold;

  if (exactMatchRequired) {
    return {
      status: "no_match",
      matched: false,
      confidence: 0,
      targetText: input.targetText,
      normalizedTargetText,
      candidates,
      rejectionReason: "no_match",
    };
  }

  if (duplicateTopText || scoreTooClose) {
    return {
      status: "ambiguous",
      matched: false,
      confidence: best.rankScore ?? 0,
      targetText: input.targetText,
      normalizedTargetText,
      candidates,
      matchType: best.matchType === "none" ? undefined : best.matchType,
      rejectionReason: "ambiguous",
    };
  }

  return {
    status: "matched",
    matched: true,
    confidence: best.rankScore ?? 0,
    targetText: input.targetText,
    normalizedTargetText,
    bestCandidate: best.block,
    candidates,
    matchType: best.matchType === "none" ? undefined : best.matchType,
  };
}
