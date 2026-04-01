import type {
  AmbiguityDiff,
  InspectUiMatch,
  InspectUiMatchField,
  InspectUiNode,
  InspectUiQueryResult,
  InspectUiSummary,
  QueryUiSelector,
  ReasonCode,
  UiBounds,
  UiPoint,
  UiScrollDirection,
  UiTargetResolution,
  UiTargetResolutionStatus,
  WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

export interface ResolvedUiTarget {
  matchCount: number;
  matchedNode?: InspectUiNode;
  resolvedBounds?: UiBounds;
  resolvedPoint?: UiPoint;
}

export interface UiSwipeCoordinates {
  start: UiPoint;
  end: UiPoint;
  durationMs: number;
}

export interface IosNativeLocatorCandidate {
  kind: "identifier";
  value: string;
}

export interface WaitForUiReadFailureState {
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function decodeXmlText(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&#10;", "\n")
    .replaceAll("&#39;", "'");
}

export function normalizeQueryUiSelector(query: QueryUiSelector): QueryUiSelector {
  const normalized: QueryUiSelector = {};

  if (query.resourceId && query.resourceId.length > 0) {
    normalized.resourceId = query.resourceId;
  }
  if (query.contentDesc && query.contentDesc.length > 0) {
    normalized.contentDesc = query.contentDesc;
  }
  if (query.text && query.text.length > 0) {
    normalized.text = query.text;
  }
  if (query.className && query.className.length > 0) {
    normalized.className = query.className;
  }
  if (query.clickable !== undefined) {
    normalized.clickable = query.clickable;
  }
  if (typeof query.limit === "number" && Number.isFinite(query.limit) && query.limit > 0) {
    normalized.limit = Math.floor(query.limit);
  }

  return normalized;
}

export function hasQueryUiSelector(query: QueryUiSelector): boolean {
  return query.resourceId !== undefined
    || query.contentDesc !== undefined
    || query.text !== undefined
    || query.className !== undefined
    || query.clickable !== undefined;
}

export function buildIosNativeLocatorCandidate(
  node: InspectUiNode | undefined,
  _query?: QueryUiSelector,
): IosNativeLocatorCandidate | undefined {
  if (!node?.resourceId) {
    return undefined;
  }
  return {
    kind: "identifier",
    value: node.resourceId,
  };
}

export function parseAndroidUiHierarchyNodes(xml: string): InspectUiNode[] {
  const nodes: InspectUiNode[] = [];
  const nodeRegex = /<node([^>]*)\/?>(?:<\/node>)?/g;

  for (const match of xml.matchAll(nodeRegex)) {
    const rawAttributes = match[1] ?? "";
    const attributes = Object.fromEntries(
      Array.from(rawAttributes.matchAll(/([\w:-]+)="([^"]*)"/g)).map(([, key, value]) => [key, decodeXmlText(value) ?? ""]),
    );

    nodes.push({
      index: attributes.index ? Number(attributes.index) : undefined,
      text: attributes.text || undefined,
      resourceId: attributes["resource-id"] || undefined,
      className: attributes.class || undefined,
      packageName: attributes.package || undefined,
      contentDesc: attributes["content-desc"] || undefined,
      clickable: attributes.clickable === "true",
      enabled: attributes.enabled !== "false",
      scrollable: attributes.scrollable === "true",
      bounds: attributes.bounds || undefined,
    });
  }

  return nodes;
}

export function buildInspectUiSummary(nodes: InspectUiNode[]): InspectUiSummary {
  const sampleNodes = nodes.filter((node) => node.clickable || node.text || node.contentDesc || node.resourceId).slice(0, 25);
  return {
    totalNodes: nodes.length,
    clickableNodes: nodes.filter((node) => node.clickable).length,
    scrollableNodes: nodes.filter((node) => node.scrollable).length,
    nodesWithText: nodes.filter((node) => Boolean(node.text)).length,
    nodesWithContentDesc: nodes.filter((node) => Boolean(node.contentDesc)).length,
    sampleNodes,
  };
}

export function parseInspectUiSummary(xml: string): InspectUiSummary {
  return buildInspectUiSummary(parseAndroidUiHierarchyNodes(xml));
}

function toIosInspectNode(node: Record<string, unknown>, depth: number): InspectUiNode {
  const frame = isRecord(node.frame) ? node.frame : undefined;
  const frameX = typeof frame?.x === "number" ? frame.x : 0;
  const frameY = typeof frame?.y === "number" ? frame.y : 0;
  const frameWidth = typeof frame?.width === "number" ? frame.width : 0;
  const frameHeight = typeof frame?.height === "number" ? frame.height : 0;
  const bounds = frame ? `[${String(frameX)},${String(frameY)}][${String(frameX + frameWidth)},${String(frameY + frameHeight)}]` : undefined;
  const type = readNonEmptyString(node, "type") ?? undefined;

  const stableIdentifier = readNonEmptyString(node, "identifier")
    ?? readNonEmptyString(node, "AXIdentifier")
    ?? readNonEmptyString(node, "id")
    ?? readNonEmptyString(node, "AXUniqueId")
    ?? undefined;
  const title = readNonEmptyString(node, "title") ?? undefined;
  const label = readNonEmptyString(node, "AXLabel")
    ?? readNonEmptyString(node, "name")
    ?? undefined;
  const valueText = readNonEmptyString(node, "value")
    ?? readNonEmptyString(node, "AXValue")
    ?? undefined;
  const labelEligibleForText = ["Button", "Link", "Cell", "StaticText"].includes(type ?? "");

  return {
    depth,
    text: title ?? valueText ?? (labelEligibleForText ? label : undefined),
    resourceId: stableIdentifier,
    className: type,
    packageName: readNonEmptyString(node, "bundleIdentifier")
      ?? readNonEmptyString(node, "bundleId")
      ?? readNonEmptyString(node, "bundle")
      ?? undefined,
    contentDesc: label,
    clickable: ["Button", "Link", "Cell"].includes(type ?? "") || (Array.isArray(node.custom_actions) && node.custom_actions.length > 0),
    enabled: node.enabled !== false,
    scrollable: (type ?? "").toLowerCase().includes("scroll"),
    bounds,
  };
}

function flattenIosInspectNodes(input: unknown, output: InspectUiNode[], depth = 0): void {
  if (!Array.isArray(input)) {
    return;
  }

  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }
    output.push(toIosInspectNode(item, depth));
    flattenIosInspectNodes(item.children, output, depth + 1);
  }
}

