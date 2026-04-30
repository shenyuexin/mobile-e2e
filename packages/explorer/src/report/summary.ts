/**
 * Summary JSON generation for exploration reports.
 *
 * Produces `summary.json` with page counts, failure details, module breakdown,
 * and run metadata.
 *
 * §5.3 — Summary specification.
 */

import type {
  ExplorerConfig,
  FailureEntry,
  PageEntry,
  StateGraphSummary,
  TransitionLifecycleSummary,
} from "../types.js";
import type { ModuleGroup } from "./modules.js";

/** Compact run entry for the index.json history file. */
export interface RunIndexEntry {
  /** Run identifier (ISO timestamp sanitized). */
  id: string;
  /** App bundle ID / package name. */
  appId: string;
  /** App version string. */
  appVersion: string;
  /** Target platform. */
  platform: string;
  /** Exploration mode. */
  mode: string;
  /** Optional scope filter description. */
  scope?: string;
  /** Total pages visited. */
  pageCount: number;
  /** Total failures recorded. */
  failureCount: number;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** Maximum depth reached during exploration. */
  maxDepthReached: number;
  /** Path to the config.json for this run. */
  configPath: string;
  /** Path to the summary.json for this run. */
  summaryPath: string;
  /** Whether the run completed fully or was aborted. */
  status: "complete" | "partial";
  /** Whether the run was aborted. */
  aborted?: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
}

/** Full summary written to summary.json per run. */
export interface RunSummary {
  /** Run identifier. */
  runId: string;
  /** ISO timestamp when exploration started. */
  startedAt: string;
  /** ISO timestamp when exploration ended. */
  completedAt: string;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** Total pages visited. */
  totalPages: number;
  /** Number of unique paths visited. */
  totalPaths: number;
  /** Total failure count. */
  totalFailures: number;
  /** Maximum depth reached. */
  maxDepthReached: number;
  /** List of inferred module names. */
  uniqueModules: string[];
  /** Failure details. */
  failures: Array<{
    pageScreenId: string;
    elementLabel: string;
    failureType: string;
    retryCount: number;
    errorMessage: string;
    depth: number;
    path: string[];
  }>;
  /** Page inventory. */
  pages: Array<{
    id: string;
    screenId: string;
    screenTitle?: string;
    pageContext?: {
      type: string;
      platform: string;
      detectionSource: string;
      confidence: number;
    };
    depth: number;
    path: string[];
    arrivedFrom: string | null;
    viaElement: string | null;
    loadTimeMs: number;
		clickableCount: number;
		hasFailure: boolean;
		explorationStatus?: "expanded" | "reached-not-expanded";
		stoppedByPolicy?: string;
		ruleFamily?: string;
		recoveryMethod?: string;
		ruleDecision?: PageEntry["ruleDecision"];
		ruleDecisions?: PageEntry["ruleDecisions"];
	}>;
	/** Aggregate rule decision counts for explainable traversal policy. */
	ruleDecisions?: {
		total: number;
		byRuleId: Record<string, number>;
		byCategory: Record<string, number>;
		byAction: Record<string, number>;
		examples: NonNullable<PageEntry["ruleDecision"]>[];
	};
  /** Present when the run was aborted. */
  aborted?: boolean;
  /** Present when the run was aborted. */
  abortReason?: string;
  /** Present when high-fanout collection page sampling was applied. */
  sampling?: {
    /** Screen IDs of pages where sampling was applied. */
    appliedPages: string[];
    /** Total children skipped due to sampling. */
    skippedChildren: number;
    /** Per-page sampling details for transparency in reports. */
    details?: Record<
      string,
      {
        screenTitle?: string;
        totalChildren: number;
        exploredChildren: number;
        skippedChildren: number;
        exploredLabels: string[];
        skippedLabels: string[];
      }
    >;
  };
  /** Transition lifecycle counters for navigation auditing. */
  transitionLifecycle?: TransitionLifecycleSummary;
  /** StateGraph aggregate counters. */
  stateGraph?: StateGraphSummary;
  /** Page type distribution summary. */
  pageTypeCounts?: PageTypeCounts;
}

