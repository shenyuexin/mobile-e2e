import type {
	InspectUiSummary,
	InterruptionClassification,
	InterruptionSignal,
	InterruptionSignalSource,
	Platform,
	StateSummary,
} from "@mobile-e2e-mcp/contracts";

function pushSignal(
	output: InterruptionSignal[],
	source: InterruptionSignalSource,
	key: string,
	value: string | undefined,
	confidence: number,
	evidence?: string,
): void {
	if (!value) {
		return;
	}
	output.push({
		source,
		key,
		value,
		confidence,
		evidence,
	});
}

function normalizeRole(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const lower = value.toLowerCase();
	if (lower.includes("alert")) return "alert";
	if (
		lower.includes("sheet") ||
		lower.includes("bottomsheet") ||
		lower.includes("bottom_sheet")
	)
		return "sheet";
	if (lower.includes("dialog")) return "dialog";
	if (lower.includes("keyboard")) return "keyboard";
	return undefined;
}

function inferOwnerFromState(
	stateSummary: StateSummary,
	platform: Platform,
): string | undefined {
	const ownerHint = stateSummary.topVisibleTexts?.find(
		(value) =>
			value.toLowerCase().includes("springboard") ||
			value.toLowerCase().includes("permissioncontroller"),
	);
	if (ownerHint) return ownerHint;
	if (
		platform === "ios" &&
		stateSummary.blockingSignals.includes("permission_prompt")
	)
		return "com.apple.springboard";
	if (
		platform === "android" &&
		stateSummary.blockingSignals.includes("permission_prompt")
	)
		return "com.android.permissioncontroller";
	return undefined;
}

function looksLikeIosSystemInterruptionText(
	values: string[] | undefined,
): boolean {
	const samples = values ?? [];
	return samples.some((text) => {
		const lower = text.toLowerCase();
		return (
			lower.includes("save password") ||
			lower.includes("not now") ||
			lower.includes("allow") ||
			lower.includes("don’t allow") ||
			lower.includes("don't allow") ||
			lower.includes("while using")
		);
	});
}

function isLikelySystemInterruptionOwner(
	platform: Platform,
	owner: string,
): boolean {
	const normalized = owner.toLowerCase();
	if (platform === "android") {
		return (
			normalized.startsWith("com.android.permissioncontroller") ||
			normalized.startsWith("com.google.android.permissioncontroller") ||
			normalized.startsWith("com.android.systemui") ||
			normalized.startsWith("com.android.settings")
		);
	}
	return (
		normalized.startsWith("com.apple.springboard") ||
		normalized.startsWith("com.apple.preferences")
	);
}

export interface DetectInterruptionOutput {
	detected: boolean;
	classification: InterruptionClassification;
	signals: InterruptionSignal[];
}

export function detectInterruptionFromSummary(params: {
	platform: Platform;
	stateSummary: StateSummary;
	uiSummary?: InspectUiSummary;
}): DetectInterruptionOutput {
	const { stateSummary, platform } = params;
	const signals: InterruptionSignal[] = [];
	const sampleNodes = params.uiSummary?.sampleNodes ?? [];

	for (const signal of stateSummary.blockingSignals ?? []) {
		pushSignal(
			signals,
			"state_summary",
			signal,
			signal,
			0.72,
			"Detected from stateSummary.blockingSignals",
		);
	}

	if (stateSummary.readiness === "interrupted") {
		pushSignal(
			signals,
			"state_summary",
			"readiness",
			"interrupted",
			0.86,
			"State readiness indicates interrupted",
		);
	}

	const role = sampleNodes
		.map((node) => normalizeRole(node.className))
		.find((value): value is string => Boolean(value));

	const ownerFromTree = sampleNodes
		.map((node) => node.packageName)
		.find((value) => typeof value === "string" && value.length > 0);
	const owner =
		ownerFromTree ??
		inferOwnerFromState(stateSummary, platform) ??
		(platform === "ios" &&
		(role === "alert" || role === "sheet") &&
		looksLikeIosSystemInterruptionText(stateSummary.topVisibleTexts)
			? "com.apple.springboard"
			: undefined);
	const ownerLooksSystem = owner
		? isLikelySystemInterruptionOwner(platform, owner)
		: false;
	if (owner && ownerLooksSystem) {
		const ownerKey = platform === "ios" ? "owner_bundle" : "owner_package";
		pushSignal(
			signals,
			"ui_tree",
			ownerKey,
			owner,
			0.78,
			"Captured owner identity from UI tree/state hint",
		);
	}

	if (role) {
		pushSignal(
			signals,
			"ui_tree",
			"container_role",
			role,
			0.7,
			"Class name indicates interruption container role",
		);
	}

	for (const text of stateSummary.topVisibleTexts ?? []) {
		const lower = text.toLowerCase();
		// Use word-boundary matching to avoid false positives like "Spoken" matching "ok"
		const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, "i").test(text);
		if (
			hasWord("allow") ||
			hasWord("not now") ||
			hasWord("save password") ||
			hasWord("deny") ||
			hasWord("while using")
		) {
			pushSignal(
				signals,
				"ui_tree",
				"visible_text",
				text,
				0.64,
				"Visible interruption keyword",
			);
		}
	}

	const hasInterruptionSignal = signals.some((signal) =>
		[
			"permission_prompt",
			"dialog_actions",
			"interrupted",
			"container_role",
			"visible_text",
		].includes(signal.key),
	);

	const confidence = Math.min(
		0.98,
		Number((0.45 + Math.min(signals.length, 6) * 0.08).toFixed(2)),
	);
	const type = stateSummary.blockingSignals.includes("permission_prompt")
		? "permission_prompt"
		: role === "sheet"
			? "action_sheet"
			: role === "alert" || role === "dialog"
				? "system_alert"
				: hasInterruptionSignal
					? "overlay"
					: "unknown";

	return {
		detected: hasInterruptionSignal,
		classification: {
			type,
			confidence,
			rationale: signals
				.map((signal) => `${signal.key}:${signal.value ?? "n/a"}`)
				.slice(0, 6),
			ownerPackage: platform === "android" ? owner : undefined,
			ownerBundle: platform === "ios" ? owner : undefined,
			containerRole: role,
			buttonSlots:
				type === "action_sheet"
					? ["primary", "cancel"]
					: type === "permission_prompt"
						? ["primary", "secondary"]
						: undefined,
		},
		signals,
	};
}
