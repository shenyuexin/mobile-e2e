/**
 * Tests for summary JSON generation.
 *
 * Validates the structure and content of summary.json output.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSummaryJson, generateRunId, countUniquePaths } from '../../src/report/summary.js';
import { inferModules } from '../../src/report/modules.js';
import type { PageEntry, FailureEntry, ExplorerConfig } from '../../src/types.js';

function makePage(id: string, depth: number, path: string[], hasFailure = false): PageEntry {
  return {
    id,
    screenId: `screen-${id}`,
    screenTitle: id,
    depth,
    path,
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs: 100,
    clickableCount: 5,
    hasFailure,
  };
}

function makeFailure(pageScreenId: string, failureType = 'TAP_FAILED'): FailureEntry {
  return {
    pageScreenId,
    elementLabel: 'some-element',
    failureType,
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

describe('generateSummaryJson', () => {
  it('includes correct page count', () => {
    const pages = [makePage('p1', 0, []), makePage('p2', 1, ['p1']), makePage('p3', 2, ['p1', 'p2'])];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.totalPages, 3);
  });

  it('partial report includes aborted: true and abortReason', () => {
    const pages = [makePage('p1', 0, [])];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: true,
      abortReason: 'Timeout reached',
      durationMs: 3000,
    });
    assert.equal(summary.aborted, true);
    assert.equal(summary.abortReason, 'Timeout reached');
  });

  it('full report does not include aborted', () => {
    const pages = [makePage('p1', 0, [])];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.aborted, undefined);
    assert.equal(summary.abortReason, undefined);
  });

  it('uniqueModules matches module inference output', () => {
    const pages = [
      makePage('p1', 0, []),
      makePage('p2', 1, ['Settings']),
      makePage('p3', 1, ['Bluetooth']),
    ];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.deepEqual(summary.uniqueModules, ['Bluetooth', 'Home', 'Settings']);
  });

  it('maxDepthReached is correct', () => {
    const pages = [
      makePage('p1', 0, []),
      makePage('p2', 1, ['p1']),
      makePage('p3', 3, ['p1', 'p2', 'p3']),
    ];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.maxDepthReached, 3);
  });

  it('maxDepthReached is 0 for empty pages', () => {
    const modules = inferModules([]);
    const summary = generateSummaryJson([], [], modules, mockConfig, {
      partial: false,
      durationMs: 0,
    });
    assert.equal(summary.maxDepthReached, 0);
    assert.equal(summary.totalPages, 0);
  });

  it('includes failure details', () => {
    const pages = [makePage('p1', 0, [])];
    const failures = [makeFailure('screen-p1', 'TIMEOUT')];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, failures, modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.totalFailures, 1);
    assert.equal(summary.failures[0].failureType, 'TIMEOUT');
    assert.equal(summary.failures[0].pageScreenId, 'screen-p1');
  });

  it('includes page inventory', () => {
    const pages = [makePage('p1', 0, ['home'], false)];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.equal(summary.pages.length, 1);
    assert.equal(summary.pages[0].id, 'p1');
    assert.equal(summary.pages[0].depth, 0);
    assert.equal(summary.pages[0].hasFailure, false);
  });

  it('includes stateGraph summary when provided', () => {
    const pages = [makePage('p1', 0, ['home'], false)];
    const modules = inferModules(pages);
    const summary = generateSummaryJson(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
      stateGraph: {
        nodeCount: 5,
        edgeCount: 7,
        committedEdgeCount: 4,
        rejectedEdgeCount: 3,
      },
    });

    assert.deepEqual(summary.stateGraph, {
      nodeCount: 5,
      edgeCount: 7,
      committedEdgeCount: 4,
      rejectedEdgeCount: 3,
    });
  });

  it('generates a valid runId', () => {
    const runId = generateRunId();
    assert.ok(typeof runId === 'string');
    assert.ok(runId.length > 0);
    // Should not contain characters that are problematic for file paths
    assert.ok(!runId.includes(':'));
    assert.ok(!runId.includes('.'));
  });
});

describe('countUniquePaths', () => {
  it('counts unique paths correctly', () => {
    const pages = [
      makePage('p1', 0, []),
      makePage('p2', 0, []),
      makePage('p3', 1, ['a']),
      makePage('p4', 2, ['a', 'b']),
    ];
    assert.equal(countUniquePaths(pages), 3); // [], ['a'], ['a', 'b']
  });

  it('returns 0 for empty pages', () => {
    assert.equal(countUniquePaths([]), 0);
  });
});
