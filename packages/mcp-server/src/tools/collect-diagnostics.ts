import type { CollectDiagnosticsData, CollectDiagnosticsInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { collectDiagnosticsWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function collectDiagnostics(input: CollectDiagnosticsInput): Promise<ToolResult<CollectDiagnosticsData>> {
  return collectDiagnosticsWithMaestro(input);
}
