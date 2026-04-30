import type { ExplorerConfig } from "../types.js";
import {
  projectDefaultSamplingRules,
  projectDefaultSkipElements,
  projectDefaultSkipPages,
} from "./default-rules.js";
import type { ExplorerRule } from "./rule-types.js";

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function legacyRule(id: string, rule: Omit<ExplorerRule, "id" | "source">): ExplorerRule {
  return { id, source: "legacy-adapter", ...rule };
}

export function adaptLegacySamplingRules(config: ExplorerConfig): ExplorerRule[] {
  const rules = config.samplingRules ?? [];
  if (sameJson(rules, projectDefaultSamplingRules())) {
    return [];
  }
  return rules.map((rule, index) =>
    legacyRule(`legacy.sampling.${index}`, {
      category: "sampling",
      action: "sample-children",
      reason: "Legacy samplingRules config entry",
      match: { ...rule.match, mode: rule.mode },
      sampling: {
        strategy: rule.strategy,
        maxChildrenToValidate: rule.maxChildrenToValidate,
        stopAfterFirstSuccessfulNavigation: rule.stopAfterFirstSuccessfulNavigation,
        excludeActions: rule.excludeActions,
      },
    }),
  );
}

export function adaptLegacySkipPageRules(config: ExplorerConfig): ExplorerRule[] {
  const rules = config.skipPages ?? [];
  if (sameJson(rules, projectDefaultSkipPages())) {
    return [];
  }
  return rules.map((rule, index) =>
    legacyRule(`legacy.skip-page.${index}`, {
      category: "page-skip",
      action: "skip-page",
      reason: rule.reason ?? "Legacy skipPages config entry",
      match: rule.match,
    }),
  );
}

export function adaptLegacySkipElementRules(config: ExplorerConfig): ExplorerRule[] {
  const rules = config.skipElements ?? [];
  if (sameJson(rules, projectDefaultSkipElements())) {
    return [];
  }
  return rules.map((rule, index) =>
    legacyRule(`legacy.skip-element.${index}`, {
      category: "element-skip",
      action: "skip-element",
      reason: rule.reason ?? "Legacy skipElements config entry",
      match: rule.match,
    }),
  );
}

export function adaptLegacyBlockedOwnerPackages(config: ExplorerConfig): ExplorerRule[] {
  const packages = config.blockedOwnerPackages ?? [];
  if (sameJson(packages, ["com.bbk.account"])) {
    return [];
  }
  return packages.map((ownerPackage, index) =>
    legacyRule(`legacy.owner-package.${index}`, {
      category: "external-app",
      action: "gate-page",
      reason: `Legacy blockedOwnerPackages config entry: ${ownerPackage}`,
      recoveryMethod: "navigate-back",
      match: { ownerPackage },
    }),
  );
}

export function adaptLegacyPolicyRules(config: ExplorerConfig): ExplorerRule[] {
  const rules: ExplorerRule[] = [];
  if (config.destructiveActionPolicy !== "allow") {
    rules.push(
      legacyRule("legacy.policy.destructive-action", {
        category: "risk-pattern",
        action: "defer-action",
        reason: `Legacy destructiveActionPolicy=${config.destructiveActionPolicy}`,
        match: { elementLabelPattern: "Delete|Remove|Reset|Erase|Sign Out|Log Out|Logout" },
      }),
    );
  }
  if ((config.statefulFormPolicy ?? "skip") !== "allow") {
    rules.push(
      legacyRule("legacy.policy.stateful-form", {
        category: "stateful-form",
        action: "gate-page",
        reason: `Legacy statefulFormPolicy=${config.statefulFormPolicy ?? "skip"}`,
        recoveryMethod: "backtrack-cancel-first",
        match: { screenTitlePattern: "Account|Payment|Address|Location|Profile" },
      }),
    );
  }
  return rules;
}

export function adaptLegacyConfigRules(config: ExplorerConfig): ExplorerRule[] {
  return [
    ...adaptLegacySamplingRules(config),
    ...adaptLegacySkipPageRules(config),
    ...adaptLegacySkipElementRules(config),
    ...adaptLegacyBlockedOwnerPackages(config),
    ...adaptLegacyPolicyRules(config),
  ];
}
