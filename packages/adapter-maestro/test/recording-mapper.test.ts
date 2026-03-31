import assert from "node:assert/strict";
import test from "node:test";
import type { RawRecordedEvent } from "@mobile-e2e-mcp/contracts";
import { mapRawEventsToRecordedSteps, renderRecordedStepsAsFlow } from "../src/recording-mapper.ts";

function buildEvent(overrides: Partial<RawRecordedEvent>): RawRecordedEvent {
  const base: RawRecordedEvent = {
    eventId: overrides.eventId ?? "event-1",
    recordSessionId: overrides.recordSessionId ?? "rec-1",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    eventType: overrides.eventType ?? "tap",
    x: overrides.x,
    y: overrides.y,
    textDelta: overrides.textDelta,
    foregroundApp: overrides.foregroundApp,
    uiSnapshotRef: overrides.uiSnapshotRef,
    rawLine: overrides.rawLine,
  };
  (base as RawRecordedEvent & { eventMonotonicMs?: number }).eventMonotonicMs = (overrides as RawRecordedEvent & { eventMonotonicMs?: number }).eventMonotonicMs;
  (base as RawRecordedEvent & { normalizedPoint?: { x: number; y: number } }).normalizedPoint = (overrides as RawRecordedEvent & { normalizedPoint?: { x: number; y: number } }).normalizedPoint;
  (base as RawRecordedEvent & { gesture?: { kind: "tap" | "swipe"; start?: { x: number; y: number }; end?: { x: number; y: number }; durationMs?: number } }).gesture = (overrides as RawRecordedEvent & { gesture?: { kind: "tap" | "swipe"; start?: { x: number; y: number }; end?: { x: number; y: number }; durationMs?: number } }).gesture;
  (base as RawRecordedEvent & { resolvedSelector?: { identifier?: string; resourceId?: string; text?: string; value?: string; contentDesc?: string; className?: string } }).resolvedSelector = (overrides as RawRecordedEvent & { resolvedSelector?: { identifier?: string; resourceId?: string; text?: string; value?: string; contentDesc?: string; className?: string } }).resolvedSelector;
  return base;
}

test("mapRawEventsToRecordedSteps maps tap to tap_element with resolved selector and auto wait", () => {
  const result = mapRawEventsToRecordedSteps("rec-1", [
    buildEvent({
      eventId: "tap-1",
      eventType: "tap",
      x: 100,
      y: 200,
      resolvedSelector: { resourceId: "com.epam.mobitru:id/login_email" },
    } as Partial<RawRecordedEvent>),
  ]);

  assert.equal(result.steps[0]?.actionType, "tap_element");
  assert.equal(result.steps[0]?.actionIntent?.actionType, "tap_element");
  assert.equal(result.steps[1]?.actionType, "wait_for_ui");
});

