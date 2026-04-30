import type { ExplorationMode, ExplorerPlatform } from "../types.js";
import type { ExplorerRuleEvaluationInput, ExplorerRuleMatchCriteria } from "./rule-types.js";

export function normalizeRuleText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchesRegexSafely(value: string | undefined, pattern: string | undefined): boolean {
  if (!value || !pattern) {
    return false;
  }
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return false;
  }
}

export function matchesPathPrefix(path: string[], prefix: string[] | undefined): boolean {
  if (!prefix || prefix.length === 0) {
    return true;
  }
  if (path.length < prefix.length) {
    return false;
  }
  return prefix.every((segment, index) => {
    const actual = normalizeRuleText(path[index] ?? "");
    const expected = normalizeRuleText(segment);
    return actual === expected || actual.endsWith(`.${expected}`) || actual.includes(expected);
  });
}

export function matchesPlatform(platform: ExplorerPlatform, criterion: ExplorerPlatform | ExplorerPlatform[] | undefined): boolean {
  if (!criterion) {
    return true;
  }
  return Array.isArray(criterion) ? criterion.includes(platform) : criterion === platform;
}

function matchesMode(mode: ExplorationMode, criterion: ExplorationMode | ExplorationMode[] | undefined): boolean {
  if (!criterion) {
    return true;
  }
  return Array.isArray(criterion) ? criterion.includes(mode) : criterion === mode;
}

function matchesExactText(actual: string | undefined, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }
  return normalizeRuleText(actual ?? "") === normalizeRuleText(expected);
}

function matchesSubstringText(actual: string | undefined, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }
  return normalizeRuleText(actual ?? "").includes(normalizeRuleText(expected));
}

function getElementResourceId(input: ExplorerRuleEvaluationInput): string | undefined {
  return input.element?.selector.resourceId;
}

export function matchesRuleCriteria(criteria: ExplorerRuleMatchCriteria, input: ExplorerRuleEvaluationInput): boolean {
  const snapshot = input.snapshot;
  const pageContext = snapshot?.pageContext;
  const appId = snapshot?.appId;
  const elementLabel = input.element?.label;
  const resourceId = getElementResourceId(input);

  if (!matchesPathPrefix(input.path, criteria.pathPrefix)) return false;
  if (!matchesMode(input.mode, criteria.mode)) return false;
  if (!matchesPlatform(input.platform, criteria.platform)) return false;
  if (criteria.minDepth !== undefined && input.depth < criteria.minDepth) return false;
  if (criteria.maxDepth !== undefined && input.depth > criteria.maxDepth) return false;
  if (criteria.maxClickableCount !== undefined && (snapshot?.clickableElements.length ?? 0) > criteria.maxClickableCount) return false;

  if (!matchesExactText(snapshot?.screenTitle, criteria.screenTitle)) return false;
  if (criteria.screenTitlePattern && !matchesRegexSafely(snapshot?.screenTitle, criteria.screenTitlePattern)) return false;
  if (!matchesExactText(snapshot?.screenId, criteria.screenId)) return false;
  if (!matchesExactText(pageContext?.type, criteria.pageContextType)) return false;
  if (!matchesExactText(pageContext?.ownerPackage, criteria.ownerPackage)) return false;
  if (criteria.ownerPackagePattern && !matchesRegexSafely(pageContext?.ownerPackage, criteria.ownerPackagePattern)) return false;
  if (!matchesExactText(appId, criteria.appId)) return false;
  if (criteria.appIdPattern && !matchesRegexSafely(appId, criteria.appIdPattern)) return false;
  if (!matchesSubstringText(elementLabel, criteria.elementLabel)) return false;
  if (criteria.elementLabelPattern && !matchesRegexSafely(elementLabel, criteria.elementLabelPattern)) return false;
  if (criteria.resourceIdPattern && !matchesRegexSafely(resourceId, criteria.resourceIdPattern)) return false;
  if (!matchesExactText(pageContext?.detectionSource, criteria.detectionSource)) return false;
  if (criteria.minConfidence !== undefined && (pageContext?.confidence ?? 0) < criteria.minConfidence) return false;

  return true;
}
