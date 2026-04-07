import type { IosExecutionBackend, BackendProbeResult } from "./ios-backend-types.js";
import { executeRunnerWithTestHooks } from "./runtime-shared.js";

export class SimctlSimulatorBackend implements IosExecutionBackend {
  readonly backendId = "simctl" as const;
  readonly backendName = "Xcode simctl";

  readonly supportLevel = {
    tap: "none" as const,
    typeText: "none" as const,
    swipe: "none" as const,
    hierarchy: "none" as const,
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

  buildTapCommand(_deviceId: string, _x: number, _y: number): string[] {
    throw new Error("simctl no longer supports tap — use axe backend: brew install cameroncooke/axe/axe");
  }

  buildTypeTextCommand(_deviceId: string, _text: string): string[] {
    throw new Error("simctl no longer supports typeText — use axe backend: brew install cameroncooke/axe/axe");
  }

  buildSwipeCommand(
    _deviceId: string,
    _swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number },
  ): string[] {
    throw new Error("simctl no longer supports swipe — use axe backend: brew install cameroncooke/axe/axe");
  }

  buildHierarchyCaptureCommand(_deviceId: string): string[] {
    throw new Error("simctl no longer supports hierarchy — use axe backend: brew install cameroncooke/axe/axe");
  }

  buildScreenshotCommand(deviceId: string, outputPath: string): string[] {
    return ["xcrun", "simctl", "io", deviceId, "screenshot", outputPath];
  }

  buildFailureSuggestion(action: string, _deviceId: string): string {
    const suggestions: Record<string, string> = {
      screenshot: "Check simulator is booted and output path is writable.",
      tap: "simctl does not support tap. Use axe backend: brew install cameroncooke/axe/axe",
      typeText: "simctl does not support typeText. Use axe backend: brew install cameroncooke/axe/axe",
      swipe: "simctl does not support swipe. Use axe backend: brew install cameroncooke/axe/axe",
      hierarchy: "simctl does not support hierarchy. Use axe backend: brew install cameroncooke/axe/axe",
    };
    return suggestions[action] ?? `Check simulator state for ${action} action. Install axe for full UI support: brew install cameroncooke/axe/axe`;
  }
}
