import type { ReasonCode, UiScrollDirection, WaitForUiMode } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

const DEFAULT_WAIT_UNTIL: WaitForUiMode = "visible";
const DEFAULT_SCROLL_DIRECTION: UiScrollDirection = "up";

export function buildResolutionNextSuggestions(status: "resolved" | "no_match" | "ambiguous" | "missing_bounds" | "unsupported" | "not_executed", toolName: string): string[] {
  if (status === "resolved") return [];
  if (status === "no_match") return [`No UI nodes matched the provided selector for ${toolName}. Broaden the selector or inspect nearby nodes.`];
  if (status === "ambiguous") return [`Multiple UI nodes matched the selector for ${toolName}. Narrow the selector before performing an element action.`];
  if (status === "missing_bounds") return [`A matching UI node was found for ${toolName}, but its bounds were not parseable.`];
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
