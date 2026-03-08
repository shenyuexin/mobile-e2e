import type { ScrollAndResolveUiTargetData, ScrollAndResolveUiTargetInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { scrollAndResolveUiTargetWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function scrollAndResolveUiTarget(input: ScrollAndResolveUiTargetInput): Promise<ToolResult<ScrollAndResolveUiTargetData>> {
  return scrollAndResolveUiTargetWithMaestro(input);
}
