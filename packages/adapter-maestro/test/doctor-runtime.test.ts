import assert from "node:assert/strict";
import test from "node:test";
import { runDoctorWithMaestro } from "../src/doctor-runtime.js";

test("runDoctorWithMaestro returns structured result with checks array", async () => {
  const result = await runDoctorWithMaestro({});
  assert.ok(Array.isArray(result.data.checks));
  assert.ok(result.data.checks.length > 0);
});

test("runDoctorWithMaestro each check has valid status enum value and non-empty detail", async () => {
  const result = await runDoctorWithMaestro({});
  const validStatuses = new Set(["pass", "fail", "warn", "skip"]);
  for (const check of result.data.checks) {
    assert.ok(validStatuses.has(check.status), `Check "${check.name}" has invalid status: ${check.status}`);
    assert.ok(typeof check.detail === "string", `Check "${check.name}" detail is not a string`);
    assert.ok(check.detail.length > 0, `Check "${check.name}" has empty detail`);
  }
});

test("runDoctorWithMaestro result has expected top-level fields", async () => {
  const result = await runDoctorWithMaestro({});
  // Status varies by environment: "success" (all tools available), "partial" (some missing), or "failed" (most missing, e.g. CI)
  assert.ok(["success", "partial", "failed"].includes(result.status), `Unexpected status: ${result.status}`);
  assert.ok(result.data);
  assert.ok(Array.isArray(result.data.checks));
  // platform field may be undefined in some environments
  assert.ok(result.data.platform === undefined || typeof result.data.platform === "string");
});
