import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  InterruptionActionSlot,
  InterruptionPolicyRuleV2,
  InterruptionSignal,
  Platform,
} from "@mobile-e2e-mcp/contracts";

export interface AccessProfile {
  allow: string[];
  deny: string[];
}

export interface AccessPolicyConfig {
  profiles: Record<string, AccessProfile>;
}

export interface InterruptionPolicyConfig {
  platform: Platform;
  version?: string;
  rules: InterruptionPolicyRuleV2[];
  notes: string[];
}

export interface InterruptionResolutionPlan {
  matchedRule?: InterruptionPolicyRuleV2;
  denied: boolean;
  reason?: string;
  selectedSlot?: InterruptionActionSlot;
}

export interface NetworkRetryPolicyDecision {
  retryable: boolean;
  terminal: boolean;
  reason: string;
}

const DEFAULT_ACCESS_POLICY_PATH = "configs/policies/access-profiles.yaml";
const DEFAULT_INTERRUPTION_POLICY_DIR = "configs/policies/interruption";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function parseAccessProfile(value: unknown, profileName: string): AccessProfile {
  if (!isRecord(value)) {
    throw new Error(`Invalid access profile structure for ${profileName}`);
  }
  return {
    allow: readStringArray(value, "allow"),
    deny: readStringArray(value, "deny"),
  };
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseInterruptionRule(value: unknown, platform: Platform): InterruptionPolicyRuleV2 | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readOptionalString(value, "id");
  const type = readOptionalString(value, "type");
  const priority = readOptionalString(value, "priority");
  const auto = value.auto === true;
  const signature = isRecord(value.signature) ? value.signature : isRecord(value.match) ? value.match : undefined;
  const action = isRecord(value.action) ? value.action : undefined;

  if (!id || !type || !priority || !action) {
    return undefined;
  }

  const strategy = readOptionalString(action, "strategy")
    ?? (readOptionalString(action, "tap_text") ? "tap_selector" : undefined)
    ?? (Array.isArray(action.first_available_text) ? "tap_selector" : undefined);

  if (!strategy) {
    return undefined;
  }

  return {
    id,
    platform,
    type: type as InterruptionPolicyRuleV2["type"],
    priority: priority as InterruptionPolicyRuleV2["priority"],
    auto,
    signature: {
      ownerPackage: signature ? readOptionalString(signature, "ownerPackage") : undefined,
      ownerBundle: signature ? readOptionalString(signature, "ownerBundle") : undefined,
      containerRole: signature ? readOptionalString(signature, "containerRole") : undefined,
      requiredSignals: signature ? readStringArray(signature, "requiredSignals") : undefined,
      anyText: signature ? readStringArray(signature, "any_text") : undefined,
    },
    action: {
      strategy: strategy as InterruptionPolicyRuleV2["action"]["strategy"],
      slot: readOptionalString(action, "slot") as InterruptionPolicyRuleV2["action"]["slot"],
      tapText: readOptionalString(action, "tap_text"),
      tapResourceId: readOptionalString(action, "tap_resource_id"),
      firstAvailableText: readStringArray(action, "first_available_text"),
    },
    retry: isRecord(value.retry)
      ? {
        maxAttempts: Number.isFinite(value.retry.maxAttempts)
          ? Number(value.retry.maxAttempts)
          : Number.isFinite(value.retry.max_attempts)
            ? Number(value.retry.max_attempts)
            : 1,
      }
      : undefined,
  };
}

export async function loadAccessPolicyConfig(repoRoot: string, policyPath = DEFAULT_ACCESS_POLICY_PATH): Promise<AccessPolicyConfig> {
  const absolutePath = path.resolve(repoRoot, policyPath);
  const content = await readFile(absolutePath, "utf8");
  const parsed: unknown = parse(content);
  if (!isRecord(parsed) || !isRecord(parsed.profiles)) {
    throw new Error(`Invalid access policy config: ${policyPath}`);
  }

  const profiles = Object.fromEntries(
    Object.entries(parsed.profiles).map(([profileName, profileValue]) => [profileName, parseAccessProfile(profileValue, profileName)]),
  );

  return { profiles };
}

export async function loadAccessProfile(repoRoot: string, profileName: string, policyPath?: string): Promise<AccessProfile | undefined> {
  const config = await loadAccessPolicyConfig(repoRoot, policyPath);
  return config.profiles[profileName];
}