function calculateBoundsOverlapRatio(left: UiBounds, right: UiBounds): number {
  const overlapX = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const overlapY = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  const overlapArea = overlapX * overlapY;
  const leftArea = left.width * left.height;
  if (leftArea <= 0) {
    return 0;
  }
  return Number((overlapArea / leftArea).toFixed(2));
}

function annotateOverlap(matches: InspectUiMatch[]): InspectUiMatch[] {
  return matches.map((match, index) => {
    const matchBounds = parseUiBounds(match.node.bounds);
    if (!matchBounds) {
      return match;
    }
    let maxOverlap = 0;
    let strongestOccluderScore: number | undefined;
    let strongestOccluderClickable = false;
    for (let candidateIndex = 0; candidateIndex < index; candidateIndex += 1) {
      const higherRanked = matches[candidateIndex];
      const higherBounds = parseUiBounds(higherRanked?.node.bounds);
      if (!higherBounds) {
        continue;
      }
      const overlap = calculateBoundsOverlapRatio(matchBounds, higherBounds);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        strongestOccluderScore = higherRanked?.score;
        strongestOccluderClickable = higherRanked?.node.clickable === true;
      }
    }
    const visibilityHeuristics = [
      maxOverlap >= 0.8 ? `heavy_overlap:${String(maxOverlap)}` : undefined,
      strongestOccluderClickable ? "occluded_by_clickable_candidate" : undefined,
      typeof strongestOccluderScore === "number" && typeof match.score === "number" ? `occluder_score_delta:${String(Number((strongestOccluderScore - match.score).toFixed(2)))}` : undefined,
      match.viewportOverlapPercent !== undefined && match.viewportOverlapPercent < 0.25 ? `low_viewport_visibility:${String(match.viewportOverlapPercent)}` : undefined,
    ].filter((value): value is string => Boolean(value));
    return {
      ...match,
      overlapPercentWithHigherRanked: maxOverlap > 0 ? maxOverlap : undefined,
      obscuredByHigherRanked: maxOverlap >= 0.8 ? true : undefined,
      visibilityHeuristics: visibilityHeuristics.length > 0 ? visibilityHeuristics : undefined,
    };
  });
}

