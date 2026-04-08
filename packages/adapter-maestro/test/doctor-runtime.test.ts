import assert from "node:assert/strict";
import test from "node:test";
import { runDoctorWithMaestro } from "../src/doctor-runtime.js";

test("runDoctorWithMaestro returns structured result with checks array", async () => {
  const result = await runDoctorWithMaestro({});
  assert.ok(Array.isArray(result.data.checks));
  assert.ok(result.data.checks.length > 0);
  // Verify key checks are present
  const checkNames = result.data.checks.map((c: any) => c.name);
  assert.ok(checkNames.includes("node"));
  assert.ok(checkNames.includes("pnpm"));
  assert.ok(checkNames.includes("adb"));
});

test("runDoctorWithMaestro includes wda check", async () => {
  const result = await runDoctorWithMaestro({});
  const checkNames = result.data.checks.map((c: any) => c.name);
  assert.ok(checkNames.includes("wda"));
});

test("runDoctorWithMaestro includes iproxy check", async () => {
  const result = await runDoctorWithMaestro({});
  const checkNames = result.data.checks.map((c: any) => c.name);
  assert.ok(checkNames.includes("iproxy"));
});

test("runDoctorWithMaestro includes axe check", async () => {
  const result = await runDoctorWithMaestro({});
  const checkNames = result.data.checks.map((c: any) => c.name);
  assert.ok(checkNames.includes("axe"));
});
