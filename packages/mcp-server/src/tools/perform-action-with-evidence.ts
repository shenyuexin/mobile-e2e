import type { PerformActionWithEvidenceData, PerformActionWithEvidenceInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { performActionWithEvidenceWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function performActionWithEvidence(input: PerformActionWithEvidenceInput): Promise<ToolResult<PerformActionWithEvidenceData>> {
  return performActionWithEvidenceWithMaestro(input);
}
