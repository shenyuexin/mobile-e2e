/**
 * Page Context Decision Log — collects per-page routing decisions for analysis.
 * Emits page-context-decisions.jsonl for threshold calibration.
 */

import type { PageContext } from "@mobile-e2e-mcp/contracts";
import type { PageContextRouteAction } from "./page-context-router.js";
import type { HeuristicPageDecision } from "./page-context-heuristic.js";

export type FinalPageOutcome =
	| "expanded"
	| "gated"
	| "reached-not-expanded"
	| "skipped-dedup"
	| "aborted";

export interface PageContextDecisionRecord {
	screenId: string;
	screenTitle?: string;
	timestamp: string;
	pageContext?: PageContext;
	routerDecision?: PageContextRouteAction;
	heuristicDecision?: HeuristicPageDecision;
	finalOutcome: FinalPageOutcome;
	outcomeReason: string;
}

export interface PageContextDecisionLog {
	record: (entry: PageContextDecisionRecord) => void;
	getEntries: () => PageContextDecisionRecord[];
}

export function createPageContextDecisionLog(): PageContextDecisionLog {
	const entries: PageContextDecisionRecord[] = [];
	return {
		record(entry) {
			entries.push(entry);
		},
		getEntries() {
			return [...entries];
		},
	};
}

export function serializeDecisionLog(entries: PageContextDecisionRecord[]): string {
	return entries.map((e) => JSON.stringify(e)).join("\n");
}
