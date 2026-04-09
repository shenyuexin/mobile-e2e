import assert from "node:assert/strict";
import test from "node:test";
import { createAndroidUiRuntimeHooks } from "../src/ui-runtime-android.ts";

test("createAndroidUiRuntimeHooks builds adb input swipe command", () => {
  const hooks = createAndroidUiRuntimeHooks();
  const command = hooks.buildSwipeCommand("android-device-1", {
    start: { x: 10, y: 20 },
    end: { x: 30, y: 40 },
    durationMs: 250,
  });

  assert.deepEqual(command, [
    "adb",
    "-s",
    "android-device-1",
    "shell",
    "input",
    "swipe",
    "10",
    "20",
    "30",
    "40",
    "250",
  ]);
});
