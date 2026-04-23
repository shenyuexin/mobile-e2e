/**
 * Page Context Heuristic — legacy uiTree-based page-type detection.
 * Runs when the deterministic router defers to heuristic fallback.
 */

import type { PageSnapshot } from "./types.js";

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
): HeuristicPageDecision {
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
