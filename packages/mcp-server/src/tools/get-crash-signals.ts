import type { GetCrashSignalsData, GetCrashSignalsInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { getCrashSignalsWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function getCrashSignals(input: GetCrashSignalsInput): Promise<ToolResult<GetCrashSignalsData>> {
  return getCrashSignalsWithMaestro(input);
}
