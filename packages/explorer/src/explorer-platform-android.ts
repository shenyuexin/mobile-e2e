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
    const label = el.contentDesc || el.text || el.accessibilityLabel;
    const className = (el.className ?? el.elementType ?? "").toLowerCase();
    if (!label) {
      continue;
    }

    if (className.includes("application")) {
      continue;
    }

    if (className.includes("toolbar") || className.includes("actionbar") || className.includes("textview")) {
      if (label.length > 1 && label.length < 60) {
        return label.split(" ").slice(0, 3).join(" ");
      }
    }
  }

  for (const el of allElements) {
    const label = el.contentDesc || el.text || el.accessibilityLabel;
    const className = (el.className ?? el.elementType ?? "").toLowerCase();
    if (className.includes("application")) {
      continue;
    }
    if (label && label.length > 1 && label.length < 60) {
      return label.split(" ").slice(0, 3).join(" ");
    }
  }

  return undefined;
}

function extractAppId(uiTree: UiHierarchy): string | undefined {
  const allElements = flattenTree(uiTree);
  for (const el of allElements) {
    if (el.packageName) {
      return el.packageName;
    }
    if (el.className === "Application" || el.elementType === "Application") {
      const raw = el as Record<string, unknown>;
      const packageName = typeof raw.packageName === "string" ? raw.packageName : undefined;
      if (packageName) {
        return packageName;
      }
      // Fallback: iOS-style pages use accessibilityLabel for appId on Application root
      const accessibilityLabel = typeof raw.accessibilityLabel === "string" ? raw.accessibilityLabel : undefined;
      if (accessibilityLabel && accessibilityLabel.includes(".")) {
        return accessibilityLabel;
      }
    }
  }
  return undefined;
}

function buildNavigateBackSelector(args?: ExplorerNavigateBackInput): ExplorerNavigateBackSelector | undefined {
  if (args?.selector) {
    return { ...args.selector };
  }
  if (!args?.parentPageTitle) {
    return undefined;
  }
  return { text: args.parentPageTitle };
}

export function createExplorerPlatformAndroidHooks(): ExplorerPlatformHooks {
  return {
    platform: "android",
    parseInspectUi: (data, options) => parseUiTreeFromInspectData(data, options),
    extractScreenTitle,
    extractAppId,
    buildNavigateBackSelector,
  };
}
