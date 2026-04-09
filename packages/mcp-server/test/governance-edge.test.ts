import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditedArtifactEntries,
  redactSensitiveText,
  type ArtifactGovernanceConfig,
} from "../../core/src/index.ts";

const governanceConfig: ArtifactGovernanceConfig = {
  retention: {
    "local-dev": {
      screenshots: "14d",
      "debug-output": "7d",
      reports: "30d",
    },
    ci: {
      screenshots: "3d",
      "debug-output": "2d",
      reports: "10d",
    },
  },
  redaction: {
    enabled: true,
    targets: ["token", "password", "phone-number"],
  },
};

test("redactSensitiveText returns empty string unchanged for empty input", () => {
  const result = redactSensitiveText("", governanceConfig);
  assert.equal(result, "");
});

test("buildAuditedArtifactEntries returns [] for empty input array", () => {
  const entries = buildAuditedArtifactEntries([], governanceConfig);
  assert.deepEqual(entries, []);
});
