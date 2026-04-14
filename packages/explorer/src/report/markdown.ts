/**
 * Markdown report generation for exploration reports.
 *
 * Renders `report.md` from a structured template including overview table,
 * module breakdown, failure report, and slow page warnings.
 *
 * §5.4 — Markdown report template.
 */

import type { PageEntry, FailureEntry, ExplorerConfig } from '../types.js';
import type { ModuleGroup } from './modules.js';
import { countUniquePaths } from './summary.js';

/** Options passed to markdown generation. */
export interface MarkdownOpts {
  /** Whether the exploration was partial/aborted. */
  partial: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
  /** Total duration in milliseconds. */
  durationMs: number;
}

/** Threshold in milliseconds for marking a page as "slow". */
const SLOW_PAGE_THRESHOLD_MS = 5000;

/**
 * Generate a Markdown-formatted exploration report.
 *
 * @param pages - All visited page entries
 * @param failures - All failure entries
 * @param modules - Inferred module groups
 * @param config - Explorer configuration
 * @param opts - Markdown options
 * @returns Markdown string ready for writing to report.md
 */
export function generateMarkdown(
  pages: PageEntry[],
  failures: FailureEntry[],
  modules: ModuleGroup[],
  config: ExplorerConfig,
  opts: MarkdownOpts,
): string {
  const appVersion = 'unknown';
  const maxDepth = pages.length > 0
    ? pages.reduce((max, p) => Math.max(max, p.depth), 0)
    : 0;
  const slowPages = pages.filter((p) => p.loadTimeMs > SLOW_PAGE_THRESHOLD_MS);

  let content = '';

  // Title
  if (opts.partial) {
    content += `# ⚠️ PARTIAL REPORT — APP Exploration Report — ${config.appId} v${appVersion}\n\n`;
    if (opts.abortReason) {
      content += `> **Aborted:** ${opts.abortReason}\n\n`;
    }
  } else {
    content += `# APP Exploration Report — ${config.appId} v${appVersion}\n\n`;
  }

  // Overview table
  content += `## Overview\n`;
  content += `| Metric | Value |\n`;
  content += `|--------|-------|\n`;
  content += `| Exploration Time | ${new Date().toISOString()} |\n`;
  content += `| Duration | ${formatDuration(opts.durationMs)} |\n`;
  content += `| Mode | ${config.mode} |\n`;
  content += `| Total Pages | ${pages.length} |\n`;
  content += `| Total Paths | ${countUniquePaths(pages)} |\n`;
  content += `| Failures | ${failures.length} |\n`;
  content += `| Max Depth | ${maxDepth} |\n`;
  content += `| Platform | ${config.platform} |\n\n`;

  // Page map reference
  content += `## Page Map\n\n`;
  content += `See [graph.mmd](./graph.mmd) and [tree.txt](./tree.txt)\n\n`;

  // Module breakdown
  content += `## Module Breakdown\n\n`;
  for (const mod of modules) {
    content += `### ${mod.name} (${mod.pages.length} pages)\n\n`;
    content += `| Page | Depth | Path | Status |\n`;
    content += `|------|-------|------|--------|\n`;
    for (const page of mod.pages) {
      const status = page.hasFailure ? '❌' : '✅';
      const pathStr = page.path.length > 0 ? page.path.join(' → ') : '(root)';
      const title = page.screenTitle || page.screenId;
      content += `| ${escapeMarkdown(title)} | ${page.depth} | ${escapeMarkdown(pathStr)} | ${status} |\n`;
    }
    content += '\n';
  }

  // Failure report
  if (failures.length > 0) {
    content += `## Alerts\n\n`;
    content += `### ❌ Failed Pages (${failures.length})\n\n`;
    for (const f of failures) {
      const pathStr = f.path.length > 0 ? f.path.join(' → ') : '(root)';
      content += `- **${escapeMarkdown(f.pageScreenId)}**: ${f.failureType} on "${escapeMarkdown(f.elementLabel)}" at depth ${f.depth}\n`;
      content += `  Path: ${escapeMarkdown(pathStr)}\n`;
      content += `  Error: ${escapeMarkdown(f.errorMessage)}\n\n`;
    }
  }

  // Slow pages
  if (slowPages.length > 0) {
    content += `### ⚠️ Slow Pages (load > 5s)\n\n`;
    for (const p of slowPages) {
      content += `- **${escapeMarkdown(p.screenId)}**: ${p.loadTimeMs}ms\n`;
    }
    content += '\n';
  }

  return content;
}

/** Format milliseconds to a human-readable duration string. */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/** Escape special Markdown characters in text that could break table rendering. */
function escapeMarkdown(text: string): string {
  // In table cells, pipe characters need escaping
  return text.replace(/\|/g, '\\|');
}
