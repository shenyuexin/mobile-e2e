import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../packages/mcp-server/src/index.ts";

// ═══════════════════════════════════════════════════════════════════
// Android Tool Probe — Step-by-step flow with expected page state
// ═══════════════════════════════════════════════════════════════════
//
// 每个步骤前都标注了：
//   【预期页面】  — 调用该工具前屏幕应该是什么状态
//   【操作】     — 这一步要做什么
//   【期望结果】 — 成功后的页面状态
//
// 如果工具失败，先核对"预期页面"与实际屏幕是否一致。页面不一致是绝大多数失败的根因。
// ═══════════════════════════════════════════════════════════════════

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

  if (result.status === "success") return { observedEffect: "observed", observedEvidence: "tool contract passed" };
  if (tool === "launch_app" && laterUiVisibilityEvidence) return { observedEffect: "observed", observedEvidence: "later UI probe reached Settings hierarchy" };
  if (tool === "wait_for_ui" && result.status === "partial") return { observedEffect: "observed", observedEvidence: "UI polling ran but target wait did not close" };
  if (tool === "resolve_ui_target" && result.status === "partial") return { observedEffect: "observed", observedEvidence: "target resolution saw live UI but did not find selector" };
  if (["execute_intent", "perform_action_with_evidence", "complete_task", "resume_interrupted_action"].includes(tool)
    && ["OCR_NO_MATCH", "OCR_AMBIGUOUS_TARGET", "TIMEOUT", "INTERRUPTION_RESOLUTION_FAILED"].includes(result.reasonCode ?? "")) {
    return { observedEffect: "possible", observedEvidence: "action likely dispatched but post-action verification did not close the loop" };
  }
  if (["scroll_and_resolve_ui_target", "tap_element", "type_into_element"].includes(tool) && result.reasonCode === "ADAPTER_ERROR") {
    return { observedEffect: "unknown", observedEvidence: "adapter-level failure prevents proving device interaction" };
  }
  if (result.status === "partial") return { observedEffect: "possible", observedEvidence: "partial result — some runtime progress but not closed contract" };
  if (result.status === "failed") return { observedEffect: "not_observed", observedEvidence: "no reliable evidence of intended device effect" };
  return { observedEffect: "unknown", observedEvidence: "no inference rule matched" };
}

function reclassifyObservedEffects(records: ProbeRecord[]): ProbeRecord[] {
  return records.map((record, index) => {
    const priorAndLater = records.filter((_, i) => i !== index);
    const observed = inferObservedEffect(record.tool, { status: record.status, reasonCode: record.reasonCode, nextSuggestions: record.next ? [record.next] : undefined }, priorAndLater);
    return { ...record, observedEffect: observed.observedEffect, observedEvidence: observed.observedEvidence };
  });
}

function toMarkdown(params: {
  runId: string; sessionId: string; deviceId: string; platform: string;
  runnerProfile: string; appId: string; flowPath: string;
  summary: ProbeSummary; records: ProbeRecord[];
}): string {
  return [
    "# Android Tool Probe Report", "",
    `- Run: ${params.runId}`, `- Session: ${params.sessionId}`, `- Device: ${params.deviceId}`,
    `- Platform: ${params.platform}`, `- Runner Profile: ${params.runnerProfile}`,
    `- App: ${params.appId}`, `- Flow: ${params.flowPath}`, "",
    `- Total: ${params.summary.total}`, `- Success: ${params.summary.success}`,
    `- Partial: ${params.summary.partial}`, `- Failed: ${params.summary.failed}`,
    `- Observed: ${params.summary.observed}`, `- Possible: ${params.summary.possible}`,
    `- Not observed: ${params.summary.notObserved}`, `- Unknown: ${params.summary.unknown}`, "",
    "| Tool | Verdict | Observed effect | Reason | Note |",
    "|---|---|---|---|---|",
    ...params.records.map((r) => `| ${r.tool} | ${r.status} | ${r.observedEffect ?? "unknown"} | ${r.reasonCode ?? ""} | ${r.note ?? ""} |`),
    "",
  ].join("\n");
}

