import type { InspectUiSummary, StateSummary } from "@mobile-e2e-mcp/contracts";
import {
	type DetectPageContextResult,
	detectPageContext,
} from "./page-context-detector.js";

type AppIdentitySource = "session" | "input_override" | "unknown";

export interface PageContextServiceParams {
	sessionId?: string;
	platform: "android" | "ios";
	stateSummary: StateSummary;
	uiSummary?: InspectUiSummary;
	appId?: string;
	appIdentitySource: AppIdentitySource;
	deviceId?: string;
	probeIosRealDevicePreflight?: (deviceId: string) => Promise<{
		available: boolean;
		version?: string;
		error?: string;
	}>;
}

interface PageContextServiceDeps {
	detectPageContext: typeof detectPageContext;
	now: () => number;
	ttlMs: number;
}

interface CacheEntry {
	sessionId?: string;
	createdAt: number;
	result: DetectPageContextResult;
}

function buildCacheKey(params: PageContextServiceParams): string {
	return JSON.stringify({
		sessionId: params.sessionId,
		platform: params.platform,
		appId: params.appId,
		appIdentitySource: params.appIdentitySource,
		deviceId: params.deviceId,
		stateSummary: params.stateSummary,
		uiSummary: params.uiSummary,
	});
}

export class PageContextDetectorService {
	private readonly cache = new Map<string, CacheEntry>();

	constructor(private readonly deps: PageContextServiceDeps) {}

	async detect(
		params: PageContextServiceParams,
	): Promise<DetectPageContextResult> {
		const key = buildCacheKey(params);
		const now = this.deps.now();
		const cached = this.cache.get(key);
		if (cached && now - cached.createdAt <= this.deps.ttlMs) {
			return cached.result;
		}

		const result = await this.deps.detectPageContext(params);
		this.cache.set(key, {
			sessionId: params.sessionId,
			createdAt: now,
			result,
		});
		return result;
	}

	clear(): void {
		this.cache.clear();
	}

	clearSession(sessionId: string): void {
		for (const [key, entry] of this.cache.entries()) {
			if (entry.sessionId === sessionId) {
				this.cache.delete(key);
			}
		}
	}
}

let sharedPageContextDetectorService: PageContextDetectorService | undefined;

export function getSharedPageContextDetectorService(): PageContextDetectorService {
	sharedPageContextDetectorService ??= createPageContextDetectorService();
	return sharedPageContextDetectorService;
}

export function createPageContextDetectorService(
	deps: Partial<PageContextServiceDeps> = {},
): PageContextDetectorService {
	return new PageContextDetectorService({
		detectPageContext: deps.detectPageContext ?? detectPageContext,
		now: deps.now ?? Date.now,
		ttlMs: deps.ttlMs ?? 1000,
	});
}
