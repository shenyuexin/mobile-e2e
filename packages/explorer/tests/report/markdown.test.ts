/**
 * Tests for Markdown report template rendering.
 *
 * Validates that the generated Markdown includes correct structure and values.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateMarkdown } from '../../src/report/markdown.js';
import { inferModules } from '../../src/report/modules.js';
import type { PageEntry, FailureEntry, ExplorerConfig } from '../../src/types.js';

function makePage(id: string, depth: number, path: string[], hasFailure = false, loadTimeMs = 100): PageEntry {
  return {
    id,
    screenId: `screen-${id}`,
    screenTitle: id,
    depth,
    path,
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs,
    clickableCount: 5,
    hasFailure,
  };
}

function makeFailure(pageScreenId: string, elementLabel = 'btn'): FailureEntry {
  return {
    pageScreenId,
    elementLabel,
    failureType: 'TAP_FAILED',
    retryCount: 1,
    errorMessage: 'tap failed',
    depth: 1,
    path: ['some-path'],
  };
}

const mockConfig: ExplorerConfig = {
  mode: 'scoped',
  auth: { type: 'skip-auth' },
  failureStrategy: 'retry-3',
  maxDepth: 8,
  maxPages: 100,
  timeoutMs: 300_000,
  compareWith: null,
  platform: 'ios-simulator',
  destructiveActionPolicy: 'skip',
  appId: 'com.example.app',
  reportDir: '/tmp/reports',
};

describe('generateMarkdown', () => {
  it('includes overview table with correct values', () => {
    const pages = [makePage('p1', 0, []), makePage('p2', 1, ['p1'])];
    const failures: FailureEntry[] = [];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, failures, modules, mockConfig, {
      partial: false,
      durationMs: 120_000,
    });

    assert.ok(md.includes('# APP Exploration Report — com.example.app'));
    assert.ok(md.includes('| Total Pages | 2 |'));
    assert.ok(md.includes('| Max Depth | 1 |'));
    assert.ok(md.includes('| Platform | ios-simulator |'));
    assert.ok(md.includes('| Mode | scoped |'));
  });

  it('partial report includes PARTIAL REPORT prefix', () => {
    const pages = [makePage('p1', 0, [])];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: true,
      abortReason: 'Timeout',
      durationMs: 5000,
    });

    assert.ok(md.includes('# ⚠️ PARTIAL REPORT'));
    assert.ok(md.includes('> **Aborted:** Timeout'));
  });

  it('module breakdown groups pages correctly', () => {
    const pages = [
      makePage('p1', 0, []),
      makePage('p2', 1, ['Settings']),
      makePage('p3', 1, ['Settings']),
    ];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.ok(md.includes('## Module Breakdown'));
    assert.ok(md.includes('### Home (1 pages)'));
    assert.ok(md.includes('### Settings (2 pages)'));
    assert.ok(md.includes('| Page | Depth | Path | Status |'));
  });

  it('failure section lists all failures', () => {
    const pages = [makePage('p1', 0, []), makePage('p2', 1, ['p1'], true)];
    const failures = [
      makeFailure('screen-p2', 'submit-btn'),
      makeFailure('screen-p2', 'cancel-btn'),
    ];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, failures, modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.ok(md.includes('## Alerts'));
    assert.ok(md.includes('### ❌ Failed Pages (2)'));
    assert.ok(md.includes('submit-btn'));
    assert.ok(md.includes('cancel-btn'));
  });

  it('slow pages section appears only when pages exceed 5s threshold', () => {
    // No slow pages
    const pages1 = [makePage('p1', 0, [], false, 1000)];
    const modules1 = inferModules(pages1);
    const md1 = generateMarkdown(pages1, [], modules1, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.ok(!md1.includes('### ⚠️ Slow Pages'));

    // With slow pages
    const pages2 = [makePage('p1', 0, [], false, 6000)];
    const modules2 = inferModules(pages2);
    const md2 = generateMarkdown(pages2, [], modules2, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.ok(md2.includes('### ⚠️ Slow Pages (load > 5s)'));
    assert.ok(md2.includes('6000ms'));
  });

  it('includes page map reference to graph.mmd', () => {
    const pages = [makePage('p1', 0, [])];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.ok(md.includes('[graph.mmd](./graph.mmd)'));
  });

  it('escapes pipe characters in markdown table cells', () => {
    const pages = [makePage('Screen | Title', 0, ['Module | A'])];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    // Pipes should be escaped in table cells
    assert.ok(md.includes('Screen \\| Title'));
    assert.ok(md.includes('Module \\| A'));
  });
});
