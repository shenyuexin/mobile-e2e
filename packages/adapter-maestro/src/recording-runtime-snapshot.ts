import { readdir } from "node:fs/promises";
import path from "node:path";
import type { RawRecordedEvent } from "@mobile-e2e-mcp/contracts";
import {
	parseAndroidUiHierarchyNodes,
	parseIosInspectNodes,
	parseUiBounds,
} from "./ui-model.js";

export interface ExtendedRawRecordedEvent extends RawRecordedEvent {
	eventMonotonicMs?: number;
	normalizedPoint?: { x: number; y: number };
	gesture?: {
		kind: "tap" | "swipe";
		start?: { x: number; y: number };
		end?: { x: number; y: number };
		durationMs?: number;
	};
	resolvedSelector?: {
		identifier?: string;
		resourceId?: string;
		text?: string;
		value?: string;
		contentDesc?: string;
		className?: string;
	};
}

export interface ResolvedSelector {
	identifier?: string;
	resourceId?: string;
	text?: string;
	value?: string;
	contentDesc?: string;
	className?: string;
}

export interface SnapshotCandidate {
	ref: string;
	capturedAtMs: number;
}

export interface ViewportSize {
	width: number;
	height: number;
}

export async function listSnapshotRefsForSession(
	repoRoot: string,
	recordSessionId: string,
): Promise<string[]> {
	const relativeDir = path.posix.join(
		"artifacts",
		"record-snapshots",
		recordSessionId,
	);
	const absoluteDir = path.resolve(repoRoot, relativeDir);
	try {
		const entries = await readdir(absoluteDir, { withFileTypes: true });
		return entries
			.filter(
				(entry) =>
					entry.isFile() &&
					(entry.name.endsWith(".xml") || entry.name.endsWith(".json")),
			)
			.map((entry) => path.posix.join(relativeDir, entry.name))
			.sort();
	} catch {
		return [];
	}
}

export function parseSnapshotNodes(
	snapshot: string,
): ReturnType<typeof parseAndroidUiHierarchyNodes> {
	const trimmed = snapshot.trim();
	if (trimmed.startsWith("<")) {
		return parseAndroidUiHierarchyNodes(snapshot);
	}
	return parseIosInspectNodes(snapshot);
}

