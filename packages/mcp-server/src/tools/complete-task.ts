import { completeTaskWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { CompleteTaskData, CompleteTaskInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function completeTask(input: CompleteTaskInput): Promise<ToolResult<CompleteTaskData>> {
  return completeTaskWithMaestro(input);
}
