import type { ClickableTarget, Frame, SamplingRule, SkipElementRule, SkipPageRule } from "./types.js";

const SIDE_EFFECT_PATTERNS = [
  /download/i,
  /install/i,
  /change\s+avatar/i,
  /profile\s+picture/i,
  /purchase/i,
  /buy/i,
  /delete/i,
  /remove/i,
  /erase/i,
  /reset/i,
  /sign\s*out/i,
  /log\s*out/i,
];

const NAVIGATION_CONTROL_PATTERNS = [
  /^back$/i,
  /^cancel$/i,
  /^done$/i,
  /^close$/i,
  /^xmark$/i,
];

export function isSideEffectAction(label: string): boolean {
  return SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(label));
}

export function isNavigationControlAction(label: string): boolean {
  return NAVIGATION_CONTROL_PATTERNS.some((pattern) => pattern.test(label.trim()));
}

function compareExplorationOrder(a: ClickableTarget, b: ClickableTarget): number {
  const aIsNav = isNavigationControlAction(a.label) || isSideEffectAction(a.label);
  const bIsNav = isNavigationControlAction(b.label) || isSideEffectAction(b.label);
  if (aIsNav === bIsNav) return 0;
  return aIsNav ? 1 : -1;
}

export function compareFrameExplorationOrder(
  a: ClickableTarget,
  b: ClickableTarget,
  frame: Frame,
): number {
  const parentTitle = frame.parentTitle?.trim().toLowerCase();
  const aReturnsToParent = parentTitle !== undefined && a.label.trim().toLowerCase() === parentTitle;
  const bReturnsToParent = parentTitle !== undefined && b.label.trim().toLowerCase() === parentTitle;
  if (aReturnsToParent !== bReturnsToParent) {
    return aReturnsToParent ? 1 : -1;
  }
  return compareExplorationOrder(a, b);
}

export function shouldGateExternalAppFrame(frame: Frame, externalLinkMaxDepth: number): boolean {
  if (!frame.isExternalApp) {
    return false;
  }

  if (frame.depth <= externalLinkMaxDepth) {
    return false;
  }

  const hasSafeElements = frame.elements.some(
    (candidate) =>
      !isNavigationControlAction(candidate.label) &&
      !isSideEffectAction(candidate.label),
  );

  return !hasSafeElements;
}

function normalizeSamplingPathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchSamplingRule(
  rules: SamplingRule[] | undefined,
  framePath: string[],
  screenTitle: string | undefined,
  screenId: string | undefined,
  mode: string,
): SamplingRule | undefined {
  if (!rules || rules.length === 0) return undefined;

  for (const rule of rules) {
    if (rule.mode && rule.mode !== mode) continue;
    const match = rule.match;

    if (match.screenId && screenId && match.screenId === screenId) return rule;

    if (match.pathPrefix && match.pathPrefix.length > 0) {
      const prefix = match.pathPrefix;
      if (framePath.length === prefix.length) {
        let matches = true;
        for (let index = 0; index < prefix.length; index += 1) {
          const framePart = normalizeSamplingPathSegment(framePath[index]);
          const rulePart = normalizeSamplingPathSegment(prefix[index]);
          if (!(framePart === rulePart || framePart.endsWith(`.${rulePart}`))) {
            matches = false;
            break;
          }
        }
        if (matches) return rule;
      }
    }

    if (match.screenTitle && screenTitle && match.screenTitle === screenTitle) return rule;
  }

  return undefined;
}

export function matchSkipPageRule(
  rules: SkipPageRule[] | undefined,
  framePath: string[],
  screenTitle: string | undefined,
  screenId: string | undefined,
): SkipPageRule | undefined {
  if (!rules || rules.length === 0) return undefined;

  for (const rule of rules) {
    const match = rule.match;

    if (match.screenId && screenId && match.screenId === screenId) return rule;

    if (match.pathPrefix && match.pathPrefix.length > 0) {
      const prefix = match.pathPrefix;
      if (framePath.length === prefix.length || framePath.length >= prefix.length) {
        let matches = true;
        for (let index = 0; index < prefix.length; index += 1) {
          const framePart = normalizeSamplingPathSegment(framePath[index]);
          const rulePart = normalizeSamplingPathSegment(prefix[index]);
          if (!(framePart === rulePart || framePart.endsWith(`.${rulePart}`) || framePart.includes(rulePart))) {
            matches = false;
            break;
          }
        }
        if (matches) return rule;
      }
    }

    if (match.screenTitle && screenTitle && match.screenTitle === screenTitle) return rule;
  }

  return undefined;
}

export function matchSkipElementRule(
  rules: SkipElementRule[] | undefined,
  elementLabel: string,
  framePath: string[],
  screenTitle: string | undefined,
): SkipElementRule | undefined {
  if (!rules || rules.length === 0) return undefined;

  const normalizedLabel = normalizeSamplingPathSegment(elementLabel);

  for (const rule of rules) {
    const match = rule.match;

    if (match.screenTitle && screenTitle) {
      const normalizedScreenTitle = normalizeSamplingPathSegment(screenTitle);
      if (!normalizedScreenTitle.includes(normalizeSamplingPathSegment(match.screenTitle))) {
        continue;
      }
    }

    if (match.pathPrefix && match.pathPrefix.length > 0) {
      const prefix = match.pathPrefix;
      if (framePath.length < prefix.length) {
        continue;
      }
      let pathMatches = true;
      for (let index = 0; index < prefix.length; index += 1) {
        const framePart = normalizeSamplingPathSegment(framePath[index]);
        const rulePart = normalizeSamplingPathSegment(prefix[index]);
        if (!(framePart === rulePart || framePart.endsWith(`.${rulePart}`) || framePart.includes(rulePart))) {
          pathMatches = false;
          break;
        }
      }
      if (!pathMatches) continue;
    }

    if (match.elementLabel) {
      const ruleLabel = normalizeSamplingPathSegment(match.elementLabel);
      if (normalizedLabel.includes(ruleLabel)) {
        return rule;
      }
    }

    if (match.elementLabelPattern) {
      try {
        const pattern = new RegExp(match.elementLabelPattern, "i");
        if (pattern.test(elementLabel)) {
          return rule;
        }
      } catch {
        // Ignore invalid regex configuration.
      }
    }
  }

  return undefined;
}

export interface SamplingState {
  appliedPages: Set<string>;
  skippedChildren: number;
  details: Record<string, {
    screenTitle?: string;
    totalChildren: number;
    exploredChildren: number;
    skippedChildren: number;
    exploredLabels: string[];
    skippedLabels: string[];
  }>;
}

export function elementIdentity(element: ClickableTarget): string {
  return `${element.label}::${JSON.stringify(element.selector)}`;
}
