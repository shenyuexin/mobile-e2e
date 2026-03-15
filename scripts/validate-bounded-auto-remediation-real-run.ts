import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../packages/mcp-server/src/index.ts";
import { buildSessionAuditRelativePath, buildSessionRecordRelativePath, loadSessionAuditRecord, loadSessionRecord } from "../packages/core/src/index.ts";
import type { InstallAppInput, LaunchAppInput, PerformActionWithEvidenceInput, RunnerProfile, StartSessionInput } from "../packages/contracts/src/index.ts";

function resolveRunnerProfile(value: string | undefined): RunnerProfile {
  const allowed: RunnerProfile[] = ["phase1", "native_android", "native_ios", "flutter_android"];
  return allowed.includes(value as RunnerProfile) ? (value as RunnerProfile) : "native_android";
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function main(): Promise<void> {
  const root = repoRoot();
  const outputDir = path.resolve(root, "reports");
  const outputJson = path.resolve(outputDir, "bounded-auto-remediation-acceptance.json");
  const outputMd = path.resolve(outputDir, "bounded-auto-remediation-acceptance.md");
  const sessionId = `bounded-auto-remediation-${Date.now()}`;
  const server = createServer();
  const deviceId = process.env.DEVICE_ID ?? "emulator-5554";
  const appId = process.env.APP_ID ?? "com.epam.mobitru";
  const runnerProfile = resolveRunnerProfile(process.env.RUNNER_PROFILE);
  const apkPath = process.env.NATIVE_ANDROID_APK_PATH ?? path.resolve(root, "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk");

  const startInput: StartSessionInput = {
    sessionId,
    platform: "android",
    profile: runnerProfile,
    policyProfile: "sample-harness-default",
  };
  try {
    await server.invoke("start_session", startInput);

    const installInput: InstallAppInput = {
      sessionId,
      platform: "android",
      runnerProfile,
      deviceId,
      artifactPath: apkPath,
    };
    await server.invoke("install_app", installInput);

    const launchInput: LaunchAppInput = {
      sessionId,
      platform: "android",
      runnerProfile,
      deviceId,
      appId,
    };
    await server.invoke("launch_app", launchInput);

    const actionInput: PerformActionWithEvidenceInput = {
      sessionId,
      platform: "android",
      runnerProfile,
      deviceId,
      appId,
      autoRemediate: true,
      action: {
        actionType: "tap_element",
        contentDesc: "This control does not exist",
      },
    };
    const result = await server.invoke("perform_action_with_evidence", actionInput);

    const sessionRecord = await loadSessionRecord(root, sessionId);
    const auditRecord = await loadSessionAuditRecord(root, sessionId);
    assert.ok(sessionRecord);
    assert.ok(auditRecord);
    assert.ok(result.data.autoRemediation);

    const timelineEvents = sessionRecord.session.timeline.filter((event) => event.type.startsWith("auto_remediation_"));
    if (result.data.autoRemediation.attempted) {
      assert.equal(timelineEvents.length > 0, true);
    }
    assert.equal(auditRecord.artifact_paths.length > 0, true);

    const payload = {
      generated_at: new Date().toISOString(),
      session_id: sessionId,
      result_status: result.status,
      result_reason_code: result.reasonCode,
      auto_remediation: result.data.autoRemediation,
      session_record_path: buildSessionRecordRelativePath(sessionId),
      session_audit_path: buildSessionAuditRelativePath(sessionId),
      artifact_count: result.artifacts.length,
      artifacts: result.artifacts,
      timeline_events: timelineEvents.map((event) => ({
        type: event.type,
        detail: event.detail,
        artifactRefs: event.artifactRefs ?? [],
      })),
    };

    await writeFile(outputJson, JSON.stringify(payload, null, 2) + "\n", "utf8");
    await writeFile(outputMd, [
      "# Bounded Auto-Remediation Acceptance",
      "",
      `- Session: ${sessionId}`,
      `- Status: ${result.status}`,
      `- Reason code: ${result.reasonCode}`,
      `- Stop reason: ${result.data.autoRemediation.stopReason}`,
      `- Attempted: ${result.data.autoRemediation.attempted ? "yes" : "no"}`,
      `- Recovered: ${result.data.autoRemediation.recovered ? "yes" : "no"}`,
      `- Session record: ${buildSessionRecordRelativePath(sessionId)}`,
      `- Session audit: ${buildSessionAuditRelativePath(sessionId)}`,
      "",
      "## Timeline events",
      ...payload.timeline_events.map((event) => `- ${event.type}: ${event.detail ?? "<no detail>"}`),
      "",
    ].join("\n"), "utf8");

    const finalAudit = await loadSessionAuditRecord(root, sessionId);
    assert.ok(finalAudit);
  } finally {
    await server.invoke("end_session", { sessionId, artifacts: [path.relative(root, outputJson), path.relative(root, outputMd)] });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
