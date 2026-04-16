import type { PageEntry } from '../types.js';
import { derivePageLink } from './hierarchy.js';

interface SamplingPageDetail {
  screenTitle?: string;
  totalChildren: number;
  exploredChildren: number;
  skippedChildren: number;
  exploredLabels: string[];
  skippedLabels: string[];
}

interface SampledSkippedChild {
  kind: 'sampled-skipped';
  label: string;
}

function isSampledSkippedChild(
  node: PageEntry | SampledSkippedChild,
): node is SampledSkippedChild {
  return (node as SampledSkippedChild).kind === 'sampled-skipped';
}

/** Generate an ASCII tree representation of the explored page structure. */
export function generateAsciiTree(
  pages: PageEntry[],
  samplingDetails: Record<string, SamplingPageDetail> = {},
): string {
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
    const label = formatPageLabel(page, samplingDetails[page.screenId]);
    if (prefix.length === 0) {
      lines.push(label);
    } else {
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label}`);
    }

    const children = childrenByParent.get(page.screenId) ?? [];
    const skippedChildren = getSkippedChildren(page.screenId, children);
    const renderChildren = [...children, ...skippedChildren];
    const nextPrefix = prefix.length === 0 ? '' : `${prefix}${isLast ? '    ' : '│   '}`;
    renderChildren.forEach((child, index) => {
      const childPrefix = prefix.length === 0 ? '' : nextPrefix;
      const branchPrefix = prefix.length === 0 ? '' : childPrefix;
      walkChild(child, branchPrefix, index === renderChildren.length - 1);
    });
  }

  function walkChild(
    node: PageEntry | SampledSkippedChild,
    prefix: string,
    isLast: boolean,
  ): void {
    if (isSampledSkippedChild(node)) {
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${node.label}`);
      return;
    }

    const label = formatPageLabel(node, samplingDetails[node.screenId]);
    lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label}`);

    const children = childrenByParent.get(node.screenId) ?? [];
    const skippedChildren = getSkippedChildren(node.screenId, children);
    const renderChildren = [...children, ...skippedChildren];
    const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
    renderChildren.forEach((child, index) => {
      walkChild(child, nextPrefix, index === renderChildren.length - 1);
    });
  }

  function getSkippedChildren(
    screenId: string,
    realChildren: PageEntry[],
  ): SampledSkippedChild[] {
    const details = samplingDetails[screenId];
    if (!details || details.skippedLabels.length === 0) {
      return [];
    }

    const existingTitles = new Set(realChildren.map((child) => child.screenTitle ?? child.screenId));
    return details.skippedLabels
      .filter((label) => !existingTitles.has(label))
      .map((label) => ({ kind: 'sampled-skipped' as const, label: `${label}  [skipped by sampling]` }));
  }
}

function formatPageLabel(
  page: PageEntry,
  samplingDetail?: SamplingPageDetail,
): string {
  const title = page.screenTitle || page.screenId;
  const base = page.viaElement ? `${title}  [via: ${page.viaElement}]` : title;
  if (!samplingDetail || samplingDetail.totalChildren <= 0) {
    return base;
  }
  return `${base}  [sampling: ${samplingDetail.exploredChildren}/${samplingDetail.totalChildren}]`;
}
