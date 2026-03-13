import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export interface AccessProfile {
  allow: string[];
  deny: string[];
}

export interface AccessPolicyConfig {
  profiles: Record<string, AccessProfile>;
}

const DEFAULT_ACCESS_POLICY_PATH = "configs/policies/access-profiles.yaml";

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
  if (["type_text", "type_into_element"].includes(toolName)) {
    return ["type"];
  }
  if (["scroll_and_resolve_ui_target", "scroll_and_tap_element"].includes(toolName)) {
    return ["swipe"];
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