export function parseSnapshotCapturedAtMs(ref: string): number | undefined {
	const match = ref.match(/-(\d{13})\.(?:xml|json)$/);
	if (!match) {
		return undefined;
	}
	const parsed = Number.parseInt(match[1], 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function chooseNearestSnapshotRef(
	eventTimestampIso: string,
	snapshots: SnapshotCandidate[],
): string | undefined {
	if (snapshots.length === 0) {
		return undefined;
	}
	const eventTimestampMs = Date.parse(eventTimestampIso);
	if (!Number.isFinite(eventTimestampMs)) {
		return snapshots[0]?.ref;
	}
	let closestBefore: SnapshotCandidate | undefined;
	for (const snapshot of snapshots) {
		if (snapshot.capturedAtMs <= eventTimestampMs) {
			closestBefore = snapshot;
			continue;
		}
		break;
	}
	return closestBefore?.ref ?? snapshots[0]?.ref;
}

export function resolveSelectorAtPoint(
	snapshot: string,
	x?: number,
	y?: number,
): ResolvedSelector | undefined {
	if (x === undefined || y === undefined) {
		return undefined;
	}
	const nodes = parseSnapshotNodes(snapshot);
	let best:
		| {
			area: number;
			score: number;
			selector: ResolvedSelector;
		}
		| undefined;
	for (const node of nodes) {
		const bounds = parseUiBounds(node.bounds);
		if (!bounds) {
			continue;
		}
		if (
			x < bounds.left ||
			x > bounds.right ||
			y < bounds.top ||
			y > bounds.bottom
		) {
			continue;
		}
		const selector: ResolvedSelector = {
			identifier: node.resourceId,
			resourceId: node.resourceId,
			text: node.text,
			contentDesc: node.contentDesc,
			className: node.className,
			value: node.text,
		};
		if (
			!selector.identifier &&
			!selector.resourceId &&
			!selector.text &&
			!selector.contentDesc &&
			!selector.value
		) {
			continue;
		}
		const area = bounds.width * bounds.height;
		const score =
			(selector.identifier || selector.resourceId ? 100 : 0)
			+ (node.clickable ? 20 : 0)
			+ (node.className === "Button" || node.className === "Cell" || node.className === "Link" ? 10 : 0)
			- (node.className === "StaticText" ? 10 : 0)
			+ (selector.contentDesc ? 3 : 0)
			+ (selector.text ? 1 : 0);
		if (!best || score > best.score || (score === best.score && area < best.area)) {
			best = { area, score, selector };
		}
	}
	return best?.selector;
}

export function deriveViewportSizeFromSnapshot(
	snapshot: string,
): ViewportSize | undefined {
	const nodes = parseSnapshotNodes(snapshot);
	let maxRight = 0;
	let maxBottom = 0;
	for (const node of nodes) {
		const bounds = parseUiBounds(node.bounds);
		if (!bounds) {
			continue;
		}
		if (bounds.right > maxRight) {
			maxRight = bounds.right;
		}
		if (bounds.bottom > maxBottom) {
			maxBottom = bounds.bottom;
		}
	}
	if (maxRight <= 0 || maxBottom <= 0) {
		return undefined;
	}
	return { width: maxRight, height: maxBottom };
}

export function deriveViewportSizeFromXml(
	xml: string,
): ViewportSize | undefined {
	return deriveViewportSizeFromSnapshot(xml);
}

export function normalizeCoordinate(
	raw: number,
	rawMax: number,
	viewportMax: number,
): number {
	if (rawMax <= 0 || viewportMax <= 0) {
		return raw;
	}
	const scaled = Math.round((raw / rawMax) * viewportMax);
	return Math.min(viewportMax, Math.max(0, scaled));
}

export function normalizeEventsToViewport(
	events: ExtendedRawRecordedEvent[],
	viewport: ViewportSize,
): ExtendedRawRecordedEvent[] {
	const coordinateValues = events.flatMap((event) => {
		const values: number[] = [];
		if (event.x !== undefined) values.push(event.x);
		if (event.y !== undefined) values.push(event.y);
		if (event.gesture?.start?.x !== undefined)
			values.push(event.gesture.start.x);
		if (event.gesture?.start?.y !== undefined)
			values.push(event.gesture.start.y);
		if (event.gesture?.end?.x !== undefined) values.push(event.gesture.end.x);
		if (event.gesture?.end?.y !== undefined) values.push(event.gesture.end.y);
		return values;
	});

	if (coordinateValues.length === 0) {
		return events;
	}

	const maxX = Math.max(
		0,
		...events.flatMap((event) => [
			event.x ?? 0,
			event.gesture?.start?.x ?? 0,
			event.gesture?.end?.x ?? 0,
		]),
	);
	const maxY = Math.max(
		0,
		...events.flatMap((event) => [
			event.y ?? 0,
			event.gesture?.start?.y ?? 0,
			event.gesture?.end?.y ?? 0,
		]),
	);
	const appearsRawAxisSpace =
		maxX > viewport.width * 1.2 || maxY > viewport.height * 1.2;
	if (!appearsRawAxisSpace) {
		return events;
	}

	return events.map((event) => {
		const normalizedX =
			event.x !== undefined
				? normalizeCoordinate(event.x, maxX, viewport.width)
				: undefined;
		const normalizedY =
			event.y !== undefined
				? normalizeCoordinate(event.y, maxY, viewport.height)
				: undefined;
		const normalizedGesture = event.gesture
			? {
					...event.gesture,
					...(event.gesture.start
						? {
								start: {
									x: normalizeCoordinate(
										event.gesture.start.x,
										maxX,
										viewport.width,
									),
									y: normalizeCoordinate(
										event.gesture.start.y,
										maxY,
										viewport.height,
									),
								},
							}
						: {}),
					...(event.gesture.end
						? {
								end: {
									x: normalizeCoordinate(
										event.gesture.end.x,
										maxX,
										viewport.width,
									),
									y: normalizeCoordinate(
										event.gesture.end.y,
										maxY,
										viewport.height,
									),
								},
							}
						: {}),
				}
			: undefined;
		return {
			...event,
			x: normalizedX,
			y: normalizedY,
			gesture: normalizedGesture,
			normalizedPoint:
				normalizedX !== undefined && normalizedY !== undefined
					? { x: normalizedX, y: normalizedY }
					: event.normalizedPoint,
		};
	});
}

export function mapMonotonicToIso(
	startedAt: string,
	eventMonotonicMs: number | undefined,
	anchorMonotonicMs: number | undefined,
): string {
	if (!eventMonotonicMs || !anchorMonotonicMs) {
		return new Date().toISOString();
	}
	const delta = Math.max(0, eventMonotonicMs - anchorMonotonicMs);
	return new Date(Date.parse(startedAt) + delta).toISOString();
}
