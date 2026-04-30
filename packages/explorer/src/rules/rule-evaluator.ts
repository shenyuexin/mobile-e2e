import { matchesRuleCriteria } from "./rule-matcher.js";
import type { ExplorerRuleRegistry } from "./rule-registry.js";
import type {
	ExplorerRuleEvaluationInput,
	ExplorerRuleMatchResult,
} from "./rule-types.js";

const PAGE_ACTIONS = new Set(["skip-page", "gate-page", "defer-to-heuristic"]);
const ELEMENT_ACTIONS = new Set(["skip-element", "defer-action"]);

function noMatch(): ExplorerRuleMatchResult {
	return { matched: false };
}

function toMatchResult(
	rule: ExplorerRuleRegistry["rules"][number],
): ExplorerRuleMatchResult {
	return {
		matched: true,
		ruleId: rule.id,
		category: rule.category,
		action: rule.action,
		reason: rule.reason,
		source: rule.source,
		recoveryMethod: rule.recoveryMethod,
		interruptionType: rule.interruptionType,
		supportLevel: rule.supportLevel,
		caveat: rule.caveat,
		sampling: rule.sampling,
	};
}

function orderedRules(
	registry: ExplorerRuleRegistry,
): ExplorerRuleRegistry["rules"] {
	return [...registry.rules].sort(
		(left, right) => (right.priority ?? 0) - (left.priority ?? 0),
	);
}

export function evaluatePageRules(
	registry: ExplorerRuleRegistry,
	input: ExplorerRuleEvaluationInput,
): ExplorerRuleMatchResult {
	for (const rule of orderedRules(registry)) {
		if (rule.enabled === false || !PAGE_ACTIONS.has(rule.action)) {
			continue;
		}
		if (matchesRuleCriteria(rule.match, input)) {
			return toMatchResult(rule);
		}
	}
	return noMatch();
}

export function evaluateElementRules(
	registry: ExplorerRuleRegistry,
	input: ExplorerRuleEvaluationInput,
): ExplorerRuleMatchResult {
	for (const rule of orderedRules(registry)) {
		if (rule.enabled === false || !ELEMENT_ACTIONS.has(rule.action)) {
			continue;
		}
		if (matchesRuleCriteria(rule.match, input)) {
			return toMatchResult(rule);
		}
	}
	return noMatch();
}

export function evaluateSamplingRules(
	registry: ExplorerRuleRegistry,
	input: ExplorerRuleEvaluationInput,
): ExplorerRuleMatchResult {
	for (const rule of orderedRules(registry)) {
		if (rule.enabled === false || rule.action !== "sample-children") {
			continue;
		}
		if (matchesRuleCriteria(rule.match, input)) {
			return toMatchResult(rule);
		}
	}
	return noMatch();
}
