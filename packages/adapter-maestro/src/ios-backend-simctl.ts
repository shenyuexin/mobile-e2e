import type { IosExecutionBackend, BackendProbeResult } from "./ios-backend-types.js";
import { executeRunnerWithTestHooks } from "./runtime-shared.js";

export class SimctlSimulatorBackend implements IosExecutionBackend {
  readonly backendId = "simctl" as const;
  readonly backendName = "Xcode simctl";

  readonly supportLevel = {
    tap: "full" as const,
    typeText: "full" as const,
    swipe: "full" as const,
    hierarchy: "full" as const,
    screenshot: "full" as const,
  };

  async probeAvailability(repoRoot: string): Promise<BackendProbeResult> {
    try {
      const result = await executeRunnerWithTestHooks(["xcrun", "simctl", "help"], repoRoot, process.env);
      if (result.exitCode !== 0) {
        return { available: false, error: `xcrun simctl help failed: ${result.stderr.trim()}` };
      }
      // Extract Xcode version from xcrun simctl help output (typically shows in usage/header)
      const version = result.stdout.trim().match(/Xcode\s+([\d.]+)/)?.[1];
      return { available: true, version };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  buildTapCommand(deviceId: string, x: number, y: number): string[] {
    return ["xcrun", "simctl", "io", deviceId, "tap", String(x), String(y)];
  }

  buildTypeTextCommand(deviceId: string, text: string): string[] {
    const escaped = text
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "'\\''")
      .replaceAll('"', '\\"');
    return ["xcrun", "simctl", "keyboard", deviceId, "type", "--", escaped];
  }

  buildSwipeCommand(
    deviceId: string,
    swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number },
  ): string[] {
    return ["xcrun", "simctl", "io", deviceId, "swipe", String(swipe.start.x), String(swipe.start.y), String(swipe.end.x), String(swipe.end.y)];
  }

  buildHierarchyCaptureCommand(deviceId: string): string[] {
    return ["xcrun", "simctl", "spawn", deviceId, "accessibility", "dump"];
  }

  buildScreenshotCommand(deviceId: string, outputPath: string): string[] {
    return ["xcrun", "simctl", "io", deviceId, "screenshot", outputPath];
  }

  buildFailureSuggestion(action: string, deviceId: string): string {
    const suggestions: Record<string, string> = {
      tap: "Check simulator is booted and iOS version is 15+. Run 'xcrun simctl list devices' to verify.",
      typeText: "Check simulator keyboard is active. Ensure the simulator has a focused text field.",
      swipe: "Check simulator is booted. Verify coordinates are within screen bounds.",
      hierarchy: "Ensure the simulator is booted. Try 'xcrun simctl spawn <udid> accessibility dump' manually.",
      screenshot: "Check simulator is booted and output path is writable.",
    };
    return suggestions[action] ?? `Check simulator state for ${action} action.`;
  }
}
