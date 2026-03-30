import assert from "node:assert/strict";
import test from "node:test";
import { recordingRuntimeInternals } from "../src/recording-runtime.ts";

test("parseAdbDeviceEntries parses adb devices output", () => {
  const parsed = recordingRuntimeInternals.parseAdbDeviceEntries([
    "List of devices attached",
    "emulator-5554\tdevice",
    "10AEA40Z3Y000R5\tdevice",
    "offline-device\toffline",
    "",
  ].join("\n"));

  assert.deepEqual(parsed, [
    { id: "emulator-5554", state: "device" },
    { id: "10AEA40Z3Y000R5", state: "device" },
    { id: "offline-device", state: "offline" },
  ]);
});

test("choosePreferredAndroidDeviceId prefers physical over emulator", () => {
  const selected = recordingRuntimeInternals.choosePreferredAndroidDeviceId([
    { id: "emulator-5554", state: "device" },
    { id: "10AEA40Z3Y000R5", state: "device" },
  ]);

  assert.equal(selected, "10AEA40Z3Y000R5");
});

test("choosePreferredAndroidDeviceId falls back to emulator when no physical device exists", () => {
  const selected = recordingRuntimeInternals.choosePreferredAndroidDeviceId([
    { id: "emulator-5554", state: "device" },
    { id: "emulator-5556", state: "device" },
  ]);

  assert.equal(selected, "emulator-5554");
});

test("choosePreferredAndroidDeviceId returns undefined with no online devices", () => {
  const selected = recordingRuntimeInternals.choosePreferredAndroidDeviceId([
    { id: "10AEA40Z3Y000R5", state: "offline" },
  ]);

  assert.equal(selected, undefined);
});

test("chooseNearestSnapshotRef prefers pre-action snapshot when available", () => {
  const selected = recordingRuntimeInternals.chooseNearestSnapshotRef(new Date(1773885602500).toISOString(), [
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml", capturedAtMs: 1773885601000 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885602600.xml", capturedAtMs: 1773885602600 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885604000.xml", capturedAtMs: 1773885604000 },
  ]);

  assert.equal(selected, "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml");
});

test("chooseNearestSnapshotRef falls back to earliest snapshot when no pre-action snapshot exists", () => {
  const selected = recordingRuntimeInternals.chooseNearestSnapshotRef(new Date(1773885600500).toISOString(), [
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml", capturedAtMs: 1773885601000 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885602600.xml", capturedAtMs: 1773885602600 },
  ]);

  assert.equal(selected, "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml");
});

test("mapMonotonicToIso anchors with capture start monotonic clock", () => {
  const timestamp = recordingRuntimeInternals.mapMonotonicToIso(
    "2026-03-19T10:00:00.000Z",
    1_100_000,
    1_000_000,
  );

  assert.equal(timestamp, "2026-03-19T10:01:40.000Z");
});

test("parseSnapshotCapturedAtMs extracts epoch millis from snapshot ref", () => {
  const parsed = recordingRuntimeInternals.parseSnapshotCapturedAtMs(
    "artifacts/record-snapshots/rec-1/rec-1-1773885602600.xml",
  );

  assert.equal(parsed, 1773885602600);
});

