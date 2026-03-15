import type { ClassifyInterruptionData, ClassifyInterruptionInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { classifyInterruptionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function classifyInterruption(input: ClassifyInterruptionInput): Promise<ToolResult<ClassifyInterruptionData>> {
  return classifyInterruptionWithMaestro(input);
}
