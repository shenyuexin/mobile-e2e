/**
 * Configuration module for the explorer CLI.
 *
 * Provides interview questions, config persistence, and adaptive page budgeting.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_EXPLORER_RULES,
	projectDefaultSamplingRules,
	projectDefaultSkipElements,
	projectDefaultSkipPages,
} from "./rules/default-rules.js";
import type {
	ExplorerRule,
	ExplorerRuleAction,
	ExplorerRuleCategory,
} from "./rules/rule-types.js";
import type {
	AuthConfig,
	DestructiveActionPolicy,
	ExplorationMode,
	ExplorerConfig,
	ExplorerPlatform,
	FailureStrategy,
	SamplingRule,
	SkipElementRule,
	SkipPageRule,
	StatefulFormPolicy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Default sampling rules for high-fanout collection pages (smoke mode).
// SPEC: explorer-high-fanout-list-sampling
// ---------------------------------------------------------------------------

export const DEFAULT_SAMPLING_RULES: SamplingRule[] =
	projectDefaultSamplingRules();

export const DEFAULT_SKIP_PAGES: SkipPageRule[] = projectDefaultSkipPages();

export const DEFAULT_SKIP_ELEMENTS: SkipElementRule[] =
	projectDefaultSkipElements();

export interface RuleConfigDiagnostics {
	errors: string[];
	warnings: string[];
}

const VALID_RULE_CATEGORIES = new Set<ExplorerRuleCategory>([
	"page-skip",
	"element-skip",
	"sampling",
	"page-context",
	"risk-pattern",
	"navigation-control",
	"side-effect",
	"low-value-content",
	"auth-boundary",
	"system-dialog",
	"stateful-form",
	"external-app",
]);

const VALID_RULE_ACTIONS = new Set<ExplorerRuleAction>([
	"allow",
	"skip-page",
	"skip-element",
	"gate-page",
	"sample-children",
	"defer-action",
	"defer-to-heuristic",
]);

const REGEX_MATCH_FIELDS = [
	"screenTitlePattern",
	"ownerPackagePattern",
	"elementLabelPattern",
	"resourceIdPattern",
	"appIdPattern",
] as const;

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isValidRuleCategory(value: unknown): value is ExplorerRuleCategory {
	return typeof value === "string" && VALID_RULE_CATEGORIES.has(value as ExplorerRuleCategory);
}

function isValidRuleAction(value: unknown): value is ExplorerRuleAction {
	return typeof value === "string" && VALID_RULE_ACTIONS.has(value as ExplorerRuleAction);
}

function canCompileRegex(pattern: string): boolean {
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
}

function validateRule(rule: ExplorerRule, diagnostics: RuleConfigDiagnostics): void {
	const ruleLabel = isNonEmptyString(rule.id) ? rule.id : "(missing-id)";
	if (!isNonEmptyString(rule.id)) {
		diagnostics.errors.push("Rule id is required");
	}
	if (!isValidRuleCategory(rule.category)) {
		diagnostics.errors.push(
			`Rule ${ruleLabel} has invalid category: ${String(rule.category)}`,
		);
	}
	if (!isValidRuleAction(rule.action)) {
		diagnostics.errors.push(
			`Rule ${ruleLabel} has invalid action: ${String(rule.action)}`,
		);
	}

	for (const field of REGEX_MATCH_FIELDS) {
		const pattern = rule.match?.[field];
		if (typeof pattern === "string" && !canCompileRegex(pattern)) {
			diagnostics.warnings.push(
				`Rule ${ruleLabel} has invalid ${field} regex; matcher will ignore it`,
			);
		}
	}
}

export function validateRuleConfig(config: Pick<ExplorerConfig, "rules">): RuleConfigDiagnostics {
	const diagnostics: RuleConfigDiagnostics = { errors: [], warnings: [] };
	const ruleConfig = config.rules;
	if (!ruleConfig) {
		return diagnostics;
	}

	const knownRuleIds = new Set(DEFAULT_EXPLORER_RULES.map((rule) => rule.id));
	for (const rule of ruleConfig.rules ?? []) {
		validateRule(rule, diagnostics);
		if (isNonEmptyString(rule.id)) {
			knownRuleIds.add(rule.id);
		}
	}

	for (const disabledId of ruleConfig.defaults?.disabledRuleIds ?? []) {
		if (!knownRuleIds.has(disabledId)) {
			diagnostics.warnings.push(
				`Disabled rule id does not match a known default or project rule: ${disabledId}`,
			);
		}
	}

	return diagnostics;
}

// ---------------------------------------------------------------------------
// Interview question definitions
// ---------------------------------------------------------------------------

interface Question {
	id: string;
	prompt: string;
	options: { label: string; value: unknown }[];
	defaultValue: unknown;
}

export const INTERVIEW_QUESTIONS: Question[] = [
	{
		id: "mode",
		prompt: "探索模式",
		options: [
			{ label: "A) 主流程冒烟", value: "smoke" },
			{ label: "B) 指定模块", value: "scoped" },
			{ label: "C) 全量探索", value: "full" },
		],
		defaultValue: "scoped",
	},
	{
		id: "auth",
		prompt: "登录态",
		options: [
			{ label: "A) 已登录", value: { type: "already-logged-in" } },
			{ label: "B) 测试账号", value: { type: "auto-login" } },
			{ label: "C) 手动登录", value: { type: "handoff" } },
			{ label: "D) 不需要", value: { type: "skip-auth" } },
		],
		defaultValue: { type: "already-logged-in" },
	},
	{
		id: "failureStrategy",
		prompt: "失败策略",
		options: [
			{ label: "A) 重试3次", value: "retry-3" },
			{ label: "B) 跳过", value: "skip" },
			{ label: "C) 等待处理", value: "handoff" },
		],
		defaultValue: "retry-3",
	},
	{
		id: "maxDepth",
		prompt: "探索深度",
		options: [
			{ label: "A) 浅层 (5)", value: 5 },
			{ label: "B) 标准 (8)", value: 8 },
			{ label: "C) 深层 (12)", value: 12 },
		],
		defaultValue: 8,
	},
	{
		id: "compareWith",
		prompt: "历史对比",
		options: [
			{ label: "A) 对比最近一次", value: "latest" },
			{ label: "B) 选择历史版本", value: "select" },
			{ label: "C) 不对比", value: null },
		],
		defaultValue: null,
	},
	{
		id: "platform",
		prompt: "平台",
		options: [
			{ label: "A) iOS 模拟器", value: "ios-simulator" },
			{ label: "B) iOS 真机", value: "ios-device" },
			{ label: "C) Android 模拟器", value: "android-emulator" },
			{ label: "D) Android 真机", value: "android-device" },
		],
		defaultValue: "ios-simulator",
	},
	{
		id: "destructiveActionPolicy",
		prompt: "破坏性操作策略",
		options: [
			{ label: "A) 跳过 (默认)", value: "skip" },
			{ label: "B) 允许", value: "allow" },
			{ label: "C) 弹出确认", value: "confirm" },
		],
		defaultValue: "skip",
	},
	{
		id: "statefulFormPolicy",
		prompt: "状态型表单分支策略",
		options: [
			{ label: "A) 到达即止步 (默认)", value: "skip" },
			{ label: "B) 运行前确认", value: "confirm" },
			{ label: "C) 允许深入", value: "allow" },
		],
		defaultValue: "skip",
	},
];

// ---------------------------------------------------------------------------
// Default config paths
// ---------------------------------------------------------------------------

const PROJECT_CONFIG = ".explorer-config.json";

function globalConfigDir(): string {
	const home = homedir();
	if (platform() === "win32") {
		return join(home, "AppData", "Local", "mobile-e2e-mcp");
	}
	return join(home, ".config", "mobile-e2e-mcp");
}

export function globalConfigPath(): string {
	return join(globalConfigDir(), "explorer.json");
}

export function projectConfigPath(): string {
	return PROJECT_CONFIG;
}

// ---------------------------------------------------------------------------
// Config persistence helpers
// ---------------------------------------------------------------------------

function defaultDepthForMode(mode: ExplorationMode): number {
	switch (mode) {
		case "smoke":
			return 5;
		case "scoped":
			return 8;
		case "full":
			return Infinity;
	}
}

export function buildDefaultConfig(
	overrides: Partial<ExplorerConfig> = {},
): ExplorerConfig {
	const mode = (overrides.mode ?? "scoped") as ExplorationMode;
	const auth = (overrides.auth ?? { type: "already-logged-in" }) as AuthConfig;
	const plat = (overrides.platform ?? "ios-simulator") as ExplorerPlatform;
	const failureStrategy = (overrides.failureStrategy ??
		"retry-3") as FailureStrategy;
	const destructiveActionPolicy = (overrides.destructiveActionPolicy ??
		"skip") as DestructiveActionPolicy;
	const statefulFormPolicy = (overrides.statefulFormPolicy ??
		"skip") as StatefulFormPolicy;
	const maxDepth = overrides.maxDepth ?? defaultDepthForMode(mode);
	const compareWith = overrides.compareWith ?? null;
	const appId = overrides.appId ?? "";
	const maxPages = overrides.maxPages ?? 200;
	const timeoutMs = overrides.timeoutMs ?? 300_000;
	const reportDir = overrides.reportDir ?? "./explorer-reports";
	const samplingRules = overrides.samplingRules ?? DEFAULT_SAMPLING_RULES;
	const blockedOwnerPackages = overrides.blockedOwnerPackages ?? [
		"com.bbk.account",
	];
	const skipPages = overrides.skipPages ?? DEFAULT_SKIP_PAGES;
	const skipElements = overrides.skipElements ?? DEFAULT_SKIP_ELEMENTS;
	const rules = overrides.rules;

	return {
		mode,
		auth,
		failureStrategy,
		maxDepth,
		maxPages,
		timeoutMs,
		compareWith,
		platform: plat,
		destructiveActionPolicy,
		statefulFormPolicy,
		appId,
		reportDir,
		samplingRules,
		blockedOwnerPackages,
		skipPages,
		skipElements,
		rules,
	};
}

/**
 * Load config from the given path, or from the default project-local location.
 * Returns null if the file does not exist or is invalid.
 */
