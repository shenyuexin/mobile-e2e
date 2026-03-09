import type { ListJsDebugTargetsData, ListJsDebugTargetsInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { listJsDebugTargetsWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function listJsDebugTargets(input: ListJsDebugTargetsInput): Promise<ToolResult<ListJsDebugTargetsData>> {
  return listJsDebugTargetsWithMaestro(input);
}
