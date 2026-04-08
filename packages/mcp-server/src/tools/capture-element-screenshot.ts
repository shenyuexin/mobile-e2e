import type { ElementScreenshotData, ElementScreenshotInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { cropElementScreenshot } from "@mobile-e2e-mcp/adapter-maestro";

export async function captureElementScreenshot(input: ElementScreenshotInput): Promise<ToolResult<ElementScreenshotData>> {
  return cropElementScreenshot(input);
}
