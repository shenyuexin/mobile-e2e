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
    explorationStatus: 'expanded',
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

  it('falls back to path-derived hierarchy when arrivedFrom is missing', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('general', 'general', 0, ['General'], null, null, 'General'),
      makePage('about', 'about', 0, ['General', 'About'], null, null, 'About'),
      makePage('ios-version', 'ios-version', 0, ['General', 'About', 'iOS Version'], null, null, 'iOS Version'),
    ];

    const tree = generateAsciiTree(pages);

    assert.equal(
      tree,
      [
        'Settings',
        '└── General',
        '    └── About',
        '        └── iOS Version',
        '',
      ].join('\n'),
    );
  });

  it('renders sampled skipped children and per-page sampling counts', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('general', 'general', 0, ['General'], null, null, 'General'),
      makePage('fonts', 'fonts', 0, ['General', 'Fonts'], null, null, 'Fonts'),
    ];

    const tree = generateAsciiTree(pages, {
      fonts: {
        screenTitle: 'Fonts',
        totalChildren: 3,
        exploredChildren: 1,
        skippedChildren: 2,
        exploredLabels: ['System Fonts'],
        skippedLabels: ['System Fonts', 'My Fonts'],
      },
    });

    assert.equal(
      tree,
      [
        'Settings',
        '└── General',
        '    └── Fonts  [sampling: 1/3]',
        '        ├── System Fonts  [skipped by sampling]',
        '        └── My Fonts  [skipped by sampling]',
        '',
      ].join('\n'),
    );
  });

  it('renders reached-but-not-expanded stateful branches', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('shipping', 'shipping', 1, ['Create shipping address'], 'settings', 'Create shipping address', 'Create shipping address'),
    ];
    pages[1].explorationStatus = 'reached-not-expanded';
    pages[1].ruleFamily = 'stateful_form_entry';

    const tree = generateAsciiTree(pages);

    assert.equal(
      tree,
      [
        'Settings',
        '└── Create shipping address  [via: Create shipping address]  [reached, not expanded: stateful_form_entry]',
        '',
      ].join('\n'),
    );
  });
});
