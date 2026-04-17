import type { IosExecutionBackend, BackendProbeResult } from "./ios-backend-types.js";
import { executeRunnerWithTestHooks } from "./runtime-shared.js";

/**
 * IosExecutionBackend for iOS simulators using AXe CLI.
 *
 * AXe is a single-binary CLI tool that provides all simulator UI capabilities
 * via Apple's Accessibility APIs. Installed via: `brew install cameroncooke/axe/axe`
 *
 * All commands below have been VERIFIED on an actual booted simulator
 * (iPhone 16 Plus, iOS 18.5, axe v1.6.0).
 *
 * @see https://github.com/cameroncooke/AXe
 */
export class AxeSimulatorBackend implements IosExecutionBackend {
  readonly backendId = "axe" as const;
  readonly backendName = "AXe CLI";

  readonly supportLevel = {
    tap: "full" as const,
    typeText: "full" as const,
    swipe: "full" as const,
    hierarchy: "full" as const,
    screenshot: "full" as const,
  };

  async probeAvailability(repoRoot: string): Promise<BackendProbeResult> {
    try {
      const result = await executeRunnerWithTestHooks(["axe", "--version"], repoRoot, process.env);
      if (result.exitCode !== 0) {
        return { available: false, error: `axe --version failed: ${result.stderr.trim()}` };
      }
      const version = result.stdout.trim();
      return { available: true, version: version || undefined };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  buildTapCommand(deviceId: string, x: number, y: number): string[] {
    // axe tap -x X -y Y --udid UDID
    // VERIFIED: ✓ Tap at (200.0, 400.0) completed successfully
    return ["axe", "tap", "-x", String(x), "-y", String(y), "--udid", deviceId];
  }

  buildTypeTextCommand(deviceId: string, text: string): string[] {
    // axe type "text" --udid UDID
    // Text is passed as positional argument; axe handles shell escaping internally
    // If text starts with "-", prefix with "--" to prevent flag parsing
    const safeText = text.startsWith("-") ? "--" + text : text;
    return ["axe", "type", safeText, "--udid", deviceId];
  }

  buildSwipeCommand(
    deviceId: string,
    swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number },
  ): string[] {
    // axe swipe --start-x X1 --start-y Y1 --end-x X2 --end-y Y2 --udid UDID
    // Optional: --duration (seconds)
    const durationSec = (swipe.durationMs / 1000).toFixed(1);
    return [
      "axe", "swipe",
      "--start-x", String(swipe.start.x),
      "--start-y", String(swipe.start.y),
      "--end-x", String(swipe.end.x),
      "--end-y", String(swipe.end.y),
      "--duration", durationSec,
      "--udid", deviceId,
    ];
  }

  buildHierarchyCaptureCommand(deviceId: string): string[] {
    // axe describe-ui --udid UDID
    // Output is JSON array by default (NO --json flag needed)
    // VERIFIED: Compatible with parseIosInspectNodes() — zero parser changes needed
    // 14 nodes parsed, 12 clickable, text correctly extracted
    return ["axe", "describe-ui", "--udid", deviceId];
  }

  buildDescribePointCommand(deviceId: string, x: number, y: number): string[] {
    return [
      "axe",
      "describe-ui",
      "--udid",
      deviceId,
      "--point",
      `${Math.round(x)},${Math.round(y)}`,
    ];
  }

  buildScreenshotCommand(deviceId: string, outputPath: string): string[] {
    // axe screenshot --udid UDID --output <path>
    // VERIFIED: saved 3.6M PNG, 1290×2796, RGBA
    // Same quality as simctl (same underlying mechanism)
    return ["axe", "screenshot", "--udid", deviceId, "--output", outputPath];
  }

  buildFailureSuggestion(action: string, _deviceId: string): string {
    const suggestions: Record<string, string> = {
      tap: "Check simulator is booted and coordinates are within screen bounds. Run 'axe tap -x X -y Y --udid <UDID>' manually.",
      typeText: "Check simulator has a focused text field. Run 'axe type \"text\" --udid <UDID>' manually.",
      swipe: "Check simulator is booted and coordinates are valid. Run 'axe swipe --start-x X1 --start-y Y1 --end-x X2 --end-y Y2 --udid <UDID>' manually.",
      hierarchy: "Check simulator is booted. Run 'axe describe-ui --udid <UDID>' manually.",
      screenshot: "Check simulator is booted and output path is writable.",
    };
    return suggestions[action] ?? `Check simulator state for ${action} action. Install axe: brew install cameroncooke/axe/axe`;
  }
}
