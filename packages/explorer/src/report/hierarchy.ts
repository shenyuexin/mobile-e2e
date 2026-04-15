import type { PageEntry } from '../types.js';

interface DerivedPageLink {
  parentScreenId: string | null;
  viaElement: string | null;
}

function pathKey(path: string[]): string {
  return JSON.stringify(path);
}

export function derivePageLink(page: PageEntry, pages: PageEntry[]): DerivedPageLink {
  if (page.arrivedFrom) {
    return {
      parentScreenId: page.arrivedFrom,
      viaElement: page.viaElement,
    };
  }

  if (page.path.length === 0) {
    return {
      parentScreenId: null,
      viaElement: page.viaElement,
    };
  }

  const parentPath = page.path.slice(0, -1);
  const parent = pages.find((candidate) => pathKey(candidate.path) === pathKey(parentPath)) ?? null;

  return {
    parentScreenId: parent?.screenId ?? null,
    viaElement: page.viaElement ?? page.path.at(-1) ?? null,
  };
}
