import assert from "node:assert/strict";
import test from "node:test";
import { runDoctorWithMaestro } from "../src/doctor-runtime.js";

test("runDoctorWithMaestro returns structured result with all expected checks", async () => {
  const result = await runDoctorWithMaestro({});
  assert.ok(Array.isArray(result.data.checks));
  assert.ok(result.data.checks.length > 0);
  const checkNames = result.data.checks.map((c: any) => c.name);
  // Core checks (always present)
  assert.ok(checkNames.includes("node"));
  assert.ok(checkNames.includes("pnpm"));
  // Platform checks (always added by doctor-runtime.ts, may have fail status on CI)
  assert.ok(checkNames.includes("adb"));
  assert.ok(checkNames.includes("wda"));
  assert.ok(checkNames.includes("iproxy"));
  assert.ok(checkNames.includes("axe"));
});
