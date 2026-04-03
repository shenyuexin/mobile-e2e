import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isIosPhysicalDeviceId, mergeIosPhysicalDevices, parseIosDevicectlDevices, parseIosXctraceDevices } from "../src/device-runtime.ts";
import { createIosDeviceRuntimeHooks, extractIosPhysicalAppName, extractIosPhysicalProcessId, resolveIosAttachTarget, resolveIosPhysicalAttachTarget } from "../src/device-runtime-ios.ts";

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

test("parseIosXctraceDevices extracts available physical iOS devices from xctrace output", () => {
  const devices = parseIosXctraceDevices(`
== Devices ==
Aiden's Mac (F6CA5073-4841-5F64-A56B-77F35FF51840)

== Devices ==
yx’s iPhone12  (26.4) (00008101-000D482C1E78001E)

== Simulators ==
iPhone 16 Plus Simulator (18.5) (ADA078B9-3C6B-4875-8B85-A7789F368816)
`, false);

  assert.deepEqual(devices, [
    {
      id: "00008101-000D482C1E78001E",
      name: "yx’s iPhone12",
      platform: "ios",
      state: "Connected",
      available: true,
    },
  ]);
});

test("parseIosXctraceDevices keeps offline devices only when includeUnavailable is true", () => {
  const offlineOnly = `
== Devices Offline ==
yx’s iPhone12  (26.4) (00008101-000D482C1E78001E)
`;

  assert.deepEqual(parseIosXctraceDevices(offlineOnly, false), []);
  assert.deepEqual(parseIosXctraceDevices(offlineOnly, true), [
    {
      id: "00008101-000D482C1E78001E",
      name: "yx’s iPhone12",
      platform: "ios",
      state: "Offline",
      available: false,
    },
  ]);
});

test("parseIosDevicectlDevices extracts paired physical iOS devices", () => {
  const devices = parseIosDevicectlDevices(`
Name             Hostname                        Identifier                             State                Model
--------------   -----------------------------   ------------------------------------   ------------------   ----------------------------------------------
yx’s iPhone12    yxs-iPhone12.coredevice.local   EE6F1C34-3C04-5E27-9E47-28D37301C8F9   available (paired)   iPhone 12 Pro Max (iPhone13,4)
李楠的iPad          linandeiPad.coredevice.local    033D6DD7-F4FC-5A74-A96C-3DAD43892404   unavailable          iPad Pro (11-inch) (3rd generation) (iPad13,4)
`, false);

  assert.deepEqual(devices, [
    {
      id: "EE6F1C34-3C04-5E27-9E47-28D37301C8F9",
      name: "yx’s iPhone12",
      platform: "ios",
      state: "Connected",
      available: true,
    },
  ]);
});

test("mergeIosPhysicalDevices prefers xctrace UDID but upgrades availability from devicectl", () => {
  const merged = mergeIosPhysicalDevices(
    [{ id: "00008101-000D482C1E78001E", name: "yx’s iPhone12", platform: "ios", state: "Offline", available: false }],
    [{ id: "EE6F1C34-3C04-5E27-9E47-28D37301C8F9", name: "yx’s iPhone12", platform: "ios", state: "Connected", available: true }],
    false,
  );

  assert.deepEqual(merged, [
    {
      id: "00008101-000D482C1E78001E",
      name: "yx’s iPhone12",
      platform: "ios",
      state: "Connected",
      available: true,
    },
  ]);
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
