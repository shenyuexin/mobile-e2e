import type { CollectDebugEvidenceData, CollectDebugEvidenceInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { collectDebugEvidenceWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function collectDebugEvidence(input: CollectDebugEvidenceInput): Promise<ToolResult<CollectDebugEvidenceData>> {
  return collectDebugEvidenceWithMaestro(input);
}