export function parseIosInspectNodes(jsonText: string): InspectUiNode[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const nodes: InspectUiNode[] = [];
  flattenIosInspectNodes(parsed, nodes);
  return nodes;
}

export function parseIosInspectSummary(jsonText: string): InspectUiSummary {
  return buildInspectUiSummary(parseIosInspectNodes(jsonText));
}

function matchesQueryString(nodeValue: string | undefined, queryValue: string | undefined): boolean {
  if (queryValue === undefined) {
    return true;
  }
  if (!nodeValue) {
    return false;
  }
  return nodeValue.toLocaleLowerCase().includes(queryValue.toLocaleLowerCase());
}

function classifyStringMatch(nodeValue: string | undefined, queryValue: string | undefined): { matched: boolean; quality?: "exact" | "prefix" | "substring"; score: number; note?: string } {
  if (queryValue === undefined) {
    return { matched: true, score: 0 };
  }
  if (!nodeValue) {
    return { matched: false, score: 0 };
  }
  const normalizedNode = nodeValue.toLocaleLowerCase();
  const normalizedQuery = queryValue.toLocaleLowerCase();
  if (normalizedNode === normalizedQuery) {
    return { matched: true, quality: "exact", score: 6, note: "exact text match" };
  }
  if (normalizedNode.startsWith(normalizedQuery)) {
    return { matched: true, quality: "prefix", score: 4, note: "prefix text match" };
  }
  if (normalizedNode.includes(normalizedQuery)) {
    return { matched: true, quality: "substring", score: 2, note: "substring text match" };
  }
  return { matched: false, score: 0 };
}

export function detectViewportBounds(nodes: InspectUiNode[]): UiBounds {
  const candidateBounds = nodes
    .map((node) => parseUiBounds(node.bounds))
    .filter((bounds): bounds is UiBounds => bounds !== undefined);
  const scrollableBounds = nodes
    .filter((node) => node.scrollable)
    .map((node) => parseUiBounds(node.bounds))
    .filter((bounds): bounds is UiBounds => bounds !== undefined);

  return scrollableBounds[0]
    ?? candidateBounds.sort((left, right) => (right.width * right.height) - (left.width * left.height))[0]
    ?? {
      left: 0,
      top: 0,
      right: 1080,
      bottom: 1920,
      width: 1080,
      height: 1920,
      center: { x: 540, y: 960 },
    };
}

export function calculateViewportOverlap(bounds: UiBounds, viewport: UiBounds): number {
  const visibleX = Math.max(0, Math.min(bounds.right, viewport.right) - Math.max(bounds.left, viewport.left));
  const visibleY = Math.max(0, Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top));
  const visibleArea = visibleX * visibleY;
  const totalArea = bounds.width * bounds.height;
  if (totalArea <= 0) {
    return 0;
  }
  return Number((visibleArea / totalArea).toFixed(2));
}

function calculateDistanceToViewportCenter(bounds: UiBounds, viewport: UiBounds): number {
  const dx = bounds.center.x - viewport.center.x;
  const dy = bounds.center.y - viewport.center.y;
  return Math.round(Math.sqrt((dx * dx) + (dy * dy)));
}

