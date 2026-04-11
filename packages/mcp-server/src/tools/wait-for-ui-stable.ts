import type { WaitForUiStableData, WaitForUiStableInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { waitForUiStableWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function waitForUiStable(input: WaitForUiStableInput): Promise<ToolResult<WaitForUiStableData>> {
  return waitForUiStableWithMaestro(input);
}
