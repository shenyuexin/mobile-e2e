import assert from "node:assert/strict";
import test from "node:test";
import { runDoctorWithMaestro } from "../src/doctor-runtime.js";

test("runDoctorWithMaestro returns structured result", async () => {
  const result = await runDoctorWithMaestro({});
  assert.ok(Array.isArray(result.data.checks));
  assert.ok(result.data.checks.length > 0);
  // Verify core checks are always present regardless of platform
  const checkNames = result.data.checks.map((c: any) => c.name);
  assert.ok(checkNames.includes("node"));
  assert.ok(checkNames.includes("pnpm"));
});

test("runDoctorWithMaestro includes platform checks on macOS", async () => {
  const result = await runDoctorWithMaestro({});
  const checkNames = result.data.checks.map((c: any) => c.name);
  // These checks are always added by doctor-runtime.ts, even on Linux/CI
  // (they will have fail status but the check entry exists)
  assert.ok(checkNames.includes("adb"));
  assert.ok(checkNames.includes("wda"));
  assert.ok(checkNames.includes("iproxy"));
  assert.ok(checkNames.includes("axe"));
});
