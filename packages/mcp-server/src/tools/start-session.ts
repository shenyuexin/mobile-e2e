import { buildCapabilityProfile, resolveRepoPath, resolveSessionDefaults } from "@mobile-e2e-mcp/adapter-maestro";
import { persistStartedSession } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type Session, type StartSessionInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

function buildDefaultDeviceId(platform: StartSessionInput["platform"]): string {
  return platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816";
}

function buildDefaultAppId(platform: StartSessionInput["platform"]): string {
  return platform === "android" ? "host.exp.exponent" : "host.exp.Exponent";
}

export async function startSession(input: StartSessionInput): Promise<ToolResult<Session>> {
  const repoRoot = resolveRepoPath();
  const sessionId = input.sessionId ?? `session-${Date.now()}`;
  const profile = input.profile ?? null;
  const sessionDefaults = await resolveSessionDefaults({
    sessionId,
    platform: input.platform,
    runnerProfile: profile,
    harnessConfigPath: input.harnessConfigPath,
    artifactRoot: input.artifactsRoot,
  });

  const session: Session = {
    sessionId,
    platform: input.platform,
    deviceId: input.deviceId ?? buildDefaultDeviceId(input.platform),
    appId: input.appId ?? sessionDefaults.appId ?? buildDefaultAppId(input.platform),
    policyProfile: input.policyProfile ?? "sample-harness-default",
    startedAt: new Date().toISOString(),
    artifactsRoot: sessionDefaults.artifactsRoot,
    profile,
    phase: input.phase ?? "phase2",
    sampleName: input.sampleName ?? sessionDefaults.sampleName,
    capabilities: buildCapabilityProfile(input.platform, profile),
    timeline: [
      {
        timestamp: new Date().toISOString(),
        type: "session_started",
        detail: `Initialized ${input.platform} sample session`,
      },
    ],
  };
  const sessionArtifactPath = await persistStartedSession(repoRoot, session);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [sessionArtifactPath],
    data: session,
    nextSuggestions: ["Invoke run_flow with the returned sessionId to execute the sample harness.", "Use the persisted session artifact to restore context across agent/tool restarts."],
  };
}
