import type { InstallAppInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { installAppWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function installApp(input: InstallAppInput): Promise<ToolResult> {
  return installAppWithMaestro(input);
}
