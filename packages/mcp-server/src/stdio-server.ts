import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createServer } from "./index.js";

export interface StdioRequest {
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface StdioSuccessResponse {
  id: string | number | null;
  result: unknown;
}

export interface StdioErrorResponse {
  id: string | number | null;
  error: {
    code: string;
    message: string;
  };
}

export function writeResponse(response: StdioSuccessResponse | StdioErrorResponse): void {
  process.stdout.write(`${JSON.stringify(response)}
`);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildToolList() {
  return [
    { name: "capture_js_console_logs", description: "Capture one-shot React Native or Expo JS console events through the Metro inspector WebSocket." },
    { name: "capture_js_network_events", description: "Capture one-shot React Native or Expo JS network events through the Metro inspector WebSocket." },
    { name: "compare_against_baseline", description: "Compare the current action outcome against a previously successful local baseline." },
    { name: "collect_debug_evidence", description: "Capture AI-friendly summarized debug evidence from logs and crash signals, with optional diagnostics escalation." },
    { name: "collect_diagnostics", description: "Capture an Android bugreport bundle or an iOS simulator diagnostics bundle." },
    { name: "detect_interruption", description: "Detect interruption signals from current state summary and UI evidence." },
    { name: "classify_interruption", description: "Classify interruption type and confidence from structured interruption signals." },
    { name: "describe_capabilities", description: "Return the current platform capability profile before invoking platform-specific tools." },
    { name: "doctor", description: "Check command availability and device readiness." },
    { name: "explain_last_failure", description: "Explain the most recent action failure using deterministic attribution heuristics." },
    { name: "find_similar_failures", description: "Find locally indexed failures that resemble the current failure signature." },
    { name: "get_action_outcome", description: "Load a previously recorded action outcome by actionId." },
    { name: "get_crash_signals", description: "Capture recent Android crash or ANR evidence and inspect the iOS simulator crash reporter tree." },
    { name: "get_logs", description: "Capture recent Android logcat output or recent iOS simulator logs." },
    { name: "get_screen_summary", description: "Capture a compact current-screen summary with actionable targets and blocking signals." },
    { name: "get_session_state", description: "Return compact AI-first session state with latest screen, readiness, and recent failure signals." },
    { name: "inspect_ui", description: "Capture a device UI hierarchy dump; iOS still relies on idb-backed hierarchy artifacts." },
    { name: "query_ui", description: "Query Android or iOS hierarchy dumps by selector fields and return structured matches." },
    { name: "resolve_ui_target", description: "Resolve a UI selector to a single actionable Android or iOS target or report ambiguity." },
    { name: "scroll_and_resolve_ui_target", description: "Scroll Android or iOS UI containers while trying to resolve a selector to a single actionable target." },
    { name: "scroll_and_tap_element", description: "Scroll Android or iOS UI containers until a target resolves, then tap the resolved element." },
    { name: "install_app", description: "Install a native or flutter artifact onto a target device/simulator." },
    { name: "list_js_debug_targets", description: "Discover React Native or Expo JS debug targets from the Metro inspector endpoint." },
    { name: "launch_app", description: "Launch the selected app or Expo URL on a target device/simulator." },
    { name: "list_devices", description: "List Android devices and iOS simulators." },
    { name: "measure_android_performance", description: "Capture an Android Perfetto time window and return a lightweight AI-friendly performance summary." },
    { name: "measure_ios_performance", description: "Capture an iOS xctrace time window and return a lightweight AI-friendly performance summary." },
    { name: "perform_action_with_evidence", description: "Execute one bounded action and automatically capture pre/post state plus outcome evidence." },
    { name: "rank_failure_candidates", description: "Rank likely failure layers for the latest attributed action window." },
    { name: "record_screen", description: "Record screen output on Android (adb) or iOS simulator (simctl) for a bounded duration." },
    { name: "recover_to_known_state", description: "Attempt a bounded deterministic recovery such as wait-ready or app relaunch." },
    { name: "resolve_interruption", description: "Resolve interruption with policy-aware signature matching and bounded actions." },
    { name: "resume_interrupted_action", description: "Replay interrupted action from checkpoint with drift detection." },
    { name: "replay_last_stable_path", description: "Replay the latest successful bounded action recorded for this session." },
    { name: "reset_app_state", description: "Reset app state using clear_data, uninstall_reinstall, or keychain_reset strategy." },
    { name: "take_screenshot", description: "Capture a screenshot from a target device or simulator." },
    { name: "tap", description: "Perform a coordinate tap on Android or on iOS simulators through idb." },
    { name: "tap_element", description: "Resolve a UI selector to a single Android or iOS target and tap only when the match is unambiguous." },
    { name: "type_text", description: "Perform direct text input on Android or on iOS simulators through idb." },
    { name: "type_into_element", description: "Resolve a UI selector, focus the matched Android or iOS element, and type text." },
    { name: "terminate_app", description: "Terminate the selected app on a target device or simulator." },
    { name: "wait_for_ui", description: "Poll the Android or iOS hierarchy until a selector matches or timeout is reached." },
    { name: "start_session", description: "Create a typed mobile execution session." },
    { name: "run_flow", description: "Run the selected flow through the Maestro adapter." },
    { name: "suggest_known_remediation", description: "Suggest remediation based on similar failures and local successful baselines." },
    { name: "end_session", description: "Close a session and return final metadata." },
  ];
}

export async function handleRequest(request: StdioRequest): Promise<unknown> {
  const server = createServer();

  if (request.method === "ping") {
    return { ok: true };
  }
  if (request.method === "initialize") {
    return { name: "mobile-e2e-mcp", protocol: "minimal-stdio-v1", tools: buildToolList() };
  }
  if (request.method === "list_tools" || request.method === "tools/list") {
    return buildToolList();
  }
  if (request.method === "invoke" || request.method === "tools/call") {
    const params = request.params;
    if (typeof params !== "object" || params === null) {
      throw new Error("invoke requires an object params payload.");
    }
    const toolName = "tool" in params ? (params as { tool?: unknown }).tool : (params as { name?: unknown }).name;
    const input = "input" in params ? (params as { input?: unknown }).input : (params as { arguments?: unknown }).arguments;
    if (typeof toolName !== "string") {
      throw new Error("invoke requires a string tool/name field.");
    }
    return server.invoke(toolName as never, (input ?? {}) as never);
  }
  throw new Error(`Unsupported stdio method: ${request.method}`);
}

export async function main(): Promise<void> {
  const lineReader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lineReader) {
    if (!line.trim()) {
      continue;
    }
    let request: StdioRequest;
    try {
      request = JSON.parse(line) as StdioRequest;
    } catch (error) {
      writeResponse({ id: null, error: { code: "INVALID_JSON", message: toErrorMessage(error) } });
      continue;
    }
    try {
      const result = await handleRequest(request);
      writeResponse({ id: request.id ?? null, result });
    } catch (error) {
      writeResponse({ id: request.id ?? null, error: { code: "REQUEST_FAILED", message: toErrorMessage(error) } });
    }
  }
}

const isEntrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(`${toErrorMessage(error)}
`);
    process.exitCode = 1;
  });
}
