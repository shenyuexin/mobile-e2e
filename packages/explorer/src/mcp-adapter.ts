/**
 * MCP Adapter — bridges the explorer engine to MobileE2EMcpServer.invoke().
 *
 * Call path: MobileE2EMcpServer.invoke() -> ToolResult<TData> -> unwrapResult -> engine plain types
 *
 * This is the ONLY place where ToolResult is consumed. The rest of the engine
 * works with plain types. Never inspect ToolResult fields outside this module.
 */

import type { ToolResult, Platform, RunnerProfile } from "@mobile-e2e-mcp/contracts";
import type {
  InspectUiData,
  TapElementData,
  NavigateBackData,
  WaitForUiStableData,
  ScreenshotData,
  LaunchAppData,
  RecoverToKnownStateData,
  ResetAppStateData,
  RequestManualHandoffData,
  GetScreenSummaryData,
  TapData,
} from "@mobile-e2e-mcp/contracts";

/** Session context required by all MCP tools. */
export interface SessionContext {
  sessionId: string;
  platform: Platform;
  runnerProfile: RunnerProfile;
  deviceId?: string;
}

/** Args for navigateBack. */
export interface NavigateBackArgs {
  /** Title of the parent page — used as iOS back button text. */
  parentPageTitle?: string;
  /** iOS-only back strategy override. */
  iosStrategy?: "selector_tap" | "edge_swipe";
  /** Optional explicit selector for iOS selector_tap back. */
  selector?: {
    resourceId?: string;
    contentDesc?: string;
    text?: string;
    className?: string;
    clickable?: boolean;
  };
}

/** Type-safe interface for MCP tools consumed by the explorer engine. */
export interface McpToolInterface {
  launchApp(args: { appId: string }): Promise<ToolResult<LaunchAppData>>;
  waitForUiStable(args: { timeoutMs: number }): Promise<ToolResult<WaitForUiStableData>>;
  inspectUi(): Promise<ToolResult<InspectUiData>>;
  tapElement(args: {
    resourceId?: string;
    contentDesc?: string;
    text?: string;
    className?: string;
    clickable?: boolean;
    limit?: number;
  }): Promise<ToolResult<TapElementData>>;
  navigateBack(args?: NavigateBackArgs): Promise<ToolResult<NavigateBackData>>;
  takeScreenshot(): Promise<ToolResult<ScreenshotData>>;
  recoverToKnownState(): Promise<ToolResult<RecoverToKnownStateData>>;
  resetAppState(args: { appId: string }): Promise<ToolResult<ResetAppStateData>>;
  requestManualHandoff(): Promise<ToolResult<RequestManualHandoffData>>;
  getScreenSummary(): Promise<ToolResult<GetScreenSummaryData>>;
  tap(args: { x: number; y: number }): Promise<ToolResult<TapData>>;
}

/** Shape of an object that has an invoke method (MobileE2EMcpServer). */
export interface InvokableServer {
  invoke<TName extends string>(name: TName, input: unknown): Promise<ToolResult<unknown>>;
}

/**
 * Navigate back for the explorer.
 *
 * For iOS: uses the parentPageTitle as the back button selector text.
 * iOS back buttons always show the parent page's title — this is standard
 * iOS behavior and works for any app, not just Settings.
 *
 * For Android: delegates to standard KEYEVENT_BACK.
 */
export function createMcpAdapter(
  server: InvokableServer,
  ctx: SessionContext,
): McpToolInterface {
  const invoke = server.invoke.bind(server);

  const baseInput = () => ({
    sessionId: ctx.sessionId,
    platform: ctx.platform,
    runnerProfile: ctx.runnerProfile,
    deviceId: ctx.deviceId,
  });

  return {
    launchApp: (args) =>
      invoke("launch_app", { ...baseInput(), appId: args.appId }) as Promise<ToolResult<LaunchAppData>>,
    waitForUiStable: (args) =>
      invoke("wait_for_ui_stable", {
        ...baseInput(),
        timeoutMs: args.timeoutMs,
        intervalMs: 300,
        consecutiveStable: 2,
      }) as Promise<ToolResult<WaitForUiStableData>>,
    inspectUi: () =>
      invoke("inspect_ui", { ...baseInput() }) as Promise<ToolResult<InspectUiData>>,
    tapElement: (args) =>
      invoke("tap_element", { ...baseInput(), ...args }) as Promise<ToolResult<TapElementData>>,
    navigateBack: (args?) => {
      const parentTitle = args?.parentPageTitle;
      const selector = args?.iosStrategy === "edge_swipe"
        ? undefined
        : args?.selector
        ? { ...args.selector }
        : parentTitle
        ? ctx.platform === "ios"
          ? { text: parentTitle, contentDesc: parentTitle }
          : { text: parentTitle }
        : undefined;
      return invoke("navigate_back", {
        ...baseInput(),
        target: "app" as const,
        ...(args?.iosStrategy ? { iosStrategy: args.iosStrategy } : {}),
        ...(selector && { selector }),
      }) as Promise<ToolResult<NavigateBackData>>;
    },
    takeScreenshot: () =>
      invoke("take_screenshot", { ...baseInput() }) as Promise<ToolResult<ScreenshotData>>,
    recoverToKnownState: () =>
      invoke("recover_to_known_state", { ...baseInput() }) as Promise<ToolResult<RecoverToKnownStateData>>,
    resetAppState: (args) =>
      invoke("reset_app_state", { ...baseInput(), appId: args.appId }) as Promise<ToolResult<ResetAppStateData>>,
    requestManualHandoff: () =>
      invoke("request_manual_handoff", { ...baseInput() }) as Promise<ToolResult<RequestManualHandoffData>>,
    getScreenSummary: () =>
      invoke("get_screen_summary", { ...baseInput(), includeDebugSignals: false }) as Promise<ToolResult<GetScreenSummaryData>>,
    tap: (args) =>
      invoke("tap", { ...baseInput(), x: args.x, y: args.y }) as Promise<ToolResult<TapData>>,
  };
}

/**
 * Unwrap a ToolResult into either the data or an Error.
 */
export function unwrapResult<T>(result: ToolResult<T>): T {
  if (result.status === "success" || result.status === "partial") {
    return result.data as T;
  }
  const err = new Error(
    `ToolResult: ${result.status} (${result.reasonCode}): ${result.nextSuggestions?.join("; ")}`,
  );
  (err as unknown as Record<string, unknown>).reasonCode = result.reasonCode;
  (err as unknown as Record<string, unknown>).suggestions = result.nextSuggestions;
  throw err;
}
