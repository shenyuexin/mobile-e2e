import type { RecordScreenInput, RecordScreenData, ToolResult } from "@mobile-e2e-mcp/contracts";
import { recordScreenWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function recordScreen(input: RecordScreenInput): Promise<ToolResult<RecordScreenData>> {
  return recordScreenWithMaestro(input);
}