export function diffAmbiguousCandidates(matches: InspectUiMatch[]): AmbiguityDiff | undefined {
  const left = matches[0];
  const right = matches[1];
  if (!left || !right) {
    return undefined;
  }

  const differingFields: AmbiguityDiff["differingFields"] = [];
  const maybePush = (field: AmbiguityDiff["differingFields"][number]["field"], leftValue: unknown, rightValue: unknown) => {
    if (leftValue === rightValue) {
      return;
    }
    differingFields.push({
      field,
      left: leftValue === undefined ? undefined : String(leftValue),
      right: rightValue === undefined ? undefined : String(rightValue),
    });
  };

  maybePush("resourceId", left.node.resourceId, right.node.resourceId);
  maybePush("contentDesc", left.node.contentDesc, right.node.contentDesc);
  maybePush("text", left.node.text, right.node.text);
  maybePush("className", left.node.className, right.node.className);
  maybePush("clickable", left.node.clickable, right.node.clickable);
  maybePush("enabled", left.node.enabled, right.node.enabled);
  maybePush("bounds", left.node.bounds, right.node.bounds);

  const suggestedSelectors = [
    left.node.resourceId ? { resourceId: left.node.resourceId } : undefined,
    left.node.contentDesc ? { contentDesc: left.node.contentDesc } : undefined,
    left.node.text ? { text: left.node.text } : undefined,
    left.node.clickable !== right.node.clickable ? { clickable: left.node.clickable } : undefined,
  ].filter((value): value is NonNullable<typeof value> => value !== undefined).slice(0, 3);

  return {
    scoreDelta: left.score !== undefined && right.score !== undefined ? Number(((left.score ?? 0) - (right.score ?? 0)).toFixed(2)) : undefined,
    differingFields,
    suggestedSelectors,
  };
}

