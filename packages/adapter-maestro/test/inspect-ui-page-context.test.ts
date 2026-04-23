import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { inspectUiWithMaestroTool } from "../src/ui-inspection-tools.ts";

test("inspectUiWithMaestroTool exposes pageContext when summary is available", async () => {
  const result = await inspectUiWithMaestroTool(
    {
      sessionId: "inspect-ui-page-context",
      platform: "android",
      dryRun: false,
    },
    {
      loadHarnessSelection: async () => ({ deviceId: "android-emulator-1" }),
      captureAndroidUiSnapshot: async () => ({
        absoluteOutputPath: "/tmp/inspect-ui-page-context.xml",
        relativeOutputPath: "artifacts/ui-dumps/inspect-ui-page-context.xml",
        readCommand: ["fixture", "read"],
        dumpCommand: ["fixture", "dump"],
        readExecution: { exitCode: 0, stdout: "<hierarchy />", stderr: "" },
      }),
      parseInspectUiSummary: () => ({
        totalNodes: 4,
        clickableNodes: 2,
        scrollableNodes: 0,
        nodesWithText: 2,
        nodesWithContentDesc: 0,
        sampleNodes: [
          { clickable: false, enabled: true, scrollable: false, text: "Allow", className: "Dialog", packageName: "com.example.app" },
        ],
      }),
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, REASON_CODES.ok);
  assert.equal(result.data.pageContext?.type, "app_dialog");
  assert.equal(result.data.pageContext?.platform, "android");
});
