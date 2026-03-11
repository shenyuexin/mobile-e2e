import type { GetActionOutcomeData, GetActionOutcomeInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { getActionOutcomeWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function getActionOutcome(input: GetActionOutcomeInput): Promise<ToolResult<GetActionOutcomeData>> {
  return getActionOutcomeWithMaestro(input);
}
