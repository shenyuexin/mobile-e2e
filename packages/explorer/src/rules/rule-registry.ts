import type { ExplorerConfig } from "../types.js";
import { DEFAULT_EXPLORER_RULES } from "./default-rules.js";
import { adaptLegacyConfigRules } from "./legacy-rule-adapter.js";
import type { ExplorerRule } from "./rule-types.js";

export interface ExplorerRuleRegistry {
  rules: ExplorerRule[];
  diagnostics: string[];
}

function cloneRule(rule: ExplorerRule): ExplorerRule {
  return {
    ...rule,
    match: { ...rule.match },
    sampling: rule.sampling ? { ...rule.sampling, excludeActions: rule.sampling.excludeActions ? [...rule.sampling.excludeActions] : undefined } : undefined,
  };
}

function upsertRule(rules: ExplorerRule[], rule: ExplorerRule): void {
  const index = rules.findIndex((candidate) => candidate.id === rule.id);
  if (index >= 0) {
    rules[index] = rule;
    return;
  }
  rules.push(rule);
}

export function buildExplorerRuleRegistry(config: ExplorerConfig): ExplorerRuleRegistry {
  const diagnostics: string[] = [];
  const rules: ExplorerRule[] = [];
  const ruleConfig = config.rules;

  if (ruleConfig?.defaults?.includeBuiltIns !== false) {
    for (const rule of DEFAULT_EXPLORER_RULES) {
      rules.push(cloneRule(rule));
    }
  }

  for (const rule of adaptLegacyConfigRules(config)) {
    upsertRule(rules, cloneRule(rule));
  }

  const seenProjectIds = new Set<string>();
  for (const projectRule of ruleConfig?.rules ?? []) {
    if (seenProjectIds.has(projectRule.id)) {
      diagnostics.push(`Duplicate project rule id: ${projectRule.id}`);
      continue;
    }
    seenProjectIds.add(projectRule.id);
    upsertRule(rules, { ...cloneRule(projectRule), source: "project-config" });
  }

  for (const override of ruleConfig?.overrides ?? []) {
    const index = rules.findIndex((rule) => rule.id === override.id);
    if (index < 0) {
      diagnostics.push(`Override references unknown rule id: ${override.id}`);
      continue;
    }
    rules[index] = {
      ...rules[index],
      enabled: override.enabled ?? rules[index].enabled,
      priority: override.priority ?? rules[index].priority,
      reason: override.reason ?? rules[index].reason,
    };
  }

  const disabledRuleIds = new Set(ruleConfig?.defaults?.disabledRuleIds ?? []);
  if (config.destructiveActionPolicy === "allow") {
    disabledRuleIds.add("default.risk.destructive-actions");
    disabledRuleIds.add("legacy.policy.destructive-action");
  }
  if ((config.statefulFormPolicy ?? "skip") === "allow") {
    disabledRuleIds.add("default.stateful-form.account-payment-address");
    disabledRuleIds.add("legacy.policy.stateful-form");
  }
  if ((config.editorEntryPolicy ?? "skip") === "allow") {
    disabledRuleIds.add("default.editor-entry.create-add-new-style");
  }
  const enabledRules = rules.filter((rule) => !disabledRuleIds.has(rule.id));
  return { rules: enabledRules, diagnostics };
}
