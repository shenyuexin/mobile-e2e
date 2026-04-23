import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import type { AccessProfile, InterruptionPolicyContext } from "@mobile-e2e-mcp/core";
import { isHighRiskInterruptionActionAllowed, isToolAllowedByProfile, loadAccessProfile, loadSessionRecord } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type InterruptionPolicyRuleV2, type StartSessionInput, type ToolResult, TOOL_NAMES } from "@mobile-e2e-mcp/contracts";

const DEFAULT_POLICY_PROFILE = "sample-harness-default";

function extractSessionId(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = (input as { sessionId?: unknown }).sessionId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractStartSessionPolicyProfile(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = (input as { policyProfile?: unknown }).policyProfile;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function validatePolicyProfile(policyProfile: string | undefined): Promise<void> {
  const repoRoot = resolveRepoPath();
  const profile = await loadAccessProfile(repoRoot, policyProfile ?? DEFAULT_POLICY_PROFILE);
  if (!profile) {
    throw new Error(`Unknown policy profile: ${policyProfile ?? DEFAULT_POLICY_PROFILE}`);
  }
}

export async function enforcePolicyForTool<TInput>(toolName: string, input: TInput): Promise<ToolResult<{ toolName: string; policyProfile: string }> | undefined> {
  if (toolName === TOOL_NAMES.endSession) {
    return undefined;
  }

  const repoRoot = resolveRepoPath();
  const sessionId = extractSessionId(input);
  const startSessionPolicyProfile = toolName === TOOL_NAMES.startSession ? extractStartSessionPolicyProfile(input) : undefined;
  const sessionRecord = sessionId ? await loadSessionRecord(repoRoot, sessionId) : undefined;
  const policyProfile = startSessionPolicyProfile ?? sessionRecord?.session.policyProfile ?? DEFAULT_POLICY_PROFILE;
  const profile = await loadAccessProfile(repoRoot, policyProfile);
  if (!profile) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: sessionId ?? "policy-check",
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: { toolName, policyProfile },
      nextSuggestions: [`Unknown policy profile '${policyProfile}'. Start a session with a valid policyProfile before invoking governed tools.`],
    };
  }

  if (isToolAllowedByProfile(profile, toolName)) {
    return undefined;
  }

  return {
    status: "failed",
    reasonCode: REASON_CODES.policyDenied,
    sessionId: sessionId ?? "policy-check",
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: { toolName, policyProfile },
    nextSuggestions: [
      `Tool '${toolName}' is denied by policy profile '${policyProfile}'. Start a session with a more permissive profile if this action is intended.`,
      ([TOOL_NAMES.detectInterruption, TOOL_NAMES.classifyInterruption, TOOL_NAMES.resolveInterruption, TOOL_NAMES.resumeInterruptedAction] as string[]).includes(toolName)
        ? "Interruption tools require 'interrupt' scope (and 'interrupt-high-risk' for destructive interruption actions)."
        : undefined,
    ].filter((value): value is string => Boolean(value)),
  };
}

export async function validateStartSessionInput(input: StartSessionInput): Promise<void> {
  await validatePolicyProfile(input.policyProfile);
}

export function requiredScopesForInterruptionTool(toolName: string): readonly string[] {
  switch (toolName) {
    case TOOL_NAMES.resolveInterruption:
      return ["interrupt", "interrupt-high-risk"];
    case TOOL_NAMES.detectInterruption:
    case TOOL_NAMES.classifyInterruption:
    case TOOL_NAMES.resumeInterruptedAction:
      return ["interrupt"];
    default:
      return [];
  }
}

export async function loadInterruptionPolicyContext(sessionId: string): Promise<InterruptionPolicyContext | undefined> {
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, sessionId);
  const policyProfileName = sessionRecord?.session.policyProfile ?? DEFAULT_POLICY_PROFILE;
  const accessProfile = await loadAccessProfile(repoRoot, policyProfileName);
  if (!accessProfile) {
    return undefined;
  }
  return { accessProfile, policyProfileName };
}

export function checkInterruptionRulePolicy(
  matchedRule: InterruptionPolicyRuleV2,
  accessProfile: AccessProfile,
): { allowed: boolean; reason?: string } {
  return isHighRiskInterruptionActionAllowed(matchedRule, accessProfile);
}

export function checkInterruptionTapScope(
  accessProfile: AccessProfile,
): boolean {
  return isToolAllowedByProfile(accessProfile, TOOL_NAMES.tapElement);
}
