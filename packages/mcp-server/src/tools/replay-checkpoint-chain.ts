import type { ReplayCheckpointChainData, ReplayCheckpointChainInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { replayCheckpointChainWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function replayCheckpointChainTool(input: ReplayCheckpointChainInput): Promise<ToolResult<ReplayCheckpointChainData>> {
  return replayCheckpointChainWithMaestro(input);
}
