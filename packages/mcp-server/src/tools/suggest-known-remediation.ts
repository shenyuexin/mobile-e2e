import type { SuggestKnownRemediationData, SuggestKnownRemediationInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { suggestKnownRemediationWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function suggestKnownRemediation(input: SuggestKnownRemediationInput): Promise<ToolResult<SuggestKnownRemediationData>> {
  return suggestKnownRemediationWithMaestro(input);
}
