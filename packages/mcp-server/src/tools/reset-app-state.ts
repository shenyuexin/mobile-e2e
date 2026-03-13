import type { ResetAppStateInput, ResetAppStateData, ToolResult } from "@mobile-e2e-mcp/contracts";
import { resetAppStateWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function resetAppState(input: ResetAppStateInput): Promise<ToolResult<ResetAppStateData>> {
  return resetAppStateWithMaestro(input);
}
