/**
 * Page Context Heuristic — legacy uiTree-based page-type detection.
 * Runs when the deterministic router defers to heuristic fallback.
 *
 * Includes low-value deep-content pruning for Android: pages like
 * Bluetooth Help/FAQ, Earphones & Speakers, and similar deep content
 * that dominates full-traversal budget without adding exploration value.
 */

import type { PageSnapshot, ExplorerPlatform } from "./types.js";

export type HeuristicPageDecisionType = "dfs" | "gated";

export interface HeuristicPageDecision {
	type: HeuristicPageDecisionType;
	reason: string;
	isInterruption?: boolean;
	interruptionType?: string;
	recoveryMethod?: string;
	ruleFamily?: string;
}

export function hasClickableLabel(
	clickableElements: Array<{ label: string }>,
	expectedLabel: string,
): boolean {
	const normalized = expectedLabel.trim().toLowerCase();
	return clickableElements.some(
		(element) => element.label.trim().toLowerCase() === normalized,
	);
}

function collectAllElements(
	node: Record<string, unknown>,
	result: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
	result.push(node);
	const children = node.children;
	if (Array.isArray(children)) {
		for (const child of children) {
			if (typeof child === "object" && child !== null) {
				collectAllElements(child as Record<string, unknown>, result);
			}
		}
	}
	return result;
}

export function isSystemDialog(snapshot: { uiTree: Record<string, unknown> }): boolean {
	const uiTree = snapshot.uiTree;
	const elements = collectAllElements(uiTree);
	const hasAlertRole = elements.some(
		(el) =>
			el.accessibilityRole === "alert" ||
			el.accessibilityRole === "SystemAlert" ||
			(el as Record<string, unknown>).elementType === "Alert" ||
			(el as Record<string, unknown>).elementType === "Sheet" ||
			(el as Record<string, unknown>).className === "Alert" ||
			(el as Record<string, unknown>).className === "Sheet",
	);
	if (hasAlertRole) return true;

	const allText = elements
		.map((el) => {
			const label =
				(el as Record<string, unknown>).contentDesc ||
				(el as Record<string, unknown>).accessibilityLabel ||
				(el as Record<string, unknown>).label ||
				(el as Record<string, unknown>).text ||
				"";
			return typeof label === "string" ? label : "";
		})
		.join(" ");

	const dialogKeywords = [
		"Would Like to Send",
		"Allow",
		"Don't Allow",
		"Allow ACCESS to use",
		"While Using the App",
		"Update Available",
		"Not Now",
		"Remind Me Later",
		"Sign in to iCloud",
		"OK",
		"Cancel",
		"Allow Once",
		"Pairing",
		"Pairing failed",
		"Bluetooth pairing",
	];
	const matched = dialogKeywords.filter((kw) => allText.includes(kw));
	return matched.length >= 3;
}

export function isDismissibleNicknameDialog(snapshot: PageSnapshot): boolean {
	if (snapshot.appId !== "com.bbk.account") {
		return false;
	}
	const title = snapshot.screenTitle?.trim().toLowerCase();
	if (title !== "account nickname") {
		return false;
	}
	return (
		hasClickableLabel(snapshot.clickableElements, "Cancel") &&
		hasClickableLabel(snapshot.clickableElements, "OK")
	);
}

// ---------------------------------------------------------------------------
// Low-value deep-content page detection (Android pruning)
// ---------------------------------------------------------------------------

/**
 * Screen-title patterns that indicate low-value deep content pages.
 * These are typically help/FAQ/tips/about pages deep in the navigation tree
 * that consume page budget without yielding actionable exploration findings.
 *
 * Matched against screenTitle (case-insensitive).
 */
const LOW_VALUE_CONTENT_TITLE_PATTERNS: RegExp[] = [
	/^help\s*(?:&|and)?\s*(?:faq|tips|info|center|support)?$/i,
	/^faq$/i,
	/^tips(?:\s+&?\s*tricks)?$/i,
	/^about\s+(?:this\s+)?(?:app|phone|device|tablet|program)$/i,
	/^legal(?:\s+info(?:rmation)?)?$/i,
	/^terms(?:\s+of\s+(?:service|use))?(?:\s+&?\s*privacy)?$/i,
	/^privacy(?:\s+policy)?$/i,
	/^software\s+info(?:rmation)?$/i,
	/^device\s+info(?:rmation)?$/i,
	/^phone\s+info(?:rmation)?$/i,
	/^tablet\s+info(?:rmation)?$/i,
	/^system\s+info(?:rmation)?$/i,
	/^status(?:\s+info(?:rmation)?)?$/i,
	/^copyright$/i,
	/^open[- ]source\s+licenses?$/i,
	/^third[- ]party\s+licenses?$/i,
	/^licenses?$/i,
	/^earphones?\s*(?:&|and)?\s*speakers?$/i,
	/^connected\s+devices?\s+(?:help|support)$/i,
	/^bluetooth\s+(?:help|faq|support)$/i,
	/^wi-?fi\s+(?:help|faq|support)$/i,
	/^network\s+(?:help|faq|support)$/i,
	/^accessibility\s+(?:help|faq|support)$/i,
	/^sound\s+(?:help|faq|support)$/i,
	/^display\s+(?:help|faq|support)$/i,
	/^battery\s+(?:help|faq|support)$/i,
	/^storage\s+(?:help|faq|support)$/i,
	/^notifications?\s+(?:help|faq|support)$/i,
	/^security\s+(?:help|faq|support)$/i,
	/^location\s+(?:help|faq|support)$/i,
];

/**
 * Resource-ID substrings that indicate low-value content pages on Android.
 * These are typically Settings sub-screens that are informational only.
 */
