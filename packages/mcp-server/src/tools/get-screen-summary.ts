import type { GetScreenSummaryData, GetScreenSummaryInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { getScreenSummaryWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function getScreenSummary(input: GetScreenSummaryInput): Promise<ToolResult<GetScreenSummaryData>> {
  return getScreenSummaryWithMaestro(input);
}
