import type { GetSessionStateData, GetSessionStateInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { getSessionStateWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function getSessionState(input: GetSessionStateInput): Promise<ToolResult<GetSessionStateData>> {
  return getSessionStateWithMaestro(input);
}