async function stabilize(ms = 2000) {
  await new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════
// 探针入口
// ═══════════════════════════════════════════════════════════════════
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
    records.push({ tool, status: result.status, reasonCode: result.reasonCode, note, next: result.nextSuggestions?.[0], actionId: pickActionId(result.data), observedEffect: observed.observedEffect, observedEvidence: observed.observedEvidence });
    return result;
  };

  const tryTextSelector = async (
    toolName: string, notesPrefix: string, candidates: string[],
    buildInput: (text: string) => Record<string, unknown>,
  ): Promise<ToolResultLike> => {
    let last: ToolResultLike | undefined;
    for (const text of candidates) {
      const result = await invoke(toolName, buildInput(text));
      last = result;
      if (result.status === "success" || result.status === "partial") return push(toolName, result, `${notesPrefix} text=${text}`);
    }
    return push(toolName, last ?? { status: "failed" }, `${notesPrefix} text=${candidates[candidates.length - 1]}`);
  };

  const tryTextOrContentDescSelector = async (
    toolName: string, notesPrefix: string,
    textCandidates: string[], contentDescCandidates: string[],
    buildInput: (params: { text?: string; contentDesc?: string }) => Record<string, unknown>,
  ): Promise<ToolResultLike> => {
    for (const text of textCandidates) {
      const result = await invoke(toolName, buildInput({ text }));
      if (result.status === "success" || result.status === "partial") return push(toolName, result, `${notesPrefix} text=${text}`);
    }
    for (const contentDesc of contentDescCandidates) {
      const result = await invoke(toolName, buildInput({ contentDesc }));
      if (result.status === "success" || result.status === "partial") return push(toolName, result, `${notesPrefix} content-desc=${contentDesc}`);
    }
    return push(toolName, { status: "failed" }, `${notesPrefix} text=${textCandidates[textCandidates.length - 1]}`);
  };

  // ───────────────────────────────────────────────────────────────
  // 重置到 Settings 首页：先 terminate（force-stop）再 launch。
  // LaunchAppInput 没有 force 参数，所以必须显式调用 terminate_app。
  // ───────────────────────────────────────────────────────────────
  const relaunch = async () => {
    await invoke("terminate_app", {
      sessionId, platform, runnerProfile, deviceId, appId,
    });
    await stabilize(500);
    await invoke("launch_app", {
      sessionId, platform, runnerProfile, deviceId, appId,
      launchUrl: "android.settings.SETTINGS",
    });
    await stabilize(3000);
  };

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Session / lifecycle
  // ═══════════════════════════════════════════════════════════════

  // ── Step 1 ─────────────────────────────────────────────────────
  // 【预期页面】 无（初始状态）
  // 【操作】     创建探针会话，注册平台和设备
  // 【期望结果】 会话建立，无页面变化
  // ──────────────────────────────────────────────────────────────
  push("start_session", await invoke("start_session", {
    sessionId, platform, profile: runnerProfile, deviceId, appId,
  }), "session created");

  // ── Step 2 ─────────────────────────────────────────────────────
  // 【预期页面】 无（初始状态）
  // 【操作】     通过 intent action 打开 Android Settings 应用
  // 【期望结果】 屏幕显示 Settings 首页（包含 Wi-Fi、Bluetooth 等列表项）
  // ──────────────────────────────────────────────────────────────
  push("launch_app", await invoke("launch_app", {
    sessionId, platform, runnerProfile, deviceId, appId,
    launchUrl: "android.settings.SETTINGS",
  }), "open Android Settings");

  await stabilize();

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: UI inspect / action / orchestration
  // ═══════════════════════════════════════════════════════════════

  // ── Step 3: wait_for_ui ───────────────────────────────────────
  // 【预期页面】 Settings 首页（刚 launch_app 进入）
  // 【操作】     等待 "Wi-Fi" 文本可见（Settings 首页顶部固定显示）
  // 【期望结果】 wait_for_ui 返回 success，页面不变
  // ──────────────────────────────────────────────────────────────
  await tryTextSelector(
    "wait_for_ui", "wait visible by",
    ["Wi-Fi", "WLAN", "蓝牙", "Bluetooth"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, text, timeoutMs: 8000, intervalMs: 500, waitUntil: "visible" }),
  );

  // ── relaunch：回到 Settings 首页 ──────────────────────────────
  await relaunch();

  // ── Step 4: resolve_ui_target ─────────────────────────────────
  // 【预期页面】 Settings 首页（relaunch 后）
  // 【操作】     尝试解析 "Bluetooth" 元素的位置（vivo 使用 content-desc="Bluetooth, On"）
  // 【期望结果】 返回 Bluetooth 行的边界坐标，页面不变
  // ──────────────────────────────────────────────────────────────
  const cdResult1 = await invoke("resolve_ui_target", {
    sessionId, platform, runnerProfile, deviceId, contentDesc: "Bluetooth, On", limit: 1,
  });
  if (cdResult1.status === "success") {
    push("resolve_ui_target", cdResult1, "resolve content-desc=Bluetooth, On");
  } else {
    await tryTextSelector(
      "resolve_ui_target", "resolve",
      ["Bluetooth", "蓝牙"],
      (text) => ({ sessionId, platform, runnerProfile, deviceId, text, limit: 1 }),
    );
  }

  // ── relaunch ───────────────────────────────────────────────────
  await relaunch();

  // ── Step 5: scroll_and_resolve_ui_target ──────────────────────
  // 【预期页面】 Settings 首页
  // 【操作】     向下滑动直到找到 "About phone"（在 Settings 首页底部）
  // 【期望结果】 滚动后找到目标元素，页面滚动到底部
  // ──────────────────────────────────────────────────────────────
  await tryTextSelector(
    "scroll_and_resolve_ui_target", "scroll resolve",
    ["About phone", "关于手机", "System", "系统"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, text, maxSwipes: 5, swipeDirection: "down", swipeDurationMs: 400, limit: 1 }),
  );

  // ── relaunch ───────────────────────────────────────────────────
  await relaunch();

  // ── Step 6: tap_element ───────────────────────────────────────
  // 【预期页面】 Settings 首页
  // 【操作】     点击顶部 "Search settings" 搜索栏，进入搜索界面
  // 【期望结果】 页面跳转到 Settings 搜索页（出现搜索输入框和键盘）
  // ──────────────────────────────────────────────────────────────
  const tapCdResult = await invoke("tap_element", {
    sessionId, platform, runnerProfile, deviceId, contentDesc: "Search settings", limit: 1,
  });
  if (tapCdResult.status === "success") {
    push("tap_element", tapCdResult, "tap content-desc=Search settings");
  } else {
    await tryTextOrContentDescSelector(
      "tap_element", "tap",
      ["Search settings", "搜索设置", "Search"],
      ["Search settings", "搜索设置"],
      (params) => ({ sessionId, platform, runnerProfile, deviceId, ...params, limit: 1 }),
    );
  }

  // ── relaunch ───────────────────────────────────────────────────
  // 注意：上一步 tap_element 可能把页面带到了搜索页，必须 relaunch 回到首页
  await relaunch();

  // ── Step 7: type_into_element ─────────────────────────────────
  // 【预期页面】 Settings 首页（relaunch 后）
  // 【操作】     在页面上查找 EditText 元素并输入 "wifi"
  //              注意：Settings 首页本身就有搜索栏 EditText，
  //              输入后页面会跳转到搜索结果页（出现多个含 "Wi-Fi" 的条目）
  // 【期望结果】 文本输入成功，页面跳转到搜索结果页
  // ──────────────────────────────────────────────────────────────
  push("type_into_element", await invoke("type_into_element", {
    sessionId, platform, runnerProfile, deviceId,
    className: "android.widget.EditText", value: "wifi", limit: 1,
  }), "type into edit text");

  // ── relaunch ───────────────────────────────────────────────────
  // type_into_element 把页面带到了搜索结果页，必须 relaunch 回到首页
  await relaunch();

  // ── Step 8: execute_intent ────────────────────────────────────
  // 【预期页面】 Settings 首页（relaunch 后）
  // 【操作】     使用 execute_intent 点击 "Wi-Fi" 设置项
  //              deterministic 路径（accessibility tree）会先尝试定位 Wi-Fi 元素
  //              如果失败则 fallback 到 OCR 截屏识别
  //              如果 OCR 识别到多个 "Wi-Fi" 文本则报 OCR_AMBIGUOUS_TARGET
  // 【期望结果】 点击 Wi-Fi 行，页面跳转到 Wi-Fi 子设置页
  // 【潜在问题】 如果 relaunch 未正确清空活动栈，页面可能仍处于搜索结果页，
  //              此时屏幕上会出现多个 "Wi-Fi" 文本（搜索结果标题、面包屑导航等），
  //              导致 OCR_AMBIGUOUS_TARGET
  // ──────────────────────────────────────────────────────────────
  push("execute_intent", await invoke("execute_intent", {
    sessionId, platform, runnerProfile, deviceId, appId,
    intent: "tap wifi settings entry", actionType: "tap_element", text: "Wi-Fi",
  }), "real UI intent on Settings");

  // ── relaunch ───────────────────────────────────────────────────
  await relaunch();

  // ── Step 9: perform_action_with_evidence ──────────────────────
  // 【预期页面】 Settings 首页（relaunch 后）
  // 【操作】     点击 "Bluetooth, On" 元素，并收集操作后的证据
  //              同样走 deterministic → OCR fallback 路径
  // 【期望结果】 成功点击 Bluetooth 行，页面跳转到蓝牙设置页
  // 【潜在问题】 如果当前页面不在首页，content-desc="Bluetooth, On" 可能不存在
  // ──────────────────────────────────────────────────────────────
  const actionResult = push("perform_action_with_evidence", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: { actionType: "tap_element", contentDesc: "Bluetooth, On", timeoutMs: 8000, intervalMs: 500, waitUntil: "visible" },
  }), "tap + evidence");

  // ── relaunch ───────────────────────────────────────────────────
  await relaunch();

  // ── Step 10: complete_task ────────────────────────────────────
  // 【预期页面】 Settings 首页（relaunch 后）
  // 【操作】     多步骤任务：先 wait_for_ui 等待 Wi-Fi 可见，再 tap_element 点击 Bluetooth
  //              每一步都走 deterministic → OCR fallback
  // 【期望结果】 两步都成功，页面最终停留在蓝牙设置页
  // ──────────────────────────────────────────────────────────────
  push("complete_task", await invoke("complete_task", {
    sessionId, platform, runnerProfile, deviceId, appId,
    goal: "wait and tap in Settings",
    steps: [
      { intent: "wait for Wi-Fi", actionType: "wait_for_ui", text: "Wi-Fi", timeoutMs: 4000 },
      { intent: "tap Bluetooth", actionType: "tap_element", contentDesc: "Bluetooth, On" },
    ],
  }), "run multi-step task");

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Recovery / diagnosis
  // ═══════════════════════════════════════════════════════════════

  // ── Step 11: recover_to_known_state ───────────────────────────
  // 【预期页面】 未知（上一步 complete_task 后可能在蓝牙设置页）
  // 【操作】     恢复到已知状态（通常是关闭所有弹出层、回到应用首页）
  // 【期望结果】 页面恢复到 Settings 首页或稳定状态
  // ──────────────────────────────────────────────────────────────
  push("recover_to_known_state", await invoke("recover_to_known_state", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), "recover current state");

  // ── Step 12: replay_last_stable_path ──────────────────────────
  // 【预期页面】 稳定状态（recover_to_known_state 后）
  // 【操作】     重放最近一次成功的操作路径
  // 【期望结果】 如果存在可重放的 checkpoint，则重放成功
  // 【潜在问题】 如果之前没有记录任何成功的 checkpoint，或 checkpoint 对应的页面已漂移，
  //              则重放失败
  // ──────────────────────────────────────────────────────────────
  push("replay_last_stable_path", await invoke("replay_last_stable_path", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), "replay last success");

  // ═══════════════════════════════════════════════════════════════
  // Phase 4: Flow / integration
  // ═══════════════════════════════════════════════════════════════

  // ── Step 13: run_flow ─────────────────────────────────────────
  // 【预期页面】 稳定状态（replay 后）
  // 【操作】     运行 android-settings-smoke flow（仅 launchApp 一步）
  //              使用 owned-adb 后端（Maestro 在 vivo 系统应用上不工作）
  // 【期望结果】 flow 执行成功，Settings 应用被正确启动
  // ──────────────────────────────────────────────────────────────
  push("run_flow", await invoke("run_flow", {
    sessionId, platform, runnerProfile, deviceId, flowPath, runCount: 1,
    runnerScript: "scripts/dev/run-phase1-android.sh",
    env: { ANDROID_REPLAY_BACKEND: "owned-adb" },
  }), "run android-settings-smoke flow");

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Failure context tools
  // ═══════════════════════════════════════════════════════════════

  // ── Step 14: perform_action_with_evidence (failure probe) ─────
  // 【预期页面】 flow 执行后的状态
  // 【操作】     故意使用不存在的元素名触发失败路径，验证错误处理
  // 【期望结果】 正确返回 OCR_NO_MATCH（元素确实不存在）
  // ──────────────────────────────────────────────────────────────
  const failingResult = push("perform_action_with_evidence(failure)", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: { actionType: "tap_element", text: "__NO_SUCH_ELEMENT_FOR_FAILURE__", timeoutMs: 2000, intervalMs: 400, waitUntil: "visible" },
  }), "create failure context");

  const failedActionId = pickActionId(failingResult.data);
  const successfulActionId = pickActionId(actionResult.data);

  // ── Step 15: explain_last_failure ─────────────────────────────
  // 【预期页面】 不变
  // 【操作】     解释最近一次失败的原因
  // 【期望结果】 返回失败分析
  // ──────────────────────────────────────────────────────────────
  push("explain_last_failure", await invoke("explain_last_failure", { sessionId }), "explain latest failed action");

  // ── Step 16: find_similar_failures ────────────────────────────
  // 【预期页面】 不变
  // 【操作】     查找类似的历史失败
  // 【期望结果】 返回相似失败列表（可能为空）
  // ──────────────────────────────────────────────────────────────
  push("find_similar_failures", await invoke("find_similar_failures", { sessionId, actionId: failedActionId }), "lookup similar failures");

  // ── Step 17: rank_failure_candidates ──────────────────────────
  // 【预期页面】 不变
  // 【操作】     对失败候选进行排序
  // 【期望结果】 返回排序后的候选列表
  // ──────────────────────────────────────────────────────────────
  push("rank_failure_candidates", await invoke("rank_failure_candidates", { sessionId }), "rank failure candidates");

  // ── Step 18: compare_against_baseline ─────────────────────────
  // 【预期页面】 不变
  // 【操作】     与本地基线对比
  // 【期望结果】 返回对比结果
  // ──────────────────────────────────────────────────────────────
  push("compare_against_baseline", await invoke("compare_against_baseline", { sessionId, actionId: successfulActionId }), "compare with local baseline");

  // ── Step 19: resume_interrupted_action ────────────────────────
  // 【预期页面】 不变
  // 【操作】     从合成 checkpoint 恢复中断的操作
  // 【期望结果】 恢复到稳定状态
  // ──────────────────────────────────────────────────────────────
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

  // ═══════════════════════════════════════════════════════════════
  // Phase 6: JS debug tools (out-of-scope without Metro)
  // ═══════════════════════════════════════════════════════════════
  // 预期失败：没有 Metro/JS debug target 时，这些工具返回 CONFIGURATION_ERROR

  // ── Step 20: capture_js_console_logs ──────────────────────────
  // 【预期页面】 不变
  // 【操作】     捕获 JS 控制台日志
  // 【期望结果】 CONFIGURATION_ERROR（无 Metro target）
  // ──────────────────────────────────────────────────────────────
  push("capture_js_console_logs", await invoke("capture_js_console_logs", {
    sessionId, timeoutMs: 2500, maxLogs: 20,
  }), "without Metro expected limited/empty");

  // ── Step 21: capture_js_network_events ────────────────────────
  // 【预期页面】 不变
  // 【操作】     捕获 JS 网络事件
  // 【期望结果】 CONFIGURATION_ERROR（无 Metro target）
  // ──────────────────────────────────────────────────────────────
  push("capture_js_network_events", await invoke("capture_js_network_events", {
    sessionId, timeoutMs: 2500, maxEvents: 20, failuresOnly: false,
  }), "without Metro expected limited/empty");

  // ═══════════════════════════════════════════════════════════════
  // Phase 7: Session cleanup
  // ═══════════════════════════════════════════════════════════════

  // ── Step 22: end_session ──────────────────────────────────────
  // 【预期页面】 不变
  // 【操作】     关闭探针会话，清理资源
  // 【期望结果】 会话关闭
  // ──────────────────────────────────────────────────────────────
  push("end_session", await invoke("end_session", { sessionId }), "close session");

  // ═══════════════════════════════════════════════════════════════
  // 报告生成
  // ═══════════════════════════════════════════════════════════════
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
