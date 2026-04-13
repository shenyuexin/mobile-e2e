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
} from "@mobile-e2e-mcp/contracts";

/**
 * Session context required by all MCP tools.
 *
 * The explorer engine should not need to know about these — they are injected
 * at the adapter boundary based on the ExplorerConfig.
 */
export interface SessionContext {
  sessionId: string;
  platform: Platform;
  runnerProfile: RunnerProfile;
  deviceId?: string;
}

/**
 * Type-safe interface for MCP tools consumed by the explorer engine.
 * All methods return ToolResult<TData> which must be unwrapped via unwrapResult().
 */
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
  navigateBack(): Promise<ToolResult<NavigateBackData>>;
  takeScreenshot(): Promise<ToolResult<ScreenshotData>>;
  recoverToKnownState(): Promise<ToolResult<RecoverToKnownStateData>>;
  resetAppState(args: { appId: string }): Promise<ToolResult<ResetAppStateData>>;
  requestManualHandoff(): Promise<ToolResult<RequestManualHandoffData>>;
}

/**
 * Shape of an object that has an invoke method (MobileE2EMcpServer).
 */
export interface InvokableServer {
  invoke<TName extends string>(name: TName, input: unknown): Promise<ToolResult<unknown>>;
}

/**
 * Create an adapter bound to the given server instance.
 *
 * All MCP tool calls include sessionId, platform, runnerProfile, and deviceId
 * as required by the contracts.
 *
 * In CLI mode: server = new MobileE2EMcpServer(registry).
 * In test mode: pass a mock implementation.
 */
export function createMcpAdapter(
  server: InvokableServer,
  ctx: SessionContext,
): McpToolInterface {
  const invoke = server.invoke.bind(server);

  // Base params included in every tool call
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
    navigateBack: () =>
      invoke("navigate_back", {
        ...baseInput(),
        target: "app" as const,
        // iOS needs a selector for app-level back.
        // Try common back button patterns: "Settings", "Back", or a left-chevron icon.
        selector: { text: "Settings" },
      }) as Promise<ToolResult<NavigateBackData>>,
    takeScreenshot: () =>
      invoke("take_screenshot", { ...baseInput() }) as Promise<ToolResult<ScreenshotData>>,
    recoverToKnownState: () =>
      invoke("recover_to_known_state", { ...baseInput() }) as Promise<ToolResult<RecoverToKnownStateData>>,
    resetAppState: (args) =>
      invoke("reset_app_state", { ...baseInput(), appId: args.appId }) as Promise<ToolResult<ResetAppStateData>>,
    requestManualHandoff: () =>
      invoke("request_manual_handoff", { ...baseInput() }) as Promise<ToolResult<RequestManualHandoffData>>,
  };
}

/**
 * Unwrap a ToolResult into either the data or an Error.
 *
 * Use this at adapter boundaries only — do NOT check ToolResult fields elsewhere in the engine.
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
