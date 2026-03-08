import type { InspectUiInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { inspectUiWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function inspectUi(input: InspectUiInput): Promise<ToolResult> {
  return inspectUiWithMaestro(input);
}