export function loadConfig(path?: string): ExplorerConfig | null {
	const target = path ?? projectConfigPath();
	if (!existsSync(target)) return null;
	try {
		const raw = readFileSync(target, "utf-8");
		const config = JSON.parse(raw) as ExplorerConfig;
		const diagnostics = validateRuleConfig(config);
		for (const warning of diagnostics.warnings) {
			console.warn(`[EXPLORER-CONFIG] ${warning}`);
		}
		if (diagnostics.errors.length > 0) {
			for (const error of diagnostics.errors) {
				console.warn(`[EXPLORER-CONFIG] ${error}`);
			}
			return null;
		}
		return config;
	} catch {
		return null;
	}
}

/**
 * Persist config to the given path, or to the default project-local location.
 */
export function saveConfig(config: ExplorerConfig, path?: string): void {
	const target = path ?? projectConfigPath();
	writeFileSync(target, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Check if a project-local config exists and is recent (modified within 24 hours).
 */
export function shouldReuseConfig(path?: string): boolean {
	const target = path ?? projectConfigPath();
	if (!existsSync(target)) return false;
	try {
		const stat = statSync(target);
		const ageMs = Date.now() - stat.mtimeMs;
		return ageMs < 24 * 60 * 60 * 1000;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Adaptive max-pages calculation
// ---------------------------------------------------------------------------

/**
 * EMA-based rolling average for dynamic page budget.
 */
export class AdaptiveMaxPages {
	private rollingAvg: number;
	private alpha: number;

	constructor(initialEstimateMs = 9000, alpha = 0.3) {
		this.rollingAvg = initialEstimateMs;
		this.alpha = alpha;
	}

	update(observedMs: number): void {
		this.rollingAvg =
			(1 - this.alpha) * this.rollingAvg + this.alpha * observedMs;
	}

	getMaxPages(timeoutMs: number): number {
		const raw = Math.floor((timeoutMs * 0.8) / this.rollingAvg);
		return Math.min(500, Math.max(50, raw));
	}

	get rollingAvgMs(): number {
		return this.rollingAvg;
	}
}
