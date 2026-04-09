import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isIosPhysicalDeviceId } from "../src/device-runtime.ts";
import {
  buildIosLogLevelPredicate,
  extractIosSimulatorProcessId,
  extractIosPhysicalProcessId,
  extractIosPhysicalAppName,
  createIosDeviceRuntimeHooks,
  resolveIosAttachTarget,
  resolveIosPhysicalAttachTarget,
} from "../src/device-runtime-ios.ts";

async function installFakeXcrun(script: string): Promise<{ binDir: string; restore: () => void }> {
  const binDir = await mkdtemp(path.join(tmpdir(), "mobile-e2e-xcrun-"));
  const xcrunPath = path.join(binDir, "xcrun");
  await writeFile(xcrunPath, script, "utf8");
  await chmod(xcrunPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
  return {
    binDir,
    restore: () => {
      process.env.PATH = originalPath;
    },
  };
}

// ── buildIosLogLevelPredicate ───────────────────────────────────────────────

test("buildIosLogLevelPredicate returns undefined for undefined level", () => {
  const result = buildIosLogLevelPredicate(undefined);
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
  assert.equal(result.levelNote, undefined);
});

test("buildIosLogLevelPredicate returns fault predicate for F level", () => {
  const result = buildIosLogLevelPredicate("F");
  assert.equal(result.levelPredicate, "messageType == 'fault'");
  assert.equal(result.actualApplied, true);
  assert.equal(result.levelNote, undefined);
});

test("buildIosLogLevelPredicate returns error predicate for E level", () => {
  const result = buildIosLogLevelPredicate("E");
  assert.equal(result.levelPredicate, "messageType == 'error'");
  assert.equal(result.actualApplied, true);
});

test("buildIosLogLevelPredicate returns error+default predicate for W level", () => {
  const result = buildIosLogLevelPredicate("W");
  assert.equal(result.levelPredicate, "messageType == 'error' OR messageType == 'default'");
  assert.equal(result.actualApplied, true);
});

test("buildIosLogLevelPredicate returns no-filter note for I level", () => {
  const result = buildIosLogLevelPredicate("I");
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
  assert.ok(result.levelNote?.includes("I"));
});

test("buildIosLogLevelPredicate returns no-filter note for D level", () => {
  const result = buildIosLogLevelPredicate("D");
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
});

test("buildIosLogLevelPredicate returns no-filter note for V level", () => {
  const result = buildIosLogLevelPredicate("V");
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
});

// ── extractIosSimulatorProcessId ────────────────────────────────────────────

test("extractIosSimulatorProcessId extracts PID from launchctl output", () => {
  const output = `PID\tStatus\tLabel
12345\t0\tcom.example.app
67890\t0\tcom.other.service`;
  const result = extractIosSimulatorProcessId(output, "com.example.app");
  assert.equal(result, "12345");
});

test("extractIosSimulatorProcessId returns undefined for no match", () => {
  const output = `PID\tStatus\tLabel
67890\t0\tcom.other.service`;
  const result = extractIosSimulatorProcessId(output, "com.example.app");
  assert.equal(result, undefined);
});

// ── extractIosPhysicalProcessId ─────────────────────────────────────────────

test("extractIosPhysicalProcessId extracts PID from devicectl output", () => {
  const output = `10446   /private/var/containers/Bundle/Application/EBFE2B02-1B06-4743-9200-70D737C8A7B0/ExampleApp.app/ExampleApp
11452   /System/Library/CoreServices/SpringBoard.app/SpringBoard`;
  const result = extractIosPhysicalProcessId(output, "ExampleApp");
  assert.equal(result, "10446");
});

test("extractIosPhysicalProcessId returns undefined for no match", () => {
  const output = `11452   /System/Library/CoreServices/SpringBoard.app/SpringBoard`;
  const result = extractIosPhysicalProcessId(output, "ExampleApp");
  assert.equal(result, undefined);
});

test("extractIosPhysicalProcessId handles app names with special regex chars", () => {
  const output = `999   /var/containers/Bundle/Application/UUID/MyApp+Special.app/MyApp+Special`;
  const result = extractIosPhysicalProcessId(output, "MyApp+Special");
  assert.equal(result, "999");
});

// ── extractIosPhysicalAppName ───────────────────────────────────────────────

test("extractIosPhysicalAppName extracts app name from devicectl output", () => {
  const output = `Apps installed:
Name        Bundle Identifier       Version   Bundle Version
-------     ---------------------   -------   --------------
ExampleApp  com.example.app         1.0       1`;
  const result = extractIosPhysicalAppName(output, "com.example.app");
  assert.equal(result, "ExampleApp");
});

test("extractIosPhysicalAppName returns undefined for no match", () => {
  const output = `Apps installed:
Name        Bundle Identifier       Version   Bundle Version
-------     ---------------------   -------   --------------
OtherApp    com.other.app           2.0       2`;
  const result = extractIosPhysicalAppName(output, "com.example.app");
  assert.equal(result, undefined);
});

test("extractIosPhysicalAppName handles empty output", () => {
  const result = extractIosPhysicalAppName("", "com.example.app");
  assert.equal(result, undefined);
});

test("isIosPhysicalDeviceId distinguishes simulator UUIDs from real-device UDIDs", () => {
  assert.equal(isIosPhysicalDeviceId("00008101-000D482C1E78001E"), true);
  assert.equal(isIosPhysicalDeviceId("7FAAF425-69B6-49B6-8CC4-297FA9DAEA88"), false);
});

test("createIosDeviceRuntimeHooks uses devicectl launch for physical devices", () => {
  const hooks = createIosDeviceRuntimeHooks();
  const command = hooks.buildLaunchCommand({
    runnerProfile: "native_ios",
    deviceId: "00008101-000D482C1E78001E",
    appId: "com.mobitru.demoapp",
  });

  assert.deepEqual(command, [
    "xcrun",
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    "00008101-000D482C1E78001E",
    "--terminate-existing",
    "com.mobitru.demoapp",
  ]);
});

test("createIosDeviceRuntimeHooks keeps simctl launch for simulators", () => {
  const hooks = createIosDeviceRuntimeHooks();
  const command = hooks.buildLaunchCommand({
    runnerProfile: "native_ios",
    deviceId: "7FAAF425-69B6-49B6-8CC4-297FA9DAEA88",
    appId: "com.mobitru.demoapp",
  });

  assert.deepEqual(command, [
    "xcrun",
    "simctl",
    "launch",
    "7FAAF425-69B6-49B6-8CC4-297FA9DAEA88",
    "com.mobitru.demoapp",
  ]);
});

test("createIosDeviceRuntimeHooks uses devicectl install for physical devices", () => {
  const hooks = createIosDeviceRuntimeHooks();
  const command = hooks.buildInstallCommand({
    deviceId: "00008101-000D482C1E78001E",
    artifactPath: "/tmp/MobiTru.app",
  });

  assert.deepEqual(command, [
    "xcrun",
    "devicectl",
    "device",
    "install",
    "app",
    "--device",
    "00008101-000D482C1E78001E",
    "/tmp/MobiTru.app",
  ]);
});

test("createIosDeviceRuntimeHooks marks physical-device clear_data reset as partial unsupported", () => {
  const hooks = createIosDeviceRuntimeHooks();
  const plan = hooks.buildResetPlan({
    strategy: "clear_data",
    deviceId: "00008101-000D482C1E78001E",
    appId: "com.mobitru.demoapp",
  });

  assert.equal(plan.supportLevel, "partial");
  assert.equal(plan.commands.length, 0);
  assert.equal(
    plan.unsupportedReason,
    "iOS physical-device reset_app_state is not yet deterministic for clear_data/uninstall_reinstall/keychain_reset in this adapter path. Use app relaunch or reinstall workflow with signed tooling until a devicectl-backed reset contract is verified.",
  );
});

test("extractIosPhysicalAppName parses devicectl app listing by bundle id", () => {
  const appName = extractIosPhysicalAppName(`
Apps installed:
Name      Bundle Identifier     Version   Bundle Version
-------   -------------------   -------   --------------
Mobitru   com.mobitru.demoapp   1.0       1
`, "com.mobitru.demoapp");

  assert.equal(appName, "Mobitru");
});

test("extractIosPhysicalProcessId finds running app pid from devicectl process listing", () => {
  const pid = extractIosPhysicalProcessId(`
10446   /private/var/containers/Bundle/Application/EBFE2B02-1B06-4743-9200-70D737C8A7B0/Mobitru.app/Mobitru
11452   /System/Library/CoreServices/SpringBoard.app/SpringBoard
`, "Mobitru");

  assert.equal(pid, "10446");
});

test("resolveIosPhysicalAttachTarget resolves a real-device pid from devicectl listings", async () => {
  const fakeXcrun = await installFakeXcrun(`#!/bin/sh
set -eu
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "apps" ]; then
  printf '%s\n' 'Apps installed:' 'Name      Bundle Identifier     Version   Bundle Version' '-------   -------------------   -------   --------------' 'Mobitru   com.mobitru.demoapp   1.0       1'
  exit 0
fi
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "processes" ]; then
  printf '%s\n' '10446   /private/var/containers/Bundle/Application/EBFE2B02-1B06-4743-9200-70D737C8A7B0/Mobitru.app/Mobitru' '11452   /System/Library/CoreServices/SpringBoard.app/SpringBoard'
  exit 0
fi
exit 1
`);

  try {
    const pid = await resolveIosPhysicalAttachTarget(process.cwd(), "00008101-000D482C1E78001E", "com.mobitru.demoapp");
    assert.equal(pid, "10446");
  } finally {
    fakeXcrun.restore();
  }
});

test("resolveIosAttachTarget dispatches to the physical-device path", async () => {
  const fakeXcrun = await installFakeXcrun(`#!/bin/sh
set -eu
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "apps" ]; then
  printf '%s\n' 'Mobitru   com.mobitru.demoapp   1.0   1'
  exit 0
fi
if [ "$1" = "devicectl" ] && [ "$2" = "device" ] && [ "$3" = "info" ] && [ "$4" = "processes" ]; then
  printf '%s\n' '10446   /private/var/containers/Bundle/Application/UUID/Mobitru.app/Mobitru'
  exit 0
fi
exit 1
`);

  try {
    const pid = await resolveIosAttachTarget(process.cwd(), "00008101-000D482C1E78001E", "com.mobitru.demoapp");
    assert.equal(pid, "10446");
  } finally {
    fakeXcrun.restore();
  }
});

test("resolveIosAttachTarget keeps simulator attach discovery on simctl", async () => {
  const fakeXcrun = await installFakeXcrun(`#!/bin/sh
set -eu
if [ "$1" = "simctl" ] && [ "$2" = "spawn" ] && [ "$4" = "launchctl" ] && [ "$5" = "list" ]; then
  printf 'PID\tStatus\tLabel\n4242\t0\tcom.mobitru.demoapp\n'
  exit 0
fi
exit 1
`);

  try {
    const pid = await resolveIosAttachTarget(process.cwd(), "7FAAF425-69B6-49B6-8CC4-297FA9DAEA88", "com.mobitru.demoapp");
    assert.equal(pid, "4242");
  } finally {
    fakeXcrun.restore();
  }
});
