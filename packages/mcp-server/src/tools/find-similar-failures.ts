import type { FindSimilarFailuresData, FindSimilarFailuresInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { findSimilarFailuresWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function findSimilarFailures(input: FindSimilarFailuresInput): Promise<ToolResult<FindSimilarFailuresData>> {
  return findSimilarFailuresWithMaestro(input);
}
