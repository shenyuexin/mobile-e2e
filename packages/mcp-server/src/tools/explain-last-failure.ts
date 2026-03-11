import type { ExplainLastFailureData, ExplainLastFailureInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { explainLastFailureWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function explainLastFailure(input: ExplainLastFailureInput): Promise<ToolResult<ExplainLastFailureData>> {
  return explainLastFailureWithMaestro(input);
}