export async function loadInterruptionPolicyConfig(
  repoRoot: string,
  platform: Platform,
  policyPath = path.posix.join(DEFAULT_INTERRUPTION_POLICY_DIR, `${platform}.yaml`),
): Promise<InterruptionPolicyConfig> {
  const absolutePath = path.resolve(repoRoot, policyPath);
  const content = await readFile(absolutePath, "utf8");
  const parsed: unknown = parse(content);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid interruption policy config: ${policyPath}`);
  }

  const rulesSource = Array.isArray(parsed.rules) ? parsed.rules : [];
  const rules = rulesSource
    .map((rule) => parseInterruptionRule(rule, platform))
    .filter((rule): rule is InterruptionPolicyRuleV2 => Boolean(rule));

  return {
    platform,
    version: readOptionalString(parsed, "version"),
    rules,
    notes: readStringArray(parsed, "notes"),
  };
}

function signalMatchesRule(signals: InterruptionSignal[], rule: InterruptionPolicyRuleV2): boolean {
  if (!rule.signature) {
    return false;
  }

  const keySet = new Set(signals.map((signal) => signal.key));
  const valueSet = new Set(
    signals
      .map((signal) => signal.value?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );

  if (rule.signature.requiredSignals && rule.signature.requiredSignals.length > 0) {
    if (!rule.signature.requiredSignals.every((required) => keySet.has(required))) {
      return false;
    }
  }

  if (rule.signature.anyText && rule.signature.anyText.length > 0) {
    if (!rule.signature.anyText.some((text) => valueSet.has(text.toLowerCase()))) {
      return false;
    }
  }

  if (rule.signature.ownerPackage && !signals.some((signal) => signal.key === "owner_package" && signal.value === rule.signature.ownerPackage)) {
    return false;
  }
  if (rule.signature.ownerBundle && !signals.some((signal) => signal.key === "owner_bundle" && signal.value === rule.signature.ownerBundle)) {
    return false;
  }
  if (rule.signature.containerRole && !signals.some((signal) => signal.key === "container_role" && signal.value === rule.signature.containerRole)) {
    return false;
  }

  return true;
}

export function resolveInterruptionPlan(
  signals: InterruptionSignal[],
  rules: InterruptionPolicyRuleV2[],
  preferredSlot?: InterruptionActionSlot,
  expectedType?: InterruptionPolicyRuleV2["type"],
): InterruptionResolutionPlan {
  const prioritized = [...rules].sort((left, right) => {
    const score = (priority: InterruptionPolicyRuleV2["priority"]) => (priority === "high" ? 3 : priority === "medium" ? 2 : 1);
    return score(right.priority) - score(left.priority);
  });

  const matchedRule = prioritized.find((rule) => {
    if (expectedType && rule.type !== expectedType) {
      return false;
    }
    return signalMatchesRule(signals, rule);
  });
  if (!matchedRule) {
    return {
      denied: true,
      reason: "No interruption policy rule matched detected signals.",
    };
  }

  if (!matchedRule.auto) {
    return {
      matchedRule,
      denied: true,
      reason: `Matched interruption rule '${matchedRule.id}' is not auto-executable.`,
    };
  }

  return {
    matchedRule,
    denied: false,
    selectedSlot: preferredSlot ?? matchedRule.action.slot,
  };
}

export function requiredPolicyScopesForTool(toolName: string): string[] {
  if (["inspect_ui", "query_ui", "resolve_ui_target", "wait_for_ui", "describe_capabilities", "list_devices", "doctor"].includes(toolName)) {
    return ["inspect"];
  }
  if (toolName === "take_screenshot") {
    return ["screenshot"];
  }
  if (toolName === "record_screen") {
    return ["screenshot"];
  }
  if (["get_logs", "get_crash_signals", "collect_diagnostics", "collect_debug_evidence", "capture_js_console_logs", "capture_js_network_events", "list_js_debug_targets"].includes(toolName)) {
    return ["logs"];
  }
  if (["measure_android_performance", "measure_ios_performance"].includes(toolName)) {
    return ["performance"];
  }
  if (["tap", "tap_element", "launch_app", "terminate_app"].includes(toolName)) {
    return ["tap"];
  }
  if (toolName === "perform_action_with_evidence") {
    return ["tap", "type", "swipe"];
  }
  if (["type_text", "type_into_element"].includes(toolName)) {
    return ["type"];
  }
  if (["scroll_and_resolve_ui_target", "scroll_and_tap_element"].includes(toolName)) {
    return ["swipe"];
  }
  if (["recover_to_known_state", "replay_last_stable_path"].includes(toolName)) {
    return ["tap"];
  }
  if (toolName === "install_app") {
    return ["install"];
  }
  if (toolName === "reset_app_state") {
    return ["clear-data", "install", "uninstall"];
  }
  if (toolName === "run_flow") {
    return ["tap", "type", "swipe"];
  }
  if (["detect_interruption", "classify_interruption", "resolve_interruption", "resume_interrupted_action"].includes(toolName)) {
    return ["interrupt"];
  }
  return [];
}

export function isToolAllowedByProfile(profile: AccessProfile, toolName: string): boolean {
  const scopes = requiredPolicyScopesForTool(toolName);
  if (scopes.length === 0) {
    return true;
  }

  if (scopes.some((scope) => profile.deny.includes(scope))) {
    return false;
  }

  return scopes.every((scope) => profile.allow.includes(scope));
}

export function evaluateNetworkRetryPolicy(readiness: string | undefined): NetworkRetryPolicyDecision {
  if (readiness === "offline_terminal") {
    return { retryable: false, terminal: true, reason: "offline_terminal" };
  }
  if (readiness === "backend_failed_terminal") {
    return { retryable: false, terminal: true, reason: "backend_failed_terminal" };
  }
  if (readiness === "waiting_network" || readiness === "degraded_success") {
    return { retryable: true, terminal: false, reason: readiness };
  }
  return { retryable: false, terminal: false, reason: readiness ?? "unknown" };
}

export function isReplayAllowedByPolicy(profile: AccessProfile, highRisk: boolean): boolean {
  if (highRisk) {
    return false;
  }
  return profile.allow.includes("tap") || profile.allow.includes("swipe");
}
