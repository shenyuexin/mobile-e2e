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
  observedEffect?: "observed" | "possible" | "not_observed" | "unknown";
  observedEvidence?: string;
}

interface ProbeSummary {
  total: number;
  success: number;
  partial: number;
  failed: number;
  observed: number;
  possible: number;
  notObserved: number;
  unknown: number;
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
    success: records.filter((r) => r.status === "success").length,
    partial: records.filter((r) => r.status === "partial").length,
    failed: records.filter((r) => r.status === "failed").length,
    observed: records.filter((r) => r.observedEffect === "observed").length,
    possible: records.filter((r) => r.observedEffect === "possible").length,
    notObserved: records.filter((r) => r.observedEffect === "not_observed").length,
    unknown: records.filter((r) => r.observedEffect === "unknown").length,
  };
}

function inferObservedEffect(tool: string, result: ToolResultLike, records: ProbeRecord[]): Pick<ProbeRecord, "observedEffect" | "observedEvidence"> {
  const laterUiVisibilityEvidence = records.some((r) =>
    ["wait_for_ui", "resolve_ui_target", "tap_element", "type_into_element"].includes(r.tool)
    && ["success", "partial"].includes(r.status),
  );

  if (result.status === "success") {
    return { observedEffect: "observed", observedEvidence: "tool contract passed in this run" };
  }

  if (tool === "launch_app" && laterUiVisibilityEvidence) {
    return { observedEffect: "observed", observedEvidence: "later UI probe steps reached Settings hierarchy, so foreground launch effect was observed" };
  }

  if (tool === "wait_for_ui" && result.status === "partial") {
    return { observedEffect: "observed", observedEvidence: "UI polling ran against live hierarchy; target wait did not close but app state was observable" };
  }

  if (tool === "resolve_ui_target" && result.status === "partial") {
    return { observedEffect: "observed", observedEvidence: "target resolution saw live UI state but did not find the requested selector" };
  }

  if (["execute_intent", "perform_action_with_evidence", "complete_task", "resume_interrupted_action"].includes(tool)
    && ["OCR_NO_MATCH", "OCR_AMBIGUOUS_TARGET", "TIMEOUT", "INTERRUPTION_RESOLUTION_FAILED"].includes(result.reasonCode ?? "")) {
    return { observedEffect: "possible", observedEvidence: "action chain likely dispatched device interaction, but post-action verification did not close the loop" };
  }

  if (["scroll_and_resolve_ui_target", "tap_element", "type_into_element"].includes(tool)
    && result.reasonCode === "ADAPTER_ERROR") {
    return { observedEffect: "unknown", observedEvidence: "adapter-level failure prevents proving whether device interaction happened" };
  }

  if (result.status === "partial") {
    return { observedEffect: "possible", observedEvidence: "partial result indicates some runtime progress but not a closed contract" };
  }

  if (result.status === "failed") {
    return { observedEffect: "not_observed", observedEvidence: "no reliable evidence of the intended device effect from this tool result alone" };
  }

  return { observedEffect: "unknown", observedEvidence: "no inference rule matched this result" };
}

function reclassifyObservedEffects(records: ProbeRecord[]): ProbeRecord[] {
  return records.map((record, index) => {
    const priorAndLaterRecords = records.filter((_, i) => i !== index);
    const observed = inferObservedEffect(
      record.tool,
      { status: record.status, reasonCode: record.reasonCode, nextSuggestions: record.next ? [record.next] : undefined },
      priorAndLaterRecords,
    );
    return { ...record, observedEffect: observed.observedEffect, observedEvidence: observed.observedEvidence };
  });
}