export function queryUiNodes(nodes: InspectUiNode[], query: QueryUiSelector): { totalMatches: number; matches: InspectUiMatch[] } {
  const viewport = detectViewportBounds(nodes);
  const allMatches = nodes.flatMap((node) => {
    const matchedBy: InspectUiMatchField[] = [];
    const scoreBreakdown: string[] = [];
    let score = 0;
    let matchQuality: InspectUiMatch["matchQuality"];
    const parsedBounds = parseUiBounds(node.bounds);
    const viewportOverlapPercent = parsedBounds ? calculateViewportOverlap(parsedBounds, viewport) : undefined;
    const isOffScreen = typeof viewportOverlapPercent === "number" ? viewportOverlapPercent <= 0 : false;
    const distanceToViewportCenter = parsedBounds ? calculateDistanceToViewportCenter(parsedBounds, viewport) : undefined;

    if (query.resourceId !== undefined) {
      const result = classifyStringMatch(node.resourceId, query.resourceId);
      if (!result.matched) {
        return [];
      }
      matchedBy.push("resourceId");
      score += result.quality === "exact" ? 10 : result.quality === "prefix" ? 8 : 6;
      scoreBreakdown.push(result.note ?? "resourceId match");
      matchQuality = matchQuality ?? result.quality;
    }

    if (query.contentDesc !== undefined) {
      const result = classifyStringMatch(node.contentDesc, query.contentDesc);
      if (!result.matched) {
        return [];
      }
      matchedBy.push("contentDesc");
      score += result.score;
      scoreBreakdown.push(result.note ?? "content description match");
      matchQuality = matchQuality ?? result.quality;
    }

    if (query.text !== undefined) {
      const result = classifyStringMatch(node.text, query.text);
      if (!result.matched) {
        return [];
      }
      matchedBy.push("text");
      score += result.score;
      scoreBreakdown.push(result.note ?? "text match");
      matchQuality = matchQuality ?? result.quality;
    }

    if (query.className !== undefined) {
      const result = classifyStringMatch(node.className, query.className);
      if (!result.matched) {
        return [];
      }
      matchedBy.push("className");
      score += result.score;
      scoreBreakdown.push(result.note ?? "class name match");
      matchQuality = matchQuality ?? result.quality;
    }

    if (query.clickable !== undefined) {
      if (node.clickable !== query.clickable) {
        return [];
      }
      matchedBy.push("clickable");
      score += 1;
      scoreBreakdown.push("clickable flag matched");
      matchQuality = matchQuality ?? "boolean";
    }

    if (node.enabled === false) {
      score -= 3;
      scoreBreakdown.push("disabled node penalty");
    }
    if (!node.bounds) {
      score -= 2;
      scoreBreakdown.push("missing bounds penalty");
    }
    if (isOffScreen) {
      score -= 2;
      scoreBreakdown.push(`off-screen penalty (${String(viewportOverlapPercent)})`);
    } else if (typeof viewportOverlapPercent === "number") {
      score += 2;
      scoreBreakdown.push(`visible in viewport bonus (${String(viewportOverlapPercent)})`);
    }
    if (node.clickable) {
      score += 1;
      scoreBreakdown.push("clickable node bonus");
    }
    if (typeof node.depth === "number") {
      const depthBonus = Math.min(3, node.depth);
      score += depthBonus;
      scoreBreakdown.push(`leaf-depth bonus (${String(depthBonus)})`);
    }
    if (node.contentDesc || node.text) {
      score += 1;
      scoreBreakdown.push("human-readable node bonus");
    }
    if (typeof distanceToViewportCenter === "number") {
      const centerBonus = Math.max(0, 2 - Math.floor(distanceToViewportCenter / 500));
      if (centerBonus > 0) {
        score += centerBonus;
        scoreBreakdown.push(`viewport centrality bonus (${String(centerBonus)})`);
      }
    }

    return [{ node, matchedBy, score, matchQuality, scoreBreakdown, isOffScreen, viewportOverlapPercent, distanceToViewportCenter }];
  });

  const sortedMatches = annotateOverlap(allMatches.sort((left, right) => {
    const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const leftEnabled = left.node.enabled === false ? 0 : 1;
    const rightEnabled = right.node.enabled === false ? 0 : 1;
    if (rightEnabled !== leftEnabled) {
      return rightEnabled - leftEnabled;
    }
    const leftVisible = left.isOffScreen ? 0 : 1;
    const rightVisible = right.isOffScreen ? 0 : 1;
    if (rightVisible !== leftVisible) {
      return rightVisible - leftVisible;
    }
    const leftClickable = left.node.clickable ? 1 : 0;
    const rightClickable = right.node.clickable ? 1 : 0;
    if (rightClickable !== leftClickable) {
      return rightClickable - leftClickable;
    }
    const leftDistance = left.distanceToViewportCenter ?? Number.MAX_SAFE_INTEGER;
    const rightDistance = right.distanceToViewportCenter ?? Number.MAX_SAFE_INTEGER;
    return leftDistance - rightDistance;
  })).map((match) => {
    if (match.obscuredByHigherRanked) {
      return {
        ...match,
        score: (match.score ?? 0) - ((match.node.clickable ? 1 : 2)),
        scoreBreakdown: [...(match.scoreBreakdown ?? []), `obscured penalty (${String(match.overlapPercentWithHigherRanked)})`, ...(match.visibilityHeuristics ?? [])],
      };
    }
    if ((match.viewportOverlapPercent ?? 1) < 0.25) {
      return {
        ...match,
        score: (match.score ?? 0) - 1,
        scoreBreakdown: [...(match.scoreBreakdown ?? []), ...(match.visibilityHeuristics ?? [])],
      };
    }
    return match;
  }).sort((left, right) => (right.score ?? 0) - (left.score ?? 0));

  return {
    totalMatches: sortedMatches.length,
    matches: query.limit === undefined ? sortedMatches : sortedMatches.slice(0, query.limit),
  };
}

export function parseUiBounds(bounds: string | undefined): UiBounds | undefined {
  if (!bounds) {
    return undefined;
  }

  const match = bounds.match(/^\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]$/);
  if (!match) {
    return undefined;
  }

  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);
  const width = right - left;
  const height = bottom - top;

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    center: {
      x: Math.round(left + width / 2),
      y: Math.round(top + height / 2),
    },
  };
}

