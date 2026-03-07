import { REASON_CODES } from "../../../contracts/reason-codes";

export async function runFlow(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return {
    status: "partial",
    reasonCode: REASON_CODES.unsupportedOperation,
    sessionId: String(input.sessionId ?? ""),
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: {
      flowPath: input.flowPath ?? null,
      note: "Flow execution is not wired yet. Use the migrated scripts under scripts/dev as the current execution backend.",
    },
    nextSuggestions: [
      "Connect this tool to the Maestro-backed runner under packages/adapter-maestro.",
      "Map flowPath to configs/harness and flows/samples before enabling runtime execution."
    ],
  };
}
