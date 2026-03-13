import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { appendSessionTimelineEvent, loadSessionRecord, persistEndedSession, releaseLease } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type EndSessionInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

export async function endSession(input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>> {
  const repoRoot = resolveRepoPath();
  const existing = await loadSessionRecord(repoRoot, input.sessionId);
  const persisted = await persistEndedSession(repoRoot, input.sessionId, input.artifacts ?? []);
  let leaseArtifactPath: string | undefined;
  let leaseSuggestion: string | undefined;
  if (existing) {
    const released = await releaseLease(repoRoot, {
      sessionId: input.sessionId,
      platform: existing.session.platform,
      deviceId: existing.session.deviceId,
    });
    if (released.released) {
      leaseArtifactPath = released.relativePath;
    } else if (released.reason === "owned_by_another") {
      leaseSuggestion = `Lease for ${existing.session.deviceId} is currently owned by another session.`;
    }
    if (released.released) {
      await appendSessionTimelineEvent(repoRoot, input.sessionId, {
        timestamp: new Date().toISOString(),
        type: "lease_released",
        detail: `Released device lease for ${existing.session.deviceId}.`,
      });
    }
  }
  const endedAt = persisted.endedAt ?? new Date().toISOString();
  const toolArtifacts = [
    ...(persisted.relativePath ? [persisted.relativePath] : []),
    ...(persisted.auditPath ? [persisted.auditPath] : []),
    ...(leaseArtifactPath ? [leaseArtifactPath] : []),
    ...(input.artifacts ?? []),
  ];
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: toolArtifacts,
    data: {
      closed: persisted.closed,
      endedAt,
    },
    nextSuggestions: [
      ...(persisted.finalized ? [] : ["No persisted session record was found to finalize; ensure start_session ran before end_session if you rely on session recovery."]),
      ...(leaseSuggestion ? [leaseSuggestion] : []),
    ],
  };
}
