/**
 * Main entry point for report generation.
 *
 * Orchestrates module inference, summary JSON, Markdown report, Mermaid graph,
 * config snapshot, and index management.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PageEntry, FailureEntry, ExplorerConfig } from '../types.js';
import { inferModules } from './modules.js';
import { generateSummaryJson, generateRunId, type RunIndexEntry } from './summary.js';
import { generateMarkdown } from './markdown.js';
import { generateMermaidGraph, generateMermaidGraphLargeApp, isLargeApp } from './mermaid.js';
import { updateIndex } from './index-manager.js';

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
}

/**
 * Generate a complete exploration report.
 *
 * Writes the following to the output directory:
 * - summary.json — structured run data
 * - report.md — human-readable Markdown report
 * - graph.mmd — Mermaid flowchart visualization
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
  const runId = generateRunId();
  const runDir = join(reportDir, runId);

  // Ensure output directory exists
  mkdirSync(runDir, { recursive: true });

  // Generate summary.json
  const summary = generateSummaryJson(pages, failures, modules, config, opts);
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  // Generate report.md
  const markdown = generateMarkdown(pages, failures, modules, config, opts);
  writeFileSync(join(runDir, 'report.md'), markdown, 'utf-8');

  // Generate graph.mmd
  const largeApp = isLargeApp(pages.length);
  let graph: string;
  if (largeApp) {
    const modulePages = modules.map((m) => ({ name: m.name, pages: m.pages }));
    graph = generateMermaidGraphLargeApp(pages, failures, modulePages);
  } else {
    graph = generateMermaidGraph(pages, failures);
  }
  writeFileSync(join(runDir, 'graph.mmd'), graph, 'utf-8');

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
export { updateIndex, loadIndex, findRunById, computeDiff } from './index-manager.js';
export type { RunIndex, RunDiff } from './index-manager.js';
