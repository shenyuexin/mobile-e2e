import type { ToolResult, VisualDiffData, VisualDiffInput } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { compareVisualBaseline } from "@mobile-e2e-mcp/adapter-vision";
import { cropElementScreenshot } from "@mobile-e2e-mcp/adapter-maestro";

export async function compareVisualBaselineTool(input: VisualDiffInput): Promise<ToolResult<VisualDiffData>> {
  const startTime = Date.now();

  // If sessionId + selector provided (but no explicit paths), capture element screenshot first
  if (input.sessionId && input.selector && !input.currentPath) {
    const screenshotResult = await cropElementScreenshot({
      sessionId: input.sessionId,
      selector: input.selector,
      platform: input.platform,
      runnerProfile: input.runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId,
      dryRun: input.dryRun,
    });

    if (screenshotResult.status !== "success") {
      return {
        status: screenshotResult.status,
        reasonCode: screenshotResult.reasonCode,
        sessionId: input.sessionId ?? `visual-diff-${Date.now()}`,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: screenshotResult.artifacts,
        data: {
          baselinePath: input.baselinePath ?? "",
          currentPath: "",
          pixelDiffPercent: 0,
          threshold: input.threshold ?? 5.0,
          passed: false,
        },
        nextSuggestions: ["Capture element screenshot failed; cannot compare without current image."],
      };
    }

    // Use the captured element screenshot as currentPath
    const enhancedInput: VisualDiffInput = {
      ...input,
      currentPath: screenshotResult.data.croppedElementPath,
    };

    const diffResult = await compareVisualBaseline(enhancedInput);
    return {
      status: diffResult.result.passed ? "success" : "partial",
      reasonCode: diffResult.result.passed ? REASON_CODES.ok : REASON_CODES.visualDiffExceeded,
      sessionId: input.sessionId,
      durationMs: diffResult.durationMs + screenshotResult.durationMs,
      attempts: 1,
      artifacts: [diffResult.result.baselinePath, diffResult.result.currentPath, ...(diffResult.result.diffPath ? [diffResult.result.diffPath] : [])],
      data: diffResult.result,
      nextSuggestions: diffResult.result.passed
        ? []
        : ["Visual diff exceeds threshold. Review diffPath for pixel-level differences."],
    };
  }

  // Direct image-to-image comparison
  const diffResult = await compareVisualBaseline(input);
  return {
    status: diffResult.result.passed ? "success" : "partial",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId ?? `visual-diff-${Date.now()}`,
    durationMs: diffResult.durationMs,
    attempts: 1,
    artifacts: [diffResult.result.baselinePath, diffResult.result.currentPath, ...(diffResult.result.diffPath ? [diffResult.result.diffPath] : [])],
    data: diffResult.result,
    nextSuggestions: diffResult.result.passed
      ? []
      : ["Visual diff exceeds threshold. Review diffPath for pixel-level differences."],
  };
}
