/**
 * Shared UI tree hashing utility.
 *
 * Both `derivePageIdentity` (session-state.ts) and `waitForUiStable`
 * (ui-stability.ts) use the same rolling-hash algorithm but on different
 * input sources. This module exports a single implementation so the hash
 * semantics are unified and comparable within the same derivation context.
 *
 * IMPORTANT: tree hashes from DIFFERENT input sources (e.g. inspect_ui
 * summary vs. raw hierarchy snapshot) are NOT cross-comparable. They share
 * the same algorithm but see different node sets.
 */

/**
 * Compute a rolling hash over a string of visible node signatures.
 * Uses the same algorithm as ui-stability.ts to keep semantics aligned.
 */
export function computeTreeHash(signatures: string[]): string {
  const content = signatures.join("\n");
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 16);
}

/**
 * Build node signatures from an InspectUiSummary sample (used by derivePageIdentity).
 * Only includes visible nodes with text and bounds.
 */
export function sampleNodeSignatures(params: {
  sampleNodes: Array<{
    text?: string;
    contentDesc?: string;
    className?: string;
    bounds?: string;
  }>;
}): string[] {
  const { sampleNodes } = params;
  return sampleNodes
    .filter((n) => n.text && n.bounds)
    .map((n) => `${n.className ?? ""}|${(n.text ?? "").slice(0, 50)}|${n.bounds ?? ""}`);
}
