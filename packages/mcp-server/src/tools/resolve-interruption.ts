import type { ResolveInterruptionData, ResolveInterruptionInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { resolveInterruptionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import { loadInterruptionPolicyContext } from "../policy-guard.js";

export async function resolveInterruption(input: ResolveInterruptionInput): Promise<ToolResult<ResolveInterruptionData>> {
  const policyContext = await loadInterruptionPolicyContext(input.sessionId);
  return resolveInterruptionWithMaestro(input, policyContext);
}
