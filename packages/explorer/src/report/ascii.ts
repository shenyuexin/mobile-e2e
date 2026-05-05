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

/** Detect whether a value looks like a 16-char hex hash. */
function isHashLike(value: string | undefined): boolean {
  if (!value) return false;
  return /^[a-f0-9]{16}$/i.test(value);
}

/** Extract short hash (first 8 chars) for disambiguation. */
function shortHash(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 8);
}

/** Map internal ruleFamily identifiers to human-readable labels. */
function displayNameForRuleFamily(ruleFamily: string | undefined): string | undefined {
  if (!ruleFamily) return undefined;
  const map: Record<string, string> = {
    dedup_alias: 'Already Visited',
    foreign_app_boundary: 'External App',
    stateful_form_entry: 'Form Entry',
    owner_package_gate: 'Blocked Package',
    heuristic_low_value_content: 'Low-Value Content',
    page_context_gate: 'Gated Page',
  };
  return map[ruleFamily] ?? ruleFamily;
}

function formatPageLabel(
  page: PageEntry,
  samplingDetail?: SamplingPageDetail,
): string {
  let title: string;

  if (page.ruleFamily === 'dedup_alias' || page.screenId?.includes(':alias:')) {
    // Alias inherits the original page's screenTitle via ...snapshot spread
    if (page.screenTitle?.trim()) {
      title = `[Already Visited: ${page.screenTitle.trim()}]`;
    } else if (page.viaElement?.trim()) {
      title = `${page.viaElement.trim()} [Already Visited]`;
    } else {
      title = '[Already Visited]';
    }
  } else if (page.snapshot?.isExternalApp && page.snapshot?.appId) {
    const appId = page.snapshot.appId;
    const appIdShort = appId.split('.').pop() || appId;
    const displayTitle = page.screenTitle || appIdShort;
    title = `${displayTitle} (${appId})`;
  } else if (page.screenTitle) {
    title = page.screenTitle;
  } else if (page.screenId && !isHashLike(page.screenId)) {
    title = page.screenId;
  } else if (
    page.snapshot?.appId &&
    page.snapshot.appId !== '(target-app)' &&
    !page.snapshot.appId.startsWith('external:')
  ) {
    const appId = page.snapshot.appId;
    const appIdShort = appId.split('.').pop() || appId;
    title = `${appIdShort} (${appId})`;
  } else if (page.pageContext?.type) {
    title = `[${page.pageContext.type}]`;
  } else {
    const hash = shortHash(page.screenId);
    title = hash ? `[Unnamed Page: ${hash}]` : '[Unnamed Page]';
  }

  let base = page.viaElement ? `${title}  [via: ${page.viaElement}]` : title;

  if (page.explorationStatus === 'reached-not-expanded' && page.ruleFamily) {
    const friendlyFamily = displayNameForRuleFamily(page.ruleFamily);
    base = `${base}  [reached, not expanded: ${friendlyFamily}]`;
  }

  if (page.snapshot?.isExternalApp && !title.includes('External')) {
    base = `${base}  [External App]`;
  }

  if (samplingDetail && samplingDetail.totalChildren > 0) {
    base = `${base}  [sampling: ${samplingDetail.exploredChildren}/${samplingDetail.totalChildren}]`;
  }

  return base;
}
