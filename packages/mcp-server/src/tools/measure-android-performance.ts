import type { MeasureAndroidPerformanceData, MeasureAndroidPerformanceInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { measureAndroidPerformanceWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function measureAndroidPerformance(input: MeasureAndroidPerformanceInput): Promise<ToolResult<MeasureAndroidPerformanceData>> {
  return measureAndroidPerformanceWithMaestro(input);
}
