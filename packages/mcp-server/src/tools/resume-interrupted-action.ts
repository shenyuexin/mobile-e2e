import type { ResumeInterruptedActionData, ResumeInterruptedActionInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { resumeInterruptedActionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function resumeInterruptedAction(input: ResumeInterruptedActionInput): Promise<ToolResult<ResumeInterruptedActionData>> {
  return resumeInterruptedActionWithMaestro(input);
}
