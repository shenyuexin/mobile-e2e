/**
 * Tests for Mermaid graph generation.
 *
 * Validates graph syntax, node/edge structure, escaping, and large-app sub-graph splitting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMermaidGraph,
  generateMermaidGraphLargeApp,
  escapeMermaidLabel,
  findPageIdByScreenId,
  getFailureStatus,
  isLargeApp,
} from '../../src/report/mermaid.js';
import type { PageEntry, FailureEntry } from '../../src/types.js';

function makePage(id: string, screenId: string, depth: number, path: string[], arrivedFrom: string | null = null, viaElement: string | null = null, screenTitle?: string): PageEntry {
  return {
    id,
    screenId,
    screenTitle: screenTitle || id,
    depth,
    path,
    arrivedFrom,
    viaElement,
    loadTimeMs: 100,
    clickableCount: 5,
    hasFailure: false,
  };
}

function makeFailure(pageScreenId: string): FailureEntry {
  return {
    pageScreenId,
    elementLabel: 'some-element',
    failureType: 'TAP_FAILED',
    retryCount: 1,
    errorMessage: 'tap failed',
    depth: 1,
    path: ['some-path'],
  };
}

describe('generateMermaidGraph', () => {
  it('has one node per page', () => {
    const pages = [
      makePage('page-1', 's1', 0, []),
      makePage('page-2', 's2', 1, ['a']),
      makePage('page-3', 's3', 2, ['a', 'b']),
    ];
    const graph = generateMermaidGraph(pages, []);
    const nodeCount = (graph.match(/style|graph/sg) || []).length;

    // Each page should have a node definition: page-id["label"]
    assert.ok(graph.includes('page-1['));
    assert.ok(graph.includes('page-2['));
    assert.ok(graph.includes('page-3['));
  });

  it('edges connect parent to child via arrivedFrom', () => {
    const pages = [
      makePage('page-1', 's1', 0, []),
      makePage('page-2', 's2', 1, ['a'], 's1', 'button-a'),
    ];
    const graph = generateMermaidGraph(pages, []);
    assert.ok(graph.includes('page-1 -->|button-a| page-2'));
  });

  it('derives hierarchy edges from path when arrivedFrom is missing', () => {
    const pages = [
      makePage('page-1', 'settings', 0, [], null, null, 'Settings'),
      makePage('page-2', 'general', 0, ['General'], null, null, 'General'),
      makePage('page-3', 'about', 0, ['General', 'About'], null, null, 'About'),
      makePage('page-4', 'ios-version', 0, ['General', 'About', 'iOS Version'], null, null, 'iOS Version'),
    ];

    const graph = generateMermaidGraph(pages, []);

    assert.ok(graph.includes('page-1 -->|General| page-2'));
    assert.ok(graph.includes('page-2 -->|About| page-3'));
    assert.ok(graph.includes('page-3 -->|iOS Version| page-4'));
  });

  it('failed pages have red style', () => {
    const pages = [
      makePage('page-1', 's1', 0, []),
      makePage('page-2', 's2', 1, ['a'], 's1'),
    ];
    const failures = [makeFailure('s2'), makeFailure('s2'), makeFailure('s2')];
    const graph = generateMermaidGraph(pages, failures);
    assert.ok(graph.includes('style page-2 fill:#f99,stroke:#f66'));
  });

  it('partially failed pages have orange style', () => {
    const pages = [
      makePage('page-1', 's1', 0, []),
      makePage('page-2', 's2', 1, ['a'], 's1'),
    ];
    const failures = [makeFailure('s2')];
    const graph = generateMermaidGraph(pages, failures);
    assert.ok(graph.includes('style page-2 fill:#ff9,stroke:#cc6'));
  });

  it('labels are escaped (no quotes, parens, or #)', () => {
    const pages = [
      makePage('page-1', 's1', 0, [], null, null, 'Screen "Title" (Test) #1'),
    ];
    const graph = generateMermaidGraph(pages, []);
    assert.ok(!graph.includes('"Screen "'));
    assert.ok(!graph.includes('(Test)'));
    assert.ok(!graph.includes('#1'));
    assert.ok(graph.includes("Screen 'Title' Test sharp1"));
  });

  it('findPageIdByScreenId returns null when screenId not found', () => {
    const pages = [makePage('page-1', 's1', 0, [])];
    const result = findPageIdByScreenId(pages, 'nonexistent');
    assert.equal(result, null);
  });

  it('findPageIdByScreenId returns pageId when found', () => {
    const pages = [makePage('page-1', 's1', 0, []), makePage('page-2', 's2', 1, ['a'])];
    const result = findPageIdByScreenId(pages, 's2');
    assert.equal(result, 'page-2');
  });

  it('graph includes home node when pages have orphan arrivedFrom references', () => {
    const pages = [
      makePage('page-1', 's1', 1, ['a'], 'orphan-screen', 'btn'),
    ];
    const graph = generateMermaidGraph(pages, []);
    assert.ok(graph.includes('home["Home"]'));
  });

  it('graph does not include home node when all arrivals are valid', () => {
    const pages = [
      makePage('page-1', 's1', 0, []),
      makePage('page-2', 's2', 1, ['a'], 's1', 'btn'),
    ];
    const graph = generateMermaidGraph(pages, []);
    assert.ok(!graph.includes('home["Home"]'));
  });
});

describe('escapeMermaidLabel', () => {
  it('escapes double quotes', () => {
    assert.equal(escapeMermaidLabel('Say "hello"'), "Say 'hello'");
  });

  it('removes parentheses', () => {
    assert.equal(escapeMermaidLabel('Test (v2)'), 'Test v2');
  });

  it('replaces hash with sharp', () => {
    assert.equal(escapeMermaidLabel('Room #101'), 'Room sharp101');
  });

  it('removes angle brackets', () => {
    assert.equal(escapeMermaidLabel('A < B > C'), 'A  B  C');
  });

  it('handles empty string', () => {
    assert.equal(escapeMermaidLabel(''), '');
  });
});

describe('getFailureStatus', () => {
  it('returns ok for pages with no failures', () => {
    const status = getFailureStatus('page-1', 's1', []);
    assert.equal(status, 'ok');
  });

  it('returns warn for pages with 1-2 failures', () => {
    const failures = [makeFailure('s1'), makeFailure('s1')];
    const status = getFailureStatus('page-1', 's1', failures);
    assert.equal(status, 'warn');
  });

  it('returns fail for pages with more than 2 failures', () => {
    const failures = [makeFailure('s1'), makeFailure('s1'), makeFailure('s1')];
    const status = getFailureStatus('page-1', 's1', failures);
    assert.equal(status, 'fail');
  });
});

describe('generateMermaidGraphLargeApp', () => {
  it('generates sub-graphs per module', () => {
    const pages = [
      makePage('page-1', 's1', 0, []),
      makePage('page-2', 's2', 1, ['Settings']),
      makePage('page-3', 's3', 1, ['Bluetooth']),
    ];
    const modulePages = [
      { name: 'Home', pages: [pages[0]] },
      { name: 'Settings', pages: [pages[1]] },
      { name: 'Bluetooth', pages: [pages[2]] },
    ];
    const graph = generateMermaidGraphLargeApp(pages, [], modulePages);
    assert.ok(graph.includes('subgraph home'));
    assert.ok(graph.includes('subgraph settings'));
    assert.ok(graph.includes('subgraph bluetooth'));
  });
});

describe('isLargeApp', () => {
  it('returns false for small page counts', () => {
    assert.equal(isLargeApp(50), false);
    assert.equal(isLargeApp(199), false);
  });

  it('returns true for 200+ pages', () => {
    assert.equal(isLargeApp(200), true);
    assert.equal(isLargeApp(500), true);
  });
});
