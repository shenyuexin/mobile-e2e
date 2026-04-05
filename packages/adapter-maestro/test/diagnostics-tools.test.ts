import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { diagnosticsToolInternals } from "../src/diagnostics-tools.ts";

test("buildDebugNextSuggestions includes preflight guidance for iOS startup evidence", () => {
  const suggestions = diagnosticsToolInternals.buildDebugNextSuggestions({
    reasonCode: REASON_CODES.deviceUnavailable,
    suspectAreas: ["iOS startup suspect: preflight"],
    includeDiagnostics: false,
    iosStartupEvidence: {
      artifactPath: "artifacts/ios-physical-actions/session-a/tap.execution.md",
      startupPhase: "preflight",
      reasonCode: REASON_CODES.deviceUnavailable,
    },
  });

  assert.equal(
    suggestions.some((item) => item.includes("unlock the target device")),
    true,
  );
  assert.equal(
    suggestions.some((item) => item.includes("tap.execution.md")),
    true,
  );
});

test("buildDebugNextSuggestions includes handshake guidance for code74/dtxproxy phase", () => {
  const suggestions = diagnosticsToolInternals.buildDebugNextSuggestions({
    reasonCode: REASON_CODES.adapterError,
    suspectAreas: ["iOS startup suspect: dtxproxy"],
    includeDiagnostics: true,
    iosStartupEvidence: {
      artifactPath: "artifacts/ios-physical-actions/session-b/tap.execution.md",
      startupPhase: "xctest_handshake",
      reasonCode: REASON_CODES.adapterError,
    },
  });

  assert.equal(
    suggestions.some((item) => item.includes("code74/dtxproxy")),
    true,
  );
});

test("parseIosPhysicalExecutionEvidenceMarkdown extracts startup fields and summary", () => {
  const parsed = diagnosticsToolInternals.parseIosPhysicalExecutionEvidenceMarkdown(
    [
      "# iOS physical tap execution evidence",
      "",
      "- attemptedBackend: local_manual_runner",
      "- executedBackend: maestro_cli",
      "- fallbackUsed: true",
      "- primaryFailurePhase: xctest_handshake",
      "- startupPhase: maestro_fallback_success",
      "- reasonCode: ADAPTER_ERROR",
      "",
      "## Summary",
      "Runner exited before channel bootstrap completed (code74 / dtxproxy XCTestManager handshake failure).",
      "",
    ].join("\n"),
  );

  assert.equal(parsed.attemptedBackend, "local_manual_runner");
  assert.equal(parsed.executedBackend, "maestro_cli");
  assert.equal(parsed.fallbackUsed, true);
  assert.equal(parsed.primaryFailurePhase, "xctest_handshake");
  assert.equal(parsed.startupPhase, "maestro_fallback_success");
  assert.equal(parsed.reasonCode, REASON_CODES.adapterError);
  assert.match(parsed.summaryLine ?? "", /dtxproxy/i);
});
