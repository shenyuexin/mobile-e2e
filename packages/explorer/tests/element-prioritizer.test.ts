/**
 * Unit tests for element-prioritizer module.
 *
 * Tests: findClickableElements filtering, isToggle detection,
 * buildSelector priority, toClickableTarget label extraction.
 *
 * Incorporates spike data from docs/spike/toggle-detection.md.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isToggle,
  isInteractive,
  isTextInput,
  isNonInteractive,
  isDestructive,
  findClickableElements,
  buildSelector,
  toClickableTarget,
  getElementLabel,
  prioritizeElements,
} from "../src/element-prioritizer.js";
import type { UiHierarchy, ExplorerConfig } from "../src/types.js";

// ---------------------------------------------------------------------------
// Test fixtures — based on iOS 26.0 spike data
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<UiHierarchy>): UiHierarchy {
  return {
    className: "Unknown",
    clickable: false,
    enabled: true,
    scrollable: false,
    ...overrides,
  };
}

const config: ExplorerConfig = {
  mode: "full",
  auth: { type: "skip-auth" },
  failureStrategy: "retry-3",
  maxDepth: 8,
  maxPages: 200,
  timeoutMs: 30 * 60 * 1000,
  compareWith: null,
  platform: "ios-simulator",
  destructiveActionPolicy: "skip",
  appId: "com.apple.Preferences",
  reportDir: "./reports",
};

const allowConfig: ExplorerConfig = {
  ...config,
  destructiveActionPolicy: "allow",
};

// ---------------------------------------------------------------------------
// isToggle tests
// ---------------------------------------------------------------------------

describe("isToggle", () => {
  it("detects CheckBox with clickable=false as toggle (iOS 26.0 pattern)", () => {
    const el = makeNode({
      className: "CheckBox",
      clickable: false,
      text: "0",
      contentDesc: "Grid",
    });
    assert.equal(isToggle(el), true);
  });

  it("detects Button with On/Off AXValue as toggle", () => {
    const el = makeNode({
      className: "Button",
      clickable: true,
      AXValue: "On",
      contentDesc: "Live Speech",
    });
    assert.equal(isToggle(el), true);
  });

  it("detects Switch type as toggle", () => {
    const el = makeNode({
      className: "Switch",
      clickable: true,
    });
    assert.equal(isToggle(el), true);
  });

  it("detects Toggle type as toggle", () => {
    const el = makeNode({
      className: "Toggle",
      clickable: true,
    });
    assert.equal(isToggle(el), true);
  });

  it("does NOT detect regular Button as toggle", () => {
    const el = makeNode({
      className: "Button",
      clickable: true,
      contentDesc: "General",
    });
    assert.equal(isToggle(el), false);
  });

  it("detects CheckBox with text '1' as toggle", () => {
    const el = makeNode({
      className: "CheckBox",
      clickable: false,
      text: "1",
      contentDesc: "View Outside the Frame",
    });
    assert.equal(isToggle(el), true);
  });
});

// ---------------------------------------------------------------------------
// isInteractive tests
// ---------------------------------------------------------------------------

describe("isInteractive", () => {
  it("detects Button as interactive", () => {
    const el = makeNode({ className: "Button", clickable: true });
    assert.equal(isInteractive(el), true);
  });

  it("detects Cell as interactive", () => {
    const el = makeNode({ className: "Cell", clickable: true });
    assert.equal(isInteractive(el), true);
  });

  it("detects Link via accessibilityTraits", () => {
    const el = makeNode({
      className: "StaticText",
      accessibilityTraits: ["link"],
    });
    assert.equal(isInteractive(el), true);
  });

  it("does NOT detect StaticText as interactive", () => {
    const el = makeNode({ className: "StaticText", clickable: false });
    assert.equal(isInteractive(el), false);
  });

  it("detects clickable Android container as interactive", () => {
    const el = makeNode({
      className: "android.widget.FrameLayout",
      elementType: "android.widget.FrameLayout",
      clickable: true,
    });
    assert.equal(isInteractive(el), true);
  });
});

// ---------------------------------------------------------------------------
// isTextInput tests
// ---------------------------------------------------------------------------

describe("isTextInput", () => {
  it("detects TextField as text input", () => {
    const el = makeNode({ className: "TextField", clickable: true });
    assert.equal(isTextInput(el), true);
  });

  it("detects SearchField as text input", () => {
    const el = makeNode({ className: "SearchField", clickable: true });
    assert.equal(isTextInput(el), true);
  });

  it("does NOT detect Button as text input", () => {
    const el = makeNode({ className: "Button", clickable: true });
    assert.equal(isTextInput(el), false);
  });
});

// ---------------------------------------------------------------------------
// isNonInteractive tests
// ---------------------------------------------------------------------------

describe("isNonInteractive", () => {
  it("detects StaticText without link trait as non-interactive", () => {
    const el = makeNode({ className: "StaticText" });
    assert.equal(isNonInteractive(el), true);
  });

  it("detects Heading as non-interactive", () => {
    const el = makeNode({ className: "Heading" });
    assert.equal(isNonInteractive(el), true);
  });

  it("detects Separator as non-interactive", () => {
    const el = makeNode({ className: "Separator" });
    assert.equal(isNonInteractive(el), true);
  });

  it("does NOT detect Button as non-interactive", () => {
    const el = makeNode({ className: "Button" });
    assert.equal(isNonInteractive(el), false);
  });

  it("does NOT detect clickable Android container as non-interactive", () => {
    const el = makeNode({
      className: "android.widget.FrameLayout",
      elementType: "android.widget.FrameLayout",
      clickable: true,
    });
    assert.equal(isNonInteractive(el), false);
  });
});

// ---------------------------------------------------------------------------
// isDestructive tests
// ---------------------------------------------------------------------------

describe("isDestructive", () => {
  it("detects 'Delete Account' as destructive", () => {
    const el = makeNode({ contentDesc: "Delete Account" });
    assert.equal(isDestructive(el, "skip"), true);
  });

  it("detects 'Sign Out' as destructive", () => {
    const el = makeNode({ contentDesc: "Sign Out" });
    assert.equal(isDestructive(el, "skip"), true);
  });

  it("detects 'Reset All Settings' as destructive", () => {
    const el = makeNode({ text: "Reset All Settings" });
    assert.equal(isDestructive(el, "skip"), true);
  });

  it("does NOT detect 'General' as destructive", () => {
    const el = makeNode({ contentDesc: "General" });
    assert.equal(isDestructive(el, "skip"), false);
  });

  it("allows destructive elements when policy is 'allow'", () => {
    const el = makeNode({ contentDesc: "Delete Account" });
    assert.equal(isDestructive(el, "allow"), false);
  });
});

// ---------------------------------------------------------------------------
// findClickableElements tests
// ---------------------------------------------------------------------------

describe("findClickableElements", () => {
  const uiTree: UiHierarchy = {
    className: "Application",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [
      {
        className: "Button",
        clickable: true,
        enabled: true,
        scrollable: false,
        contentDesc: "General",
        children: [],
      },
      {
        className: "CheckBox",
        clickable: false,
        enabled: true,
        scrollable: false,
        contentDesc: "Grid",
        text: "0",
        children: [],
      },
      {
        className: "TextField",
        clickable: true,
        enabled: true,
        scrollable: false,
        contentDesc: "Search",
        children: [],
      },
      {
        className: "StaticText",
        clickable: false,
        enabled: true,
        scrollable: false,
        text: "Some description",
        children: [],
      },
      {
        className: "Heading",
        clickable: false,
        enabled: true,
        scrollable: false,
        contentDesc: "COMPOSITION",
        children: [],
      },
      {
        className: "Button",
        clickable: true,
        enabled: true,
        scrollable: false,
        contentDesc: "Delete Account",
        children: [],
      },
    ],
  };

  it("filters out toggles, text inputs, non-interactive, and destructive elements", () => {
    const elements = findClickableElements(uiTree, config);
    // Only "General" should remain (Delete Account is filtered by destructive policy)
    assert.equal(elements.length, 1);
    assert.equal(elements[0].label, "General");
  });

  it("includes destructive elements when policy is 'allow'", () => {
    const elements = findClickableElements(uiTree, allowConfig);
    // "General" and "Delete Account" should remain
    assert.equal(elements.length, 2);
  });

  it("keeps clickable Android container rows", () => {
    const androidTree: UiHierarchy = {
      className: "Application",
      clickable: false,
      enabled: true,
      scrollable: false,
      children: [
        {
          className: "android.widget.FrameLayout",
          elementType: "android.widget.FrameLayout",
          clickable: true,
          enabled: true,
          scrollable: false,
          contentDesc: "Wi-Fi, Connected",
          children: [],
        },
      ],
    };

    const elements = findClickableElements(androidTree, config);
    assert.equal(elements.length, 1);
    assert.equal(elements[0].label, "Wi-Fi, Connected");
  });
});

// ---------------------------------------------------------------------------
// buildSelector tests
// ---------------------------------------------------------------------------

describe("buildSelector", () => {
  it("prioritizes AXUniqueId > resourceId > text > position", () => {
    const el = makeNode({
      AXUniqueId: "com.apple.settings.general",
      contentDesc: "General",
      text: "General",
      className: "Button",
    });
    const selector = buildSelector(el);
    assert.equal(selector.accessibilityId, "com.apple.settings.general");
    assert.equal(selector.resourceId, undefined);
    assert.equal(selector.text, undefined);
  });

  it("falls back to resourceId when no AXUniqueId", () => {
    const el = makeNode({
      resourceId: "com.example:id/button",
      contentDesc: "Some Button",
      className: "Button",
    });
    const selector = buildSelector(el);
    assert.equal(selector.resourceId, "com.example:id/button");
  });

  it("falls back to text when no AXUniqueId or resourceId", () => {
    const el = makeNode({
      contentDesc: "General",
      className: "Button",
    });
    const selector = buildSelector(el);
    assert.equal(selector.text, "General");
  });

  it("falls back to position when no text fields", () => {
    const el = makeNode({
      className: "Image",
      frame: { x: 100, y: 200, width: 50, height: 50 },
    });
    const selector = buildSelector(el);
    assert.deepEqual(selector.position, { x: 100, y: 200 });
  });
});

// ---------------------------------------------------------------------------
// toClickableTarget tests
// ---------------------------------------------------------------------------

describe("toClickableTarget", () => {
  it("extracts label from contentDesc", () => {
    const el = makeNode({
      className: "Button",
      contentDesc: "General",
    });
    const target = toClickableTarget(el);
    assert.equal(target.label, "General");
    assert.equal(target.elementType, "Button");
  });

  it("falls back to text when no contentDesc", () => {
    const el = makeNode({
      className: "Button",
      text: "Settings",
    });
    const target = toClickableTarget(el);
    assert.equal(target.label, "Settings");
  });

  it("falls back to className as last resort", () => {
    const el = makeNode({ className: "Button" });
    const target = toClickableTarget(el);
    assert.equal(target.label, "Button");
  });
});

// ---------------------------------------------------------------------------
// getElementLabel tests
// ---------------------------------------------------------------------------

describe("getElementLabel", () => {
  it("uses contentDesc as primary label", () => {
    const el = makeNode({ contentDesc: "General" });
    assert.equal(getElementLabel(el), "General");
  });

  it("falls back through accessibilityLabel, label, text, visibleTexts, className", () => {
    const el = makeNode({ text: "Fallback" });
    assert.equal(getElementLabel(el), "Fallback");
  });

  it("returns className as fallback when no label fields present", () => {
    const el = makeNode({});
    assert.equal(getElementLabel(el), "Unknown");
  });
});

// ---------------------------------------------------------------------------
// prioritizeElements tests
// ---------------------------------------------------------------------------

describe("prioritizeElements", () => {
  it("assigns default priority of 10 to all elements", () => {
    const elements = [
      { label: "A", selector: { text: "A" }, elementType: "Button" },
      { label: "B", selector: { text: "B" }, elementType: "Cell" },
    ];
    const prioritized = prioritizeElements(elements);
    assert.equal(prioritized[0].priority, 10);
    assert.equal(prioritized[1].priority, 10);
  });

  it("preserves existing priority when set", () => {
    const elements = [
      { label: "A", selector: { text: "A" }, elementType: "Button", priority: 20 },
    ];
    const prioritized = prioritizeElements(elements);
    assert.equal(prioritized[0].priority, 20);
  });
});
