import assert from "node:assert/strict";
import test from "node:test";
import { detectInterruptionFromSummary } from "../src/interruption-detector.ts";

test("detectInterruptionFromSummary identifies permission interruption signals", () => {
  const result = detectInterruptionFromSummary({
    platform: "android",
    stateSummary: {
      appPhase: "blocked",
      readiness: "interrupted",
      blockingSignals: ["permission_prompt"],
      topVisibleTexts: ["Allow", "While using the app"],
    },
    uiSummary: {
      totalNodes: 3,
      clickableNodes: 2,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        {
          text: "Allow",
          className: "android.widget.Button",
          packageName: "com.android.permissioncontroller",
          clickable: true,
          enabled: true,
          scrollable: false,
        },
      ],
    },
  });

  assert.equal(result.detected, true);
  assert.equal(result.classification.type, "permission_prompt");
  assert.equal(result.signals.some((signal) => signal.key === "owner_package"), true);
});

test("detectInterruptionFromSummary infers iOS springboard owner for system alert text", () => {
  const result = detectInterruptionFromSummary({
    platform: "ios",
    stateSummary: {
      appPhase: "blocked",
      readiness: "interrupted",
      blockingSignals: ["dialog_actions"],
      topVisibleTexts: ["Save Password", "Not Now"],
    },
    uiSummary: {
      totalNodes: 2,
      clickableNodes: 1,
      scrollableNodes: 0,
      nodesWithText: 2,
      nodesWithContentDesc: 0,
      sampleNodes: [
        {
          text: "Save Password",
          className: "XCUIElementTypeAlert",
          clickable: false,
          enabled: true,
          scrollable: false,
        },
      ],
    },
  });

  assert.equal(result.classification.type, "system_alert");
  assert.equal(result.signals.some((signal) => signal.key === "owner_bundle" && signal.value === "com.apple.springboard"), true);
});

test("detectInterruptionFromSummary does not flag normal app owner package as interruption", () => {
  const result = detectInterruptionFromSummary({
    platform: "android",
    stateSummary: {
      appPhase: "authentication",
      readiness: "ready",
      blockingSignals: [],
      topVisibleTexts: ["Login", "Password", "Sign in"],
    },
    uiSummary: {
      totalNodes: 3,
      clickableNodes: 1,
      scrollableNodes: 0,
      nodesWithText: 3,
      nodesWithContentDesc: 0,
      sampleNodes: [
        {
          text: "Sign in",
          className: "android.widget.Button",
          packageName: "com.epam.mobitru",
          clickable: true,
          enabled: true,
          scrollable: false,
        },
      ],
    },
  });

  assert.equal(result.detected, false);
  assert.equal(result.classification.type, "unknown");
  assert.equal(result.signals.some((signal) => signal.key === "owner_package"), false);
});
