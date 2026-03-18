import { executeIntentPlanWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { ExecuteIntentData, ExecuteIntentInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function executeIntent(input: ExecuteIntentInput): Promise<ToolResult<ExecuteIntentData>> {
  return executeIntentPlanWithMaestro(input);
}
