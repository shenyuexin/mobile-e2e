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

  let stepNum = 0;
  const log = (msg: string) => console.log(`[probe] ${msg}`);
  const logStep = (label: string) => { stepNum++; log(`\n═══ Step ${stepNum}: ${label} ═══`); };

  const invoke = async (toolName: string, input: Record<string, unknown>): Promise<ToolResultLike> => {
    log(`  → calling ${toolName}`);
    const raw = await server.invoke(toolName as never, input as never);
    return raw as ToolResultLike;
  };

  const push = (tool: string, result: ToolResultLike, note?: string): ToolResultLike => {
    log(`    ← ${tool}: ${result.status}${result.reasonCode ? ` (${result.reasonCode})` : ""}`);
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
      await stabilize(500); // 每次尝试后等待动画稳定
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
      await stabilize(500); // 每次尝试后等待动画稳定
      if (result.status === "success" || result.status === "partial") return push(toolName, result, `${notesPrefix} text=${text}`);
    }
    for (const contentDesc of contentDescCandidates) {
      const result = await invoke(toolName, buildInput({ contentDesc }));
      await stabilize(500); // 每次尝试后等待动画稳定
      if (result.status === "success" || result.status === "partial") return push(toolName, result, `${notesPrefix} content-desc=${contentDesc}`);
    }
    return push(toolName, { status: "failed" }, `${notesPrefix} text=${textCandidates[textCandidates.length - 1]}`);
  };

  // ───────────────────────────────────────────────────────────────
  // 回到 Settings 首页的三种方式，按场景选用：
  // 1. scroll_to_top()  — 滚动后回到顶部（不离开 Settings 首页）
  // 2. tap_cancel()     — 搜索页点 Cancel 按钮退出搜索
  // 3. goback()         — press_back 回退（通用兜底）
  // ───────────────────────────────────────────────────────────────
  const scroll_to_top = async () => {
    log("→ calling scroll_to_top");
    const result = await invoke("scroll_and_resolve_ui_target", {
      sessionId, platform, runnerProfile, deviceId,
      text: "Airplane mode", maxSwipes: 3, swipeDirection: "down", swipeDurationMs: 500, limit: 1,
    });
    // 滚动动画需要更长时间稳定，等待所有惯性滚动停止
    await stabilize(4000);
    // 验证：等待 Wi-Fi 再次可见（确认回到顶部）
    await invoke("wait_for_ui", {
      sessionId, platform, runnerProfile, deviceId,
      text: "Wi-Fi", timeoutMs: 5000, intervalMs: 1000, waitUntil: "visible",
    });
    return result;
  };

  const tap_cancel = async () => {
    log("→ calling tap_cancel");
    const result = await invoke("tap_element", {
      sessionId, platform, runnerProfile, deviceId,
      text: "Cancel", limit: 1,
    });
    // Cancel 点击后页面转场动画需要等待
    await stabilize(3000);
    return result;
  };

  const goback = async () => {
    log("→ calling goback");
    const result = await invoke("navigate_back", {
      sessionId, platform, runnerProfile, deviceId,
      target: "system",
    });
    // 返回动画需要等待
    await stabilize(3000);
    return result;
  };

    // ───────────────────────────────────────────────────────────────
  // 重置到 Settings 首页：先 terminate（force-stop）再 launch。
  // LaunchAppInput 没有 force 参数，所以必须显式调用 terminate_app。
  // 重置到 Settings 首页：优先用 press_back 回退，回退不了再 terminate+launch。
  // press_back 比 terminate+launch 快得多，且不会清空已建立的 session 状态。
  // ───────────────────────────────────────────────────────────────
  // NOTE: relaunch is no longer used; kept for reference.
  const _relaunch_unused = async () => {
    log("→ calling relaunch app");
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
  logStep("start_session — 创建探针会话");
  push("start_session", await invoke("start_session", {
    sessionId, platform, profile: runnerProfile, deviceId, appId,
  }), "session created");

  // ── Step 2 ─────────────────────────────────────────────────────
  logStep("launch_app — 打开 Settings 首页");
  // 先检测 Settings app 是否已在运行（通过 dumpsys activity 检查）
  let isAppRunning = false;
  try {
    // 方法 1：尝试获取 session 状态
    try {
      const sessionState = await invoke("get_session_state", { sessionId }) as { currentScreen?: { topActivity?: string } };
      if (sessionState?.currentScreen?.topActivity?.includes("settings")) {
        isAppRunning = true;
        log(`    检测到 Settings 已在运行 (session topActivity: ${sessionState.currentScreen.topActivity})`);
      }
    } catch {
      // session 未创建或其他错误，继续用方法 2
    }

    // 方法 2：如果 session 检测不确定，直接用 adb 检查
    if (!isAppRunning) {
      const { execFile } = await import("child_process");
      const dumpsysResult = await new Promise<string>((resolve) => {
        execFile("adb", ["-s", deviceId, "shell", "dumpsys", "activity", "top"], { timeout: 5000 }, (err, stdout) => {
          resolve(err ? "" : stdout);
        });
      });
      isAppRunning = dumpsysResult.includes("com.android.settings");
      if (isAppRunning) {
        log("    检测到 Settings 已在运行 (adb dumpsys)");
      }
    }
  } catch (err) {
    log(`    无法检测 app 状态，将执行 cold start: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (isAppRunning) {
    // App 已在运行：terminate + relaunch 确保干净的首页状态
    log("    Settings 已在运行，执行 relaunch (force-stop + launch)...");
    await invoke("terminate_app", {
      sessionId, platform, runnerProfile, deviceId, appId,
    });
    await stabilize(500);
  }

  push("launch_app", await invoke("launch_app", {
    sessionId, platform, runnerProfile, deviceId, appId,
    launchUrl: "android.settings.SETTINGS",
  }), isAppRunning ? "relaunch Android Settings (was running)" : "launch Android Settings (cold start)");

  await stabilize();

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: UI inspect / action / orchestration
  // ═══════════════════════════════════════════════════════════════

  // ── Step 3: wait_for_ui ───────────────────────────────────────
  logStep("wait_for_ui — 等待 Wi-Fi 可见");
  await tryTextSelector(
    "wait_for_ui", "wait visible by",
    ["Wi-Fi", "WLAN", "蓝牙", "Bluetooth"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, text, timeoutMs: 8000, intervalMs: 500, waitUntil: "visible" }),
  );

  // ── relaunch：回到 Settings 首页 ──────────────────────────────
  // await relaunch();

  // ── Step 4: resolve_ui_target ─────────────────────────────────
  logStep("resolve_ui_target — 解析 Bluetooth 位置");
  const cdResult1 = await invoke("resolve_ui_target", {
    sessionId, platform, runnerProfile, deviceId, contentDesc: "Bluetooth, On", limit: 1,
  });
  await stabilize(500); // 等待 UI 查询稳定
  if (cdResult1.status === "success") {
    push("resolve_ui_target", cdResult1, "resolve content-desc=Bluetooth, On");
  } else {
    await tryTextSelector(
      "resolve_ui_target", "resolve",
      ["Bluetooth", "蓝牙"],
      (text) => ({ sessionId, platform, runnerProfile, deviceId, text, limit: 1 }),
    );
  }

  // ── goback ───────────────────────────────────────────────────
  // await goback();

  // ── Step 5: scroll_only + wait_for_ui + resolve_ui_target ────
  logStep("scroll_only — 滑动 3 次");
  push("scroll_only", await invoke("scroll_only", {
    sessionId, platform, runnerProfile, deviceId,
    count: 3, gesture: { direction: "up" }, swipeDurationMs: 500, settleDelayMs: 2000,
  }), "scroll 3 times");

  // 额外等待确保 View 层级完全更新

  // 验证：先 wait_for_ui 确认 About phone 可见，再 resolve
  logStep("wait_for_ui — 等待 About phone 可见");
  const aboutWaitResult = await invoke("wait_for_ui", {
    sessionId, platform, runnerProfile, deviceId,
    text: "About phone", timeoutMs: 3000, intervalMs: 500, waitUntil: "visible",
  });
  log(`    ← wait_for_ui About phone: ${aboutWaitResult.status}`);

  logStep("resolve_ui_target — 解析 About phone");
  await tryTextSelector(
    "resolve_ui_target", "resolve",
    ["About phone", "关于手机", "System", "系统"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, text, limit: 1 }),
  );

  // ── scroll_to_top ────────────────────────────────────────────
  // 滑动后回到顶部，不离开 Settings 首页
  await scroll_to_top();

  // ── Step 6: tap_element ───────────────────────────────────────
  logStep("tap_element — 点击 Search settings");
  const tapCdResult = await invoke("tap_element", {
    sessionId, platform, runnerProfile, deviceId, contentDesc: "Search settings", limit: 1,
  });
  await stabilize(1000); // 点击后等待页面转场动画
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

  // ── tap_cancel ───────────────────────────────────────────────
  // 搜索页点击 Cancel 按钮退出搜索，回到 Settings 首页
  await tap_cancel();

  // 验证：确保回到 Settings 首页
  await invoke("wait_for_ui", {
    sessionId, platform, runnerProfile, deviceId,
    text: "Wi-Fi", timeoutMs: 5000, intervalMs: 1500, waitUntil: "visible",
  });

  // ── Step 7: type_into_element ─────────────────────────────────
  logStep("type_into_element — 输入 wifi");
  push("type_into_element", await invoke("type_into_element", {
    sessionId, platform, runnerProfile, deviceId,
    className: "android.widget.EditText", value: "wifi", limit: 1,
  }), "type into edit text");
  // 输入后等待键盘弹出和搜索结果渲染

  // ── tap_cancel ───────────────────────────────────────────────
  // 搜索结果页点击 Cancel 按钮退出搜索，回到 Settings 首页
  await tap_cancel();

  // 验证：确保回到 Settings 首页（Wi-Fi 可见）
  await invoke("wait_for_ui", {
    sessionId, platform, runnerProfile, deviceId,
    text: "Wi-Fi", timeoutMs: 5000, intervalMs: 1500, waitUntil: "visible",
  });

  // ── Step 8: execute_intent ────────────────────────────────────
  logStep("execute_intent — 点击 Wi-Fi");
  push("execute_intent", await invoke("execute_intent", {
    sessionId, platform, runnerProfile, deviceId, appId,
    intent: "tap wifi settings entry", actionType: "tap_element", text: "Wi-Fi",
  }), "real UI intent on Settings");

  // ── goback ───────────────────────────────────────────────────
  await goback();

  // ── Step 9: perform_action_with_evidence ──────────────────────
  logStep("perform_action_with_evidence — 点击 Bluetooth");
  const actionResult = push("perform_action_with_evidence", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: { actionType: "tap_element", contentDesc: "Bluetooth, On", timeoutMs: 8000, intervalMs: 500, waitUntil: "visible" },
  }), "tap + evidence");

  // ── goback ───────────────────────────────────────────────────
  await goback();

  // ── Step 10: complete_task ────────────────────────────────────
  logStep("complete_task — 多步任务");
  push("complete_task", await invoke("complete_task", {
    sessionId, platform, runnerProfile, deviceId, appId,
    goal: "wait and tap in Settings",
    steps: [
      { intent: "wait for Wi-Fi", actionType: "wait_for_ui", text: "Wi-Fi", timeoutMs: 4000 },
      { intent: "tap Bluetooth", actionType: "tap_element", contentDesc: "Bluetooth, On" },
    ],
  }), "run multi-step task");

  // ── goback ───────────────────────────────────────────────────
  // complete_task 点击 Bluetooth 后会停留在 Bluetooth 子页面，必须先回退
  // 否则 recover_to_known_state 会在错误的页面上下文中执行
  await goback();

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Recovery / diagnosis
  // ═══════════════════════════════════════════════════════════════

  // ── Step 11: recover_to_known_state ───────────────────────────
  logStep("recover_to_known_state — 恢复已知状态");
  push("recover_to_known_state", await invoke("recover_to_known_state", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), "recover current state");


  // ── Step 12: replay_last_stable_path ──────────────────────────
  logStep("replay_last_stable_path — 重放成功路径");
  push("replay_last_stable_path", await invoke("replay_last_stable_path", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), "replay last success");

  // ═══════════════════════════════════════════════════════════════
  // Phase 4: Flow / integration
  // ═══════════════════════════════════════════════════════════════

  // ── Step 13: run_flow ─────────────────────────────────────────
  logStep("run_flow — 运行 flow");
  push("run_flow", await invoke("run_flow", {
    sessionId, platform, runnerProfile, deviceId, flowPath, runCount: 1,
    runnerScript: "scripts/dev/run-phase1-android.sh",
    env: { ANDROID_REPLAY_BACKEND: "owned-adb" },
  }), "run android-settings-smoke flow");

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Failure context tools
  // ═══════════════════════════════════════════════════════════════

  // ── Step 14: perform_action_with_evidence (failure probe) ─────
  logStep("perform_action_with_evidence(failure) — 故意失败");
  const failingResult = push("perform_action_with_evidence(failure)", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: { actionType: "tap_element", text: "__NO_SUCH_ELEMENT_FOR_FAILURE__", timeoutMs: 2000, intervalMs: 400, waitUntil: "visible" },
  }), "create failure context");

  const failedActionId = pickActionId(failingResult.data);
  const successfulActionId = pickActionId(actionResult.data);

  // ── Step 15: explain_last_failure ─────────────────────────────
  logStep("explain_last_failure — 解释失败原因");
  push("explain_last_failure", await invoke("explain_last_failure", { sessionId }), "explain latest failed action");

  // ── Step 16: find_similar_failures ────────────────────────────
  logStep("find_similar_failures — 查找相似失败");
  push("find_similar_failures", await invoke("find_similar_failures", { sessionId, actionId: failedActionId }), "lookup similar failures");

  // ── Step 17: rank_failure_candidates ──────────────────────────
  logStep("rank_failure_candidates — 排序失败候选");
  push("rank_failure_candidates", await invoke("rank_failure_candidates", { sessionId }), "rank failure candidates");

  // ── Step 18: compare_against_baseline ─────────────────────────
  logStep("compare_against_baseline — 对比基线");
  push("compare_against_baseline", await invoke("compare_against_baseline", { sessionId, actionId: successfulActionId }), "compare with local baseline");

  // ── Step 19: resume_interrupted_action ────────────────────────
  logStep("resume_interrupted_action — 恢复中断操作");
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
  logStep("capture_js_console_logs — 捕获JS日志（预期失败）");
  push("capture_js_console_logs", await invoke("capture_js_console_logs", {
    sessionId, timeoutMs: 2500, maxLogs: 20,
  }), "without Metro expected limited/empty");

  // ── Step 21: capture_js_network_events ────────────────────────
  logStep("capture_js_network_events — 捕获JS网络事件（预期失败）");
  push("capture_js_network_events", await invoke("capture_js_network_events", {
    sessionId, timeoutMs: 2500, maxEvents: 20, failuresOnly: false,
  }), "without Metro expected limited/empty");

  // ── Step 22: end_session ──────────────────────────────────────
  logStep("end_session — 关闭会话");
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

  log(`\n═══ 探针完成 ═══`);
  log(`总计: ${summary.total} | 成功: ${summary.success} | 部分: ${summary.partial} | 失败: ${summary.failed}`);
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
