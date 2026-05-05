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
  extra?: Partial<PageEntry>,
): PageEntry {
  return {
    id,
    screenId,
    screenTitle: screenTitle ?? id,
    depth,
    path,
    arrivedFrom,
    viaElement,
    loadTimeMs: 100,
    clickableCount: 1,
    hasFailure: false,
    explorationStatus: 'expanded',
    snapshot: undefined as never,
    ...extra,
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
        '└── Create shipping address  [via: Create shipping address]  [reached, not expanded: Form Entry]',
        '',
      ].join('\n'),
    );
  });
});

describe('generateAsciiTree — readable labels', () => {
  it('shows [Already Visited] for alias pages', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('alias1', 'settings:alias:1', 1, ['General'], 'settings', 'General', 'Settings', {
        ruleFamily: 'dedup_alias',
        explorationStatus: 'reached-not-expanded',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('Already Visited'), `tree should show Already Visited, got:\n${tree}`);
    assert.ok(tree.includes('Settings'), `tree should preserve original screenTitle, got:\n${tree}`);
    assert.ok(!tree.includes('settings:alias:1'), `tree should not show raw alias screenId, got:\n${tree}`);
  });

  it('shows [Already Visited] for dedup_alias ruleFamily even without alias in screenId', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('alias1', 'settings-screen', 1, ['General'], 'settings', 'General', 'Settings', {
        ruleFamily: 'dedup_alias',
        explorationStatus: 'reached-not-expanded',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('Already Visited'), `tree should show Already Visited, got:\n${tree}`);
    assert.ok(tree.includes('Settings'), `tree should preserve original screenTitle, got:\n${tree}`);
  });

  it('shows appId for external app with screenTitle', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('safari', 'safari-page', 1, ['Certificate Trust Settings'], 'settings', 'Certificate Trust Settings', 'Safari', {
        snapshot: {
          isExternalApp: true,
          appId: 'com.apple.mobilesafari',
        } as never,
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('Safari (com.apple.mobilesafari)'), `tree should show appId, got:\n${tree}`);
  });

  it('does not expose raw 16-char hash for hash-only screenId', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('hashpage', 'e3b0c44298fc1c14', 1, ['General'], 'settings', 'General', undefined, {
        screenTitle: '',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(!tree.includes('e3b0c44298fc1c14'), `tree should not show raw hash, got:\n${tree}`);
    assert.ok(tree.includes('Unnamed Page'), `tree should show [Unnamed Page], got:\n${tree}`);
  });

  it('disambiguates multiple hash-only pages with short hash', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('hash1', 'e3b0c44298fc1c14', 1, ['A'], 'settings', 'A', undefined, {
        screenTitle: '',
      }),
      makePage('hash2', '6b9933e86c301931', 1, ['B'], 'settings', 'B', undefined, {
        screenTitle: '',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('e3b0c442'), `tree should show short hash for first, got:\n${tree}`);
    assert.ok(tree.includes('6b9933e8'), `tree should show short hash for second, got:\n${tree}`);
  });

  it('maps ruleFamily to friendly name in reached-not-expanded suffix', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('form', 'form-page', 1, ['Add Address'], 'settings', 'Add Address', 'Add Address', {
        explorationStatus: 'reached-not-expanded',
        ruleFamily: 'stateful_form_entry',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('[reached, not expanded: Form Entry]'), `tree should show friendly ruleFamily, got:\n${tree}`);
  });

  it('preserves original ruleFamily when unknown', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('custom', 'custom-page', 1, ['X'], 'settings', 'X', 'X', {
        explorationStatus: 'reached-not-expanded',
        ruleFamily: 'custom_rule_xyz',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('[reached, not expanded: custom_rule_xyz]'), `tree should preserve unknown ruleFamily, got:\n${tree}`);
  });

  it('does not mislabel non-external fallback appId as external app', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('nonext', 'some-page', 1, ['Link'], 'settings', 'Link', undefined, {
        screenTitle: '',
        snapshot: {
          appId: 'external:SomeLabel',
        } as never,
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(!tree.includes('external:SomeLabel'), `tree should not show fake external appId, got:\n${tree}`);
  });
});
