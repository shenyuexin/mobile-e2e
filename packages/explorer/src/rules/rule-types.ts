import type { PageContext } from "@mobile-e2e-mcp/contracts";
import type {
	ClickableTarget,
	ExplorationMode,
	ExplorerPlatform,
	PageSnapshot,
} from "../types.js";

export type ExplorerRuleCategory =
	| "page-skip"
	| "element-skip"
	| "sampling"
	| "page-context"
	| "risk-pattern"
	| "navigation-control"
	| "side-effect"
	| "low-value-content"
	| "auth-boundary"
	| "system-dialog"
	| "stateful-form"
	| "external-app";

export type ExplorerRuleAction =
	| "allow"
	| "skip-page"
	| "skip-element"
	| "gate-page"
	| "sample-children"
	| "defer-action"
	| "defer-to-heuristic";

export type ExplorerRuleSource =
	| "default"
	| "project-config"
	| "runtime-config"
	| "legacy-adapter";

export type ExplorerRuleSupportLevel =
	| "contract-ready"
	| "experimental"
	| "reproducible-demo"
	| "ci-verified";

export interface ExplorerRuleMatchCriteria {
	pathPrefix?: string[];
	screenTitle?: string;
	screenTitlePattern?: string;
	screenId?: string;
	pageContextType?: PageContext["type"];
	ownerPackage?: string;
	ownerPackagePattern?: string;
	elementLabel?: string;
	elementLabelPattern?: string;
	resourceIdPattern?: string;
  appId?: string;
  appIdPattern?: string;
  mode?: ExplorationMode | ExplorationMode[];
  platform?: ExplorerPlatform | ExplorerPlatform[];
	minDepth?: number;
	maxDepth?: number;
	maxClickableCount?: number;
	detectionSource?: PageContext["detectionSource"];
	minConfidence?: number;
}

export interface ExplorerRule {
	id: string;
	category: ExplorerRuleCategory;
	action: ExplorerRuleAction;
	reason: string;
	match: ExplorerRuleMatchCriteria;
	enabled?: boolean;
	priority?: number;
	source?: ExplorerRuleSource;
	recoveryMethod?: string;
	interruptionType?: string;
	supportLevel?: ExplorerRuleSupportLevel;
	caveat?: string;
	sampling?: {
		strategy: "representative-child";
		maxChildrenToValidate?: number;
		stopAfterFirstSuccessfulNavigation?: boolean;
		excludeActions?: string[];
	};
}

export interface ExplorerRuleConfig {
	version: 1;
	defaults?: {
		includeBuiltIns?: boolean;
		disabledRuleIds?: string[];
	};
	rules?: ExplorerRule[];
	overrides?: Array<{
		id: string;
		enabled?: boolean;
		reason?: string;
		priority?: number;
	}>;
}

export interface ExplorerRuleEvaluationInput {
	path: string[];
	depth: number;
	mode: ExplorationMode;
	platform: ExplorerPlatform;
	snapshot?: PageSnapshot;
	element?: ClickableTarget;
}

export interface ExplorerRuleMatchResult {
	matched: boolean;
	ruleId?: string;
	category?: ExplorerRuleCategory;
	action?: ExplorerRuleAction;
	reason?: string;
	source?: ExplorerRuleSource;
	recoveryMethod?: string;
	interruptionType?: string;
	supportLevel?: ExplorerRuleSupportLevel;
	caveat?: string;
	sampling?: ExplorerRule["sampling"];
}
