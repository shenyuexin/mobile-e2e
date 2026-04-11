import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../packages/mcp-server/src/index.ts";

// ═══════════════════════════════════════════════════════════════════
// iOS Tool Probe — Step-by-step flow with expected page state
// ═══════════════════════════════════════════════════════════════════
//
// 每个步骤前都标注了：
//   【预期页面】  — 调用该工具前屏幕应该是什么状态
//   【操作】     — 这一步要做什么
//   【期望结果】 — 成功后的页面状态
//
// 如果工具失败，先核对"预期页面"与实际屏幕是否一致。页面不一致是绝大多数失败的根因。
//
// Target: iOS physical device (WDA backend)
// NOT for simulators — use ios-simulator-tool-probe.ts for those.
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
    "# iOS Tool Probe Report", "",
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
  // 3. goback()         — app-level back（iOS 不支持 system back）
  //
  // 滚动方向说明:
  //   - direction "up"   = 手指从下往上滑 = 内容向上 = 看到更下面的内容
  //   - direction "down" = 手指从上往下滑 = 内容向下 = 回到顶部
  // ───────────────────────────────────────────────────────────────
  const scroll_to_top = async () => {
    log("→ calling scroll_to_top");
    const result = await invoke("scroll_only", {
      sessionId, platform, runnerProfile, deviceId,
      count: 3, gesture: { direction: "down" }, swipeDurationMs: 400, settleDelayMs: 1000,
    });
    // 滚动动画需要更长时间稳定，等待所有惯性滚动停止
    await stabilize(3000);
    // 验证：等待 General 再次可见（确认回到顶部）
    await invoke("wait_for_ui", {
      sessionId, platform, runnerProfile, deviceId, appId,
      text: "General", timeoutMs: 5000, intervalMs: 1000, waitUntil: "visible",
    });
    return result;
  };

  const tap_cancel = async () => {
    log("→ calling tap_cancel");
    const result = await invoke("tap_element", {
      sessionId, platform, runnerProfile, deviceId, appId,
      text: "Cancel", limit: 1,
    });
    // Cancel 点击后页面转场动画需要等待
    await stabilize(3000);
    return result;
  };

  const goback = async () => {
    log("→ calling goback");
    // iOS Settings: the back button is labeled "Settings" (or "设置" on Chinese) and appears at top-left of sub-pages.
    // Check if we're on a sub-page by looking for the back button.
    // On the main page, there's no back button — only a "Settings" heading.
    const checkResult = await invoke("resolve_ui_target", {
      sessionId, platform, runnerProfile, deviceId, appId,
      text: "Settings", limit: 1,
    });
    if (checkResult.status === "success") {
      log("    on sub-page, tapping Settings back button");
      const result = await invoke("tap_element", {
        sessionId, platform, runnerProfile, deviceId, appId,
        text: "Settings", limit: 1,
      });
      await stabilize(2000);
      // Verify we actually returned to main page
      const verifyResult = await invoke("wait_for_ui", {
        sessionId, platform, runnerProfile, deviceId, appId,
        text: "General", timeoutMs: 5000, intervalMs: 500, waitUntil: "visible",
      });
      if (verifyResult.status !== "success") {
        log("    WARNING: goback did not return to main page, forcing relaunch");
        await relaunch();
      }
      return result;
    }
    // Try Chinese "设置" back button
    const checkZhResult = await invoke("resolve_ui_target", {
      sessionId, platform, runnerProfile, deviceId, appId,
      text: "设置", limit: 1,
    });
    if (checkZhResult.status === "success") {
      log("    on sub-page (Chinese), tapping 设置 back button");
      const result = await invoke("tap_element", {
        sessionId, platform, runnerProfile, deviceId, appId,
        text: "设置", limit: 1,
      });
      await stabilize(2000);
      const verifyResult = await invoke("wait_for_ui", {
        sessionId, platform, runnerProfile, deviceId, appId,
        text: "General", timeoutMs: 5000, intervalMs: 500, waitUntil: "visible",
      });
      if (verifyResult.status !== "success") {
        log("    WARNING: goback did not return to main page, forcing relaunch");
        await relaunch();
      }
      return result;
    }
    log("    already on main page (no Settings/设置 back button found), skipping goback");
    return { status: "success" as ResultStatus };
  };

  // ───────────────────────────────────────────────────────────────
  // 重置到 Settings 首页：terminate+launch 确保干净的首页状态。
  // ───────────────────────────────────────────────────────────────
  const relaunch = async () => {
    log("→ calling relaunch app");
    await invoke("terminate_app", {
      sessionId, platform, runnerProfile, deviceId, appId,
    });
    await stabilize(500);
    await invoke("launch_app", {
      sessionId, platform, runnerProfile, deviceId, appId,
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
  // 先检测 Settings app 是否已在运行
  let isAppRunning = false;
  try {
    try {
      const sessionState = await invoke("get_session_state", { sessionId }) as { currentScreen?: { topActivity?: string } };
      if (sessionState?.currentScreen?.topActivity?.includes("Preferences")) {
        isAppRunning = true;
        log(`    检测到 Settings 已在运行 (session topActivity: ${sessionState.currentScreen.topActivity})`);
      }
    } catch {
      // session 未创建或其他错误，继续 cold start
    }
  } catch (err) {
    log(`    无法检测 app 状态，将执行 cold start: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (isAppRunning) {
    log("    Settings 已在运行，执行 relaunch (force-stop + launch)...");
    await invoke("terminate_app", {
      sessionId, platform, runnerProfile, deviceId, appId,
    });
    await stabilize(500);
  }

  push("launch_app", await invoke("launch_app", {
    sessionId, platform, runnerProfile, deviceId, appId,
  }), isAppRunning ? "relaunch iOS Settings (was running)" : "launch iOS Settings (cold start)");

  await stabilize();

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: UI inspect / action / orchestration
  // ═══════════════════════════════════════════════════════════════

  // ── Step 3: wait_for_ui ───────────────────────────────────────
  logStep("wait_for_ui — 等待 General 可见");
  // Support both English and Chinese iOS system language
  await tryTextSelector(
    "wait_for_ui", "wait visible by",
    ["General", "通用", "Accessibility", "辅助功能"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, timeoutMs: 8000, intervalMs: 500, waitUntil: "visible" }),
  );

  // ── Step 4: resolve_ui_target ─────────────────────────────────
  logStep("resolve_ui_target — 解析 General 位置");
  await tryTextSelector(
    "resolve_ui_target", "resolve",
    ["General", "通用", "Accessibility", "辅助功能"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, limit: 1 }),
  );

  // ── Step 5: scroll_only + wait_for_ui + resolve_ui_target ────
  logStep("scroll_only — 滑动 3 次（向下滚找 Developer）");
  push("scroll_only", await invoke("scroll_only", {
    sessionId, platform, runnerProfile, deviceId,
    count: 3, gesture: { direction: "up" }, swipeDurationMs: 500, settleDelayMs: 2000,
  }), "scroll 3 times (direction=up to see items below)");

  // 额外等待确保 View 层级完全更新
  await stabilize(2000);

  // 验证：先 wait_for_ui 确认 Developer 可见，再 resolve
  logStep("wait_for_ui — 等待 Developer 可见");
  const devWaitResult = await invoke("wait_for_ui", {
    sessionId, platform, runnerProfile, deviceId, appId,
    text: "Developer", timeoutMs: 3000, intervalMs: 500, waitUntil: "visible",
  });
  log(`    ← wait_for_ui Developer: ${devWaitResult.status}`);

  logStep("resolve_ui_target — 解析 Developer");
  await tryTextSelector(
    "resolve_ui_target", "resolve",
    ["Developer", "开发者", "Privacy & Security", "隐私与安全性"],
    (text) => ({ sessionId, platform, runnerProfile, deviceId, appId, text, limit: 1 }),
  );

  // ── scroll_to_top ────────────────────────────────────────────
  // 滑动后回到顶部，不离开 Settings 首页
  await scroll_to_top();

  // ── Step 6: tap_element — 点击 General ═══
  logStep("tap_element — 点击 General");
  push("tap_element", await invoke("tap_element", {
    sessionId, platform, runnerProfile, deviceId, appId,
    text: "General", limit: 1,
  }), "tap General (after scroll_to_top)");
  // Page transition animation takes ~1s; wait before goback checks for Settings button
  await stabilize(2000);

  // ── goback ───────────────────────────────────────────────────
  // General 子页面需要返回
  await goback();

  // 验证：确保回到 Settings 首页
  await invoke("wait_for_ui", {
    sessionId, platform, runnerProfile, deviceId, appId,
    text: "General", timeoutMs: 5000, intervalMs: 1500, waitUntil: "visible",
  });

  // ── Step 7: type_into_element ─────────────────────────────────
  logStep("type_into_element — 输入 bluetooth");
  // NOTE: iOS Settings search field is an unlabeled TextField at the top (always visible).
  // Use className to target it directly.
  push("type_into_element", await invoke("type_into_element", {
    sessionId, platform, runnerProfile, deviceId, appId,
    className: "TextField", value: "bluetooth", limit: 1,
  }), "type into TextField (search field)");
  // 输入后等待键盘弹出和搜索结果渲染
  await stabilize(2000);

  // 清除搜索：重新打开 Settings 回到干净状态
  log("→ relaunch Settings after search");
  await relaunch();

  // ── Step 8: execute_intent ────────────────────────────────────
  logStep("execute_intent — 点击 General");
  push("execute_intent", await invoke("execute_intent", {
    sessionId, platform, runnerProfile, deviceId, appId,
    intent: "tap general settings entry", actionType: "tap_element", text: "General",
  }), "real UI intent on iOS Settings");

  // ── goback ───────────────────────────────────────────────────
  await goback();

  // ── Step 9: perform_action_with_evidence ──────────────────────
  logStep("perform_action_with_evidence — 点击 General");
  const actionResult = push("perform_action_with_evidence", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: { actionType: "tap_element", text: "General", timeoutMs: 8000, intervalMs: 500, waitUntil: "visible" },
  }), "tap General + evidence");

  // ── goback ───────────────────────────────────────────────────
  await goback();

  // ── Step 10: complete_task — 多步任务
  logStep("complete_task — 多步任务");
  push("complete_task", await invoke("complete_task", {
    sessionId, platform, runnerProfile, deviceId, appId,
    goal: "wait and tap in iOS Settings",
    steps: [
      { intent: "wait for General", actionType: "wait_for_ui", text: "General", timeoutMs: 4000 },
      { intent: "tap Accessibility", actionType: "tap_element", text: "Accessibility", contentDesc: "Accessibility" },
    ],
  }), "run multi-step task");

  // ── goback ───────────────────────────────────────────────────
  // complete_task 点击 Accessibility 后会停留在子页面，必须先回退
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
  }), "run ios-settings-smoke flow");

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Failure context tools
  // ═══════════════════════════════════════════════════════════════

  // ── Step 14: perform_action_with_evidence (failure probe) ─────
  logStep("perform_action_with_evidence(failure) — 故意失败");
  const failingResult = push("perform_action_with_evidence(failure)", await invoke("perform_action_with_evidence", {
    sessionId, platform, runnerProfile, deviceId, appId, includeDebugSignals: true,
    action: { actionType: "tap_element", text: "__NO_SUCH_IOS_ELEMENT__", timeoutMs: 2000, intervalMs: 400, waitUntil: "visible" },
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
  // replay_last_stable_path may have navigated to a sub-page; return to main Settings first
  await goback();
  push("resume_interrupted_action", await invoke("resume_interrupted_action", {
    sessionId, platform, runnerProfile, deviceId, appId,
    checkpoint: {
      actionId: failedActionId ?? `checkpoint-${Date.now()}`,
      sessionId, platform, actionType: "wait_for_ui",
      selector: { text: "General" },
      params: { text: "General", waitUntil: "visible", timeoutMs: 5000, intervalMs: 500 },
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
  const latestJsonPath = join(reportsDir, "ios-tool-probe.json");
  const latestMdPath = join(reportsDir, "ios-tool-probe.md");

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
  runIosToolProbe().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[ios-tool-probe] ${message}`);
    process.exitCode = 1;
  });
}
