import type { CaptureJsConsoleLogsData, CaptureJsConsoleLogsInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { captureJsConsoleLogsWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function captureJsConsoleLogs(input: CaptureJsConsoleLogsInput): Promise<ToolResult<CaptureJsConsoleLogsData>> {
  return captureJsConsoleLogsWithMaestro(input);
}
