import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../packages/mcp-server/src/index.ts";

type ResultStatus = "success" | "failed" | "partial";

interface ToolResultLike {
  status: ResultStatus;
  reasonCode?: string;
  nextSuggestions?: string[];
  data?: unknown;
}

interface ProbeRecord {
  tool: string;
  status: ResultStatus;
  reasonCode?: string;
  note?: string;
  next?: string;
  actionId?: string;
}

interface ProbeSummary {
  total: number;
  success: number;
  partial: number;
  failed: number;
}

function pickActionId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const envelope = data as { outcome?: unknown };
  if (!envelope.outcome || typeof envelope.outcome !== "object") return undefined;
  const outcome = envelope.outcome as { actionId?: unknown };
  return typeof outcome.actionId === "string" ? outcome.actionId : undefined;
}

function summarize(records: ProbeRecord[]): ProbeSummary {
  return {
    total: records.length,
    success: records.filter((record) => record.status === "success").length,
    partial: records.filter((record) => record.status === "partial").length,
    failed: records.filter((record) => record.status === "failed").length,
  };
}

function toMarkdown(params: {
  runId: string;
  sessionId: string;
  deviceId: string;
  platform: string;
  runnerProfile: string;
  appId: string;
  flowPath: string;
  summary: ProbeSummary;
  records: ProbeRecord[];
}): string {
  return [
    "# iOS Tool Probe Report",
    "",
    `- Run: ${params.runId}`,
    `- Session: ${params.sessionId}`,
    `- Device: ${params.deviceId}`,
    `- Platform: ${params.platform}`,
    `- Runner Profile: ${params.runnerProfile}`,
    `- App: ${params.appId}`,
    `- Flow: ${params.flowPath}`,
    "",
    `- Total: ${params.summary.total}`,
    `- Success: ${params.summary.success}`,
    `- Partial: ${params.summary.partial}`,
    `- Failed: ${params.summary.failed}`,
    "",
    "| Tool | Status | Reason | Note |",
    "|---|---|---|---|",
    ...params.records.map((record) => `| ${record.tool} | ${record.status} | ${record.reasonCode ?? ""} | ${record.note ?? ""} |`),
    "",
  ].join("\n");
}

