import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { persistActionRecord } from "@mobile-e2e-mcp/core";
import { suggestKnownRemediationWithMaestro } from "../src/index.ts";
import { resolveRepoPath } from "../src/harness-config.js";

const repoRoot = resolveRepoPath();

test("suggestKnownRemediationWithMaestro prioritizes signing guidance for iOS signature preflight evidence", async () => {
  const sessionId = `known-remediation-ios-signature-${Date.now()}`;
  const actionId = `known-remediation-ios-signature-action-${Date.now()}`;
  const startupDir = path.join(repoRoot, "artifacts", "ios-physical-actions", sessionId);
  await mkdir(startupDir, { recursive: true });
  await writeFile(
    path.join(startupDir, "type_text.execution.md"),
    [
      "# iOS physical type_text execution evidence",
      "",
      "- attemptedBackend: local_manual_runner",
      "- executedBackend: local_manual_runner",
      "- fallbackUsed: false",
      "- primaryFailurePhase: preflight",
      "- startupPhase: preflight",
      "- reasonCode: CONFIGURATION_ERROR",
      "",
      "## Summary",
      "Runner installation failed during iOS preflight because the test-runner code signature could not be validated on device (0xe8008018).",
      "",
    ].join("\n"),
    "utf8",
  );

  await persistActionRecord(repoRoot, {
    actionId,
    sessionId,
    intent: { actionType: "type_into_element", text: "Email", value: "demo@example.com" },
    outcome: {
      actionId,
      actionType: "type_into_element",
      resolutionStrategy: "deterministic",
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      outcome: "failed",
    },
    evidenceDelta: {},
    evidence: [
      {
        kind: "log",
        path: path.posix.join("artifacts", "ios-physical-actions", sessionId, "type_text.execution.md"),
        supportLevel: "partial",
        description: "iOS startup signature evidence",
      },
    ],
    lowLevelStatus: "failed",
    lowLevelReasonCode: REASON_CODES.configurationError,
    updatedAt: new Date().toISOString(),
  });

  const remediation = await suggestKnownRemediationWithMaestro({ sessionId });

  assert.equal(remediation.status, "success");
  assert.equal(
    remediation.data.remediation.some((item) => /apple development identity|signing|provisioning/i.test(item)),
    true,
  );
});
