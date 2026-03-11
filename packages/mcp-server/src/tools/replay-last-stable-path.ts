import type { ReplayLastStablePathData, ReplayLastStablePathInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { replayLastStablePathWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function replayLastStablePath(input: ReplayLastStablePathInput): Promise<ToolResult<ReplayLastStablePathData>> {
  return replayLastStablePathWithMaestro(input);
}
