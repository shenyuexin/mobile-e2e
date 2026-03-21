import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { loadSessionRecord, persistSessionState } from "@mobile-e2e-mcp/core";
import type { ExecutionEvidence, SessionTimelineEvent, StateSummary, TimelineEventLayer, ToolResult } from "@mobile-e2e-mcp/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readExecutionEvidenceArray(value: unknown): ExecutionEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ExecutionEvidence => isRecord(item) && typeof item.path === "string");
}

function extractArtifactRefs(result: ToolResult<unknown>): string[] {
  const refs = [...result.artifacts];
  if (isRecord(result.data)) {
    if (typeof result.data.outputPath === "string" && result.data.outputPath.length > 0) {
      refs.push(result.data.outputPath);
    }
    refs.push(...readStringArray(result.data.artifactPaths));
    refs.push(...readStringArray(result.data.evidencePaths));
    refs.push(...readStringArray(result.data.artifacts));
    refs.push(...readExecutionEvidenceArray(result.data.evidence).map((item) => item.path));
  }
  return Array.from(new Set(refs.filter((item) => item.length > 0)));
}

function defaultStateSummary(stateSummary?: StateSummary): StateSummary {
  return stateSummary ?? {
    appPhase: "unknown",
    readiness: "unknown",
    blockingSignals: [],
  };
}

function buildLayer(toolName: string): TimelineEventLayer {
  if (toolName.includes("performance")) {
    return "performance";
  }
  if (toolName.includes("crash")) {
    return "crash";
  }
  if (toolName.includes("log") || toolName.includes("console") || toolName.includes("network")) {
    return toolName.includes("network") ? "network" : "log";
  }
  if (toolName.includes("diagnostic")) {
    return "environment";
  }
  return "runtime";
}

function buildEvidenceEvent(toolName: string, result: ToolResult<unknown>, artifactRefs: string[], stateSummary?: StateSummary): SessionTimelineEvent {
  const statusSummary = `${toolName} ${result.status}`;
  return {
    timestamp: new Date().toISOString(),
    type: `${toolName}_captured`,
    eventType: "evidence_capture",
    layer: buildLayer(toolName),
    summary: statusSummary,
    detail: `${statusSummary}; recorded ${String(artifactRefs.length)} artifact reference(s).`,
    artifactRefs,
    stateSummary: defaultStateSummary(stateSummary),
  };
}

export async function persistSessionEvidenceCapture(params: {
  toolName: string;
  sessionId?: string;
  result: ToolResult<unknown>;
}): Promise<void> {
  if (!params.sessionId) {
    return;
  }

  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, params.sessionId);
  if (!sessionRecord) {
    return;
  }

  const artifactRefs = extractArtifactRefs(params.result);
  if (artifactRefs.length === 0) {
    return;
  }

  await persistSessionState(
    repoRoot,
    params.sessionId,
    defaultStateSummary(sessionRecord.session.latestStateSummary),
    buildEvidenceEvent(params.toolName, params.result, artifactRefs, sessionRecord.session.latestStateSummary),
    artifactRefs,
  );
}
