import type {
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

export interface WaitForUiReadFailureState {
  consecutiveReadFailures: number;
  maxConsecutiveReadFailures: number;
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

function toIosInspectNode(node: Record<string, unknown>): InspectUiNode {
  const frame = isRecord(node.frame) ? node.frame : undefined;
  const frameX = typeof frame?.x === "number" ? frame.x : 0;
  const frameY = typeof frame?.y === "number" ? frame.y : 0;
  const frameWidth = typeof frame?.width === "number" ? frame.width : 0;
  const frameHeight = typeof frame?.height === "number" ? frame.height : 0;
  const bounds = frame ? `[${String(frameX)},${String(frameY)}][${String(frameX + frameWidth)},${String(frameY + frameHeight)}]` : undefined;
  const type = readNonEmptyString(node, "type") ?? undefined;

  return {
    text: readNonEmptyString(node, "title") ?? undefined,
    resourceId: readNonEmptyString(node, "AXUniqueId") ?? undefined,
    className: type,
    packageName: readNonEmptyString(node, "role") ?? undefined,
    contentDesc: readNonEmptyString(node, "AXLabel") ?? undefined,
    clickable: ["Button", "Link", "Cell"].includes(type ?? "") || (Array.isArray(node.custom_actions) && node.custom_actions.length > 0),
    enabled: node.enabled !== false,
    scrollable: (type ?? "").toLowerCase().includes("scroll"),
    bounds,
  };
}

function flattenIosInspectNodes(input: unknown, output: InspectUiNode[]): void {
  if (!Array.isArray(input)) {
    return;
  }

  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }
    output.push(toIosInspectNode(item));
    flattenIosInspectNodes(item.children, output);
  }
}

export function parseIosInspectSummary(jsonText: string): InspectUiSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return buildInspectUiSummary([]);
  }
  const nodes: InspectUiNode[] = [];
  flattenIosInspectNodes(parsed, nodes);
  return buildInspectUiSummary(nodes);
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

export function queryUiNodes(nodes: InspectUiNode[], query: QueryUiSelector): { totalMatches: number; matches: InspectUiMatch[] } {
  const allMatches = nodes.flatMap((node) => {
    const matchedBy: InspectUiMatchField[] = [];

    if (query.resourceId !== undefined) {
      if (!matchesQueryString(node.resourceId, query.resourceId)) {
        return [];
      }
      matchedBy.push("resourceId");
    }

    if (query.contentDesc !== undefined) {
      if (!matchesQueryString(node.contentDesc, query.contentDesc)) {
        return [];
      }
      matchedBy.push("contentDesc");
    }

    if (query.text !== undefined) {
      if (!matchesQueryString(node.text, query.text)) {
        return [];
      }
      matchedBy.push("text");
    }

    if (query.className !== undefined) {
      if (!matchesQueryString(node.className, query.className)) {
        return [];
      }
      matchedBy.push("className");
    }

    if (query.clickable !== undefined) {
      if (node.clickable !== query.clickable) {
        return [];
      }
      matchedBy.push("clickable");
    }

    return [{ node, matchedBy, score: matchedBy.length }];
  });

  return {
    totalMatches: allMatches.length,
    matches: query.limit === undefined ? allMatches : allMatches.slice(0, query.limit),
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

  if (result.totalMatches > 1) {
    return {
      status: "ambiguous",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
    };
  }

  const matchedNode = result.matches[0]?.node;
  const resolvedBounds = parseUiBounds(matchedNode?.bounds);
  if (!matchedNode || !resolvedBounds) {
    return {
      status: "missing_bounds",
      matchCount: result.totalMatches,
      query,
      matches: result.matches,
      matchedNode,
    };
  }

  return {
    status: "resolved",
    matchCount: result.totalMatches,
    query,
    matches: result.matches,
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
  return result.totalMatches > 0;
}

export function shouldAbortWaitForUiAfterReadFailure(state: WaitForUiReadFailureState): boolean {
  return state.consecutiveReadFailures >= state.maxConsecutiveReadFailures;
}

export function buildScrollSwipeCoordinates(nodes: InspectUiNode[], direction: UiScrollDirection, durationMs: number): UiSwipeCoordinates {
  const candidateBounds = nodes
    .map((node) => parseUiBounds(node.bounds))
    .filter((bounds): bounds is UiBounds => bounds !== undefined);
  const scrollableBounds = nodes
    .filter((node) => node.scrollable)
    .map((node) => parseUiBounds(node.bounds))
    .filter((bounds): bounds is UiBounds => bounds !== undefined);

  const viewport = scrollableBounds[0]
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

  const x = viewport.center.x;
  const upper = Math.round(viewport.top + viewport.height * 0.25);
  const lower = Math.round(viewport.top + viewport.height * 0.75);

  return direction === "up"
    ? { start: { x, y: lower }, end: { x, y: upper }, durationMs }
    : { start: { x, y: upper }, end: { x, y: lower }, durationMs };
}