export function resolveFirstTapTarget(matches: InspectUiMatch[]): ResolvedUiTarget {
  const matchedNode = matches[0]?.node;
  const resolvedBounds = parseUiBounds(matchedNode?.bounds);
  return {
    matchCount: matches.length,
    matchedNode,
    resolvedBounds,
    resolvedPoint: resolvedBounds?.center,
  };
}

function selectDominantCandidate(matches: InspectUiMatch[]): InspectUiMatch | undefined {
  const bestCandidate = matches[0];
  const secondCandidate = matches[1];
  if (!bestCandidate || !secondCandidate) {
    return undefined;
  }

  const bestBounds = parseUiBounds(bestCandidate.node.bounds);
  if (!bestBounds || bestCandidate.node.enabled === false || bestCandidate.isOffScreen) {
    return undefined;
  }
  if ((bestCandidate.viewportOverlapPercent ?? 1) < 0.25) {
    return undefined;
  }

  const bestHasStrongSelector = bestCandidate.matchedBy.some((field) => field === "resourceId" || field === "text" || field === "contentDesc");
  if (!bestHasStrongSelector || bestCandidate.matchQuality !== "exact") {
    return undefined;
  }

  const secondHasStrongSelector = secondCandidate.matchedBy.some((field) => field === "resourceId" || field === "text" || field === "contentDesc");
  const secondIsPeerExact = secondHasStrongSelector && secondCandidate.matchQuality === "exact";
  const bestHasExactResourceId = bestCandidate.matchQuality === "exact" && bestCandidate.matchedBy.includes("resourceId");
  const secondHasExactResourceId = secondCandidate.matchQuality === "exact" && secondCandidate.matchedBy.includes("resourceId");
  const topScore = bestCandidate.score ?? 0;
  const secondScore = secondCandidate.score ?? 0;
  const scoreDelta = topScore - secondScore;

  if (scoreDelta < 3) {
    return undefined;
  }

  if (secondIsPeerExact && !(bestHasExactResourceId && !secondHasExactResourceId)) {
    return undefined;
  }

  return bestCandidate;
}

export function buildUiTargetResolution(query: QueryUiSelector, result: InspectUiQueryResult, supportLevel: "full" | "partial"): UiTargetResolution {
  if (supportLevel === "partial") {
    return {
      status: "unsupported",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
    };
  }

  if (result.totalMatches === 0) {
    return {
      status: "no_match",
      matchCount: 0,
      query,
      matches: result.matches,
    };
  }

  if (result.totalMatches > 1 && result.matches.every((match) => match.isOffScreen)) {
    return {
      status: "off_screen",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
      bestCandidate: result.matches[0],
      ambiguityReason: "Matching nodes were found, but they are currently outside the visible viewport.",
    };
  }

  if (result.totalMatches > 1) {
    const bestCandidate = result.matches[0];
    const dominantCandidate = selectDominantCandidate(result.matches);
    if (dominantCandidate) {
      const matchedNode = dominantCandidate.node;
      const resolvedBounds = parseUiBounds(matchedNode.bounds);
      if (resolvedBounds) {
        return {
          status: "resolved",
          matchCount: result.totalMatches,
          query,
          matches: result.matches,
          bestCandidate: dominantCandidate,
          matchedNode,
          resolvedBounds,
          resolvedPoint: resolvedBounds.center,
        };
      }
    }
    const topScore = bestCandidate?.score;
    const secondScore = result.matches[1]?.score;
    const ambiguityDiff = diffAmbiguousCandidates(result.matches);
    if (bestCandidate?.node.enabled === false && result.matches.every((match) => match.node.enabled === false)) {
      return {
        status: "disabled_match",
        matchCount: result.totalMatches,
        query,
        matches: result.matches,
        bestCandidate,
        ambiguityReason: "Only disabled matches were found for the selector.",
        ambiguityDiff,
      };
    }
    return {
      status: "ambiguous",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
      bestCandidate,
      ambiguityReason: topScore !== undefined && secondScore !== undefined && topScore === secondScore
        ? `Multiple candidates have the same top ranking score. Top diff: ${ambiguityDiff?.differingFields.map((item) => `${item.field}(${item.left ?? "∅"} vs ${item.right ?? "∅"})`).join(", ") ?? "none"}.`
        : "Multiple candidates matched; narrow the selector to disambiguate.",
      ambiguityDiff,
    };
  }

  const matchedNode = result.matches[0]?.node;
  const bestCandidate = result.matches[0];
  if (bestCandidate?.isOffScreen || ((bestCandidate?.viewportOverlapPercent ?? 1) < 0.25)) {
    return {
      status: "off_screen",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
      bestCandidate,
      matchedNode,
      ambiguityReason: "The best matching node is currently outside the visible viewport.",
    };
  }
  if (matchedNode && matchedNode.enabled === false) {
    return {
      status: "disabled_match",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
      bestCandidate,
      matchedNode,
      ambiguityReason: "The best matching node is disabled.",
    };
  }
  const resolvedBounds = parseUiBounds(matchedNode?.bounds);
  if (!matchedNode || !resolvedBounds) {
    return {
      status: "missing_bounds",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
      bestCandidate,
      matchedNode,
    };
  }

  return {
    status: "resolved",
    matchCount: result.totalMatches,
    query,
    matches: result.matches,
    bestCandidate,
    matchedNode,
    resolvedBounds,
    resolvedPoint: resolvedBounds.center,
  };
}

