import { parseUiTreeFromInspectData } from "./ui-tree-parser.js";
import type { UiHierarchy } from "./types.js";
import type {
  ExplorerNavigateBackInput,
  ExplorerNavigateBackSelector,
  ExplorerPlatformHooks,
} from "./explorer-platform.js";

function flattenTree(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
  result.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, result);
    }
  }
  return result;
}

function extractScreenTitle(uiTree: UiHierarchy): string | undefined {
  const allElements = flattenTree(uiTree);

  for (const el of allElements) {
    if (el.className === "Heading" || el.elementType === "Heading") {
      const label = el.contentDesc || el.text || el.accessibilityLabel;
      if (label && label.length > 0) {
        return label;
      }
    }
  }

  for (const el of allElements) {
    if (el.className === "StaticText" || el.elementType === "StaticText") {
      const label = el.contentDesc || el.text || el.accessibilityLabel;
      if (label && label.length > 2 && label.length < 50) {
        return label.split(" ").slice(0, 3).join(" ");
      }
    }
  }

  return undefined;
}

function extractAppId(uiTree: UiHierarchy): string | undefined {
  const allElements = flattenTree(uiTree);

  for (const el of allElements) {
    if (el.className === "Application" || el.elementType === "Application") {
      const raw = el as Record<string, unknown>;
      const packageName = el.packageName
        || (typeof raw.bundleIdentifier === "string" ? raw.bundleIdentifier : undefined)
        || (typeof raw.bundleId === "string" ? raw.bundleId : undefined)
        || (typeof raw.bundle === "string" ? raw.bundle : undefined);
      const pid = raw.pid;

      return packageName
        || el.accessibilityLabel
        || (typeof pid === "string" || typeof pid === "number" ? `pid:${pid}` : undefined);
    }
  }

  return undefined;
}

function buildNavigateBackSelector(args?: ExplorerNavigateBackInput): ExplorerNavigateBackSelector | undefined {
  if (args?.iosStrategy === "edge_swipe") {
    return undefined;
  }
  if (args?.selector) {
    return { ...args.selector };
  }
  if (!args?.parentPageTitle) {
    return undefined;
  }
  return { text: args.parentPageTitle, contentDesc: args.parentPageTitle };
}

export function createExplorerPlatformIosHooks(): ExplorerPlatformHooks {
  return {
    platform: "ios",
    parseInspectUi: (data, options) => parseUiTreeFromInspectData(data, options),
    extractScreenTitle,
    extractAppId,
    buildNavigateBackSelector,
  };
}
