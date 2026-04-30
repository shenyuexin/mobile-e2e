import { decideHeuristicPageAction, isLowValueDeepContentPage } from "./page-context-heuristic.js";
import { decidePageContextAction } from "./page-context-router.js";
import { evaluatePageRules } from "./rules/rule-evaluator.js";
import type { ExplorerRuleRegistry } from "./rules/rule-registry.js";
import type { ExplorerRuleMatchResult } from "./rules/rule-types.js";
import type {
	Action,
	ClickableTarget,
	ExplorerConfig,
	ExplorerPlatform,
	FailureEntry,
	McpToolInterface,
	PageSnapshot,
	RuleDecisionEntry,
} from "./types.js";

/** In-memory failure log collection. */
export class FailureLog {
	private entries: FailureEntry[] = [];

	/** Record a new failure entry. */
	record(entry: FailureEntry): void {
		this.entries.push(entry);
	}

	/** Get all failure entries. */
	getEntries(): FailureEntry[] {
		return [...this.entries];
	}
}

export type NavValidation =
	| { navigated: true; isModalOverlay?: boolean }
	| { navigated: false; reason: string; shouldDismissDialog?: boolean };

export type ExplorerPageAction = {
	type: "dfs" | "gated";
	reason: string;
	isInterruption?: boolean;
	interruptionType?: string;
	recoveryMethod?: string;
	ruleFamily?: string;
	ruleDecision?: RuleDecisionEntry;
};

export function buildRuleDecisionEntry(
	decision: ExplorerRuleMatchResult,
	input: {
		path: string[];
		snapshot?: PageSnapshot;
		element?: ClickableTarget;
	},
): RuleDecisionEntry | undefined {
	if (
		!decision.matched ||
		!decision.ruleId ||
		!decision.category ||
		!decision.action ||
		!decision.reason
	) {
		return undefined;
	}

	return {
		ruleId: decision.ruleId,
		category: decision.category,
		action: decision.action,
		reason: decision.reason,
		source: decision.source,
		path: [...input.path],
		screenTitle: input.snapshot?.screenTitle,
		elementLabel: input.element?.label,
		recoveryMethod: decision.recoveryMethod,
		supportLevel: decision.supportLevel,
		caveat: decision.caveat,
	};
}

export function decideExplorerPageAction(
	snapshot: PageSnapshot,
	config: ExplorerConfig,
	ruleRegistry: ExplorerRuleRegistry,
	depth?: number,
	path?: string[],
): ExplorerPageAction {
	const ruleDecision = evaluatePageRules(ruleRegistry, {
		path: path ?? [],
		depth: depth ?? snapshot.depth,
		mode: config.mode,
		platform: config.platform,
		snapshot,
	});
	if (ruleDecision.matched) {
		const ruleDecisionEntry = buildRuleDecisionEntry(ruleDecision, {
			path: path ?? [],
			snapshot,
		});
		return {
			type: "gated",
			reason:
				ruleDecision.reason ??
				`rule matched for "${snapshot.screenTitle ?? snapshot.screenId}"`,
			recoveryMethod: ruleDecision.recoveryMethod ?? "backtrack-cancel-first",
			ruleFamily: ruleDecision.category,
			ruleDecision: ruleDecisionEntry,
		};
	}

	if (isLowValueDeepContentPage(snapshot, config.platform, depth)) {
		return {
			type: "gated",
			reason: `uiTree heuristic: low-value deep content page detected (title="${snapshot.screenTitle ?? "(unknown)"}") — pruning to preserve page budget`,
			recoveryMethod: "backtrack-cancel-first",
			ruleFamily: "heuristic_low_value_content",
		};
	}

	const routerDecision = decidePageContextAction(snapshot.pageContext, config);
	switch (routerDecision.type) {
		case "dfs":
			return {
				type: "dfs",
				reason: routerDecision.reason,
				isInterruption: routerDecision.isInterruption,
				interruptionType: routerDecision.interruptionType,
				recoveryMethod: routerDecision.recoveryMethod,
				ruleFamily: routerDecision.ruleFamily,
			};
		case "gated":
			return {
				type: "gated",
				reason: routerDecision.reason,
				isInterruption: routerDecision.isInterruption,
				interruptionType: routerDecision.interruptionType,
				recoveryMethod: routerDecision.recoveryMethod,
				ruleFamily: routerDecision.ruleFamily,
			};
		case "defer-to-heuristic":
			break;
	}
	return decideHeuristicPageAction(snapshot, config.platform, depth);
}

export function markSnapshotAsGated(
	snapshot: PageSnapshot,
	decision: ExplorerPageAction,
	policy: string,
): void {
	snapshot.explorationStatus = "reached-not-expanded";
	snapshot.stoppedByPolicy = policy;
	snapshot.ruleFamily = decision.ruleFamily;
	snapshot.recoveryMethod = decision.recoveryMethod ?? "backtrack-cancel-first";
	snapshot.ruleDecision = decision.ruleDecision;
}

export function pageTypeOf(
	snapshot: { pageContext?: { type?: string } } | undefined,
): string {
	return snapshot?.pageContext?.type ?? "unknown";
}

