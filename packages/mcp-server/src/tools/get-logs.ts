import type { GetLogsData, GetLogsInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { getLogsWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function getLogs(input: GetLogsInput): Promise<ToolResult<GetLogsData>> {
  return getLogsWithMaestro(input);
}