test("mapRawEventsToRecordedSteps maps type to type_into_element", () => {
  const result = mapRawEventsToRecordedSteps("rec-2", [
    buildEvent({ eventId: "type-1", eventType: "type", textDelta: "demo@example.com", uiSnapshotRef: "Email" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "type_into_element");
  assert.equal(result.steps[0]?.actionIntent?.value, "demo@example.com");
});

test("renderRecordedStepsAsFlow exports iOS identifier selectors", () => {
  const mapped = mapRawEventsToRecordedSteps("rec-ios-identifier", [
    buildEvent({
      eventId: "tap-ios-1",
      eventType: "tap",
      x: 120,
      y: 300,
      resolvedSelector: {
        identifier: "login-email-input",
      },
    }),
  ], { includeAutoWaitStep: false });

  const rendered = renderRecordedStepsAsFlow({
    appId: "com.example.ios",
    includeLaunchStep: false,
    steps: mapped.steps,
  });

  assert.equal(rendered.yaml.includes("identifier: \"login-email-input\""), true);
});

test("mapRawEventsToRecordedSteps keeps identifier on auto wait after identifier-backed tap", () => {
  const result = mapRawEventsToRecordedSteps("rec-ios-auto-wait-identifier", [
    buildEvent({
      eventId: "tap-ios-identifier",
      eventType: "tap",
      x: 120,
      y: 300,
      resolvedSelector: {
        identifier: "login-email-input",
      },
    }),
  ]);

  assert.equal(result.steps[0]?.actionType, "tap_element");
  assert.equal(result.steps[1]?.actionType, "wait_for_ui");
  assert.equal((result.steps[1]?.actionIntent as { identifier?: string } | undefined)?.identifier, "login-email-input");
});

test("mapRawEventsToRecordedSteps keeps identifier-backed iOS tap as tap_element", () => {
  const result = mapRawEventsToRecordedSteps("rec-ios-promoted-selector", [
    buildEvent({
      eventId: "tap-ios-promoted",
      eventType: "tap",
      x: 120,
      y: 340,
      resolvedSelector: {
        identifier: "login-submit-button",
        text: "Continue",
      },
    }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps[0]?.actionType, "tap_element");
  assert.equal((result.steps[0]?.actionIntent as { identifier?: string } | undefined)?.identifier, "login-submit-button");
  assert.notEqual(result.steps[0]?.actionType, "tap");
});

test("mapRawEventsToRecordedSteps rejects snapshot-path selector and falls back to coordinate tap", () => {
  const result = mapRawEventsToRecordedSteps("rec-selector-reject", [
    buildEvent({
      eventId: "tap-bad-selector",
      eventType: "tap",
      x: 120,
      y: 220,
      resolvedSelector: { text: "artifacts/record-snapshots/rec-1-end.xml" },
    } as Partial<RawRecordedEvent>),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "tap");
});

test("renderRecordedStepsAsFlow never emits snapshot-path selectors", () => {
  const rendered = renderRecordedStepsAsFlow({
    appId: "com.example.app",
    includeLaunchStep: false,
    steps: [
      {
        stepNumber: 1,
        eventId: "bad-selector-step",
        timestamp: new Date().toISOString(),
        actionType: "tap_element",
        actionIntent: {
          actionType: "tap_element",
          text: "artifacts/record-snapshots/rec-1-end.xml",
        },
        confidence: "low",
        reason: "invalid selector test",
      },
    ],
  });

  assert.equal(rendered.yaml.includes("artifacts/record-snapshots/"), false);
  assert.equal(rendered.warnings.length > 0, true);
});

test("mapRawEventsToRecordedSteps maps swipe event", () => {
  const result = mapRawEventsToRecordedSteps("rec-swipe", [
    buildEvent({
      eventId: "swipe-1",
      eventType: "swipe",
      x: 540,
      y: 1800,
      gesture: {
        kind: "swipe",
        start: { x: 540, y: 1800 },
        end: { x: 540, y: 600 },
        durationMs: 300,
      },
    } as Partial<RawRecordedEvent>),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "swipe");
});

test("mapRawEventsToRecordedSteps degrades text-only tap selector to coordinate tap", () => {
  const result = mapRawEventsToRecordedSteps("rec-text-only-tap", [
    buildEvent({
      eventId: "text-only",
      eventType: "tap",
      x: 320,
      y: 640,
      resolvedSelector: {
        text: "Mobitru",
      },
    }),
  ]);

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "tap");
});

test("mapRawEventsToRecordedSteps degrades container tap selector to coordinate tap", () => {
  const result = mapRawEventsToRecordedSteps("rec-container-tap", [
    buildEvent({
      eventId: "container-tap",
      eventType: "tap",
      x: 320,
      y: 640,
      resolvedSelector: {
        resourceId: "android:id/content",
      },
    }),
  ]);

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "tap");
});

test("mapRawEventsToRecordedSteps does not auto-insert wait_for_ui for coordinate fallback tap", () => {
  const result = mapRawEventsToRecordedSteps("rec-fallback-tap", [
    buildEvent({
      eventId: "tap-fallback",
      eventType: "tap",
      x: 88,
      y: 166,
    }),
  ]);

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "tap");
});

test("mapRawEventsToRecordedSteps does not auto-insert wait_for_ui for swipe", () => {
  const result = mapRawEventsToRecordedSteps("rec-swipe-no-autowait", [
    buildEvent({
      eventId: "swipe-no-autowait",
      eventType: "swipe",
      x: 520,
      y: 1700,
      gesture: {
        kind: "swipe",
        start: { x: 520, y: 1700 },
        end: { x: 520, y: 900 },
        durationMs: 280,
      },
    } as Partial<RawRecordedEvent>),
  ]);

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "swipe");
});

test("renderRecordedStepsAsFlow exports swipe with start/end/duration", () => {
  const rendered = renderRecordedStepsAsFlow({
    appId: "com.example.app",
    includeLaunchStep: false,
    steps: [
      {
        stepNumber: 1,
        eventId: "swipe-flow-1",
        timestamp: new Date().toISOString(),
        actionType: "swipe",
        actionIntent: {
          actionType: "swipe",
          startX: 540,
          startY: 1800,
          endX: 540,
          endY: 600,
          durationMs: 300,
        },
        confidence: "medium",
        reason: "swipe export format",
      },
    ],
  });

  assert.equal(rendered.yaml.includes("- swipe:"), true);
  assert.equal(rendered.yaml.includes("start: \"540,1800\""), true);
  assert.equal(rendered.yaml.includes("end: \"540,600\""), true);
  assert.equal(rendered.yaml.includes("duration: 300"), true);
});

test("mapRawEventsToRecordedSteps maps app switch to launch_app", () => {
  const result = mapRawEventsToRecordedSteps("rec-3", [
    buildEvent({ eventId: "switch-1", eventType: "app_switch", foregroundApp: "com.example.app" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "launch_app");
  assert.equal(result.steps[0]?.actionIntent?.appId, "com.example.app");
});

test("mapRawEventsToRecordedSteps degrades tap without coordinates", () => {
  const result = mapRawEventsToRecordedSteps("rec-4", [
    buildEvent({ eventId: "tap-no-xy", eventType: "tap" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "tap");
  assert.equal(result.steps[0]?.confidence, "low");
});

test("mapRawEventsToRecordedSteps maps back to wait_for_ui", () => {
  const result = mapRawEventsToRecordedSteps("rec-5", [
    buildEvent({ eventId: "back-1", eventType: "back", uiSnapshotRef: "Catalog" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "wait_for_ui");
});

test("mapRawEventsToRecordedSteps splits keyboard chunks on tab delimiter", () => {
  const result = mapRawEventsToRecordedSteps("rec-keyboard-tab", [
    buildEvent({ eventId: "type-1", timestamp: "2026-03-19T10:00:00.000Z", eventType: "type", textDelta: "a" }),
    buildEvent({ eventId: "type-2", timestamp: "2026-03-19T10:00:00.100Z", eventType: "type", textDelta: "b" }),
    buildEvent({ eventId: "type-tab", timestamp: "2026-03-19T10:00:00.200Z", eventType: "type", textDelta: "\t" }),
    buildEvent({ eventId: "type-3", timestamp: "2026-03-19T10:00:00.300Z", eventType: "type", textDelta: "c" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0]?.actionType, "type_into_element");
  assert.equal(result.steps[0]?.actionIntent?.value, "ab");
  assert.equal(result.steps[1]?.actionType, "type_into_element");
  assert.equal(result.steps[1]?.actionIntent?.value, "c");
});

test("mapRawEventsToRecordedSteps splits keyboard chunks on enter delimiter", () => {
  const result = mapRawEventsToRecordedSteps("rec-keyboard-enter", [
    buildEvent({ eventId: "type-1", timestamp: "2026-03-19T10:00:00.000Z", eventType: "type", textDelta: "p" }),
    buildEvent({ eventId: "type-2", timestamp: "2026-03-19T10:00:00.100Z", eventType: "type", textDelta: "w" }),
    buildEvent({ eventId: "type-enter", timestamp: "2026-03-19T10:00:00.200Z", eventType: "type", textDelta: "\n" }),
    buildEvent({ eventId: "type-3", timestamp: "2026-03-19T10:00:00.300Z", eventType: "type", textDelta: "x" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0]?.actionIntent?.value, "pw");
  assert.equal(result.steps[1]?.actionIntent?.value, "x");
});

test("mapRawEventsToRecordedSteps splits keyboard chunks by timestamp gap", () => {
  const result = mapRawEventsToRecordedSteps("rec-keyboard-gap", [
    buildEvent({ eventId: "type-1", timestamp: "2026-03-19T10:00:00.000Z", eventType: "type", textDelta: "a" }),
    buildEvent({ eventId: "type-2", timestamp: "2026-03-19T10:00:00.200Z", eventType: "type", textDelta: "b" }),
    buildEvent({ eventId: "type-3", timestamp: "2026-03-19T10:00:02.500Z", eventType: "type", textDelta: "c" }),
    buildEvent({ eventId: "type-4", timestamp: "2026-03-19T10:00:02.700Z", eventType: "type", textDelta: "d" }),
  ], { includeAutoWaitStep: false, typeChunkGapMs: 1200 });

  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0]?.actionIntent?.value, "ab");
  assert.equal(result.steps[1]?.actionIntent?.value, "cd");
});

test("mapRawEventsToRecordedSteps carries selector only from input-like tap targets", () => {
  const result = mapRawEventsToRecordedSteps("rec-input-carry", [
    buildEvent({
      eventId: "tap-input",
      timestamp: "2026-03-19T10:00:00.000Z",
      eventType: "tap",
      x: 120,
      y: 300,
      resolvedSelector: { identifier: "login-email-input", className: "TextField", text: "Email" },
    }),
    buildEvent({
      eventId: "type-after-input",
      timestamp: "2026-03-19T10:00:00.100Z",
      eventType: "type",
      textDelta: "demo@example.com",
    }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps[1]?.actionType, "type_into_element");
  assert.equal((result.steps[1]?.actionIntent as { identifier?: string } | undefined)?.identifier, "login-email-input");
});

test("mapRawEventsToRecordedSteps does not carry selector from button tap into later type event", () => {
  const result = mapRawEventsToRecordedSteps("rec-no-button-carry", [
    buildEvent({
      eventId: "tap-button",
      timestamp: "2026-03-19T10:00:00.000Z",
      eventType: "tap",
      x: 120,
      y: 300,
      resolvedSelector: { identifier: "login-submit-button", className: "Button", text: "Continue" },
    }),
    buildEvent({
      eventId: "type-after-button",
      timestamp: "2026-03-19T10:00:00.100Z",
      eventType: "type",
      textDelta: "demo@example.com",
    }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps[1]?.actionType, "type_into_element");
  assert.equal((result.steps[1]?.actionIntent as { identifier?: string } | undefined)?.identifier, undefined);
  assert.equal(result.steps[1]?.confidence, "low");
});

test("mapRawEventsToRecordedSteps clears prior input target after non-input tap", () => {
  const result = mapRawEventsToRecordedSteps("rec-clear-input-carry", [
    buildEvent({
      eventId: "tap-input",
      timestamp: "2026-03-19T10:00:00.000Z",
      eventType: "tap",
      x: 120,
      y: 300,
      resolvedSelector: { identifier: "login-email-input", className: "TextField", text: "Email" },
    }),
    buildEvent({
      eventId: "tap-button",
      timestamp: "2026-03-19T10:00:00.050Z",
      eventType: "tap",
      x: 180,
      y: 360,
      resolvedSelector: { identifier: "login-submit-button", className: "Button", text: "Continue" },
    }),
    buildEvent({
      eventId: "type-after-button",
      timestamp: "2026-03-19T10:00:00.100Z",
      eventType: "type",
      textDelta: "demo@example.com",
    }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps[2]?.actionType, "type_into_element");
  assert.equal((result.steps[2]?.actionIntent as { identifier?: string } | undefined)?.identifier, undefined);
});

test("renderRecordedStepsAsFlow escapes backslash content in inputText", () => {
  const rendered = renderRecordedStepsAsFlow({
    appId: "com.example.app",
    includeLaunchStep: false,
    steps: [
      {
        stepNumber: 1,
        eventId: "type-escape-1",
        timestamp: new Date().toISOString(),
        actionType: "type_into_element",
        actionIntent: {
          actionType: "type_into_element",
          value: "a\\134n\"b",
          identifier: "email-input",
        },
        confidence: "medium",
        reason: "escape coverage",
      },
    ],
  });

  assert.equal(rendered.yaml.includes('identifier: "email-input"'), true);
  assert.equal(rendered.yaml.includes('- inputText: "a\\\\134n\\"b"'), true);
});

test("renderRecordedStepsAsFlow skips system keyboard descriptor payloads", () => {
  const rendered = renderRecordedStepsAsFlow({
    appId: "com.example.app",
    includeLaunchStep: false,
    steps: [
      {
        stepNumber: 1,
        eventId: "type-system-descriptor-1",
        timestamp: new Date().toISOString(),
        actionType: "type_into_element",
        actionIntent: {
          actionType: "type_into_element",
          value: "<BKSHIDKeyboardDevice: 0x60000056b5a0> {\\134n    senderID: 0xACEFADE00000003;\\134n    transport: <nil>;\\134n    layout: US;\\134n    standardType: 4294967295;\\134n}",
          identifier: "password-input",
        },
        confidence: "low",
        reason: "filter system payload",
      },
    ],
  });

  assert.equal(rendered.yaml.includes("inputText:"), false);
  assert.equal(rendered.yaml.includes('identifier: "password-input"'), true);
  assert.equal(rendered.warnings.some((warning) => warning.includes("dropped non-user keyboard descriptor payload")), true);
});

test("renderRecordedStepsAsFlow keeps normal text containing sender keywords", () => {
  const rendered = renderRecordedStepsAsFlow({
    appId: "com.example.app",
    includeLaunchStep: false,
    steps: [
      {
        stepNumber: 1,
        eventId: "type-normal-keywords-1",
        timestamp: new Date().toISOString(),
        actionType: "type_into_element",
        actionIntent: {
          actionType: "type_into_element",
          value: "senderID: test transport: custom payload",
          identifier: "notes-input",
        },
        confidence: "medium",
        reason: "avoid over-filtering",
      },
    ],
  });

  assert.equal(rendered.yaml.includes('identifier: "notes-input"'), true);
  assert.equal(rendered.yaml.includes('inputText: "senderID: test transport: custom payload"'), true);
});
