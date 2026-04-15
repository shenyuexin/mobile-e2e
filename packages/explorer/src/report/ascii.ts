import type { PageEntry } from '../types.js';
import { derivePageLink } from './hierarchy.js';

/** Generate an ASCII tree representation of the explored page structure. */
export function generateAsciiTree(pages: PageEntry[]): string {
  if (pages.length === 0) {
    return '(no pages)\n';
  }

  const pagesByScreenId = new Map<string, PageEntry>();
  for (const page of pages) {
    if (!pagesByScreenId.has(page.screenId)) {
      pagesByScreenId.set(page.screenId, page);
    }
  }

  const childrenByParent = new Map<string, PageEntry[]>();
  const roots: PageEntry[] = [];

  for (const page of pages) {
    const link = derivePageLink(page, pages);

    if (!link.parentScreenId || !pagesByScreenId.has(link.parentScreenId)) {
      roots.push(page);
      continue;
    }

    const siblings = childrenByParent.get(link.parentScreenId) ?? [];
    siblings.push(page);
    childrenByParent.set(link.parentScreenId, siblings);
  }

  const lines: string[] = [];
  roots.forEach((root, rootIndex) => {
    if (rootIndex > 0) {
      lines.push('');
    }
    walk(root, '', true);
  });

  return `${lines.join('\n')}\n`;

  function walk(page: PageEntry, prefix: string, isLast: boolean): void {
    const label = formatPageLabel(page);
    if (prefix.length === 0) {
      lines.push(label);
    } else {
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label}`);
    }

    const children = childrenByParent.get(page.screenId) ?? [];
    const nextPrefix = prefix.length === 0 ? '' : `${prefix}${isLast ? '    ' : '│   '}`;
    children.forEach((child, index) => {
      const childPrefix = prefix.length === 0 ? '' : nextPrefix;
      const branchPrefix = prefix.length === 0 ? '' : childPrefix;
      walkChild(child, branchPrefix, index === children.length - 1);
    });
  }

  function walkChild(page: PageEntry, prefix: string, isLast: boolean): void {
    const label = formatPageLabel(page);
    lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label}`);

    const children = childrenByParent.get(page.screenId) ?? [];
    const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
    children.forEach((child, index) => {
      walkChild(child, nextPrefix, index === children.length - 1);
    });
  }
}

function formatPageLabel(page: PageEntry): string {
  const title = page.screenTitle || page.screenId;
  return page.viaElement ? `${title}  [via: ${page.viaElement}]` : title;
}