function normalizeNavText(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

function matchesStatefulKeyword(
	value: string | undefined,
	keywords: string[],
): boolean {
	const normalized = value?.trim().toLowerCase() ?? "";
	return keywords.some((keyword) =>
		new RegExp(
			`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
			"i",
		).test(normalized),
	);
}

export function isStatefulFormEntry(
	element: ClickableTarget,
	snapshot: PageSnapshot,
	config: ExplorerConfig,
): boolean {
	if ((config.statefulFormPolicy ?? "skip") === "allow") {
		return false;
	}

	const title = snapshot.screenTitle?.trim().toLowerCase() ?? "";
	const label = element.label.trim().toLowerCase();
	const entryKeywords = ["create", "add", "choose", "select"];
	const domainKeywords = [
		"address",
		"shipping",
		"payment",
		"profile",
		"account",
		"location",
	];

	const hasEntrySignal =
		matchesStatefulKeyword(title, entryKeywords) ||
		matchesStatefulKeyword(label, entryKeywords);
	const hasDomainSignal =
		matchesStatefulKeyword(title, domainKeywords) ||
		matchesStatefulKeyword(label, domainKeywords);

	return hasEntrySignal && hasDomainSignal;
}

export function isLowValueLeafAction(
	screenTitle: string | undefined,
	label: string,
): boolean {
	const normalizedScreenTitle = screenTitle?.trim().toLowerCase() ?? "";
	const normalizedLabel = label.trim().toLowerCase();
	if (
		![
			"about",
			"software information",
			"device information",
			"phone information",
		].includes(normalizedScreenTitle)
	) {
		return false;
	}

	return /(^|\s)(version|build|model|serial|legal|licenses?)(\s|$)/i.test(
		normalizedLabel,
	);
}

export function validateNavigation(
	nextSnapshot: {
		screenId: string;
		screenTitle?: string;
		uiTree: Record<string, unknown>;
	},
	prevState: { screenId: string; screenTitle?: string },
	actionLabel?: string,
): NavValidation {
	if (nextSnapshot.screenId === prevState.screenId) {
		const nextTitle = normalizeNavText(nextSnapshot.screenTitle);
		const prevTitle = normalizeNavText(prevState.screenTitle);
		if (!(nextTitle && prevTitle && nextTitle !== prevTitle)) {
			return {
				navigated: false,
				reason: "screenId unchanged — element had no navigation effect",
			};
		}
	}

	const nextTitle = normalizeNavText(nextSnapshot.screenTitle);
	const prevTitle = normalizeNavText(prevState.screenTitle);
	const action = normalizeNavText(actionLabel);
	if (
		nextTitle &&
		prevTitle &&
		nextTitle === prevTitle &&
		action === prevTitle
	) {
		return {
			navigated: false,
			reason:
				"screen title unchanged after tapping page-title-like element — treating as self-loop",
		};
	}

	if (isSystemDialog(nextSnapshot)) {
		return {
			navigated: false,
			reason: "system dialog detected — will dismiss and retry",
			shouldDismissDialog: true,
		};
	}

	return { navigated: true };
}

export function isAndroidExplorerPlatform(platform: ExplorerPlatform): boolean {
	return platform.startsWith("android");
}

export async function attemptCancelFirstRecovery(
	mcp: McpToolInterface,
): Promise<boolean> {
	const attempts = [{ text: "Cancel" }, { contentDesc: "Cancel" }];

	for (const args of attempts) {
		const result = await mcp.tapElement(args);
		if (result.status === "success" || result.status === "partial") {
			return true;
		}
	}

	return false;
}

function isSystemDialog(snapshot: { uiTree: Record<string, unknown> }): boolean {
	const elements = collectAllElements(snapshot.uiTree);
	const hasAlertRole = elements.some(
		(el) =>
			el.accessibilityRole === "alert" ||
			el.accessibilityRole === "SystemAlert" ||
			el.elementType === "Alert" ||
			el.elementType === "Sheet" ||
			el.className === "Alert" ||
			el.className === "Sheet",
	);
	if (hasAlertRole) return true;

	const allText = elements
		.map((el) => {
			const label =
				el.contentDesc ||
				el.accessibilityLabel ||
				el.label ||
				el.text ||
				"";
			return typeof label === "string" ? label : "";
		})
		.join(" ");

	const dialogKeywords = [
		"Would Like to Send",
		"Allow",
		"Don't Allow",
		"Allow ACCESS to use",
		"While Using the App",
		"Update Available",
		"Not Now",
		"Remind Me Later",
		"Sign in to iCloud",
		"OK",
		"Cancel",
		"Allow Once",
	];
	const matched = dialogKeywords.filter((kw) => allText.includes(kw));
	return matched.length >= 3;
}

function collectAllElements(
	node: Record<string, unknown>,
	result: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
	result.push(node);
	const children = node.children;
	if (Array.isArray(children)) {
		for (const child of children) {
			if (typeof child === "object" && child !== null) {
				collectAllElements(child as Record<string, unknown>, result);
			}
		}
	}
	return result;
}

export function handleFailure(
	_err: Error,
	strategy: ExplorerConfig["failureStrategy"],
	retries: number,
): Action {
	switch (strategy) {
		case "retry-3":
			if (retries < 3) return "retry";
			return "skip";
		case "skip":
			return "skip";
		case "handoff":
			return "handoff";
	}
}

export function hasTimedOut(timeoutMs: number, startTime: number): boolean {
	return Date.now() - startTime >= timeoutMs;
}
