import type { ReasonCode, UiScrollDirection, UiTargetResolution, WaitForUiMode } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

const DEFAULT_WAIT_UNTIL: WaitForUiMode = "visible";
const DEFAULT_SCROLL_DIRECTION: UiScrollDirection = "up";

export function buildResolutionNextSuggestions(status: "resolved" | "no_match" | "ambiguous" | "missing_bounds" | "disabled_match" | "off_screen" | "unsupported" | "not_executed", toolName: string, resolution?: Pick<UiTargetResolution, "bestCandidate" | "ambiguityDiff">): string[] {
  if (status === "resolved") return [];
  if (status === "no_match") return [`No UI nodes matched the provided selector for ${toolName}. Broaden the selector or inspect nearby nodes.`];
  if (status === "ambiguous") {
    const diffHint = resolution?.ambiguityDiff?.differingFields?.slice(0, 2).map((field) => field.field).join(", ");
    const selectorHint = resolution?.ambiguityDiff?.suggestedSelectors?.[0];
    return [
      `Multiple UI nodes matched the selector for ${toolName}. Narrow the selector before performing an element action${diffHint ? `; top differing fields: ${diffHint}` : ""}.`,
      selectorHint ? `Suggested narrowing selector: ${JSON.stringify(selectorHint)}` : "Inspect the top candidates and add a more specific resourceId/contentDesc/text filter.",
    ];
  }
  if (status === "missing_bounds") return [`A matching UI node was found for ${toolName}, but its bounds were not parseable.`];
  if (status === "disabled_match") return [`A matching UI node was found for ${toolName}, but the best candidate is disabled. Wait for the UI to become actionable or refine the selector.`];
  if (status === "off_screen") return [`A matching UI node was found for ${toolName}, but it is currently outside the visible viewport. Scroll toward the candidate before retrying.`, resolution?.bestCandidate?.node.resourceId ? `Top off-screen candidate resourceId: ${resolution.bestCandidate.node.resourceId}` : "Consider scroll_and_resolve_ui_target or change swipe direction."];
  if (status === "not_executed") return [`${toolName} did not execute live UI resolution in this run. Re-run without dryRun or fix the upstream capture failure.`];
  return [`${toolName} is not fully supported for this platform in the current repository state.`];
}

export function normalizeWaitForUiMode(value: WaitForUiMode | undefined): WaitForUiMode {
  return value ?? DEFAULT_WAIT_UNTIL;
}

export function normalizeScrollDirection(value: UiScrollDirection | undefined): UiScrollDirection {
  return value ?? DEFAULT_SCROLL_DIRECTION;
}

export function reasonCodeForWaitTimeout(_waitUntil: WaitForUiMode): ReasonCode {
  return REASON_CODES.timeout;
}
