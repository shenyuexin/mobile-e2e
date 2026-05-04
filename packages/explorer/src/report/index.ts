/**
 * Main entry point for report generation.
 *
 * Orchestrates module inference, summary JSON, Markdown report, Mermaid graph,
 * config snapshot, and index management.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExplorerConfig,
  FailureEntry,
  PageEntry,
  StateGraphSummary,
  TransitionLifecycleSummary,
} from '../types.js';
import { generateAsciiTree } from './ascii.js';
import { updateIndex } from './index-manager.js';
import { generateMarkdown } from './markdown.js';
import { inferModules } from './modules.js';
import { generateSummaryJson, resolveRunId, type RunIndexEntry } from './summary.js';

/** Options for report generation. */
export interface ReportOpts {
  /** Whether the exploration was partial/aborted. */
  partial: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** ISO timestamp when exploration started. */
  startedAt?: string;
  /** Sampling metadata for high-fanout collection pages. */
  sampling?: {
    appliedPages: string[];
    skippedChildren: number;
    details?: Record<string, {
      screenTitle?: string;
      totalChildren: number;
      exploredChildren: number;
      skippedChildren: number;
      exploredLabels: string[];
      skippedLabels: string[];
    }>;
  };
  /** Transition lifecycle counters from the engine. */
  transitionLifecycle?: TransitionLifecycleSummary;
  /** StateGraph aggregate counters from engine. */
  stateGraph?: StateGraphSummary;
  /** Precomputed run id so callers can create the run directory before report generation. */
  runId?: string;
}

/**
 * Generate a complete exploration report.
 *
 * Writes the following to the output directory:
 * - summary.json — structured run data
 * - report.md — human-readable Markdown report
 * - tree.txt — ASCII tree of discovered pages
 * - config.json — configuration snapshot
 * - Updates index.json in the parent report directory
 *
 * @param pages - All visited page entries
 * @param failures - All failure entries
 * @param config - Explorer configuration
 * @param opts - Report generation options
 */
export async function generateReport(
  pages: PageEntry[],
  failures: FailureEntry[],
  config: ExplorerConfig,
  opts: ReportOpts,
): Promise<void> {
  const modules = inferModules(pages);
  const reportDir = config.reportDir;
  const runId = resolveRunId({
    runId: opts.runId,
    startedAt: opts.startedAt,
    envRunId: process.env.EXPLORER_RUN_ID,
  });
  const runDir = join(reportDir, runId);

  // Ensure output directory exists
  mkdirSync(runDir, { recursive: true });

  // Generate summary.json
  const summary = generateSummaryJson(pages, failures, modules, config, {
    ...opts,
    runId,
  });
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  // Generate report.md
  const markdown = generateMarkdown(pages, failures, modules, config, opts);
  writeFileSync(join(runDir, 'report.md'), markdown, 'utf-8');

  // Generate tree.txt
  const asciiTree = generateAsciiTree(pages, opts.sampling?.details);
  writeFileSync(join(runDir, 'tree.txt'), asciiTree, 'utf-8');

  // Save config snapshot
  writeFileSync(join(runDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

  // Update index.json
  const maxDepth = pages.length > 0
    ? pages.reduce((max, p) => Math.max(max, p.depth), 0)
    : 0;

  const indexEntry: RunIndexEntry = {
    id: runId,
    appId: config.appId,
    appVersion: 'unknown',
    platform: config.platform,
    mode: config.mode,
    pageCount: pages.length,
    failureCount: failures.length,
    durationMs: opts.durationMs,
    maxDepthReached: maxDepth,
    configPath: join(runId, 'config.json'),
    summaryPath: join(runId, 'summary.json'),
    status: opts.partial ? 'partial' : 'complete',
    ...(opts.partial ? { aborted: true, abortReason: opts.abortReason } : {}),
  };

  updateIndex(reportDir, indexEntry);
}

export { inferModules } from './modules.js';
export type { ModuleGroup } from './modules.js';
export { generateSummaryJson, generateRunId, countUniquePaths } from './summary.js';
export type { RunSummary, RunIndexEntry } from './summary.js';
export { generateMarkdown } from './markdown.js';
export { generateMermaidGraph, generateMermaidGraphLargeApp, escapeMermaidLabel, isLargeApp } from './mermaid.js';
export { generateAsciiTree } from './ascii.js';
export { updateIndex, loadIndex, findRunById, computeDiff } from './index-manager.js';
export type { RunIndex, RunDiff } from './index-manager.js';
