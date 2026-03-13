import { buildCapabilityProfile, resolveRepoPath, resolveSessionDefaults } from "@mobile-e2e-mcp/adapter-maestro";
import { acquireLease, buildSessionRecordRelativePath, loadAccessProfile, loadSessionRecord, persistStartedSession, releaseLease } from "@mobile-e2e-mcp/core";
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
  const startedAt = new Date().toISOString();
  const profile = input.profile ?? null;
  const policyProfile = input.policyProfile ?? "sample-harness-default";
  const accessProfile = await loadAccessProfile(repoRoot, policyProfile);
  if (!accessProfile) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: {
        sessionId,
        platform: input.platform,
        deviceId: input.deviceId ?? buildDefaultDeviceId(input.platform),
        appId: input.appId ?? buildDefaultAppId(input.platform),
        policyProfile,
        startedAt,
        artifactsRoot: input.artifactsRoot ?? "artifacts/mcp-server/invalid-session",
        profile,
        phase: input.phase ?? "phase2",
        sampleName: input.sampleName ?? "unknown",
        capabilities: buildCapabilityProfile(input.platform, profile),
        timeline: [
          {
            timestamp: startedAt,
            type: "session_start_rejected",
            detail: `Rejected unknown policy profile ${policyProfile}`,
          },
        ],
      },
      nextSuggestions: [`Unknown policy profile '${policyProfile}'. Use one of the configured access profiles before retrying start_session.`],
    };
  }
  const sessionDefaults = await resolveSessionDefaults({
    sessionId,
    platform: input.platform,
    runnerProfile: profile,
    harnessConfigPath: input.harnessConfigPath,
    artifactRoot: input.artifactsRoot,
  });
  const deviceId = input.deviceId ?? sessionDefaults.deviceId ?? buildDefaultDeviceId(input.platform);
  const appId = input.appId ?? sessionDefaults.appId ?? buildDefaultAppId(input.platform);
  const existing = await loadSessionRecord(repoRoot, sessionId);
  if (existing && !existing.closed) {
    if (existing.session.platform !== input.platform || existing.session.deviceId !== deviceId) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: 0,
        attempts: 1,
        artifacts: [buildSessionRecordRelativePath(sessionId)],
        data: existing.session,
        nextSuggestions: [
          `Session '${sessionId}' is already active on ${existing.session.platform}/${existing.session.deviceId}.`,
          "Use a new sessionId or end the existing session before changing platform/device.",
        ],
      };
    }
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: [buildSessionRecordRelativePath(sessionId)],
      data: existing.session,
      nextSuggestions: ["Session already active; continue with run_flow or other session-bound tools."],
    };
  }

  const leaseResult = await acquireLease(repoRoot, {
    sessionId,
    platform: input.platform,
    deviceId,
  });

  if (!leaseResult.acquired) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.deviceUnavailable,
      sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: {
        sessionId,
        platform: input.platform,
        deviceId,
        appId,
        policyProfile,
        startedAt,
        artifactsRoot: sessionDefaults.artifactsRoot,
        profile,
        phase: input.phase ?? "phase2",
        sampleName: input.sampleName ?? sessionDefaults.sampleName,
        capabilities: buildCapabilityProfile(input.platform, profile),
        timeline: [
          {
            timestamp: startedAt,
            type: "session_start_rejected",
            detail: `Device ${deviceId} is already leased by session ${leaseResult.lease?.sessionId ?? "unknown"}.`,
          },
        ],
      },
      nextSuggestions: [
        `Device '${deviceId}' is busy${leaseResult.lease?.sessionId ? ` (held by session '${leaseResult.lease.sessionId}')` : ""}.`,
        "End the existing session or choose a different deviceId before retrying start_session.",
      ],
    };
  }

  const session: Session = {
    sessionId,
    platform: input.platform,
    deviceId,
    appId,
    policyProfile,
    startedAt,
    artifactsRoot: sessionDefaults.artifactsRoot,
    profile,
    phase: input.phase ?? "phase2",
    sampleName: input.sampleName ?? sessionDefaults.sampleName,
    capabilities: buildCapabilityProfile(input.platform, profile),
    timeline: [
      {
        timestamp: startedAt,
        type: "session_started",
        detail: `Initialized ${input.platform} sample session`,
      },
      {
        timestamp: startedAt,
        type: "lease_acquired",
        detail: `Acquired device lease for ${deviceId}.`,
      },
    ],
  };
  let persisted: Awaited<ReturnType<typeof persistStartedSession>>;
  try {
    persisted = await persistStartedSession(repoRoot, session);
  } catch (error: unknown) {
    await releaseLease(repoRoot, {
      sessionId,
      platform: input.platform,
      deviceId,
    }).catch(() => undefined);
    throw error;
  }

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: persisted.auditPath
      ? [persisted.relativePath, persisted.auditPath, leaseResult.relativePath]
      : [persisted.relativePath, leaseResult.relativePath],
    data: session,
    nextSuggestions: ["Invoke run_flow with the returned sessionId to execute the sample harness.", "Use the persisted session artifact to restore context across agent/tool restarts."],
  };
}
