import type { CompareAgainstBaselineData, CompareAgainstBaselineInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { compareAgainstBaselineWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function compareAgainstBaseline(input: CompareAgainstBaselineInput): Promise<ToolResult<CompareAgainstBaselineData>> {
  return compareAgainstBaselineWithMaestro(input);
}