export function buildNonExecutedUiTargetResolution(query: QueryUiSelector, supportLevel: "full" | "partial"): UiTargetResolution {
  return {
    status: supportLevel === "full" ? "not_executed" : "unsupported",
    matchCount: 0,
    query,
    matches: [],
  };
}

export function reasonCodeForResolutionStatus(status: UiTargetResolutionStatus): ReasonCode {
  if (status === "resolved") {
    return REASON_CODES.ok;
  }
  if (status === "no_match") {
    return REASON_CODES.noMatch;
  }
  if (status === "ambiguous") {
    return REASON_CODES.ambiguousMatch;
  }
  if (status === "missing_bounds") {
    return REASON_CODES.missingBounds;
  }
  if (status === "disabled_match") {
    return REASON_CODES.actionFocusFailed;
  }
  if (status === "off_screen") {
    return REASON_CODES.noMatch;
  }
  if (status === "not_executed") {
    return REASON_CODES.adapterError;
  }
  return REASON_CODES.unsupportedOperation;
}

export function isWaitConditionMet(result: InspectUiQueryResult, waitUntil: WaitForUiMode): boolean {
  if (waitUntil === "gone") {
    return result.totalMatches === 0;
  }
  if (waitUntil === "unique") {
    return result.totalMatches === 1;
  }
  const bestCandidate = result.matches[0];
  if (!bestCandidate) {
    return false;
  }
  if (bestCandidate.isOffScreen) {
    return false;
  }
  return (bestCandidate.viewportOverlapPercent ?? 1) >= 0.25;
}

export function shouldAbortWaitForUiAfterReadFailure(state: WaitForUiReadFailureState): boolean {
  return state.consecutiveFailures >= state.maxConsecutiveFailures;
}

export function buildScrollSwipeCoordinates(nodes: InspectUiNode[], direction: UiScrollDirection, durationMs: number): UiSwipeCoordinates {
  const viewport = detectViewportBounds(nodes);

  const x = viewport.center.x;
  const upper = Math.round(viewport.top + viewport.height * 0.25);
  const lower = Math.round(viewport.top + viewport.height * 0.75);

  return direction === "up"
    ? { start: { x, y: lower }, end: { x, y: upper }, durationMs }
    : { start: { x, y: upper }, end: { x, y: lower }, durationMs };
}
