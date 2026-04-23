/**
 * Page Context Router — deterministic decision routing for explorer page types.
 *
 * Translates harness-level pageContext detection into explorer-level action
 * routing.  Keeps the DFS engine free of page-type branching logic.
 *
 * Design principles:
 * - Deterministic detections are trusted over legacy heuristics.
 * - Low-confidence or non-deterministic detections degrade gracefully.
 * - All decisions are auditable (reason + ruleFamily).
 */

import type { PageContext } from "@mobile-e2e-mcp/contracts";
import type { ExplorerConfig } from "./types.js";

export type PageContextRouteType =
	| "dfs"
	| "gated"
	| "defer-to-heuristic";

export interface PageContextRouteAction {
	type: PageContextRouteType;
	reason: string;
	isInterruption?: boolean;
	interruptionType?: string;
	recoveryMethod?: string;
	ruleFamily?: string;
}

export interface PageContextRouterConfig {
	deterministicConfidenceThreshold: number;
	actionSheetDefaultGated: boolean;
	appDialogDefaultGated: boolean;
	appModalDefaultGated: boolean;
}

const DEFAULT_ROUTER_CONFIG: PageContextRouterConfig = {
	deterministicConfidenceThreshold: 0.85,
	actionSheetDefaultGated: true,
	appDialogDefaultGated: true,
	appModalDefaultGated: true,
};

/**
 * Decide how the explorer should handle a page based on its detected context.
 *
 * @param pageContext — the harness-level page context (may be undefined if inspect_ui did not provide it)
 * @param _config — explorer configuration (reserved for future per-mode routing rules)
 * @param routerConfig — optional overrides for decision thresholds
 * @returns a routing action telling the engine what to do next
 */
export function decidePageContextAction(
	pageContext: PageContext | undefined,
	_config: ExplorerConfig,
	routerConfig: Partial<PageContextRouterConfig> = {},
): PageContextRouteAction {
	const rc = { ...DEFAULT_ROUTER_CONFIG, ...routerConfig };

	if (!pageContext) {
		return {
			type: "defer-to-heuristic",
			reason:
				"No pageContext available in snapshot — falling back to legacy uiTree heuristic",
		};
	}

	if (pageContext.detectionSource !== "deterministic") {
		return {
			type: "defer-to-heuristic",
			reason: `pageContext detectionSource=${pageContext.detectionSource} is not deterministic — falling back to heuristic`,
		};
	}

	if (pageContext.confidence < rc.deterministicConfidenceThreshold) {
		return {
			type: "defer-to-heuristic",
			reason: `pageContext confidence=${pageContext.confidence} below threshold=${rc.deterministicConfidenceThreshold} — falling back to heuristic`,
		};
	}

	switch (pageContext.type) {
		case "normal_page":
			return {
				type: "dfs",
				reason: "normal_page — proceed with standard DFS exploration",
			};

		case "permission_surface":
			return {
				type: "gated",
				reason:
					"permission_surface detected — must be resolved before exploration can continue",
				isInterruption: true,
				interruptionType: "permission_prompt",
				recoveryMethod: "backtrack-cancel-first",
				ruleFamily: "permission_surface",
			};

		case "system_alert_surface":
			return {
				type: "gated",
				reason:
					"system_alert_surface detected — system alert must be resolved before exploration",
				isInterruption: true,
				interruptionType: "system_alert",
				recoveryMethod: "backtrack-cancel-first",
				ruleFamily: "system_alert_surface",
			};

		case "system_overlay":
			return {
				type: "gated",
				reason:
					"system_overlay detected — overlay/modal blocker must be resolved before exploration",
				isInterruption: true,
				interruptionType: "overlay",
				recoveryMethod: "backtrack-cancel-first",
				ruleFamily: "system_overlay",
			};

		case "action_sheet_surface":
			return {
				type: rc.actionSheetDefaultGated ? "gated" : "defer-to-heuristic",
				reason:
					"action_sheet_surface detected — bottom sheet / action sheet is not suitable for DFS",
				isInterruption: true,
				interruptionType: "action_sheet",
				recoveryMethod: "backtrack-cancel-first",
				ruleFamily: "action_sheet_surface",
			};

		case "app_dialog":
			return {
				type: rc.appDialogDefaultGated ? "gated" : "defer-to-heuristic",
				reason:
					"app_dialog detected — dialog content may be destructive or stateful",
				isInterruption: true,
				interruptionType: "app_dialog",
				recoveryMethod: "backtrack-cancel-first",
				ruleFamily: "app_dialog",
			};

		case "app_modal":
			return {
				type: rc.appModalDefaultGated ? "gated" : "defer-to-heuristic",
				reason:
					"app_modal detected — modal surface is not suitable for DFS expansion",
				isInterruption: true,
				interruptionType: "app_modal",
				recoveryMethod: "backtrack-cancel-first",
				ruleFamily: "app_modal",
			};

		case "keyboard_surface":
			return {
				type: "dfs",
				reason:
					"keyboard_surface detected — keyboard is an input affordance, page itself remains explorable",
				ruleFamily: "keyboard_surface",
			};

		case "unknown":
		default:
			return {
				type: "defer-to-heuristic",
				reason: `pageContext type=${pageContext.type} has no explicit route — falling back to heuristic`,
			};
	}
}

export function formatPageContextDecisionLog(
	action: PageContextRouteAction,
): string {
	let msg = `[PAGE-CONTEXT] decision=${action.type}, reason=${action.reason}`;
	if (action.interruptionType) {
		msg += `, interruptionType=${action.interruptionType}`;
	}
	if (action.recoveryMethod) {
		msg += `, recoveryMethod=${action.recoveryMethod}`;
	}
	if (action.ruleFamily) {
		msg += `, ruleFamily=${action.ruleFamily}`;
	}
	return msg;
}
