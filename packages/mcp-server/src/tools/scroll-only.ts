import type { ScrollOnlyData, ScrollOnlyInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { scrollOnlyWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function scrollOnly(input: ScrollOnlyInput): Promise<ToolResult<ScrollOnlyData>> {
  return scrollOnlyWithMaestro(input);
}