function toMarkdown(params: {
  runId: string; sessionId: string; deviceId: string; platform: string;
  runnerProfile: string; appId: string; flowPath: string;
  summary: ProbeSummary; records: ProbeRecord[];
}): string {
  const lines = [
    "# Android Tool Probe Report", "",
    `- Run: ${params.runId}`, `- Session: ${params.sessionId}`, `- Device: ${params.deviceId}`,
    `- Platform: ${params.platform}`, `- Runner Profile: ${params.runnerProfile}`,
    `- App: ${params.appId}`, `- Flow: ${params.flowPath}`, "",
    `- Total: ${params.summary.total}`, `- Success: ${params.summary.success}`,
    `- Partial: ${params.summary.partial}`, `- Failed: ${params.summary.failed}`,
    `- Observed effect: ${params.summary.observed}`, `- Possible effect: ${params.summary.possible}`,
    `- Not observed: ${params.summary.notObserved}`, `- Unknown: ${params.summary.unknown}`, "",
    "| Tool | Verdict | Observed effect | Reason | Note |",
    "|---|---|---|---|---|",
    ...params.records.map((r) => `| ${r.tool} | ${r.status} | ${r.observedEffect ?? "unknown"} | ${r.reasonCode ?? ""} | ${r.note ?? ""} |`),
    "",
  ];
  return lines.join("\n");
}

/** Wait ~1.5s for UI to stabilize after a state-changing action like press_back. */
async function waitForStable(invoke: (toolName: string, input: Record<string, unknown>) => Promise<ToolResultLike>, sessionId: string, platform: string, runnerProfile: string, deviceId: string) {
  await new Promise((r) => setTimeout(r, 1500));
  await invoke("wait_for_ui", {
    sessionId, platform, runnerProfile, deviceId,
    text: "Wi-Fi", timeoutMs: 5000, intervalMs: 500, waitUntil: "visible",
  });
}

