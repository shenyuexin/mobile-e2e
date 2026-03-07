import { REASON_CODES } from "../../../contracts/reason-codes";

export async function startSession(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sessionId = String(input.sessionId ?? `session-${Date.now()}`);
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: {
      sessionId,
      phase: input.phase ?? null,
    },
    nextSuggestions: [],
  };
}
