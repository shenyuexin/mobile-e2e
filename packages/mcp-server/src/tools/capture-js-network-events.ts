import type { CaptureJsNetworkEventsData, CaptureJsNetworkEventsInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { captureJsNetworkEventsWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function captureJsNetworkEvents(input: CaptureJsNetworkEventsInput): Promise<ToolResult<CaptureJsNetworkEventsData>> {
  return captureJsNetworkEventsWithMaestro(input);
}