/** Counts of pages by their detected page context type. */
export interface PageTypeCounts {
  /** Pages detected as normal_page. */
  normalPages: number;
  /** Pages detected as form_editor. */
  formEditorPages: number;
  /** Pages detected as app_dialog. */
  dialogPages: number;
  /** Pages detected as system_alert_surface. */
  alertPages: number;
  /** Pages detected as action_sheet_surface. */
  actionSheetPages: number;
  /** Pages detected as app_modal. */
  modalPages: number;
  /** Pages detected as system_overlay. */
  overlayPages: number;
  /** Pages detected as permission_surface. */
  permissionPages: number;
  /** Pages detected as keyboard_surface. */
  keyboardPages: number;
  /** Pages with unknown or unclassified type. */
  unknownPages: number;
}

/** Options passed to summary generation. */
export interface SummaryOpts {
  /** Whether the exploration was aborted / partial. */
  partial: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** ISO timestamp when exploration started. */
  startedAt?: string;
  /** Sampling metadata for high-fanout collection pages. */
  sampling?: {
    appliedPages: string[];
    skippedChildren: number;
    details?: Record<
      string,
      {
        screenTitle?: string;
        totalChildren: number;
        exploredChildren: number;
        skippedChildren: number;
        exploredLabels: string[];
        skippedLabels: string[];
      }
    >;
  };
  /** Transition lifecycle counters from the engine. */
  transitionLifecycle?: TransitionLifecycleSummary;
  /** StateGraph aggregate counters from engine. */
  stateGraph?: StateGraphSummary;
  /** Precomputed run id reused by the surrounding report directory. */
  runId?: string;
}

/**
 * Generate the summary JSON for an exploration run.
 *
 * @param pages - All visited page entries
 * @param failures - All failure entries
 * @param modules - Inferred module groups
 * @param _config - Explorer configuration
 * @param opts - Summary options
 * @returns RunSummary object ready for JSON serialization
 */
export function generateSummaryJson(
  pages: PageEntry[],
  failures: FailureEntry[],
  modules: ModuleGroup[],
  _config: ExplorerConfig,
  opts: SummaryOpts,
): RunSummary {
  const maxDepth =
    pages.length > 0 ? pages.reduce((max, p) => Math.max(max, p.depth), 0) : 0;
  const runId = resolveRunId({
    runId: opts.runId,
    startedAt: opts.startedAt,
    envRunId: process.env.EXPLORER_RUN_ID,
  });

  const summary: RunSummary = {
    runId,
    startedAt: formatRunTimestamp(
      opts.startedAt ?? new Date(Date.now() - opts.durationMs).toISOString(),
    ),
    completedAt: formatRunTimestamp(new Date()),
    durationMs: opts.durationMs,
    totalPages: pages.length,
    totalPaths: countUniquePaths(pages),
    totalFailures: failures.length,
    maxDepthReached: maxDepth,
    uniqueModules: modules.map((m) => m.name),
    failures: failures.map((f) => ({
      pageScreenId: f.pageScreenId,
      elementLabel: f.elementLabel,
      failureType: f.failureType,
      retryCount: f.retryCount,
      errorMessage: f.errorMessage,
      depth: f.depth,
      path: f.path,
    })),
    pages: pages.map((p) => ({
      id: p.id,
      screenId: p.screenId,
      screenTitle: p.screenTitle,
      pageContext: p.pageContext,
      depth: p.depth,
      path: p.path,
      arrivedFrom: p.arrivedFrom,
      viaElement: p.viaElement,
      loadTimeMs: p.loadTimeMs,
      clickableCount: p.clickableCount,
      hasFailure: p.hasFailure,
      explorationStatus: p.explorationStatus,
      stoppedByPolicy: p.stoppedByPolicy,
			ruleFamily: p.ruleFamily,
			recoveryMethod: p.recoveryMethod,
			ruleDecision: p.ruleDecision,
			ruleDecisions: p.ruleDecisions,
		})),
	};

  if (opts.partial) {
    summary.aborted = true;
    summary.abortReason = opts.abortReason;
  }

  if (opts.sampling) {
    summary.sampling = opts.sampling;
  }

  if (opts.transitionLifecycle) {
    summary.transitionLifecycle = opts.transitionLifecycle;
  }

  if (opts.stateGraph) {
    summary.stateGraph = opts.stateGraph;
  }

	summary.pageTypeCounts = countPageTypes(pages);
	const ruleDecisions = summarizeRuleDecisions(pages);
	if (ruleDecisions.total > 0) {
		summary.ruleDecisions = ruleDecisions;
	}

	return summary;
}

