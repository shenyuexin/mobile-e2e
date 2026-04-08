import type { NetworkProbeData, NetworkProbeInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { probeNetworkReadiness } from "@mobile-e2e-mcp/adapter-maestro";

export async function probeNetworkReadinessTool(input: NetworkProbeInput): Promise<ToolResult<NetworkProbeData>> {
  return probeNetworkReadiness(input);
}
