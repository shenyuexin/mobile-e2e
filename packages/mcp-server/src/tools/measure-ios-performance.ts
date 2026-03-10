import type { MeasureIosPerformanceData, MeasureIosPerformanceInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { measureIosPerformanceWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function measureIosPerformance(input: MeasureIosPerformanceInput): Promise<ToolResult<MeasureIosPerformanceData>> {
  return measureIosPerformanceWithMaestro(input);
}
