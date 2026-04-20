export type BackAffordanceStatus = "selector_detected" | "nav_bar_only" | "not_detected";

export interface BackAffordance {
  status: BackAffordanceStatus;
  navBarFrame?: { x: number; y: number; width: number; height: number };
  selectorLabels: string[];
  isSearchActiveLike?: boolean;
  isDialogLike?: boolean;
}

export interface BacktrackTapSelector {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
}

export type CachedBackStrategy =
  | { kind: "system_back" }
  | { kind: "selector_content_desc"; contentDesc: string }
  | { kind: "selector_text"; text: string }
  | { kind: "selector_parent"; parentPageTitle: string }
  | { kind: "edge_swipe" }
  | { kind: "tap_back_content_desc"; contentDesc: string }
  | { kind: "tap_back_text"; text: string }
  | { kind: "cancel_or_close"; label: string }
  | { kind: "dialog_control"; label: string };

export interface BacktrackLadderContext {
  parentTitle?: string;
  detectBackAffordance: () => Promise<BackAffordance>;
  tryNavigateBack: (
    method: string,
    args?: {
      parentPageTitle?: string;
      iosStrategy?: "selector_tap" | "edge_swipe";
      selector?: BacktrackTapSelector;
    },
  ) => Promise<boolean>;
  tryTapBackControl: (method: string, selector: BacktrackTapSelector) => Promise<boolean>;
  tryPointBandBack: (navBarFrame?: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
  tryTopBarBackCandidates: () => Promise<boolean>;
  tryScreenSummaryBackAffordance: () => Promise<boolean>;
  tryNavBarCoordinateBack: () => Promise<boolean>;
  logWarn: (message: string) => void;
  logBackFailureEvidence: () => Promise<void>;
}

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label || seen.has(label.toLowerCase())) {
      continue;
    }
    seen.add(label.toLowerCase());
    result.push(label);
  }
  return result;
}

export async function trySelectorFamily(
  ctx: BacktrackLadderContext,
  affordance: BackAffordance,
): Promise<boolean> {
  const shouldTrySelectorFamily = affordance.status !== "nav_bar_only";
  if (!shouldTrySelectorFamily) {
    ctx.logWarn("selector family skipped: nav_bar_only affordance detected");
    return false;
  }

  if (await ctx.tryNavigateBack("navigate_back:selector_tap")) {
    return true;
  }

  if (
    ctx.parentTitle &&
    await ctx.tryNavigateBack("navigate_back:selector_tap(parent_button_contentDesc)", {
      iosStrategy: "selector_tap",
      selector: {
        contentDesc: ctx.parentTitle,
        className: "Button",
        clickable: true,
      },
    })
  ) {
    return true;
  }

  if (
    ctx.parentTitle &&
    await ctx.tryNavigateBack("navigate_back:selector_tap(parent_button_text)", {
      iosStrategy: "selector_tap",
      selector: {
        text: ctx.parentTitle,
        className: "Button",
        clickable: true,
      },
    })
  ) {
    return true;
  }

  if (
    ctx.parentTitle &&
    await ctx.tryNavigateBack("navigate_back:selector_tap(parent)", {
      parentPageTitle: ctx.parentTitle,
      iosStrategy: "selector_tap",
    })
  ) {
    return true;
  }

  for (const label of affordance.selectorLabels) {
    if (
      await ctx.tryTapBackControl("tap_back_button:contentDesc", {
        contentDesc: label,
        className: "Button",
        clickable: true,
      }) ||
      await ctx.tryTapBackControl("tap_back_button:text", {
        text: label,
        className: "Button",
        clickable: true,
      })
    ) {
      return true;
    }
  }

  return false;
}

export async function tryCancelCloseFamily(ctx: BacktrackLadderContext): Promise<boolean> {
  for (const label of dedupeLabels(["Cancel", "Close"])) {
    if (
      await ctx.tryTapBackControl("tap_cancel_or_close:contentDesc", { contentDesc: label }) ||
      await ctx.tryTapBackControl("tap_cancel_or_close:text", { text: label })
    ) {
      return true;
    }
  }
  return false;
}

export async function tryDialogControlFamily(ctx: BacktrackLadderContext): Promise<boolean> {
  for (const label of dedupeLabels(["OK", "Ok", "Done", "Cancel"])) {
    if (
      await ctx.tryTapBackControl("tap_dialog_control:contentDesc", { contentDesc: label }) ||
      await ctx.tryTapBackControl("tap_dialog_control:text", { text: label })
    ) {
      return true;
    }
  }
  return false;
}
