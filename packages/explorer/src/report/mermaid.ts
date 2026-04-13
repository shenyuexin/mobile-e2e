/**
 * Mermaid graph generation for exploration reports.
 *
 * Generates a Mermaid flowchart where nodes = pages, edges = tap actions.
 * Color-coded: green (OK), orange (partial failures), red (failures).
 * Handles large apps (200+ pages) with sub-graphs per module.
 *
 * §5.5 — Mermaid graph visualization.
 */

import type { PageEntry, FailureEntry } from '../types.js';

/** Threshold for switching to sub-graph layout per module. */
const LARGE_APP_PAGE_THRESHOLD = 200;

/**
 * Generate a Mermaid flowchart graph from page entries.
 *
 * @param pages - All visited page entries
 * @param failures - All failure entries
 * @param moduleName - Optional module name for sub-graph labeling
 * @param isLargeApp - Whether to use sub-graph layout
 * @returns Mermaid graph definition string
 */
export function generateMermaidGraph(
  pages: PageEntry[],
  failures: FailureEntry[],
  moduleName?: string,
  isLargeApp = false,
): string {
  const lines: string[] = [];

  if (isLargeApp && moduleName) {
    lines.push(`subgraph ${escapeMermaidId(moduleName)}["${escapeMermaidLabel(moduleName)}"]`);
  } else {
    lines.push('graph TD');
  }

  // Detect orphan arrivals (arrivedFrom references that don't match any page)
  const pageScreenIds = new Set(pages.map((p) => p.screenId));
  const hasOrphanArrivals = pages.some(
    (p) => p.arrivedFrom && !pageScreenIds.has(p.arrivedFrom),
  );

  const homeNodeId = isLargeApp && moduleName
    ? escapeMermaidId(`${moduleName}_home`)
    : 'home';

  if (hasOrphanArrivals) {
    lines.push(`  ${homeNodeId}["Home"]`);
  }

  // Define page nodes
  for (const page of pages) {
    const style = getFailureStatus(page.id, page.screenId, failures);
    const label = escapeMermaidLabel(page.screenTitle || page.screenId);
    lines.push(`  ${page.id}["${label}"]`);

    if (style === 'fail') {
      lines.push(`  style ${page.id} fill:#f99,stroke:#f66`);
    } else if (style === 'warn') {
      lines.push(`  style ${page.id} fill:#ff9,stroke:#cc6`);
    }
  }

  // Define edges
  for (const page of pages) {
    if (page.arrivedFrom) {
      const fromId = findPageIdByScreenId(pages, page.arrivedFrom);
      const resolvedFromId = fromId || homeNodeId;
      const edgeLabel = page.viaElement
        ? `|${escapeMermaidLabel(page.viaElement)}|`
        : '';
      lines.push(`  ${resolvedFromId} -->${edgeLabel} ${page.id}`);
    }
  }

  if (isLargeApp && moduleName) {
    lines.push('end');
  }

  return lines.join('\n');
}

/**
 * Generate a multi-module Mermaid graph for large apps (200+ pages).
 * Creates a top-level graph with sub-graphs per module.
 *
 * @param pages - All visited page entries
 * @param failures - All failure entries
 * @param modulePages - Array of [moduleName, pages] tuples
 * @returns Mermaid graph definition with sub-graphs
 */
export function generateMermaidGraphLargeApp(
  pages: PageEntry[],
  failures: FailureEntry[],
  modulePages: Array<{ name: string; pages: PageEntry[] }>,
): string {
  const lines = ['graph TD'];

  for (const mod of modulePages) {
    lines.push(generateMermaidGraph(mod.pages, failures, mod.name, true));
  }

  return lines.join('\n');
}

/**
 * Find the page ID for a given screen ID.
 *
 * @param pages - All page entries
 * @param screenId - Screen ID to look up
 * @returns Page ID if found, null otherwise (caller should fall back to 'home')
 */
export function findPageIdByScreenId(pages: PageEntry[], screenId: string): string | null {
  const found = pages.find((p) => p.screenId === screenId);
  return found ? found.id : null;
}

/**
 * Determine the failure status of a page based on its failure entries.
 *
 * @param pageId - Page identifier
 * @param pageScreenId - Page screen identifier
 * @param failures - All failure entries
 * @returns 'ok', 'warn', or 'fail'
 */
export function getFailureStatus(
  pageId: string,
  pageScreenId: string,
  failures: FailureEntry[],
): 'ok' | 'warn' | 'fail' {
  // Count failures directly associated with this page
  const pageFailures = failures.filter(
    (f) => f.pageScreenId === pageScreenId,
  );

  if (pageFailures.length > 2) return 'fail';
  if (pageFailures.length > 0) return 'warn';
  return 'ok';
}

/**
 * Escape special characters in Mermaid labels.
 *
 * Mermaid is sensitive to quotes, parentheses, hash signs, and some other
 * characters inside node labels. This function sanitizes them.
 *
 * @param text - Raw text to escape
 * @returns Escaped text safe for Mermaid labels
 */
export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/"/g, "'")       // Double quotes → single quotes
    .replace(/[()]/g, '')      // Remove parentheses
    .replace(/#/g, 'sharp')    // Hash → "sharp"
    .replace(/[<>]/g, '');     // Remove angle brackets
}

/**
 * Escape text for use as a Mermaid node ID (alphanumeric + underscore only).
 */
function escapeMermaidId(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .toLowerCase()
    .substring(0, 50);
}

/** Check if the app is "large" enough to warrant sub-graph layout. */
export function isLargeApp(pageCount: number): boolean {
  return pageCount >= LARGE_APP_PAGE_THRESHOLD;
}
