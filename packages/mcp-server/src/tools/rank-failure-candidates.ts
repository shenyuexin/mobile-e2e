import type { RankFailureCandidatesData, RankFailureCandidatesInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { rankFailureCandidatesWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function rankFailureCandidates(input: RankFailureCandidatesInput): Promise<ToolResult<RankFailureCandidatesData>> {
  return rankFailureCandidatesWithMaestro(input);
}
