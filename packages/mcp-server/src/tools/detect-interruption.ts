import type { DetectInterruptionData, DetectInterruptionInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { detectInterruptionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function detectInterruption(input: DetectInterruptionInput): Promise<ToolResult<DetectInterruptionData>> {
  return detectInterruptionWithMaestro(input);
}