function incrementCounter(counter: Record<string, number>, key: string): void {
	counter[key] = (counter[key] ?? 0) + 1;
}

function summarizeRuleDecisions(pages: PageEntry[]): NonNullable<RunSummary["ruleDecisions"]> {
	const decisions = pages
		.flatMap((page) => [page.ruleDecision, ...(page.ruleDecisions ?? [])])
		.filter((decision): decision is NonNullable<PageEntry["ruleDecision"]> => decision !== undefined);
	const summary: NonNullable<RunSummary["ruleDecisions"]> = {
		total: decisions.length,
		byRuleId: {},
		byCategory: {},
		byAction: {},
		examples: decisions.slice(0, 10),
	};
	for (const decision of decisions) {
		incrementCounter(summary.byRuleId, decision.ruleId);
		incrementCounter(summary.byCategory, decision.category);
		incrementCounter(summary.byAction, decision.action);
	}
	return summary;
}

/** Generate a sanitized run ID from the current timestamp. */
export function generateRunId(): string {
  return sanitizeRunIdTimestamp(new Date().toISOString());
}

/** Format a timestamp as an ISO-like string in the current machine's local timezone. */
export function formatRunTimestamp(timestamp: string | number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, "0");
  const offsetRemainderMinutes = String(absOffsetMinutes % 60).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}

/** Convert an ISO-like timestamp into a filesystem-safe run ID. */
export function sanitizeRunIdTimestamp(timestamp: string): string {
  return formatRunTimestamp(timestamp).replace(/[:.]/g, "-").slice(0, 19);
}

/** Resolve the stable run ID for the current exploration run. */
export function resolveRunId(opts: {
  runId?: string;
  startedAt?: string;
  envRunId?: string;
}): string {
  if (opts.runId?.trim()) {
    return opts.runId.trim();
  }

  if (opts.envRunId?.trim()) {
    return opts.envRunId.trim();
  }

  if (opts.startedAt?.trim()) {
    return sanitizeRunIdTimestamp(opts.startedAt);
  }

  return generateRunId();
}

/** Count unique paths among the given pages. */
export function countUniquePaths(pages: PageEntry[]): number {
  const paths = new Set(pages.map((p) => p.path.join("/")));
  return paths.size;
}

/** Count pages by their detected page context type. */
export function countPageTypes(pages: PageEntry[]): PageTypeCounts {
	const counts: PageTypeCounts = {
		normalPages: 0,
		formEditorPages: 0,
		dialogPages: 0,
    alertPages: 0,
    actionSheetPages: 0,
    modalPages: 0,
    overlayPages: 0,
    permissionPages: 0,
    keyboardPages: 0,
    unknownPages: 0,
  };

  for (const page of pages) {
    const type = page.pageContext?.type ?? "unknown";
		switch (type) {
			case "normal_page":
				counts.normalPages++;
				break;
			case "form_editor":
				counts.formEditorPages++;
				break;
			case "app_dialog":
        counts.dialogPages++;
        break;
      case "system_alert_surface":
        counts.alertPages++;
        break;
      case "action_sheet_surface":
        counts.actionSheetPages++;
        break;
      case "app_modal":
        counts.modalPages++;
        break;
      case "system_overlay":
        counts.overlayPages++;
        break;
      case "permission_surface":
        counts.permissionPages++;
        break;
      case "keyboard_surface":
        counts.keyboardPages++;
        break;
      default:
        counts.unknownPages++;
        break;
    }
  }

  return counts;
}
