/**
 * Page Registry — three-tier dedup for visited pages.
 *
 * L1: Structural hash (UI tree structure + element counts)
 * L2: Text hash (visible text content)
 * L3: Visual comparison (pixelmatch on screenshots — future spike validation)
 *
 * SPEC §4.3 — dedup with structural, text, and visual comparison.
 */

import { createHash } from "node:crypto";
import { collectVisibleTexts } from "./element-prioritizer.js";
import type {
  DedupResult,
  PageEntry,
  PageRegistryContract,
  PageSnapshot,
  UiHierarchy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Hashing utilities
// ---------------------------------------------------------------------------

/** Generate a short hex hash from a string input. */
function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function isSamePath(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((part, index) => part === b[index]);
}

/**
 * L1: Hash visible text content.
 *
 * Fast check: if the visible text content matches, the page is likely the same.
 * Sorts texts to make the hash order-independent.
 */
export function hashVisibleTexts(uiTree: UiHierarchy): string {
  const texts = collectVisibleTexts(uiTree)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .sort()
    .join("|")
    .slice(0, 200);
  return shortHash(texts);
}

/**
 * L2: Hash UI structure.
 *
 * Creates a signature from element types, child counts, and nesting depth.
 * More robust than text hash for pages with dynamic content.
 */
export function hashUiStructure(uiTree: UiHierarchy): string {
  const structure = buildStructureSignature(uiTree);
  return shortHash(structure);
}

/** Build a structural signature for a UI tree node. */
function buildStructureSignature(node: UiHierarchy, depth = 0): string {
  const type = node.elementType ?? node.className ?? "?";
  const childCount = node.children?.length ?? 0;
  const childSigs =
    node.children
      ?.map((child) => buildStructureSignature(child, depth + 1))
      .join(",") ?? "";
  return `${type}:${childCount}:${childSigs}`;
}

// ---------------------------------------------------------------------------
// Page Registry
// ---------------------------------------------------------------------------

/**
 * Three-tier dedup registry for visited pages.
 *
 * Tier 1 (L1): Text hash — fast check, high confidence for content-heavy pages
 * Tier 2 (L2): Structure hash — catches pages with same layout but different text
 * Tier 3 (L3): Visual comparison — pixelmatch on screenshots (future, spike-validated)
 */
export class PageRegistry implements PageRegistryContract {
  private entries: PageEntry[] = [];
  private byTextHash = new Map<string, PageEntry[]>();
  private byStructureHash = new Map<string, PageEntry[]>();
  private counter = 0;

  /**
   * Check if a snapshot matches a previously visited page.
   *
   * Returns DedupResult with alreadyVisited=true if a match is found.
   * L3 visual comparison is deferred pending 25-00 spike validation
   * of the pixelmatch 0.05 threshold (SPEC §4.3).
   */
  async dedup(snapshot: PageSnapshot, path?: string[]): Promise<DedupResult> {
    // L1: Text hash (fast path)
    const textHash = hashVisibleTexts(snapshot.uiTree);
    const textCandidates = this.byTextHash.get(textHash) ?? [];
    if (textCandidates.length > 0) {
      const matchedEntry = path
        ? textCandidates.find((candidate) => isSamePath(path, candidate.path))
        : textCandidates[0];

      if (!matchedEntry) {
        const sameScreenEntry = textCandidates.find((candidate) => candidate.screenId === snapshot.screenId);
        if (sameScreenEntry) {
          return {
            alreadyVisited: true,
            matchedId: sameScreenEntry.id,
            confidence: "text",
            warning: "same-screen-different-path",
          };
        }

        return {
          alreadyVisited: false,
          warning: "same-visible-text-different-path",
        };
      }

      return {
        alreadyVisited: true,
        matchedId: matchedEntry.id,
        confidence: "text",
      };
    }

    // L2: Structure hash
    const structHash = hashUiStructure(snapshot.uiTree);
    const structCandidates = this.byStructureHash.get(structHash) ?? [];
    if (structCandidates.length > 0) {
      // L3 would go here: compare screenshots with pixelmatch
      // For now, return a warning that pages are structurally similar
      // but visually unverified (SPEC §4.3 — pending spike validation)
      return {
        alreadyVisited: false,
        warning: "structurally-similar-but-visually-unverified",
      };
    }

    return { alreadyVisited: false };
  }

  /**
   * Register a new page in the registry.
   * Only registers if the dedup result says not already visited.
   */
  register(result: DedupResult, snapshot: PageSnapshot, path: string[]): void {
    if (result.alreadyVisited) return;

    this.counter++;
    const entry: PageEntry = {
      id: `page-${String(this.counter).padStart(3, "0")}`,
      screenId: snapshot.screenId,
      screenTitle: snapshot.screenTitle,
      pageContext: snapshot.pageContext,
      // Derive depth from the canonical traversal path captured by the engine.
      // Snapshot.depth is currently capture-time metadata (often 0), while
      // path length reflects the actual DFS stack depth used by reports.
      depth: path.length,
      path: [...path],
      arrivedFrom: snapshot.arrivedFrom,
      viaElement: snapshot.viaElement,
      loadTimeMs: snapshot.loadTimeMs,
      clickableCount: snapshot.clickableElements.length,
      hasFailure: false,
      snapshot,
      explorationStatus: snapshot.explorationStatus ?? "expanded",
      stoppedByPolicy: snapshot.stoppedByPolicy,
      ruleFamily: snapshot.ruleFamily,
      recoveryMethod: snapshot.recoveryMethod,
      ruleDecision: snapshot.ruleDecision,
      ruleDecisions: snapshot.ruleDecisions,
    };
    this.entries.push(entry);

    // Index by hashes for future dedup
    const textHash = hashVisibleTexts(snapshot.uiTree);
    const structHash = hashUiStructure(snapshot.uiTree);
    const textEntries = this.byTextHash.get(textHash) ?? [];
    this.byTextHash.set(textHash, [...textEntries, entry]);

    const existing = this.byStructureHash.get(structHash) ?? [];
    this.byStructureHash.set(structHash, [...existing, entry]);
  }

  /** Get a page entry by ID. */
  getEntry(id: string): PageEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Get all registered page entries. */
  getEntries(): PageEntry[] {
    return [...this.entries];
  }

  /** Mark a page as having a failure. */
  markPageFailure(screenId: string): void {
    for (const entry of this.entries) {
      if (entry.screenId === screenId) {
        entry.hasFailure = true;
      }
    }
  }

  updatePageMetadata(snapshot: PageSnapshot): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry.screenId === snapshot.screenId) {
        entry.snapshot = snapshot;
        entry.explorationStatus = snapshot.explorationStatus ?? entry.explorationStatus;
        entry.stoppedByPolicy = snapshot.stoppedByPolicy;
        entry.ruleFamily = snapshot.ruleFamily;
        entry.recoveryMethod = snapshot.recoveryMethod;
        entry.ruleDecision = snapshot.ruleDecision;
        entry.ruleDecisions = snapshot.ruleDecisions;
        return;
      }
    }
  }

  /** Number of unique pages registered. */
  get count(): number {
    return this.entries.length;
  }
}
