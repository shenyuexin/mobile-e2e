import type {
	GetPageContextInput,
	InspectUiSummary,
	PageContext,
	PageContextPreflightProbe,
	PageContextRuntimeFlavor,
	StateSummary,
} from "@mobile-e2e-mcp/contracts";
import type { BackendProbeResult } from "./ios-backend-types.js";
import { WdaRealDeviceBackend } from "./ios-backend-wda.js";

interface DetectPageContextParams {
	platform: NonNullable<GetPageContextInput["platform"]>;
	stateSummary: StateSummary;
	uiSummary?: InspectUiSummary;
	appId?: string;
	appIdentitySource: "session" | "input_override" | "unknown";
	deviceId?: string;
	probeIosRealDevicePreflight?: (
		deviceId: string,
	) => Promise<BackendProbeResult>;
}

export interface DetectPageContextResult {
	pageContext: PageContext;
	preflightProbe?: PageContextPreflightProbe;
}

function normalizeContainerRole(
	uiSummary?: InspectUiSummary,
): string | undefined {
	const sampleNodes = uiSummary?.sampleNodes ?? [];
	for (const node of sampleNodes) {
		const className = node.className?.toLowerCase();
		const resourceId = node.resourceId?.toLowerCase();
		if (!className) continue;
		if (className.includes("alert")) return "alert";
		if (
			className.includes("popup") ||
			className.includes("listpopup") ||
			resourceId?.includes("list_popup")
		) {
			return "popup";
		}
		if (
			className.includes("sheet") ||
			className.includes("bottomsheet") ||
			className.includes("bottom_sheet")
		) {
			return "sheet";
		}
		if (className.includes("dialog")) return "dialog";
		if (className.includes("keyboard")) return "keyboard";
	}
	return undefined;
}

function detectFormEditor(
	params: DetectPageContextParams,
	ownerPackage: string | undefined,
): boolean {
	if (params.platform !== "android") {
		return false;
	}

	const appId = params.appId?.trim().toLowerCase();
	const owner = ownerPackage?.trim().toLowerCase();
	if (!appId || !owner || appId !== owner) {
		return false;
	}

	const texts = new Set(
		(params.stateSummary.topVisibleTexts ?? []).map((value) => value.trim().toLowerCase()),
	);
	const hasCancelDoneChrome = texts.has("cancel") && texts.has("done");
	if (!hasCancelDoneChrome) {
		return false;
	}

	const sampleNodes = params.uiSummary?.sampleNodes ?? [];
	const hasEditableField = sampleNodes.some((node) => {
		const className = node.className?.toLowerCase() ?? "";
		return className.includes("edittext") || className.includes("spinner");
	});

	const hasConfigLabels = ["network name", "password", "security", "ap band"].some(
		(label) => texts.has(label),
	);

	const title = params.stateSummary.screenTitle?.trim().toLowerCase() ?? "";
	const hasEditorTitle = title.includes("configuration") || title.includes("network name");

	return hasEditableField && (hasConfigLabels || hasEditorTitle);
}

export function resolveRuntimeFlavor(
	platform: GetPageContextInput["platform"],
	deviceId?: string,
): PageContextRuntimeFlavor {
	if (platform === "android") {
		return "android_default";
	}
	if (platform === "ios") {
		return deviceId?.startsWith("ios-") ? "ios_real_device" : "ios_simulator";
	}
	return "unknown";
}

export async function detectPageContext(
	params: DetectPageContextParams,
): Promise<DetectPageContextResult> {
	const { stateSummary, uiSummary } = params;
	const containerRole = normalizeContainerRole(uiSummary);
	const blockingSignals = new Set(stateSummary.blockingSignals ?? []);
	const sampleNode = uiSummary?.sampleNodes?.find(
		(node) => node.packageName || node.text,
	);
	const ownerPackage = sampleNode?.packageName;
	const runtimeFlavor = resolveRuntimeFlavor(params.platform, params.deviceId);
	const ownerBundle =
		params.platform === "ios" ? ownerPackage : undefined;
	const appPackage =
		params.platform === "android" && params.appId
			? params.appId
			: undefined;
	const appBundle =
		params.platform === "ios" && params.appId ? params.appId : undefined;
	const hasForeignAndroidOwner =
		params.platform === "android" &&
		Boolean(ownerPackage) &&
		Boolean(appPackage) &&
		ownerPackage !== appPackage;
	const hasForeignIosOwner =
		runtimeFlavor === "ios_simulator" &&
		Boolean(ownerBundle) &&
		Boolean(appBundle) &&
		ownerBundle !== appBundle;
	const isAppleOwnedBundle =
		ownerBundle?.startsWith("com.apple.") ?? false;

	let preflightProbe: BackendProbeResult | undefined;
	if (runtimeFlavor === "ios_real_device") {
		const probe =
			params.probeIosRealDevicePreflight ??
			(async (deviceId: string) =>
				new WdaRealDeviceBackend().probePreflightReadiness(deviceId));
		preflightProbe = await probe(params.deviceId ?? "ios-unknown");
	}

	let type: PageContext["type"] = "normal_page";
	if (blockingSignals.has("permission_prompt")) {
		type = "permission_surface";
	} else if (detectFormEditor(params, ownerPackage)) {
		type = "form_editor";
	} else if (
		hasForeignIosOwner &&
		isAppleOwnedBundle &&
		(stateSummary.readiness === "interrupted" ||
			blockingSignals.has("dialog_actions"))
	) {
		type = "system_alert_surface";
	} else if (
		hasForeignAndroidOwner &&
		(stateSummary.readiness === "interrupted" ||
			blockingSignals.has("dialog_actions"))
	) {
		type = "system_overlay";
	} else if (containerRole === "sheet") {
		type = "action_sheet_surface";
	} else if (containerRole === "popup") {
		type = "popup_surface";
	} else if (containerRole === "alert") {
		type = "system_alert_surface";
	} else if (containerRole === "dialog") {
		type = "app_dialog";
	} else if (containerRole === "keyboard") {
		type = "keyboard_surface";
	} else if (stateSummary.readiness === "interrupted") {
		type = "system_overlay";
	}

	return {
		pageContext: {
			type,
			platform: params.platform,
			detectionSource: "deterministic",
			runtimeFlavor,
			confidence: type === "normal_page" ? 0.7 : 0.9,
			title: stateSummary.screenTitle,
			ownerPackage:
				params.platform === "android" ? ownerPackage : undefined,
			ownerBundle:
				params.platform === "ios" ? ownerBundle : undefined,
			containerRole,
			visibleSignals: stateSummary.topVisibleTexts,
			appIdentity: {
				appId: params.appId,
				source: params.appIdentitySource,
			},
		},
		preflightProbe: preflightProbe
			? {
					available: preflightProbe.available,
					version: preflightProbe.version,
					error: preflightProbe.error,
					source: "ios_wda_status",
				}
			: undefined,
	};
}
