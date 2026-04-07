import type { IosExecutionBackend, BackendProbeResult } from "./ios-backend-types.js";

// WDA JSON response envelope
interface WdaResponse {
  value: unknown;
  sessionId?: string;
}

// WDA /source JSON schema (simplified)
interface WdaElement {
  type?: string;
  name?: string | null;
  label?: string | null;
  value?: string | null;
  rect?: { x: number; y: number; width: number; height: number };
  isEnabled?: boolean;
  isVisible?: boolean;
  accessible?: boolean;
  children?: WdaElement[];
}

// Transformed format compatible with parseIosInspectNodes (via flattenIosInspectNodes)
interface TransformedElement {
  type: string;
  AXLabel: string | null;
  title: string | null;
  AXValue: string | null;
  frame?: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  custom_actions: string[];
  children: TransformedElement[];
}

export interface WdaExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * IosExecutionBackend for iOS physical devices using WebDriverAgent (WDA) HTTP API.
 *
 * WDA runs on the device, accessible via iproxy port forwarding:
 * `iproxy 8100 8100 --udid <deviceId>`
 *
 * Oracle Review findings built in:
 * - WDA /source XCUIElementType prefix stripped via transformWdaSource()
 * - No custom_actions in WDA → synthesized from type-based clickable detection
 * - Direct fetch() HTTP calls (no curl hack)
 * - WDA /status endpoint for probeAvailability
 *
 * @see https://github.com/appium/WebDriverAgent
 */
export class WdaRealDeviceBackend implements IosExecutionBackend {
  readonly backendId = "wda" as const;
  readonly backendName = "WebDriverAgent";

  readonly supportLevel = {
    tap: "full" as const,
    typeText: "full" as const,
    swipe: "full" as const,
    hierarchy: "full" as const,
    screenshot: "full" as const,
  };

  // WDA is accessible via iproxy forwarding on localhost:8100
  private getBaseUrl(): string {
    return "http://localhost:8100";
  }

  async probeAvailability(_repoRoot: string): Promise<BackendProbeResult> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/status`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        return { available: false, error: `WDA /status returned ${response.status}` };
      }
      const data = (await response.json()) as WdaResponse;
      const value = data.value as Record<string, unknown> | undefined;
      const sessionId = value?.sessionId as string | undefined;
      return { available: true, version: sessionId ? `session:${sessionId.slice(0, 8)}` : "ready" };
    } catch (error) {
      return { available: false, error: `WDA not reachable at ${this.getBaseUrl()}: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  buildTapCommand(deviceId: string, x: number, y: number): string[] {
    return ["__wda_http__", deviceId, "POST", "/wda/tap", JSON.stringify({ x, y })];
  }

  buildTypeTextCommand(deviceId: string, text: string): string[] {
    return ["__wda_http__", deviceId, "POST", "/wda/keys", JSON.stringify({ value: text.split("") })];
  }

  buildSwipeCommand(
    deviceId: string,
    swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number },
  ): string[] {
    return ["__wda_http__", deviceId, "POST", "/wda/dragfromtoforduration", JSON.stringify({
      fromX: swipe.start.x,
      fromY: swipe.start.y,
      toX: swipe.end.x,
      toY: swipe.end.y,
      duration: swipe.durationMs / 1000,
    })];
  }

  buildHierarchyCaptureCommand(deviceId: string): string[] {
    return ["__wda_http__", deviceId, "GET", "/source", "{}"];
  }

  buildScreenshotCommand(deviceId: string, _outputPath: string): string[] {
    return ["__wda_http__", deviceId, "GET", "/screenshot", "{}"];
  }

  // Direct HTTP execution methods (preferred path over command builders)
  async executeWdaRequest(_deviceId: string, method: string, path: string, body?: unknown): Promise<WdaExecutionResult> {
    const url = `${this.getBaseUrl()}${path}`;
    try {
      const response = await fetch(url, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return { success: false, error: `WDA ${method} ${path} returned ${response.status}` };
      }
      const data = (await response.json()) as WdaResponse;
      return { success: true, data: data.value };
    } catch (error) {
      return { success: false, error: `WDA request failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  // Transform WDA /source JSON → parseIosInspectNodes compatible format
  // Oracle Review finding: WDA uses XCUIElementType prefix, name/label fields, rect instead of frame
  transformWdaSource(wdaElement: WdaElement): TransformedElement {
    return {
      type: wdaElement.type?.replace("XCUIElementType", "") ?? "Unknown",
      AXLabel: wdaElement.name ?? wdaElement.label ?? null,
      title: wdaElement.label ?? null,
      AXValue: wdaElement.value ?? null,
      frame: wdaElement.rect ? {
        x: wdaElement.rect.x,
        y: wdaElement.rect.y,
        width: wdaElement.rect.width,
        height: wdaElement.rect.height,
      } : undefined,
      enabled: wdaElement.isEnabled ?? true,
      custom_actions: this.isClickableType(wdaElement.type) ? ["default"] : [],
      children: (wdaElement.children ?? []).map(child => this.transformWdaSource(child)),
    };
  }

  private isClickableType(type: string | undefined): boolean {
    const stripped = type?.replace("XCUIElementType", "") ?? "";
    return ["Button", "Link", "Cell", "Switch", "Slider", "SegmentedControl", "Picker"].includes(stripped);
  }

  buildFailureSuggestion(action: string, _deviceId: string): string {
    const suggestions: Record<string, string> = {
      tap: "Check WDA is running (iproxy 8100 8100 --udid <udid>) and coordinates are within screen bounds.",
      typeText: "Check WDA is running and a text field is focused on the device.",
      swipe: "Check WDA is running and coordinates are valid.",
      hierarchy: "Check WDA is running. Try 'curl http://localhost:8100/source' manually.",
      screenshot: "Check WDA is running.",
    };
    return suggestions[action] ?? `Check WDA connectivity. Run 'curl http://localhost:8100/status' to verify.`;
  }
}
