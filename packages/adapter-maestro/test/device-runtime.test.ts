import assert from "node:assert/strict";
import test from "node:test";
import { isIosPhysicalDeviceId, mergeIosPhysicalDevices, parseIosDevicectlDevices, parseIosXctraceDevices } from "../src/device-runtime.ts";
import { createIosDeviceRuntimeHooks } from "../src/device-runtime-ios.ts";

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