export async function runIosToolProbe(): Promise<void> {
  const server = createServer();
  const now = Date.now();
  const runId = `ios-tool-probe-${now}`;
  const sessionId = process.env.M2E_SESSION_ID ?? `ios-tool-checklist-${now}`;
  const deviceId = process.env.M2E_IOS_DEVICE_ID ?? process.env.M2E_DEVICE_ID ?? "00008101-000D482C1E78001E";
  const platform = "ios" as const;
  const runnerProfile = (process.env.M2E_RUNNER_PROFILE ?? "native_ios") as "native_ios";
  const appId = process.env.M2E_APP_ID ?? "com.apple.Preferences";
  const flowPath = process.env.M2E_FLOW_PATH ?? "flows/samples/ci/ios-settings-smoke.yaml";
  const checklistSource = process.env.M2E_CHECKLIST_PATH ?? "docs/testing/ios-tool-probe-checklist.md";

  const artifactsDir = join("artifacts", "ios-tool-probe", runId);
  const reportsDir = "reports";
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const records: ProbeRecord[] = [];

  const invoke = async (toolName: string, input: Record<string, unknown>): Promise<ToolResultLike> => {
    const raw = await server.invoke(toolName as never, input as never);
    return raw as ToolResultLike;
  };

  const push = (tool: string, result: ToolResultLike, note?: string): ToolResultLike => {
    records.push({
      tool,
      status: result.status,
      reasonCode: result.reasonCode,
      note,
      next: result.nextSuggestions?.[0],
      actionId: pickActionId(result.data),
    });
    return result;
  };

  const tryTextSelector = async (
    toolName: string,
    notesPrefix: string,
    candidates: string[],
    buildInput: (text: string) => Record<string, unknown>,
  ): Promise<ToolResultLike> => {
    let lastResult: ToolResultLike | undefined;
    for (const text of candidates) {
      const result = await invoke(toolName, buildInput(text));
      lastResult = result;
      if (result.status === "success" || result.status === "partial") {
        return push(toolName, result, `${notesPrefix} text=${text}`);
      }
    }
    return push(toolName, lastResult ?? { status: "failed" }, `${notesPrefix} text=${candidates[candidates.length - 1]}`);
  };

  push("start_session", await invoke("start_session", {
    sessionId,
    platform,
    profile: runnerProfile,
    deviceId,
    appId,
  }), "session created");

  push("launch_app", await invoke("launch_app", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
  }), "open iOS Settings");

  await tryTextSelector(
    "wait_for_ui",
    "wait visible by",
    ["Settings", "设置", "General", "通用"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, timeoutMs: 5000, intervalMs: 500, waitUntil: "visible" }),
  );

  await tryTextSelector(
    "resolve_ui_target",
    "resolve",
    ["General", "通用", "Bluetooth", "蓝牙"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, limit: 1 }),
  );

  await tryTextSelector(
    "scroll_and_resolve_ui_target",
    "scroll resolve",
    ["Developer", "开发者", "Privacy & Security", "隐私与安全性"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, maxSwipes: 3, swipeDirection: "down", swipeDurationMs: 400, limit: 1 }),
  );

  await tryTextSelector(
    "tap_element",
    "open search",
    ["Search", "搜索", "General", "通用"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, limit: 1 }),
  );

  push("type_into_element", await invoke("type_into_element", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
    className: "XCUIElementTypeSearchField",
    value: "bluetooth",
    limit: 1,
  }), "type into search field");

  push("execute_intent", await invoke("execute_intent", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
    intent: "tap bluetooth settings entry",
    actionType: "tap_element",
    text: "Bluetooth",
  }), "real UI intent on iOS Settings");

  const actionResult = push("perform_action_with_evidence", await invoke("perform_action_with_evidence", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
    includeDebugSignals: true,
    action: {
      actionType: "tap_element",
      text: "General",
      timeoutMs: 5000,
      intervalMs: 500,
      waitUntil: "visible",
    },
  }), "tap + evidence");

  push("complete_task", await invoke("complete_task", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
    goal: "wait and tap in iOS Settings",
    steps: [
      { intent: "wait for Settings", actionType: "wait_for_ui", text: "Settings", timeoutMs: 4000 },
      { intent: "tap General", actionType: "tap_element", text: "General" },
    ],
  }), "run multi-step task");

  push("recover_to_known_state", await invoke("recover_to_known_state", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
  }), "recover current state");

  push("replay_last_stable_path", await invoke("replay_last_stable_path", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
  }), "replay last success");

  push("run_flow", await invoke("run_flow", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    flowPath,
    runCount: 1,
  }), "run ios-settings-smoke flow");

  const failingResult = push("perform_action_with_evidence(failure)", await invoke("perform_action_with_evidence", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
    includeDebugSignals: true,
    action: {
      actionType: "tap_element",
      text: "__NO_SUCH_IOS_ELEMENT__",
      timeoutMs: 2000,
      intervalMs: 400,
      waitUntil: "visible",
    },
  }), "create failure context");

  const failedActionId = pickActionId(failingResult.data);
  const successfulActionId = pickActionId(actionResult.data);

  push("explain_last_failure", await invoke("explain_last_failure", { sessionId }), "explain latest failed action");
  push("find_similar_failures", await invoke("find_similar_failures", { sessionId, actionId: failedActionId }), "lookup similar failures");
  push("rank_failure_candidates", await invoke("rank_failure_candidates", { sessionId }), "rank failure candidates");
  push("compare_against_baseline", await invoke("compare_against_baseline", { sessionId, actionId: successfulActionId }), "compare with local baseline");

  push("resume_interrupted_action", await invoke("resume_interrupted_action", {
    sessionId,
    platform,
    runnerProfile,
    deviceId,
    appId,
    checkpoint: {
      actionId: failedActionId ?? `checkpoint-${Date.now()}`,
      sessionId,
      platform,
      actionType: "wait_for_ui",
      selector: { text: "Settings" },
      params: { text: "Settings", waitUntil: "visible", timeoutMs: 1500, intervalMs: 300 },
      createdAt: new Date().toISOString(),
    },
  }), "resume synthetic checkpoint");

  push("capture_js_console_logs", await invoke("capture_js_console_logs", {
    sessionId,
    timeoutMs: 2500,
    maxLogs: 20,
  }), "without Metro expected limited/empty");

  push("capture_js_network_events", await invoke("capture_js_network_events", {
    sessionId,
    timeoutMs: 2500,
    maxEvents: 20,
    failuresOnly: false,
  }), "without Metro expected limited/empty");

  push("end_session", await invoke("end_session", { sessionId }), "close session");

  const summary = summarize(records);
  const report = { runId, checklistSource, sessionId, deviceId, platform, runnerProfile, appId, flowPath, summary, records };

  const artifactJsonPath = join(artifactsDir, "report.json");
  const artifactMdPath = join(artifactsDir, "summary.md");
  const latestJsonPath = join(reportsDir, "ios-tool-probe.json");
  const latestMdPath = join(reportsDir, "ios-tool-probe.md");

  await writeFile(artifactJsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(artifactMdPath, toMarkdown({ runId, sessionId, deviceId, platform, runnerProfile, appId, flowPath, summary, records }), "utf8");
  await writeFile(latestJsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(latestMdPath, toMarkdown({ runId, sessionId, deviceId, platform, runnerProfile, appId, flowPath, summary, records }), "utf8");

  console.log(JSON.stringify({ runId, sessionId, summary, artifactJsonPath, artifactMdPath, latestJsonPath, latestMdPath }, null, 2));
}

const entryFilePath = process.argv[1];
const isDirectExecution = Boolean(entryFilePath) && import.meta.url === new URL(`file://${entryFilePath}`).href;

if (isDirectExecution) {
  runIosToolProbe().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[ios-tool-probe] ${message}`);
    process.exitCode = 1;
  });
}
