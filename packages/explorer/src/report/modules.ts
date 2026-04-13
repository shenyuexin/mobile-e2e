/**
 * Module inference for exploration reports.
 *
 * Groups pages by their depth-1 path segment (first element in the path).
 * Pages with empty path are grouped under "Home".
 *
 * §5.3.2 — Module grouping algorithm.
 */

import type { PageEntry } from '../types.js';

/** A group of pages belonging to the same inferred module. */
export interface ModuleGroup {
  /** Module name (derived from depth-1 path segment or "Home"). */
  name: string;
  /** Pages that belong to this module. */
  pages: PageEntry[];
}

/**
 * Infer module groupings from a list of page entries.
 *
 * Algorithm:
 * - depth-0 (empty path) → "Home"
 * - depth-1+ → first path segment is the module name
 * - Results sorted alphabetically by module name
 *
 * @param pages - All visited page entries
 * @returns Module groups sorted alphabetically
 */
export function inferModules(pages: PageEntry[]): ModuleGroup[] {
  const groups = new Map<string, PageEntry[]>();

  for (const page of pages) {
    const moduleName = page.path.length > 0 ? page.path[0] : 'Home';

    if (!groups.has(moduleName)) {
      groups.set(moduleName, []);
    }
    groups.get(moduleName)!.push(page);
  }

  return Array.from(groups.entries())
    .map(([name, pages]) => ({ name, pages }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