test("deriveViewportSizeFromXml extracts max viewport bounds", () => {
  const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.test" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]" />
</hierarchy>`;
  const viewport = recordingRuntimeInternals.deriveViewportSizeFromXml(xml);
  assert.deepEqual(viewport, { width: 1080, height: 2400 });
});

test("normalizeEventsToViewport scales raw-axis coordinates to viewport", () => {
  const normalized = recordingRuntimeInternals.normalizeEventsToViewport([
    {
      eventId: "e1",
      recordSessionId: "rec-1",
      timestamp: "2026-03-19T00:00:00.000Z",
      eventType: "tap",
      x: 10000,
      y: 20000,
      gesture: {
        kind: "tap",
        start: { x: 10000, y: 20000 },
        end: { x: 10000, y: 20000 },
        durationMs: 50,
      },
    },
  ], { width: 1080, height: 2400 });

  assert.equal(normalized[0]?.x, 1080);
  assert.equal(normalized[0]?.y, 2400);
  assert.equal(normalized[0]?.gesture?.start?.x, 1080);
  assert.equal(normalized[0]?.gesture?.start?.y, 2400);
});

test("parseRawInputEvents classifies tap with no motion as tap", () => {
  const raw = [
    "[   100.000000] /dev/input/event6: EV_KEY       BTN_TOUCH            DOWN",
    "[   100.000000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_X    00000200",
    "[   100.000000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_Y    00000400",
    "[   100.050000] /dev/input/event6: EV_KEY       BTN_TOUCH            UP",
  ].join("\n");

  const parsed = recordingRuntimeInternals.parseRawInputEvents(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.type, "tap");
});

test("parseRawInputEvents classifies sustained drag as swipe", () => {
  const raw = [
    "[   100.000000] /dev/input/event6: EV_KEY       BTN_TOUCH            DOWN",
    "[   100.000000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_X    00000200",
    "[   100.000000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_Y    00000400",
    "[   100.010000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_X    00000800",
    "[   100.010000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_Y    00001000",
    "[   100.020000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_X    00000a00",
    "[   100.020000] /dev/input/event6: EV_ABS       ABS_MT_POSITION_Y    00001200",
    "[   100.100000] /dev/input/event6: EV_KEY       BTN_TOUCH            UP",
  ].join("\n");

  const parsed = recordingRuntimeInternals.parseRawInputEvents(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.type, "swipe");
});

test("parseRawInputEvents maps Shift+2 to @ for keyboard input", () => {
  const raw = [
    "[   100.000000] /dev/input/event12: EV_KEY       KEY_LEFTSHIFT        DOWN",
    "[   100.000000] /dev/input/event12: EV_SYN       SYN_REPORT           00000000",
    "[   100.010000] /dev/input/event12: EV_KEY       KEY_2                DOWN",
    "[   100.010000] /dev/input/event12: EV_SYN       SYN_REPORT           00000000",
    "[   100.015000] /dev/input/event12: EV_KEY       KEY_2                UP",
    "[   100.015000] /dev/input/event12: EV_SYN       SYN_REPORT           00000000",
    "[   100.020000] /dev/input/event12: EV_KEY       KEY_LEFTSHIFT        UP",
    "[   100.020000] /dev/input/event12: EV_SYN       SYN_REPORT           00000000",
  ].join("\n");

  const parsed = recordingRuntimeInternals.parseRawInputEvents(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.type, "type");
  assert.equal(parsed[0]?.textDelta, "@");
});

test("parseRawInputEvents maps ABS_MT_TRACKING_ID touch sequence to tap", () => {
  const raw = [
    "[   100.000000] /dev/input/event1: EV_ABS       ABS_MT_TRACKING_ID   00000000",
    "[   100.000000] /dev/input/event1: EV_ABS       ABS_MT_POSITION_X    00000400",
    "[   100.000000] /dev/input/event1: EV_ABS       ABS_MT_POSITION_Y    00000800",
    "[   100.010000] /dev/input/event1: EV_SYN       SYN_REPORT           00000000",
    "[   100.050000] /dev/input/event1: EV_ABS       ABS_MT_TRACKING_ID   ffffffff",
    "[   100.050000] /dev/input/event1: EV_SYN       SYN_REPORT           00000000",
  ].join("\n");

  const parsed = recordingRuntimeInternals.parseRawInputEvents(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.type, "tap");
  assert.equal(parsed[0]?.x, 0x400);
  assert.equal(parsed[0]?.y, 0x800);
});

test("parseSimctlDeviceEntries parses simctl devices json", () => {
  const parsed = recordingRuntimeInternals.parseSimctlDeviceEntries(JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-17-5": [
        { udid: "A", state: "Shutdown", isAvailable: true },
        { udid: "B", state: "Booted", isAvailable: true },
      ],
    },
  }));

  assert.deepEqual(parsed, [
    { udid: "A", state: "Shutdown", isAvailable: true },
    { udid: "B", state: "Booted", isAvailable: true },
  ]);
});

test("choosePreferredIosDeviceId prefers requested then booted", () => {
  const entries = [
    { udid: "A", state: "Shutdown", isAvailable: true },
    { udid: "B", state: "Booted", isAvailable: true },
  ];
  assert.equal(recordingRuntimeInternals.choosePreferredIosDeviceId(entries, "A"), "A");
  assert.equal(recordingRuntimeInternals.choosePreferredIosDeviceId(entries), "B");
});

test("parseIosRawInputEvents extracts tap, type, and swipe", () => {
  const raw = [
    "2026-03-20 10:00:00.000 touch at (120, 300)",
    "2026-03-20 10:00:00.050 keyboard insert='hello@example.com'",
    "2026-03-20 10:00:00.090 swipe from (120,300) to (120,120)",
  ].join("\n");

  const parsed = recordingRuntimeInternals.parseIosRawInputEvents(raw);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]?.type, "tap");
  assert.equal(parsed[1]?.type, "type");
  assert.equal(parsed[1]?.textDelta, "hello@example.com");
  assert.equal(parsed[2]?.type, "swipe");
});

test("resolveSelectorAtPoint prefers iOS identifier-backed actionable node over smaller text child", () => {
  const snapshot = JSON.stringify([
    {
      type: "Button",
      identifier: "login-submit-button",
      AXLabel: "Continue",
      frame: { x: 40, y: 300, width: 240, height: 80 },
      children: [
        {
          type: "StaticText",
          name: "Continue",
          AXLabel: "Continue",
          frame: { x: 110, y: 330, width: 80, height: 20 },
        },
      ],
    },
  ]);

  const selector = recordingRuntimeInternals.resolveSelectorAtPoint(snapshot, 120, 340);
  assert.equal(selector?.identifier, "login-submit-button");
  assert.equal(selector?.text, "Continue");
});

test("mapRecordedEventTimestamp preserves wall-clock iOS timestamps", () => {
  const timestamp = recordingRuntimeInternals.mapRecordedEventTimestamp(
    "ios",
    "2026-03-19T10:00:00.000Z",
    Date.parse("2026-03-20T10:00:00.050Z"),
    1_000_000,
  );

  assert.equal(timestamp, "2026-03-20T10:00:00.050Z");
});

test("chooseNearestSnapshotRef keeps later iOS pre-action snapshot when timestamp is wall-clock", () => {
  const mappedTimestamp = recordingRuntimeInternals.mapRecordedEventTimestamp(
    "ios",
    "2026-03-19T10:00:00.000Z",
    Date.parse("2026-03-20T10:00:00.250Z"),
    1_000_000,
  );
  const selected = recordingRuntimeInternals.chooseNearestSnapshotRef(mappedTimestamp, [
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1774000800100.json", capturedAtMs: 1774000800100 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1774000800200.json", capturedAtMs: 1774000800200 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1774000800400.json", capturedAtMs: 1774000800400 },
  ]);

  assert.equal(selected, "artifacts/record-snapshots/rec-1/rec-1-1774000800200.json");
});
