import type { DescribeCapabilitiesData, DescribeCapabilitiesInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { describeCapabilitiesWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function describeCapabilities(input: DescribeCapabilitiesInput): Promise<ToolResult<DescribeCapabilitiesData>> {
  return describeCapabilitiesWithMaestro(input);
}
