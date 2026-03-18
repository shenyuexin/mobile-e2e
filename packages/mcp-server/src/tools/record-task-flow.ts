import type { RecordTaskFlowData, RecordTaskFlowInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { exportSessionFlow } from "./export-session-flow.js";

export async function recordTaskFlow(input: RecordTaskFlowInput): Promise<ToolResult<RecordTaskFlowData>> {
  const exported = await exportSessionFlow(input);
  return {
    ...exported,
    data: {
      ...exported.data,
      goal: input.goal,
    },
  };
}
