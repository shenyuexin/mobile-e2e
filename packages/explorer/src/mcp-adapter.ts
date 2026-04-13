/**
 * MCP Adapter — bridges the explorer engine to MobileE2EMcpServer.invoke().
 *
 * Call path: MobileE2EMcpServer.invoke() -> ToolResult<TData> -> unwrapResult -> engine plain types
 *
 * This is the ONLY place where ToolResult is consumed. The rest of the engine
 * works with plain types. Never inspect ToolResult fields outside this module.
 */

import type { ToolResult } from "@mobile-e2e-mcp/contracts";
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
 * In CLI mode: server = new MobileE2EMcpServer(registry).
 * In test mode: pass a mock implementation.
 */
export function createMcpAdapter(server: InvokableServer): McpToolInterface {
  const invoke = server.invoke.bind(server);
  return {
    launchApp: (args) =>
      invoke("launch_app", args) as Promise<ToolResult<LaunchAppData>>,
    waitForUiStable: (args) =>
      invoke("wait_for_ui_stable", args) as Promise<ToolResult<WaitForUiStableData>>,
    inspectUi: () =>
      invoke("inspect_ui", {}) as Promise<ToolResult<InspectUiData>>,
    tapElement: (args) =>
      invoke("tap_element", args) as Promise<ToolResult<TapElementData>>,
    navigateBack: () =>
      invoke("navigate_back", {}) as Promise<ToolResult<NavigateBackData>>,
    takeScreenshot: () =>
      invoke("take_screenshot", {}) as Promise<ToolResult<ScreenshotData>>,
    recoverToKnownState: () =>
      invoke("recover_to_known_state", {}) as Promise<ToolResult<RecoverToKnownStateData>>,
    resetAppState: (args) =>
      invoke("reset_app_state", args) as Promise<ToolResult<ResetAppStateData>>,
    requestManualHandoff: () =>
      invoke("request_manual_handoff", {}) as Promise<ToolResult<RequestManualHandoffData>>,
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
