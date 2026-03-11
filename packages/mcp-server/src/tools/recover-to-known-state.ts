import type { RecoverToKnownStateData, RecoverToKnownStateInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { recoverToKnownStateWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function recoverToKnownState(input: RecoverToKnownStateInput): Promise<ToolResult<RecoverToKnownStateData>> {
  return recoverToKnownStateWithMaestro(input);
}
