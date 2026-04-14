import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PageEntry } from '../../src/types.js';
import { generateAsciiTree } from '../../src/report/index.js';

function makePage(
  id: string,
  screenId: string,
  depth: number,
  path: string[],
  arrivedFrom: string | null = null,
  viaElement: string | null = null,
  screenTitle?: string,
): PageEntry {
  return {
    id,
    screenId,
    screenTitle: screenTitle || id,
    depth,
    path,
    arrivedFrom,
    viaElement,
    loadTimeMs: 100,
    clickableCount: 1,
    hasFailure: false,
    snapshot: undefined as never,
  };
}

describe('generateAsciiTree', () => {
  it('renders a readable tree with branch markers and via labels', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('general', 'general', 1, ['General'], 'settings', 'General', 'General'),
      makePage('about', 'about', 2, ['General', 'About'], 'general', 'About', 'About'),
      makePage('dictionary', 'dictionary', 2, ['General', 'Dictionary'], 'general', 'Dictionary', 'Dictionary'),
    ];

    const tree = generateAsciiTree(pages);

    assert.equal(
      tree,
      [
        'Settings',
        '└── General  [via: General]',
        '    ├── About  [via: About]',
        '    └── Dictionary  [via: Dictionary]',
        '',
      ].join('\n'),
    );
  });
});
