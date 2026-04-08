import { validateFlow } from "@mobile-e2e-mcp/adapter-maestro";
import type { ToolResult, ValidateFlowData, ValidateFlowInput } from "@mobile-e2e-mcp/contracts";

export async function validateFlowTool(input: ValidateFlowInput): Promise<ToolResult<ValidateFlowData>> {
  return validateFlow(input);
}
