import type { ToolResult, WaitForUiData, WaitForUiInput } from "@mobile-e2e-mcp/contracts";
import { waitForUiWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function waitForUi(input: WaitForUiInput): Promise<ToolResult<WaitForUiData>> {
  return waitForUiWithMaestro(input);
}
