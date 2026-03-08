import type { ResolveUiTargetData, ResolveUiTargetInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { resolveUiTargetWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function resolveUiTarget(input: ResolveUiTargetInput): Promise<ToolResult<ResolveUiTargetData>> {
  return resolveUiTargetWithMaestro(input);
}
