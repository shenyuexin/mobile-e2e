import type { NavigateBackData, NavigateBackInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { navigateBackWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function navigateBack(input: NavigateBackInput): Promise<ToolResult<NavigateBackData>> {
  return navigateBackWithMaestro(input);
}
