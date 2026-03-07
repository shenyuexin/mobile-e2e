import { REASON_CODES } from "../../../contracts/reason-codes";

export async function endSession(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: String(input.sessionId ?? ""),
    durationMs: 0,
    attempts: 1,
    artifacts: Array.isArray(input.artifacts) ? input.artifacts : [],
    data: {
      closed: true,
    },
    nextSuggestions: [],
  };
}
