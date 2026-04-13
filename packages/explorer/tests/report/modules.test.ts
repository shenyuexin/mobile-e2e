/**
 * Tests for module inference algorithm.
 *
 * Validates that pages are correctly grouped by depth-1 path segment.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferModules } from '../../src/report/modules.js';
import type { PageEntry } from '../../src/types.js';

function makePage(path: string[], overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    id: `page-${path.join('-') || 'root'}`,
    screenId: `screen-${path.join('-') || 'root'}`,
    screenTitle: path[path.length - 1] || 'Home',
    depth: path.length,
    path,
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs: 100,
    clickableCount: 5,
    hasFailure: false,
    ...overrides,
  };
}

describe('inferModules', () => {
  it('returns empty array for empty pages', () => {
    const modules = inferModules([]);
    assert.deepEqual(modules, []);
  });

  it('groups pages with empty path under "Home"', () => {
    const pages = [
      makePage([]),
      makePage([]),
    ];
    const modules = inferModules(pages);
    assert.equal(modules.length, 1);
    assert.equal(modules[0].name, 'Home');
    assert.equal(modules[0].pages.length, 2);
  });

  it('groups pages by depth-1 path segment', () => {
    const pages = [
      makePage(['Wi-Fi', 'Advanced']),
      makePage(['Wi-Fi']),
      makePage(['Bluetooth']),
      makePage([]),
    ];
    const modules = inferModules(pages);
    assert.equal(modules.length, 3);

    const names = modules.map((m) => m.name);
    assert.deepEqual(names, ['Bluetooth', 'Home', 'Wi-Fi']);

    const wifiModule = modules.find((m) => m.name === 'Wi-Fi')!;
    assert.equal(wifiModule.pages.length, 2);

    const btModule = modules.find((m) => m.name === 'Bluetooth')!;
    assert.equal(btModule.pages.length, 1);

    const homeModule = modules.find((m) => m.name === 'Home')!;
    assert.equal(homeModule.pages.length, 1);
  });

  it('sorts modules alphabetically', () => {
    const pages = [
      makePage(['Zebra']),
      makePage(['Alpha']),
      makePage(['Middle']),
    ];
    const modules = inferModules(pages);
    assert.deepEqual(
      modules.map((m) => m.name),
      ['Alpha', 'Middle', 'Zebra'],
    );
  });

  it('handles pages with varying depths within the same module', () => {
    const pages = [
      makePage(['Settings']),
      makePage(['Settings', 'Display']),
      makePage(['Settings', 'Display', 'Brightness']),
    ];
    const modules = inferModules(pages);
    assert.equal(modules.length, 1);
    assert.equal(modules[0].name, 'Settings');
    assert.equal(modules[0].pages.length, 3);
  });
});
