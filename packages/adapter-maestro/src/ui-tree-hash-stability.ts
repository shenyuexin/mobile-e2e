/**
 * Tree hash helpers for wait_for_ui_stable stability polling.
 *
 * Operates on raw JSON hierarchy snapshots (full tree), not on
 * InspectUiSummary samples. Uses the shared computeTreeHash algorithm.
 */

import { computeTreeHash } from "./ui-tree-hash.js";

/**
 * Flatten the UI hierarchy into an array of node signatures suitable for hashing.
 * Only includes visible nodes with text content.
 */
export function flattenNodeSignatures(
  nodes: Array<Record<string, unknown>>,
  output: string[] = [],
): string[] {
  for (const node of nodes) {
    const visible = node.visible !== false;
    const text = typeof node.text === "string" ? node.text : "";
    const type = typeof node.type === "string" ? node.type : "";
    const bounds = typeof node.bounds === "string" ? node.bounds : "";

    if (visible && text) {
      output.push(`${type}|${text.slice(0, 60)}|${bounds}`);
    }

    const children = node.children as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(children)) {
      flattenNodeSignatures(children, output);
    }
  }
  return output;
}

/**
 * Compute a structural hash of the visible UI tree from raw JSON.
 * Delegates to the shared computeTreeHash algorithm.
 */
export function computeStabilityUiTreeHash(rawJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return "parse_error";
  }

  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  const signatures = flattenNodeSignatures(nodes as Array<Record<string, unknown>>);
  return computeTreeHash(signatures);
}
