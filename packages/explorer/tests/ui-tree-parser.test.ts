import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUiTreeFromInspectData } from "../src/ui-tree-parser.js";

function flattenLabels(node: { text?: string; contentDesc?: string; accessibilityLabel?: string; children?: unknown[] }, result: string[] = []): string[] {
  if (node.text) result.push(node.text);
  if (node.contentDesc) result.push(node.contentDesc);
  if (node.accessibilityLabel) result.push(node.accessibilityLabel);
  if (Array.isArray(node.children)) {
    for (const child of node.children as Array<typeof node>) {
      flattenLabels(child, result);
    }
  }
  return result;
}

describe("parseUiTreeFromInspectData", () => {
  it("normalizes direct iOS object payloads with AX fields", () => {
    const tree = parseUiTreeFromInspectData(
      {
        content: {
          type: "Application",
          AXLabel: "Settings",
          children: [
            {
              type: "Heading",
              AXLabel: "General",
              AXFrame: "{{0,0},{393,44}}",
            },
            {
              type: "Cell",
              AXLabel: "Wi-Fi",
              AXUniqueId: "wifi-cell",
              AXFrame: "{{0,44},{393,44}}",
            },
          ],
        },
      },
      { fallbackToDataRoot: true },
    );

    assert.ok(tree);
    assert.equal(tree?.className, "Application");
    assert.equal(tree?.accessibilityLabel, "Settings");
    assert.equal(tree?.children?.[0]?.text, "General");
    assert.equal(tree?.children?.[1]?.clickable, true);
    assert.equal(tree?.children?.[1]?.contentDesc, "wifi-cell");
    assert.deepEqual(tree?.children?.[1]?.frame, { x: 0, y: 44, width: 393, height: 44 });
  });

  it("treats wrapped iOS JSON payloads equivalently to direct payloads", () => {
    const wrapped = parseUiTreeFromInspectData(
      {
        content: JSON.stringify([
          {
            type: "Application",
            AXLabel: "Settings",
            children: [
              { type: "Heading", AXLabel: "General" },
              { type: "Cell", AXLabel: "Wi-Fi", AXUniqueId: "wifi-cell" },
            ],
          },
        ]),
      },
      { fallbackToDataRoot: true },
    );

    assert.ok(wrapped);
    assert.equal(wrapped?.className, "Root");
    assert.equal(wrapped?.children?.[0]?.className, "Application");
    assert.equal(wrapped?.children?.[0]?.accessibilityLabel, "Settings");
    assert.equal(wrapped?.children?.[0]?.children?.[1]?.clickable, true);
    assert.deepEqual(flattenLabels(wrapped as never), ["Settings", "General", "Wi-Fi", "wifi-cell"]);
  });
});