const LOW_VALUE_CONTENT_RESOURCE_ID_FRAGMENTS: string[] = [
	"help",
	"faq",
	"about",
	"legal",
	"license",
	"copyright",
	"opensource",
	"terms",
	"privacy",
	"status_info",
	"device_info",
	"system_info",
	"software_info",
];

/**
 * Detect low-value deep-content pages that should be pruned from exploration.
 *
 * These pages are typically deep in the navigation tree, contain mostly
 * static text (help/FAQ/about/legal), and have very few interactive elements
 * worth exploring. They consume page budget without yielding actionable findings.
 *
 * Platform guard: only activates on Android platforms by default, since
 * iOS Settings doesn't exhibit the same deep-content explosion pattern.
 *
 * Detection signals:
 * 1. Screen title matches known low-value patterns (help, FAQ, about, etc.)
 * 2. Resource-ID contains low-value content fragments (Android-specific)
 * 3. Page has very few clickable elements AND is deep in the tree (depth >= 3)
 *    AND the title/content suggests informational content
 *
 * @param snapshot - The current page snapshot
 * @param platform - The exploration platform (for platform guard)
 * @param depth - Current depth in the exploration tree (optional, for depth-gated detection)
 * @returns true if this page should be gated as low-value content
 */
export function isLowValueDeepContentPage(
	snapshot: PageSnapshot,
	platform?: ExplorerPlatform,
	depth?: number,
): boolean {
	if (platform && !isAndroidPlatform(platform)) return false;

	const title = (snapshot.screenTitle ?? "").trim().toLowerCase();
	const appId = (snapshot.appId ?? "").trim().toLowerCase();

	if (title && LOW_VALUE_CONTENT_TITLE_PATTERNS.some((p) => p.test(title))) return true;

	const hasLowValueResourceId = snapshot.clickableElements.some((el) => {
		const rid = (el.selector.resourceId ?? "").toLowerCase();
		return LOW_VALUE_CONTENT_RESOURCE_ID_FRAGMENTS.some((f) => rid.includes(f));
	});

	const isDeep = (depth ?? 0) >= 3;
	const hasFewInteractive = snapshot.clickableElements.length <= 3;
	const hasInfoTitlePattern = title && /\b(help|info|about|legal|terms|privacy|faq|tip|support|license|copyright)\b/i.test(title);

	if (isDeep && hasFewInteractive && hasInfoTitlePattern) return true;

	if (hasLowValueResourceId && (depth ?? 0) >= 2) return true;

	if (appId === "com.android.settings" && title) {
		const settingsHelpPatterns = [
			/\bhelp\b/i,
			/\bfaq\b/i,
			/\btips?\b/i,
			/\bsupport\b/i,
			/\babout\s+phone\b/i,
			/\babout\s+device\b/i,
			/\babout\s+tablet\b/i,
			/\blegal\b/i,
			/\bregulatory\b/i,
			/\bopensource\b/i,
		];
		if (settingsHelpPatterns.some((p) => p.test(title))) return true;
	}

	return false;
}

function isAndroidPlatform(platform: ExplorerPlatform): boolean {
	return platform === "android-emulator" || platform === "android-device";
}

function isProtectedAuthSurface(snapshot: PageSnapshot): boolean {
	const appId = snapshot.appId?.trim().toLowerCase() ?? "";
	const title = snapshot.screenTitle?.trim().toLowerCase() ?? "";
	const labels = snapshot.clickableElements.map((el) => el.label.trim().toLowerCase());

	if (appId === "com.android.systemui") {
		return labels.includes("use password") || labels.includes("tap to cancel authentication");
	}

	if (appId === "com.android.settings" && title === "enter lock screen") {
		return true;
	}

	if (
		appId === "com.android.settings" &&
		title === "scan to quickly" &&
		(labels.includes("password") || labels.includes("disconnect"))
	) {
		return true;
	}

	return false;
}

export function decideHeuristicPageAction(
	snapshot: PageSnapshot,
	platform?: ExplorerPlatform,
	depth?: number,
): HeuristicPageDecision {
	if (isLowValueDeepContentPage(snapshot, platform, depth)) {
		return {
			type: "gated",
			reason: `uiTree heuristic: low-value deep content page detected (title="${snapshot.screenTitle ?? "(unknown)"}") — pruning to preserve page budget`,
			recoveryMethod: "backtrack-cancel-first",
			ruleFamily: "heuristic_low_value_content",
		};
	}

	if (isProtectedAuthSurface(snapshot)) {
		return {
			type: "gated",
			reason: "uiTree heuristic: protected authentication surface detected — manual auth boundary, not suitable for DFS",
			isInterruption: true,
			interruptionType: "auth_boundary",
			recoveryMethod: "backtrack-cancel-first",
			ruleFamily: "heuristic_auth_boundary",
		};
	}

	if (isSystemDialog(snapshot)) {
		return {
			type: "gated",
			reason: "uiTree heuristic: system dialog detected (alert role or >=3 dialog keywords)",
			isInterruption: true,
			interruptionType: "system_alert",
			recoveryMethod: "backtrack-cancel-first",
			ruleFamily: "heuristic_system_dialog",
		};
	}

	if (isDismissibleNicknameDialog(snapshot)) {
		return {
			type: "gated",
			reason: "uiTree heuristic: dismissible nickname dialog detected",
			isInterruption: true,
			interruptionType: "app_dialog",
			recoveryMethod: "backtrack-cancel-first",
			ruleFamily: "heuristic_dismissible_dialog",
		};
	}

	return {
		type: "dfs",
		reason: "uiTree heuristic: no blocking surface detected",
	};
}
