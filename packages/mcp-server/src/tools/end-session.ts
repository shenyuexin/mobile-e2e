import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { persistEndedSession } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type EndSessionInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

export async function endSession(input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>> {
  const repoRoot = resolveRepoPath();
  const persisted = await persistEndedSession(repoRoot, input.sessionId, input.artifacts ?? []);
  const endedAt = persisted.endedAt ?? new Date().toISOString();
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: persisted.relativePath ? [persisted.relativePath, ...(input.artifacts ?? [])] : (input.artifacts ?? []),
    data: {
      closed: persisted.closed,
      endedAt,
    },
    nextSuggestions: persisted.finalized ? [] : ["No persisted session record was found to finalize; ensure start_session ran before end_session if you rely on session recovery."],
  };
}
