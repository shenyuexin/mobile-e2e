/**
 * Backtracking — navigate back to the parent page.
 *
 * Uses MCP `navigate_back` tool with verification via page-change validation.
 * SPEC §4.1 — page change validation after each back to prevent infinite loops.
 * Accuracy target: >=95% across >=30 operations.
 */

import type { McpToolInterface, UiHierarchy } from "./types.js";
import type { BackAffordance, BacktrackLadderContext, BacktrackTapSelector, CachedBackStrategy } from "./backtrack-core.js";
import { runAndroidBacktrackLadder } from "./backtrack-android.js";
import { runIosBacktrackLadder } from "./backtrack-ios.js";
import { resolveExplorerPlatformHooks } from "./explorer-platform.js";
import { generateScreenId } from "./snapshot.js";
import { hashUiStructure } from "./page-registry.js";

/**
 * Create a backtracker bound to the given MCP tool interface.
 */
export function createBacktracker(
  mcp: McpToolInterface,
  platform: "ios-simulator" | "ios-device" | "android-emulator" | "android-device" = "ios-simulator",
) {
  const platformHooks = resolveExplorerPlatformHooks(platform);
  // Cache of known screenId -> structureHash mappings
  const knownPages = new Map<string, string>();
  const backStrategyCache = new Map<string, CachedBackStrategy>();
  // Learned successful back point per (page, expected-parent) context.
  const backPointCache = new Map<string, { x: number; y: number; name: string }>();

  const captureCurrentPageContext = async (): Promise<{ screenId?: string; title?: string }> => {
    const inspectResult = await mcp.inspectUi();
    if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
      return {};
    }
    const uiTree = parseUiTreeFromInspectResult(
      inspectResult.data as unknown as Record<string, unknown>,
    );
    if (!uiTree) {
      return {};
    }
    return {
      screenId: generateScreenId(uiTree),
      title: extractScreenTitleFromUiTree(uiTree),
    };
  };

  const isSuccessfulBackResult = (result: Awaited<ReturnType<McpToolInterface["navigateBack"]>>): boolean => {
    if (result.status !== "success" && result.status !== "partial") {
      return false;
    }

    const data = (result.data ?? {}) as unknown as Record<string, unknown>;
    if (data.stateChanged === false) {
      return false;
    }

    return true;
  };

  const extractScreenTitleFromUiTree = (uiTree: UiHierarchy): string | undefined =>
    platformHooks.extractScreenTitle(uiTree);

  const parseUiTreeFromInspectResult = (
    data: Record<string, unknown>,
  ): UiHierarchy | null => platformHooks.parseInspectUi(data, { fallbackToDataRoot: false });

  return {
    /**
     * Register a page's structure hash for later fuzzy matching.
     */
    registerPage(screenId: string, uiTree: UiHierarchy): void {
      knownPages.set(screenId, hashUiStructure(uiTree));
    },

    /**
     * Navigate back to the parent page.
     *
     * @param parentTitle — title of the parent page (used as iOS back button text)
     * @returns true if back navigation succeeded and UI stabilized.
     */
    async navigateBack(parentTitle?: string): Promise<boolean> {
      const buildBackPointCacheKey = (
        ctx: { screenId?: string; title?: string },
        expectedParentTitle?: string,
      ): string => {
        const pageKey = ctx.screenId ?? normalizeTitle(ctx.title ?? "unknown-page");
        const parentKey = normalizeTitle(expectedParentTitle ?? "<none>");
        return `${pageKey}::${parentKey}`;
      };

      const cacheSemanticStrategy = (cacheKey: string, strategy: CachedBackStrategy): void => {
        backStrategyCache.set(cacheKey, strategy);
      };

      const toCachedBackStrategy = (
        method: string,
        args?: {
          parentPageTitle?: string;
          iosStrategy?: "selector_tap" | "edge_swipe";
          selector?: BacktrackTapSelector;
        },
      ): CachedBackStrategy | undefined => {
        if (method === "navigate_back:system_back") {
          return { kind: "system_back" };
        }
        if (args?.iosStrategy === "edge_swipe") {
          return { kind: "edge_swipe" };
        }
        if (args?.selector?.contentDesc) {
          return { kind: "selector_content_desc", contentDesc: args.selector.contentDesc };
        }
        if (args?.selector?.text) {
          return { kind: "selector_text", text: args.selector.text };
        }
        if (args?.parentPageTitle) {
          return { kind: "selector_parent", parentPageTitle: args.parentPageTitle };
        }
        return undefined;
      };

      const executeCachedBackStrategy = async (strategy: CachedBackStrategy): Promise<boolean> => {
        switch (strategy.kind) {
          case "system_back":
            return tryNavigateBack("cached:navigate_back:system_back");
          case "edge_swipe":
            return tryNavigateBack("cached:navigate_back:edge_swipe", { iosStrategy: "edge_swipe" });
          case "selector_content_desc":
            return tryNavigateBack("cached:navigate_back:selector_content_desc", {
              iosStrategy: "selector_tap",
              selector: { contentDesc: strategy.contentDesc, className: "Button", clickable: true },
            });
          case "selector_text":
            return tryNavigateBack("cached:navigate_back:selector_text", {
              iosStrategy: "selector_tap",
              selector: { text: strategy.text, className: "Button", clickable: true },
            });
          case "selector_parent":
            return tryNavigateBack("cached:navigate_back:selector_parent", {
              parentPageTitle: strategy.parentPageTitle,
              iosStrategy: "selector_tap",
            });
          case "tap_back_content_desc":
            return tryTapBackControl("cached:tap_back_button:contentDesc", {
              contentDesc: strategy.contentDesc,
              className: "Button",
              clickable: true,
            });
          case "tap_back_text":
            return tryTapBackControl("cached:tap_back_button:text", {
              text: strategy.text,
              className: "Button",
              clickable: true,
            });
          case "cancel_or_close":
            return tryTapBackControl("cached:tap_cancel_or_close:text", { text: strategy.label });
          case "dialog_control":
            return tryTapBackControl("cached:tap_dialog_control:text", { text: strategy.label });
        }
      };

      const normalizeLabel = (label: string): string => label.trim().replace(/\s+/g, " ");

      const dedupeLabels = (labels: string[]): string[] => {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const raw of labels) {
          const label = normalizeLabel(raw);
          if (!label || seen.has(label.toLowerCase())) {
            continue;
          }
          seen.add(label.toLowerCase());
          result.push(label);
        }
        return result;
      };

      const logTrace = (message: string): void => {
        console.log(`[BACKTRACK-TRACE] ${message}`);
      };

      const logWarn = (message: string): void => {
        console.log(`[BACKTRACK-WARN] ${message}`);
      };

      const detectBackAffordance = async (): Promise<BackAffordance> => {
        const inspectResult = await mcp.inspectUi();
        if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
          return { status: "not_detected", selectorLabels: [] };
        }

        const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
        if (!uiTree) {
          return { status: "not_detected", selectorLabels: [] };
        }

        const nodes = flattenUiTree(uiTree);
        const navBarNode = nodes.find((node) => {
          const role = (node.accessibilityRole ?? "").toLowerCase();
          const className = (node.className ?? "").toLowerCase();
          return (role.includes("nav bar") || className.includes("navigationbar")) && node.frame;
        });

        const normalizedParent = parentTitle ? normalizeLabel(parentTitle).toLowerCase() : "";
        const selectorCandidates = nodes
          .filter((node) => {
            const role = (node.accessibilityRole ?? "").toLowerCase();
            const className = (node.className ?? "").toLowerCase();
            const isButtonLike = node.clickable
              || role.includes("button")
              || role.includes("back button")
              || className.includes("button");
            const topY = node.frame?.y ?? Number.MAX_SAFE_INTEGER;
            return isButtonLike && topY <= 180;
          })
          .map((node) => normalizeLabel(node.contentDesc ?? node.text ?? node.accessibilityLabel ?? ""))
          .filter((label) => label.length > 0)
          .filter((label) => {
            const normalized = label.toLowerCase();
            return normalized === "back"
              || normalized.includes("back")
              || normalized.startsWith("<")
              || normalized.startsWith("‹")
              || (normalizedParent.length > 0 && normalized.includes(normalizedParent));
          });

        const navBarBottom = navBarNode?.frame ? navBarNode.frame.y + navBarNode.frame.height + 24 : 180;
        const hasSearchField = nodes.some((node) => {
          const className = (node.className ?? "").toLowerCase();
          const elementType = (node.elementType ?? "").toLowerCase();
          const role = (node.accessibilityRole ?? "").toLowerCase();
          return className.includes("searchfield")
            || elementType.includes("searchfield")
            || role.includes("searchfield");
        });
        const hasTopCancelButton = nodes.some((node) => {
          const topY = node.frame?.y ?? Number.MAX_SAFE_INTEGER;
          const label = normalizeLabel(node.contentDesc ?? node.text ?? node.accessibilityLabel ?? "").toLowerCase();
          const role = (node.accessibilityRole ?? "").toLowerCase();
          const className = (node.className ?? "").toLowerCase();
          const isButtonLike = node.clickable || role.includes("button") || className.includes("button");
          return isButtonLike && label === "cancel" && topY <= navBarBottom;
        });
        const dialogButtons = nodes.filter((node) => {
          const label = normalizeLabel(node.contentDesc ?? node.text ?? node.accessibilityLabel ?? "").toLowerCase();
          const role = (node.accessibilityRole ?? "").toLowerCase();
          const className = (node.className ?? "").toLowerCase();
          const isButtonLike = node.clickable || role.includes("button") || className.includes("button");
          return isButtonLike && ["cancel", "close", "ok", "done", "allow"].includes(label);
        });
        const hasDialogTitle = nodes.some((node) => {
          const label = normalizeLabel(node.contentDesc ?? node.text ?? node.accessibilityLabel ?? "").toLowerCase();
          const role = (node.accessibilityRole ?? "").toLowerCase();
          const className = (node.className ?? "").toLowerCase();
          return (role.includes("alert") || role.includes("dialog") || className.includes("alert") || className.includes("sheet"))
            && label.length > 0;
        });

        const selectorLabels = dedupeLabels([
          ...selectorCandidates,
          ...(parentTitle ? [parentTitle] : []),
          "Back",
        ]);

        const status: BackAffordance["status"] = selectorCandidates.length > 0
          ? "selector_detected"
          : navBarNode?.frame
          ? "nav_bar_only"
          : "not_detected";
        const isSearchActiveLike = Boolean(navBarNode?.frame)
          && selectorCandidates.length === 0
          && (hasSearchField || hasTopCancelButton);
        const isDialogLike = hasDialogTitle || dialogButtons.length >= 2;

        logTrace(
          `affordance status=${status}, selectorCandidates=${JSON.stringify(selectorCandidates.slice(0, 3))}, ` +
          `navBarFrame=${JSON.stringify(navBarNode?.frame ?? null)}, searchActiveLike=${String(isSearchActiveLike)}, dialogLike=${String(isDialogLike)}`,
        );

        return {
          status,
          navBarFrame: navBarNode?.frame,
          selectorLabels,
          isSearchActiveLike,
          isDialogLike,
        };
      };

      const waitForSettle = async (): Promise<boolean> => {
        const settleResult = await mcp.waitForUiStable({ timeoutMs: 3000 });
        if (settleResult.status !== "success" && settleResult.status !== "partial") {
          logWarn(`waitForUiStable failed: status=${settleResult.status}, reason=${settleResult.reasonCode}`);
        }
        return settleResult.status === "success" || settleResult.status === "partial";
      };

      const verifyScreenChanged = (
        before: { screenId?: string; title?: string },
        after: { screenId?: string; title?: string },
      ): boolean => {
        if (before.screenId && after.screenId) {
          return before.screenId !== after.screenId;
        }

        if (before.title && after.title) {
          return normalizeTitle(before.title) !== normalizeTitle(after.title);
        }

        // If we cannot compare either IDs or titles reliably, treat as unchanged.
        return false;
      };

      const verifyBackTransition = (
        before: { screenId?: string; title?: string },
        after: { screenId?: string; title?: string },
        expectedParentTitle?: string,
      ): boolean => {
        const normalizedExpectedParent = expectedParentTitle
          ? normalizeTitle(expectedParentTitle)
          : undefined;

        if (normalizedExpectedParent && after.title) {
          const normalizedAfterTitle = normalizeTitle(after.title);
          if (normalizedAfterTitle === normalizedExpectedParent) {
            return true;
          }

          // If caller gave an explicit parent title but we did not reach it,
          // reject even when screenId hash changed (dynamic content can drift).
          return false;
        }

        return verifyScreenChanged(before, after);
      };

      const tryNavigateBack = async (
        method: string,
        args?: {
          parentPageTitle?: string;
          iosStrategy?: "selector_tap" | "edge_swipe";
          selector?: BacktrackTapSelector;
        },
      ): Promise<boolean> => {
        const before = await captureCurrentPageContext();
        const result = await mcp.navigateBack(args);
        const resultData = (result.data ?? {}) as unknown as Record<string, unknown>;

        const detail =
          `method=${method}, status=${result.status}, reason=${result.reasonCode}, ` +
          `executed=${String(resultData.executedStrategy ?? "unknown")}, ` +
          `stateChanged=${String(resultData.stateChanged ?? "unknown")}, ` +
          `pageTreeHashUnchanged=${String(resultData.pageTreeHashUnchanged ?? "unknown")}, ` +
          `fallbackUsed=${String(resultData.fallbackUsed ?? "unknown")}`;

        if (!isSuccessfulBackResult(result)) {
          logWarn(`${detail} => rejected by contract check`);
          return false;
        }

        if (!(await waitForSettle())) {
          logWarn(`${detail} => settle failed`);
          return false;
        }

        const after = await captureCurrentPageContext();
        if (!verifyBackTransition(before, after, parentTitle)) {
          logWarn(
            `${detail} => transition rejected (before=${before.title ?? "unknown"}[${before.screenId ?? "n/a"}], ` +
            `after=${after.title ?? "unknown"}[${after.screenId ?? "n/a"}], ` +
            `expectedParent=${parentTitle ?? "<none>"})`,
          );
          return false;
        }

        logTrace(
          `${detail} => success (before=${before.title ?? "unknown"}[${before.screenId ?? "n/a"}], ` +
          `after=${after.title ?? "unknown"}[${after.screenId ?? "n/a"}], ` +
          `expectedParent=${parentTitle ?? "<none>"})`,
        );
        const strategy = toCachedBackStrategy(method, args);
        const cacheKey = buildBackPointCacheKey(before, parentTitle);
        if (strategy) {
          cacheSemanticStrategy(cacheKey, strategy);
        }
        return true;
      };

      const tryTapBackControl = async (
        method: string,
        selector: BacktrackTapSelector,
      ): Promise<boolean> => {
        const before = await captureCurrentPageContext();
        const tapResult = await mcp.tapElement(selector);
        const selectorLabel = selector.contentDesc ?? selector.text ?? "<unknown-selector>";
        const detail =
          `method=${method}, selector="${selectorLabel}", coordinate=n/a, status=${tapResult.status}, ` +
          `reason=${tapResult.reasonCode}, executedStrategy=tap_element`;

        if (tapResult.status !== "success" && tapResult.status !== "partial") {
          logWarn(`${detail} => tap failed`);
          return false;
        }

        if (!(await waitForSettle())) {
          logWarn(`${detail} => settle failed`);
          return false;
        }

        const after = await captureCurrentPageContext();
        if (!verifyBackTransition(before, after, parentTitle)) {
          logWarn(
            `${detail} => transition rejected (before=${before.title ?? "unknown"}[${before.screenId ?? "n/a"}], ` +
            `after=${after.title ?? "unknown"}[${after.screenId ?? "n/a"}], ` +
            `expectedParent=${parentTitle ?? "<none>"})`,
          );
          return false;
        }

        logTrace(
          `${detail} => success (before=${before.title ?? "unknown"}[${before.screenId ?? "n/a"}], ` +
          `after=${after.title ?? "unknown"}[${after.screenId ?? "n/a"}], ` +
          `expectedParent=${parentTitle ?? "<none>"})`,
        );
        const cacheKey = buildBackPointCacheKey(before, parentTitle);
        if (method.includes("tap_back_button:contentDesc") && selector.contentDesc) {
          cacheSemanticStrategy(cacheKey, { kind: "tap_back_content_desc", contentDesc: selector.contentDesc });
        } else if (method.includes("tap_back_button:text") && selector.text) {
          cacheSemanticStrategy(cacheKey, { kind: "tap_back_text", text: selector.text });
        } else if (method.includes("tap_cancel_or_close") && (selector.contentDesc || selector.text)) {
          cacheSemanticStrategy(cacheKey, { kind: "cancel_or_close", label: selector.contentDesc ?? selector.text ?? "Cancel" });
        } else if (method.includes("tap_dialog_control") && (selector.contentDesc || selector.text)) {
          cacheSemanticStrategy(cacheKey, { kind: "dialog_control", label: selector.contentDesc ?? selector.text ?? "OK" });
        }
        return true;
      };

      const logBackFailureEvidence = async (): Promise<void> => {
        const inspectResult = await mcp.inspectUi();
        if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
          logWarn(`evidence inspect failed: status=${inspectResult.status}, reason=${inspectResult.reasonCode}`);
          return;
        }

        const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
        if (!uiTree) {
          logWarn("evidence inspect parse failed: empty ui tree");
          return;
        }

        const nodes = flattenUiTree(uiTree);
        const currentTitle = extractScreenTitleFromUiTree(uiTree);
        const currentScreenId = generateScreenId(uiTree);

        const topCandidates = nodes
          .filter((node) => node.clickable === true)
          .filter((node) => (node.frame?.y ?? Number.MAX_SAFE_INTEGER) <= 220)
          .slice(0, 10)
          .map((node) => ({
            label: node.contentDesc ?? node.text ?? node.accessibilityLabel ?? "",
            className: node.className,
            clickable: node.clickable,
            frame: node.frame,
          }));

        const navBarNode = nodes.find(
          (node) => (node.accessibilityRole ?? "").toLowerCase().includes("nav bar") && node.frame,
        );

        const summaryResult = await mcp.getScreenSummary();
        const summaryStatus = `${summaryResult.status}/${summaryResult.reasonCode}`;
        const pageIdentity = (summaryResult.data as unknown as Record<string, unknown> | undefined)?.screenSummary as Record<string, unknown> | undefined;
        const backAffordance = (pageIdentity?.pageIdentity as Record<string, unknown> | undefined);

        console.log(
          `[BACKTRACK-EVIDENCE] title="${currentTitle ?? "unknown"}", screenId=${currentScreenId}, ` +
          `navBarPresent=${Boolean(navBarNode?.frame)}, navBarFrame=${JSON.stringify(navBarNode?.frame ?? null)}, ` +
          `screenSummary=${summaryStatus}, backAffordance=${JSON.stringify({
            hasBackAffordance: backAffordance?.hasBackAffordance,
            backAffordanceLabel: backAffordance?.backAffordanceLabel,
          })}`,
        );
        console.log(`[BACKTRACK-EVIDENCE] topCandidates=${JSON.stringify(topCandidates)}`);
      };

      const tryTopBarBackCandidates = async (): Promise<boolean> => {
        const inspectResult = await mcp.inspectUi();
        if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
          logWarn("top-bar candidate probe failed: inspect_ui unavailable");
          return false;
        }

        const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
        if (!uiTree) {
          logWarn("top-bar candidate probe failed: inspect_ui parse returned empty tree");
          return false;
        }

        const nodes = flattenUiTree(uiTree);
        const candidates = nodes
          .filter((node) => node.clickable === true)
          .filter((node) => node.className?.toLowerCase() === "button")
          .map((node) => {
            const label = normalizeLabel(node.contentDesc ?? node.text ?? "");
            const topY = node.frame?.y ?? Number.MAX_SAFE_INTEGER;
            return {
              label,
              topY,
              contentDesc: node.contentDesc,
              text: node.text,
            };
          })
          .filter((candidate) => candidate.label.length > 0)
          .filter((candidate) => {
            const normalizedParent = parentTitle ? normalizeLabel(parentTitle).toLowerCase() : "";
            const normalizedLabel = candidate.label.toLowerCase();
            const looksLikeBack =
              normalizedLabel === "back"
              || normalizedLabel.includes("back")
              || normalizedLabel.startsWith("<")
              || normalizedLabel.startsWith("‹")
              || (normalizedParent.length > 0 && normalizedLabel.includes(normalizedParent));
            return looksLikeBack;
          })
          .filter((candidate) => candidate.topY <= 180)
          .sort((left, right) => left.topY - right.topY)
          .slice(0, 3);

        if (candidates.length === 0) {
          logWarn("top-bar candidate probe found no clickable Button candidates in header area");
          return false;
        }

        for (const candidate of candidates) {
          if (
            candidate.contentDesc
            && await tryTapBackControl("tap_topbar_candidate:contentDesc", {
              contentDesc: candidate.contentDesc,
              className: "Button",
              clickable: true,
            })
          ) {
            return true;
          }
          if (
            candidate.text
            && await tryTapBackControl("tap_topbar_candidate:text", {
              text: candidate.text,
              className: "Button",
              clickable: true,
            })
          ) {
            return true;
          }
        }

        return false;
      };

      const tryScreenSummaryBackAffordance = async (): Promise<boolean> => {
        const summaryResult = await mcp.getScreenSummary();
        if (summaryResult.status !== "success" && summaryResult.status !== "partial") {
          logWarn(`screen-summary probe failed: status=${summaryResult.status}, reason=${summaryResult.reasonCode}`);
          return false;
        }

        const summaryData = (summaryResult.data ?? {}) as unknown as Record<string, unknown>;
        const screenSummary = (summaryData.screenSummary ?? {}) as Record<string, unknown>;
        const pageIdentity = (screenSummary.pageIdentity ?? {}) as Record<string, unknown>;
        const hasBackAffordance = pageIdentity.hasBackAffordance === true;
        const backAffordanceLabel = typeof pageIdentity.backAffordanceLabel === "string"
          ? normalizeLabel(pageIdentity.backAffordanceLabel)
          : undefined;

        if (!hasBackAffordance && !backAffordanceLabel) {
          logWarn("screen-summary probe: no back affordance detected");
          return false;
        }

        const summaryLabels = dedupeLabels([
          ...(backAffordanceLabel ? [backAffordanceLabel] : []),
          ...(parentTitle ? [parentTitle] : []),
          "Back",
        ]);

        for (const label of summaryLabels) {
          if (
            await tryTapBackControl("tap_screen_summary_back:contentDesc", {
              contentDesc: label,
              className: "Button",
              clickable: true,
            }) ||
            await tryTapBackControl("tap_screen_summary_back:text", {
              text: label,
              className: "Button",
              clickable: true,
            })
          ) {
            return true;
          }
        }

        return false;
      };

      const tryNavBarCoordinateBack = async (): Promise<boolean> => {
        const inspectResult = await mcp.inspectUi();
        if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
          logWarn("nav-bar coordinate fallback skipped: inspect_ui unavailable");
          return false;
        }

        const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
        if (!uiTree) {
          logWarn("nav-bar coordinate fallback skipped: empty ui tree");
          return false;
        }

        const navBarNode = flattenUiTree(uiTree)
          .find((node) => (node.accessibilityRole ?? "").toLowerCase().includes("nav bar") && node.frame);

        if (!navBarNode?.frame) {
          logWarn("nav-bar coordinate fallback skipped: no nav bar frame found");
          return false;
        }

        const tapX = Math.round(navBarNode.frame.x + 24);
        const tapY = Math.round(navBarNode.frame.y + navBarNode.frame.height / 2);
        const before = await captureCurrentPageContext();
        const tapResult = await mcp.tap({ x: tapX, y: tapY });
        const detail = `method=tap_nav_bar_coordinate, x=${tapX}, y=${tapY}, status=${tapResult.status}, reason=${tapResult.reasonCode}`;

        if (tapResult.status !== "success" && tapResult.status !== "partial") {
          logWarn(`${detail} => tap failed`);
          return false;
        }

        if (!(await waitForSettle())) {
          logWarn(`${detail} => settle failed`);
          return false;
        }

        const after = await captureCurrentPageContext();
        if (!verifyScreenChanged(before, after)) {
          logWarn(
            `${detail} => screen unchanged (before=${before.title ?? before.screenId ?? "unknown"}, ` +
            `after=${after.title ?? after.screenId ?? "unknown"})`,
          );
          return false;
        }

        logTrace(
          `${detail} => success (before=${before.title ?? before.screenId ?? "unknown"}, ` +
          `after=${after.title ?? after.screenId ?? "unknown"})`,
        );
        return true;
      };

      const tryPointBandBack = async (
        navBarFrame?: { x: number; y: number; width: number; height: number },
      ): Promise<boolean> => {
        const initialContext = await captureCurrentPageContext();
        const cacheKey = buildBackPointCacheKey(initialContext, parentTitle);
        const cachedPoint = backPointCache.get(cacheKey);

        const frame = navBarFrame ?? { x: 0, y: 59, width: 393, height: 96 };
        const inset = Math.max(20, Math.min(40, Math.round(frame.width * 0.12)));
        const insetTight = Math.max(14, Math.min(24, Math.round(frame.width * 0.07)));
        const centerY = Math.round(frame.y + frame.height / 2);
        const upperY = Math.round(frame.y + Math.min(frame.height - 6, Math.max(18, frame.height * 0.23)));
        const secondaryY = Math.round(frame.y + Math.min(frame.height - 6, frame.height * 0.75));
        const lowerY = Math.round(frame.y + Math.min(frame.height - 6, frame.height * 0.9));
        const headerY = Math.round(frame.y + Math.min(frame.height - 6, Math.max(22, frame.height * 0.42)));
        const leftX = Math.round(frame.x + inset);
        const leftXTight = Math.round(frame.x + insetTight);
        const rightX = Math.round(frame.x + frame.width - inset);
        const rightXTight = Math.round(frame.x + frame.width - insetTight);

        const computedProbePoints = [
          { x: leftXTight, y: upperY, name: "left-nav-tight-upper" },
          { x: leftXTight, y: headerY, name: "left-nav-tight-header" },
          { x: leftX, y: centerY, name: "left-nav-primary" },
          { x: leftX, y: upperY, name: "left-nav-upper" },
          { x: leftX, y: secondaryY, name: "left-nav-secondary" },
          { x: leftX, y: headerY, name: "left-nav-header" },
          { x: rightX, y: centerY, name: "right-nav-primary" },
          { x: rightX, y: upperY, name: "right-nav-upper" },
          { x: rightX, y: secondaryY, name: "right-nav-secondary" },
          { x: rightX, y: lowerY, name: "right-nav-lower" },
          { x: rightXTight, y: headerY, name: "right-nav-tight-header" },
          { x: rightXTight, y: secondaryY, name: "right-nav-tight-secondary" },
          { x: rightXTight, y: lowerY, name: "right-nav-tight-lower" },
        ];

        const probePoints = cachedPoint
          ? [{ x: cachedPoint.x, y: cachedPoint.y, name: `cached:${cachedPoint.name}` }, ...computedProbePoints]
          : computedProbePoints;

        const seen = new Set<string>();
        const dedupedProbePoints = probePoints.filter((point) => {
          const key = `${point.x},${point.y}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });

        if (cachedPoint) {
          logTrace(
            `using cached back point key=${cacheKey}, point=${cachedPoint.name}(${cachedPoint.x},${cachedPoint.y})`,
          );
        }

        for (const point of dedupedProbePoints) {
          const before = await captureCurrentPageContext();
          const tapResult = await mcp.tap({ x: point.x, y: point.y });
          const detail =
            `method=tap_point_band_back, point=${point.name}, x=${point.x}, y=${point.y}, ` +
            `status=${tapResult.status}, reason=${tapResult.reasonCode}`;

          if (tapResult.status !== "success" && tapResult.status !== "partial") {
            logWarn(`${detail} => tap failed`);
            continue;
          }

          if (!(await waitForSettle())) {
            logWarn(`${detail} => settle failed`);
            continue;
          }

          const after = await captureCurrentPageContext();
          if (!verifyBackTransition(before, after, parentTitle)) {
            logWarn(
              `${detail} => transition rejected (before=${before.title ?? "unknown"}[${before.screenId ?? "n/a"}], ` +
              `after=${after.title ?? "unknown"}[${after.screenId ?? "n/a"}], ` +
              `expectedParent=${parentTitle ?? "<none>"})`,
            );
            continue;
          }

          logTrace(
            `${detail} => success (before=${before.title ?? "unknown"}[${before.screenId ?? "n/a"}], ` +
            `after=${after.title ?? "unknown"}[${after.screenId ?? "n/a"}], ` +
            `expectedParent=${parentTitle ?? "<none>"})`,
          );
          backPointCache.set(cacheKey, { x: point.x, y: point.y, name: point.name });
          return true;
        }

        return false;
      };

      const ladderContext: BacktrackLadderContext = {
        parentTitle,
        detectBackAffordance,
        tryNavigateBack,
        tryTapBackControl,
        tryPointBandBack,
        tryTopBarBackCandidates,
        tryScreenSummaryBackAffordance,
        tryNavBarCoordinateBack,
        logWarn,
        logBackFailureEvidence,
      };

      const initialContext = await captureCurrentPageContext();
      const cacheKey = buildBackPointCacheKey(initialContext, parentTitle);
      const cachedStrategy = backStrategyCache.get(cacheKey);
      if (cachedStrategy) {
        logTrace(`using cached back strategy key=${cacheKey}, kind=${cachedStrategy.kind}`);
        if (await executeCachedBackStrategy(cachedStrategy)) {
          return true;
        }
      }

      if (platform === "android-device" || platform === "android-emulator") {
        return runAndroidBacktrackLadder(ladderContext);
      }

      return runIosBacktrackLadder(ladderContext);
    },

    /**
     * Validate that we're on the expected page after backtracking.
     *
     * Uses a multi-tier approach for robust validation:
     * 1. Exact screenId match (fast path, text-based)
     * 2. Screen title + structural hash match (stable, ignores dynamic text)
     * 3. Structural hash alone (fallback for pages without titles)
     *
     * SPEC §4.1 — prevents infinite loops from failed backtracking.
     * iOS fix: iOS Settings pages often have dynamic text (timestamps, loading),
     * so structural hash is more reliable for page identity.
     */
    async isOnExpectedPage(
      expectedScreenId: string,
      expectedScreenTitle?: string,
      expectedStructureHash?: string,
    ): Promise<boolean> {
      const inspectResult = await mcp.inspectUi();
      if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
        return false;
      }

      const uiTree = parseUiTreeFromInspectResult(inspectResult.data as unknown as Record<string, unknown>);
      if (!uiTree) return false;

      const currentScreenId = generateScreenId(uiTree);

      // Tier 1: exact text-based match (fast path)
      if (currentScreenId === expectedScreenId) return true;

      // Tier 2: screen title + structural hash (stable for pages with dynamic text)
      if (expectedScreenTitle && expectedStructureHash) {
        const currentTitle = extractScreenTitleFromUiTree(uiTree);
        const currentStructure = hashUiStructure(uiTree);
        if (currentTitle === expectedScreenTitle && currentStructure === expectedStructureHash) {
          return true;
        }
      }

      // Tier 3: structural hash alone (fallback)
      if (expectedStructureHash) {
        const currentStructure = hashUiStructure(uiTree);
        if (currentStructure === expectedStructureHash) {
          return true;
        }
      }

      // Tier 4: normalized title-only fallback (for dynamic pages where hashes drift)
      if (expectedScreenTitle) {
        const currentTitle = extractScreenTitleFromUiTree(uiTree);
        if (
          currentTitle &&
          normalizeTitle(currentTitle) === normalizeTitle(expectedScreenTitle)
        ) {
          return true;
        }
      }

      return false;
    },

    async getCurrentPageContext(): Promise<{ screenId?: string; title?: string }> {
      return captureCurrentPageContext();
    },
  };
}

function flattenUiTree(root: UiHierarchy): UiHierarchy[] {
  const queue: UiHierarchy[] = [root];
  const result: UiHierarchy[] = [];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }
    result.push(node);
    if (node.children && node.children.length > 0) {
      queue.push(...node.children);
    }
  }
  return result;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
