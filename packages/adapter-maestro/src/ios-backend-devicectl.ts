import { CLI_COMMANDS } from "./constants/cli-commands.js";
import type { IosExecutionBackend, BackendProbeResult } from "./ios-backend-types.js";
import { executeRunner } from "./runtime-shared.js";

/**
 * IosExecutionBackend for iOS physical devices using xcrun devicectl.
 *
 * HONESTY NOTE:
 * - devicectl provides: install, launch, terminate, logs, crashes
 * - devicectl does NOT provide: tap, typeText, swipe, hierarchy capture
 * - For UI interactions, we fall back to Maestro flow YAML
 * - Physical device UI interactions are marked "partial" for this reason
 */
export class DevicectlPhysicalBackend implements IosExecutionBackend {
  readonly backendId = "devicectl" as const;
  readonly backendName = "Apple devicectl";

  // HONEST: All UI interactions go through Maestro flow YAML, so they are "partial"
  readonly supportLevel = {
    tap: "partial" as const,
    typeText: "partial" as const,
    swipe: "partial" as const,
    hierarchy: "partial" as const,
    screenshot: "partial" as const,
  };

  async probeAvailability(repoRoot: string): Promise<BackendProbeResult> {
    try {
      const result = await executeRunner([CLI_COMMANDS.xcrun, "devicectl", "help"], repoRoot, process.env);
      if (result.exitCode !== 0) {
        return { available: false, error: `xcrun devicectl help failed: ${result.stderr.trim()}` };
      }
      const version = result.stdout.trim().match(/Xcode\s+([\d.]+)/)?.[1] ?? "14+";
      return { available: true, version };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  buildTapCommand(deviceId: string, x: number, y: number): string[] {
    return this.buildMaestroTestCommand(deviceId, this.buildTapFlowYaml(x, y));
  }

  buildTypeTextCommand(deviceId: string, text: string): string[] {
    return this.buildMaestroTestCommand(deviceId, this.buildTypeTextFlowYaml(text));
  }

  buildSwipeCommand(
    deviceId: string,
    swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number },
  ): string[] {
    return this.buildMaestroTestCommand(deviceId, this.buildSwipeFlowYaml(swipe));
  }

  buildHierarchyCaptureCommand(deviceId: string): string[] {
    // devicectl has no accessibility dump equivalent - indicate Maestro fallback
    return [CLI_COMMANDS.maestro, "test", "--platform", "ios", "--udid", deviceId, "<HIERARCHY_FLOW_YAML>"];
  }

  buildScreenshotCommand(deviceId: string, _outputPath: string): string[] {
    // devicectl has no direct screenshot - use idevicescreenshot if available
    return ["idevicescreenshot", "--udid", deviceId, "<OUTPUT_PATH>"];
  }

  buildFailureSuggestion(action: string, _deviceId: string): string {
    return `Physical device UI interactions use Maestro as execution backend. Ensure Maestro is installed and the device is connected. Run 'maestro --version' to verify.`;
  }

  // -- Private helpers --

  private escapeYamlDoubleQuoted(value: string): string {
    return value
      .replaceAll("\\", "\\\\")
      .replaceAll("\"", "\\\"")
      .replaceAll("\n", "\\n");
  }

  private buildTapFlowYaml(x: number, y: number): string {
    return [
      'appId: "*"',
      "---",
      "- tapOn:",
      `    start: "${String(x)},${String(y)}"`,
      "",
    ].join("\n");
  }

  private buildTypeTextFlowYaml(text: string): string {
    return [
      'appId: "*"',
      "---",
      `- inputText: "${this.escapeYamlDoubleQuoted(text)}"`,
      "",
    ].join("\n");
  }

  private buildSwipeFlowYaml(swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number }): string {
    return [
      'appId: "*"',
      "---",
      "- swipe:",
      `    start: "${String(swipe.start.x)},${String(swipe.start.y)}"`,
      `    end: "${String(swipe.end.x)},${String(swipe.end.y)}"`,
      `    duration: ${String(Math.round(swipe.durationMs / 1000 * 10) / 10)}`,
      "",
    ].join("\n");
  }

  private buildMaestroTestCommand(deviceId: string, flowYaml: string): string[] {
    // The execution layer (ui-action-tools.ts) will write flowYaml to a temp file
    // and replace <FLOW_YAML_PATH> with the actual path before execution.
    // We include the YAML as the last argument for the command builder contract.
    return [
      CLI_COMMANDS.maestro,
      "test",
      "--platform",
      "ios",
      "--udid",
      deviceId,
      flowYaml,
    ];
  }
}
