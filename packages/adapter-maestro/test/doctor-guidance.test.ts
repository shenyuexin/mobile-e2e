import assert from "node:assert/strict";
import test from "node:test";
import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";
import { buildDoctorGuidance, buildDoctorNextSuggestions } from "../src/doctor-guidance.js";

test("buildDoctorNextSuggestions appends IDB install guidance when idb checks fail", () => {
  const checks: DoctorCheck[] = [
    { name: "node", status: "pass", detail: "v22.0.0" },
    { name: "idb", status: "fail", detail: "No idb CLI binary is configured." },
    { name: "idb companion", status: "fail", detail: "No idb_companion binary is configured." },
  ];

  const suggestions = buildDoctorNextSuggestions(checks);

  assert.equal(suggestions.some((item) => item.includes("Resolve idb:")), true);
  assert.equal(suggestions.some((item) => item.includes("pipx install fb-idb")), true);
  assert.equal(suggestions.some((item) => item.includes("brew install idb-companion")), true);
  assert.equal(suggestions.some((item) => item.includes("IDB_CLI_PATH")), true);
});

test("buildDoctorNextSuggestions keeps regular resolution hints when idb checks pass", () => {
  const checks: DoctorCheck[] = [
    { name: "idb", status: "pass", detail: "idb is available." },
    { name: "maestro", status: "warn", detail: "maestro not found" },
  ];

  const suggestions = buildDoctorNextSuggestions(checks);

  assert.equal(suggestions.some((item) => item.includes("Resolve maestro:")), true);
  assert.equal(suggestions.some((item) => item.includes("pipx install fb-idb")), false);
});

test("buildDoctorGuidance returns structured guidance for known dependencies", () => {
  const checks: DoctorCheck[] = [
    { name: "adb", status: "fail", detail: "adb not found" },
    { name: "trace_processor", status: "fail", detail: "trace_processor missing" },
    { name: "idb target visibility", status: "warn", detail: "target not visible" },
  ];

  const result = buildDoctorGuidance(checks);

  assert.equal(result.guidance.some((item) => item.dependency === "adb"), true);
  assert.equal(result.guidance.some((item) => item.dependency === "trace_processor"), true);
  assert.equal(result.guidance.some((item) => item.dependency === "idb"), false);
  assert.equal(result.nextSuggestions.some((item) => item.includes("Install adb")), true);
  assert.equal(result.nextSuggestions.some((item) => item.includes("Resolve idb target visibility")), true);
});