export async function runAndroidToolProbe(): Promise<void> {
  const server = createServer();
  const now = Date.now();
  const runId = `android-tool-probe-${now}`;
  const sessionId = process.env.M2E_SESSION_ID ?? `tool-checklist-${now}`;
  const deviceId = process.env.M2E_DEVICE_ID ?? "10AEA40Z3Y000R5";
  const platform = "android" as const;
  const runnerProfile = (process.env.M2E_RUNNER_PROFILE ?? "phase1") as "phase1";
  const appId = process.env.M2E_APP_ID ?? "com.android.settings";
  const flowPath = process.env.M2E_FLOW_PATH ?? "flows/samples/generated/android-settings-smoke.yaml";
  const checklistSource = process.env.M2E_CHECKLIST_PATH ?? "docs/testing/android-tool-probe-checklist.md";

  const artifactsDir = join("artifacts", "android-tool-probe", runId);
  const reportsDir = "reports";
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const records: ProbeRecord[] = [];

  const invoke = async (toolName: string, input: Record<string, unknown>): Promise<ToolResultLike> => {
    const raw = await server.invoke(toolName as never, input as never);
    return raw as ToolResultLike;
  };

  const push = (tool: string, result: ToolResultLike, note?: string): ToolResultLike => {
    const observed = inferObservedEffect(tool, result, records);
    records.push({
      tool, status: result.status, reasonCode: result.reasonCode,
      note, next: result.nextSuggestions?.[0], actionId: pickActionId(result.data),
      observedEffect: observed.observedEffect, observedEvidence: observed.observedEvidence,
    });
    return result;
  };

  const tryTextSelector = async (
    toolName: string, notesPrefix: string, candidates: string[],
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

  const tryTextOrContentDescSelector = async (
    toolName: string, notesPrefix: string,
    textCandidates: string[], contentDescCandidates: string[],
    buildInput: (params: { text?: string; contentDesc?: string }) => Record<string, unknown>,
  ): Promise<ToolResultLike> => {
    // Vivo: many items have text="" but content-desc="Item Name, Status".
    // Try exact text first, then content-desc variants.
    for (const text of textCandidates) {
      const result = await invoke(toolName, buildInput({ text }));
      if (result.status === "success" || result.status === "partial") {
        return push(toolName, result, `${notesPrefix} text=${text}`);
      }
    }
    for (const contentDesc of contentDescCandidates) {
      const result = await invoke(toolName, buildInput({ contentDesc }));
      if (result.status === "success" || result.status === "partial") {
        return push(toolName, result, `${notesPrefix} content-desc=${contentDesc}`);
      }
    }
    return push(toolName, { status: "failed" }, `${notesPrefix} text=${textCandidates[textCandidates.length - 1]}`);
  };

  // ========== Session / lifecycle ==========
  push("start_session", await invoke("start_session", {
    sessionId, platform, profile: runnerProfile, deviceId, appId,
  }), "session created");

  push("launch_app", await invoke("launch_app", {
    sessionId, platform, runnerProfile, deviceId, appId,
    launchUrl: "android.settings.SETTINGS",
  }), "open Android Settings");

  // ========== UI inspect / action / orchestration ==========

  // Step 1: Wait for Wi-Fi (always visible at top of Settings home)
  await tryTextSelector(
    "wait_for_ui", "wait visible by",
    ["Wi-Fi", "WLAN", "蓝牙", "Bluetooth"],
    (text) => ({
      sessionId, platform, runnerProfile, deviceId,
      text, timeoutMs: 5000, intervalMs: 500, waitUntil: "visible",
    }),
  );

  // Step 2: press_back to ensure we are at Settings home (not in a sub-page)
  push("execute_intent", await invoke("execute_intent", {
    sessionId, platform, runnerProfile, deviceId, appId,
    intent: "navigate back to Settings home", actionType: "press_back",
  }), "press back to return to Settings home");

  await waitForStable(invoke, sessionId, platform, runnerProfile, deviceId);

  // Step 3: resolve_ui_target - Bluetooth (content-desc="Bluetooth, On" on vivo)
  await tryTextOrContentDescSelector(
    "resolve_ui_target", "resolve",
    ["Bluetooth", "蓝牙"],                          // text candidates
    ["Bluetooth, On", "Bluetooth", "蓝牙"],         // content-desc candidates (vivo adds status suffix)
    (params) => ({ sessionId, platform, runnerProfile, deviceId, ...params, limit: 1 }),
  );

  // Step 4: scroll_and_resolve_ui_target - "About phone" is at the bottom
  await tryTextSelector(
    "scroll_and_resolve_ui_target", "scroll resolve",
    ["About phone", "关于手机", "System", "系统"],
    (text) => ({
      sessionId, platform, runnerProfile, deviceId,
      text, maxSwipes: 5, swipeDirection: "down", swipeDurationMs: 400, limit: 1,
    }),
  );

  await waitForStable(invoke, sessionId, platform, runnerProfile, deviceId);

  // Step 5: tap_element - Search settings (text="Search settings" exists on Settings home)
  await tryTextOrContentDescSelector(
    "tap_element", "tap",
    ["Search settings", "搜索设置", "Search"],
    ["Search settings", "搜索设置"],
    (params) => ({ sessionId, platform, runnerProfile, deviceId, ...params, limit: 1 }),
  );

  await waitForStable(invoke, sessionId, platform, runnerProfile, deviceId);

  // Step 6: type_into_element - search box should be visible after tapping search
  push("type_into_element", await invoke("type_into_element", {
    sessionId, platform, runnerProfile, deviceId,
    className: "android.widget.EditText", value: "wifi", limit: 1,
  }), "type into edit text");

  await waitForStable(invoke, sessionId, platform, runnerProfile, deviceId);

  // Step 7: execute_intent - tap Wi-Fi (back on Settings home, press_back first)
  push("execute_intent", await invoke("execute_intent", {
    sessionId, platform, runnerProfile, deviceId, appId,
    intent: "tap wifi settings entry", actionType: "tap_element", text: "Wi-Fi",
  }), "real UI intent on Settings");

  await waitForStable(invoke, sessionId, platform, runnerProfile, deviceId);

  // Step 8: perform_action_with_evidence - tap Bluetooth (use content-desc)
  const actionResult = push("perform_action_with_evidence", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: {
      actionType: "tap_element", contentDesc: "Bluetooth, On",
      timeoutMs: 8000, intervalMs: 500, waitUntil: "visible",
    },
  }), "tap + evidence");

  await waitForStable(invoke, sessionId, platform, runnerProfile, deviceId);

  // Step 9: complete_task - multi-step task
  push("complete_task", await invoke("complete_task", {
    sessionId, platform, runnerProfile, deviceId, appId,
    goal: "wait and tap in Settings",
    steps: [
      { intent: "wait for Wi-Fi", actionType: "wait_for_ui", text: "Wi-Fi", timeoutMs: 4000 },
      { intent: "tap Bluetooth", actionType: "tap_element", contentDesc: "Bluetooth, On" },
    ],
  }), "run multi-step task");

  // ========== Recovery / diagnosis ==========
  push("recover_to_known_state", await invoke("recover_to_known_state", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), "recover current state");

  push("replay_last_stable_path", await invoke("replay_last_stable_path", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), "replay last success");

  // ========== Flow / integration ==========
  push("run_flow", await invoke("run_flow", {
    sessionId, platform, runnerProfile, deviceId, flowPath, runCount: 1,
    runnerScript: "scripts/dev/run-phase1-android.sh",
  }), "run android-settings-smoke flow");

  // ========== Failure context tools ==========
  const failingResult = push("perform_action_with_evidence(failure)", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: {
      actionType: "tap_element", text: "__NO_SUCH_ELEMENT_FOR_FAILURE__",
      timeoutMs: 2000, intervalMs: 400, waitUntil: "visible",
    },
  }), "create failure context");

  const failedActionId = pickActionId(failingResult.data);
  const successfulActionId = pickActionId(actionResult.data);

  push("explain_last_failure", await invoke("explain_last_failure", { sessionId }), "explain latest failed action");
  push("find_similar_failures", await invoke("find_similar_failures", { sessionId, actionId: failedActionId }), "lookup similar failures");
  push("rank_failure_candidates", await invoke("rank_failure_candidates", { sessionId }), "rank failure candidates");
  push("compare_against_baseline", await invoke("compare_against_baseline", { sessionId, actionId: successfulActionId }), "compare with local baseline");

  push("resume_interrupted_action", await invoke("resume_interrupted_action", {
    sessionId, platform, runnerProfile, deviceId, appId,
    checkpoint: {
      actionId: failedActionId ?? `checkpoint-${Date.now()}`,
      sessionId, platform, actionType: "wait_for_ui",
      selector: { text: "Wi-Fi" },
      params: { text: "Wi-Fi", waitUntil: "visible", timeoutMs: 1500, intervalMs: 300 },
      createdAt: new Date().toISOString(),
    },
  }), "resume synthetic checkpoint");

  // ========== JS debug tools (out-of-scope without Metro) ==========
  push("capture_js_console_logs", await invoke("capture_js_console_logs", {
    sessionId, timeoutMs: 2500, maxLogs: 20,
  }), "without Metro expected limited/empty");

  push("capture_js_network_events", await invoke("capture_js_network_events", {
    sessionId, timeoutMs: 2500, maxEvents: 20, failuresOnly: false,
  }), "without Metro expected limited/empty");

  // ========== Session cleanup ==========
  push("end_session", await invoke("end_session", { sessionId }), "close session");

  // ========== Classification & reporting ==========
  const classifiedRecords = reclassifyObservedEffects(records);
  const summary = summarize(classifiedRecords);
  const report = {
    runId, checklistSource, sessionId, deviceId, platform, runnerProfile, appId, flowPath,
    summary, records: classifiedRecords,
  };

  const artifactJsonPath = join(artifactsDir, "report.json");
  const artifactMdPath = join(artifactsDir, "summary.md");
  const latestJsonPath = join(reportsDir, "android-tool-probe.json");
  const latestMdPath = join(reportsDir, "android-tool-probe.md");

  await writeFile(artifactJsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(artifactMdPath, toMarkdown({ runId, sessionId, deviceId, platform, runnerProfile, appId, flowPath, summary, records: classifiedRecords }), "utf8");
  await writeFile(latestJsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(latestMdPath, toMarkdown({ runId, sessionId, deviceId, platform, runnerProfile, appId, flowPath, summary, records: classifiedRecords }), "utf8");

  console.log(JSON.stringify({
    runId, sessionId, summary, artifactJsonPath, artifactMdPath, latestJsonPath, latestMdPath,
  }, null, 2));
}

const entryFilePath = process.argv[1];
const isDirectExecution = Boolean(entryFilePath) && import.meta.url === new URL(`file://${entryFilePath}`).href;

if (isDirectExecution) {
  runAndroidToolProbe().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[android-tool-probe] ${message}`);
    process.exitCode = 1;
  });
}
