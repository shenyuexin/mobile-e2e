/**
 * Index management for exploration report history.
 *
 * Maintains `index.json` — an append-only history of all exploration runs
 * with support for diff reports between runs.
 *
 * §5.6 — Index and diff management.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { RunIndexEntry } from './summary.js';

/** Top-level index structure. */
export interface RunIndex {
  /** All recorded exploration runs. */
  runs: RunIndexEntry[];
}

/**
 * Diff result between two exploration runs.
 */
export interface RunDiff {
  /** Run IDs being compared. */
  from: string;
  to: string;
  /** Pages present in "to" but not in "from". */
  newPages: string[];
  /** Pages present in "from" but not in "to". */
  removedPages: string[];
  /** Pages whose status changed (e.g., OK → failed). */
  statusChanges: Array<{
    pageId: string;
    from: string;
    to: string;
  }>;
  /** Pages whose path changed between runs. */
  pathChanges: Array<{
    pageId: string;
    from: string[];
    to: string[];
  }>;
  /** Summary of the diff. */
  summary: {
    totalNew: number;
    totalRemoved: number;
    totalStatusChanges: number;
    totalPathChanges: number;
  };
}

/**
 * Update the index.json with a new run entry.
 *
 * Appends the entry to the existing index or creates a new one.
 *
 * @param reportDir - The base report directory containing index.json
 * @param entry - The run entry to append
 */
export function updateIndex(
  reportDir: string,
  entry: RunIndexEntry,
): void {
  const indexPath = join(reportDir, 'index.json');
  let index: RunIndex = { runs: [] };

  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, 'utf-8');
      index = JSON.parse(raw) as RunIndex;
    } catch {
      // Corrupted index — start fresh
      index = { runs: [] };
    }
  }

  index.runs.push(entry);
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Load the index from a report directory.
 *
 * @param reportDir - The base report directory
 * @returns The loaded RunIndex or null if not found
 */
export function loadIndex(reportDir: string): RunIndex | null {
  const indexPath = join(reportDir, 'index.json');

  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const raw = readFileSync(indexPath, 'utf-8');
    return JSON.parse(raw) as RunIndex;
  } catch {
    return null;
  }
}

/**
 * Find a run entry by its ID.
 *
 * @param index - The loaded index
 * @param runId - The run ID to find
 * @returns The entry or null if not found
 */
export function findRunById(
  index: RunIndex,
  runId: string,
): RunIndexEntry | null {
  return index.runs.find((r) => r.id === runId) ?? null;
}

/**
 * Compute a diff between two runs.
 *
 * Requires the page inventories from both runs' summary.json files.
 * This function operates on the parsed page arrays.
 *
 * @param fromRunId - The baseline run ID
 * @param toRunId - The comparison run ID
 * @param fromPages - Pages from the baseline run
 * @param toPages - Pages from the comparison run
 * @returns Diff result object
 */
export function computeDiff(
  fromRunId: string,
  toRunId: string,
  fromPages: Array<{ id: string; path: string[]; hasFailure: boolean }>,
  toPages: Array<{ id: string; path: string[]; hasFailure: boolean }>,
): RunDiff {
  const fromPageMap = new Map(fromPages.map((p) => [p.id, p]));
  const toPageMap = new Map(toPages.map((p) => [p.id, p]));

  const newPages: string[] = [];
  const removedPages: string[] = [];
  const statusChanges: RunDiff['statusChanges'] = [];
  const pathChanges: RunDiff['pathChanges'] = [];

  // Find new and changed pages
  for (const page of toPages) {
    const existing = fromPageMap.get(page.id);
    if (!existing) {
      newPages.push(page.id);
    } else {
      if (existing.hasFailure !== page.hasFailure) {
        statusChanges.push({
          pageId: page.id,
          from: existing.hasFailure ? 'failed' : 'ok',
          to: page.hasFailure ? 'failed' : 'ok',
        });
      }
      if (JSON.stringify(existing.path) !== JSON.stringify(page.path)) {
        pathChanges.push({
          pageId: page.id,
          from: existing.path,
          to: page.path,
        });
      }
    }
  }

  // Find removed pages
  for (const page of fromPages) {
    if (!toPageMap.has(page.id)) {
      removedPages.push(page.id);
    }
  }

  return {
    from: fromRunId,
    to: toRunId,
    newPages,
    removedPages,
    statusChanges,
    pathChanges,
    summary: {
      totalNew: newPages.length,
      totalRemoved: removedPages.length,
      totalStatusChanges: statusChanges.length,
      totalPathChanges: pathChanges.length,
    },
  };
}
