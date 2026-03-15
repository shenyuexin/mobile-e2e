import type { ResolveInterruptionData, ResolveInterruptionInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { resolveInterruptionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function resolveInterruption(input: ResolveInterruptionInput): Promise<ToolResult<ResolveInterruptionData>> {
  return resolveInterruptionWithMaestro(input);
}
