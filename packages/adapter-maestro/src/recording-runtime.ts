import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRecordEventsRelativePath,
  buildRecordedStepsRelativePath,
  buildRecordSessionRelativePath,
  listRawRecordedEvents,
  loadRecordedSteps,
  loadRecordSession,
  persistRawRecordedEvents,
  persistRecordedSteps,
  persistRecordSessionState,
  persistStartedRecordSession,
} from "@mobile-e2e-mcp/core";
import type { PersistedRecordSession } from "@mobile-e2e-mcp/core";
import {
  REASON_CODES,
  type CancelRecordSessionData,
  type CancelRecordSessionInput,
  type EndRecordSessionData,
  type EndRecordSessionInput,
  type GetRecordSessionStatusInput,
  type RawRecordedEvent,
  type RecordSessionStatusData,
  type StartRecordSessionData,
  type StartRecordSessionInput,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { buildDefaultAppId, buildDefaultDeviceId, resolveRepoPath } from "./harness-config.js";
import { mapRawEventsToRecordedSteps, renderRecordedStepsAsFlow } from "./recording-mapper.js";
import { parseAndroidUiHierarchyNodes, parseUiBounds } from "./ui-model.js";
import { executeRunner, shellEscape } from "./runtime-shared.js";

interface ParsedRawEvent {
  type: "tap" | "type" | "swipe" | "back" | "home" | "app_switch";
  eventMonotonicMs: number;
  x?: number;
  y?: number;
  endX?: number;
  endY?: number;
  gesture?: {
    kind: "tap" | "swipe";
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    durationMs?: number;
  };
  textDelta?: string;
  rawLine: string;
}

interface AdbDeviceEntry {
  id: string;
  state: string;
}

const SWIPE_DISTANCE_THRESHOLD_PX = 24;
const SWIPE_DURATION_THRESHOLD_MS = 1200;
const SWIPE_MIN_MOVE_SAMPLES = 2;
const SWIPE_STRONG_DISTANCE_THRESHOLD_PX = 220;

interface ExtendedRawRecordedEvent extends RawRecordedEvent {
  eventMonotonicMs?: number;
  normalizedPoint?: { x: number; y: number };
  gesture?: {
    kind: "tap" | "swipe";
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    durationMs?: number;
  };
  resolvedSelector?: {
    resourceId?: string;
    text?: string;
    contentDesc?: string;
    className?: string;
  };
}

function mapAndroidKeyTokenToText(token: string, shiftPressed: boolean): string | undefined {
  if (shiftPressed && token === "2") {
    return "@";
  }
  if (shiftPressed && token === "MINUS") {
    return "_";
  }
  if (/^[A-Z]$/.test(token)) {
    return token.toLowerCase();
  }
  if (/^[0-9]$/.test(token)) {
    return token;
  }
  if (token === "SPACE") {
    return " ";
  }
  if (token === "DOT") {
    return ".";
  }
  if (token === "AT") {
    return "@";
  }
  if (token === "MINUS") {
    return "-";
  }
  if (token === "UNDERSCORE") {
    return "_";
  }
  if (token === "TAB") {
    return "\t";
  }
  if (token === "ENTER") {
    return "\n";
  }
  return undefined;
}

async function captureAndroidContextSnapshot(params: {
  repoRoot: string;
  recordSessionId: string;
  deviceId: string;
  bucketId?: string;
  dryRun?: boolean;
}): Promise<{ uiSnapshotRef?: string; foregroundApp?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const bucketId = params.bucketId ?? "end";
  const snapshotRelativePath = path.posix.join("artifacts", "record-snapshots", params.recordSessionId, `${params.recordSessionId}-${bucketId}.xml`);
  const snapshotAbsolutePath = path.resolve(params.repoRoot, snapshotRelativePath);

  if (params.dryRun) {
    return {
      uiSnapshotRef: snapshotRelativePath,
      foregroundApp: "com.example.app",
      warnings,
    };
  }

  await mkdir(path.dirname(snapshotAbsolutePath), { recursive: true });
  const remoteDumpPath = `/sdcard/${params.recordSessionId}-${bucketId}.xml`;

  const dumpResult = await executeRunner(
    ["adb", "-s", params.deviceId, "shell", "uiautomator", "dump", remoteDumpPath],
    params.repoRoot,
    process.env,
  );
  if (dumpResult.exitCode !== 0) {
    warnings.push("Failed to capture UI snapshot via uiautomator dump.");
  }

  const pullResult = await executeRunner(
    ["adb", "-s", params.deviceId, "pull", remoteDumpPath, snapshotAbsolutePath],
    params.repoRoot,
    process.env,
  );
  if (pullResult.exitCode !== 0) {
    warnings.push("Failed to pull UI snapshot XML artifact.");
  }

  const appContextResult = await executeRunner(
    ["adb", "-s", params.deviceId, "shell", "dumpsys", "window", "windows"],
    params.repoRoot,
    process.env,
  );
  let foregroundApp: string | undefined;
  if (appContextResult.exitCode === 0) {
    const match = appContextResult.stdout.match(/mCurrentFocus=Window\{[^\s]+\s([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+\}/);
    foregroundApp = match?.[1];
  } else {
    warnings.push("Failed to collect foreground app context from dumpsys window.");
  }

  return {
    uiSnapshotRef: pullResult.exitCode === 0 ? snapshotRelativePath : undefined,
    foregroundApp,
    warnings,
  };
}

function parseHexMaybe(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractEventMonotonicMs(line: string): number {
  const match = line.match(/^\[\s*(\d+)\.(\d+)\]/);
  if (!match) {
    return 0;
  }
  const seconds = Number.parseInt(match[1], 10);
  const microseconds = Number.parseInt(match[2], 10);
  if (!Number.isFinite(seconds) || !Number.isFinite(microseconds)) {
    return 0;
  }
  return (seconds * 1000) + Math.round(microseconds / 1000);
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function spawnDetachedShell(command: string, repoRoot: string, env: NodeJS.ProcessEnv): number | undefined {
  const child = spawn("bash", ["-lc", command], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return Number.isFinite(child.pid) ? child.pid : undefined;
}

function parseAdbDeviceEntries(output: string): AdbDeviceEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of devices attached"))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({ id: parts[0], state: parts[1] }));
}

function choosePreferredAndroidDeviceId(entries: AdbDeviceEntry[]): string | undefined {
  const online = entries.filter((entry) => entry.state === "device");
  const physical = online.find((entry) => !entry.id.startsWith("emulator-"));
  return physical?.id ?? online[0]?.id;
}

async function resolveAndroidRecordingDeviceId(repoRoot: string, inputDeviceId?: string, dryRun?: boolean): Promise<string | undefined> {
  if (inputDeviceId && inputDeviceId.length > 0) {
    return inputDeviceId;
  }
  if (dryRun) {
    return buildDefaultDeviceId("android");
  }
  const listed = await executeRunner(["adb", "devices"], repoRoot, process.env);
  if (listed.exitCode !== 0) {
    return undefined;
  }
  return choosePreferredAndroidDeviceId(parseAdbDeviceEntries(listed.stdout));
}

function parseRawInputEvents(rawContent: string): ParsedRawEvent[] {
  const lines = rawContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let currentX: number | undefined;
  let currentY: number | undefined;
  const events: ParsedRawEvent[] = [];
  let touchStartX: number | undefined;
  let touchStartY: number | undefined;
  let touchStartTime: number | undefined;
  let touchMoveSamples = 0;
  let touchActive = false;
  let shiftPressed = false;

  const finalizeTouch = (eventMonotonicMs: number, rawLine: string): void => {
    if (!touchActive) {
      return;
    }
    const startX = touchStartX ?? currentX;
    const startY = touchStartY ?? currentY;
    const endX = currentX;
    const endY = currentY;
    const durationMs = touchStartTime !== undefined && eventMonotonicMs > 0
      ? Math.max(0, eventMonotonicMs - touchStartTime)
      : undefined;
    if (startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
      const movement = distance(startX, startY, endX, endY);
      const qualifiesByDistanceAndTrace = movement >= SWIPE_DISTANCE_THRESHOLD_PX
        && touchMoveSamples >= SWIPE_MIN_MOVE_SAMPLES;
      const qualifiesAsStrongSwipe = movement >= SWIPE_STRONG_DISTANCE_THRESHOLD_PX;
      if ((qualifiesByDistanceAndTrace || qualifiesAsStrongSwipe) && (durationMs ?? 0) <= SWIPE_DURATION_THRESHOLD_MS) {
        events.push({
          type: "swipe",
          eventMonotonicMs,
          x: startX,
          y: startY,
          endX,
          endY,
          gesture: {
            kind: "swipe",
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            durationMs,
          },
          rawLine,
        });
      } else {
        events.push({
          type: "tap",
          eventMonotonicMs,
          x: endX,
          y: endY,
          gesture: {
            kind: "tap",
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            durationMs,
          },
          rawLine,
        });
      }
    } else {
      events.push({ type: "tap", eventMonotonicMs, x: currentX, y: currentY, rawLine });
    }
    touchActive = false;
    touchStartX = undefined;
    touchStartY = undefined;
    touchStartTime = undefined;
    touchMoveSamples = 0;
  };

  for (const line of lines) {
    const eventMonotonicMs = extractEventMonotonicMs(line);
    const positionX = line.match(/(?:ABS_MT_POSITION_X|ABS_X)\s+([0-9a-fA-F]+)/);
    if (positionX) {
      currentX = parseHexMaybe(positionX[1]);
      if (touchActive) {
        if (touchStartX === undefined) {
          touchStartX = currentX;
        }
        touchMoveSamples += 1;
      }
    }
    const positionY = line.match(/(?:ABS_MT_POSITION_Y|ABS_Y)\s+([0-9a-fA-F]+)/);
    if (positionY) {
      currentY = parseHexMaybe(positionY[1]);
      if (touchActive) {
        if (touchStartY === undefined) {
          touchStartY = currentY;
        }
        touchMoveSamples += 1;
      }
    }

    const trackingId = line.match(/ABS_MT_TRACKING_ID\s+([0-9a-fA-F]+)/);
    if (trackingId) {
      const token = trackingId[1]?.toLowerCase();
      if (token === "ffffffff") {
        finalizeTouch(eventMonotonicMs, line);
        continue;
      }
      if (!touchActive) {
        touchActive = true;
        touchStartX = undefined;
        touchStartY = undefined;
        touchStartTime = eventMonotonicMs;
        touchMoveSamples = 0;
        currentX = undefined;
        currentY = undefined;
      }
      continue;
    }

    if (/BTN_TOUCH\s+DOWN/.test(line)) {
      touchActive = true;
      touchStartX = undefined;
      touchStartY = undefined;
      touchStartTime = eventMonotonicMs;
      touchMoveSamples = 0;
      currentX = undefined;
      currentY = undefined;
      continue;
    }
    if (/BTN_TOUCH\s+UP/.test(line)) {
      finalizeTouch(eventMonotonicMs, line);
      continue;
    }
    if (/KEY_BACK\s+DOWN/.test(line)) {
      events.push({ type: "back", eventMonotonicMs, rawLine: line });
      continue;
    }
    if (/KEY_HOME\s+DOWN/.test(line)) {
      events.push({ type: "home", eventMonotonicMs, rawLine: line });
      continue;
    }
    if (/KEY_APPSELECT\s+DOWN/.test(line)) {
      events.push({ type: "app_switch", eventMonotonicMs, rawLine: line });
      continue;
    }

    if (/KEY_(?:LEFTSHIFT|RIGHTSHIFT)\s+DOWN/.test(line)) {
      shiftPressed = true;
      continue;
    }
    if (/KEY_(?:LEFTSHIFT|RIGHTSHIFT)\s+UP/.test(line)) {
      shiftPressed = false;
      continue;
    }

    const keyDown = line.match(/KEY_([A-Z0-9_]+)\s+DOWN/);
    if (keyDown) {
      const token = keyDown[1];
      if (token === "BACK" || token === "HOME" || token === "APPSELECT") {
        continue;
      }
      const mapped = mapAndroidKeyTokenToText(token, shiftPressed);
      if (mapped !== undefined) {
        events.push({ type: "type", eventMonotonicMs, textDelta: mapped, rawLine: line });
      }
    }
  }

  return events;
}

async function listSnapshotRefsForSession(repoRoot: string, recordSessionId: string): Promise<string[]> {
  const relativeDir = path.posix.join("artifacts", "record-snapshots", recordSessionId);
  const absoluteDir = path.resolve(repoRoot, relativeDir);
  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".xml"))
      .map((entry) => path.posix.join(relativeDir, entry.name))
      .sort();
    return files;
  } catch {
    return [];
  }
}

interface ResolvedSelector {
  resourceId?: string;
  text?: string;
  contentDesc?: string;
  className?: string;
}

interface SnapshotCandidate {
  ref: string;
  capturedAtMs: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

function parseSnapshotCapturedAtMs(ref: string): number | undefined {
  const match = ref.match(/-(\d{13})\.xml$/);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function chooseNearestSnapshotRef(eventTimestampIso: string, snapshots: SnapshotCandidate[]): string | undefined {
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
  if (closestBefore) {
    return closestBefore.ref;
  }
  return snapshots[0]?.ref;
}

function resolveSelectorAtPoint(xml: string, x?: number, y?: number): ResolvedSelector | undefined {
  if (x === undefined || y === undefined) {
    return undefined;
  }
  const nodes = parseAndroidUiHierarchyNodes(xml);
  let best: { area: number; selector: ResolvedSelector } | undefined;
  for (const node of nodes) {
    const bounds = parseUiBounds(node.bounds);
    if (!bounds) {
      continue;
    }
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
      continue;
    }
    const selector: ResolvedSelector = {
      resourceId: node.resourceId,
      text: node.text,
      contentDesc: node.contentDesc,
      className: node.className,
    };
    if (!selector.resourceId && !selector.text && !selector.contentDesc) {
      continue;
    }
    const area = bounds.width * bounds.height;
    if (!best || area < best.area) {
      best = { area, selector };
    }
  }
  return best?.selector;
}

function deriveViewportSizeFromXml(xml: string): ViewportSize | undefined {
  const nodes = parseAndroidUiHierarchyNodes(xml);
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

function normalizeCoordinate(raw: number, rawMax: number, viewportMax: number): number {
  if (rawMax <= 0 || viewportMax <= 0) {
    return raw;
  }
  const scaled = Math.round((raw / rawMax) * viewportMax);
  return Math.min(viewportMax, Math.max(0, scaled));
}

function normalizeEventsToViewport(events: ExtendedRawRecordedEvent[], viewport: ViewportSize): ExtendedRawRecordedEvent[] {
  const coordinateValues = events.flatMap((event) => {
    const values: number[] = [];
    if (event.x !== undefined) values.push(event.x);
    if (event.y !== undefined) values.push(event.y);
    if (event.gesture?.start?.x !== undefined) values.push(event.gesture.start.x);
    if (event.gesture?.start?.y !== undefined) values.push(event.gesture.start.y);
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

  const appearsRawAxisSpace = maxX > viewport.width * 1.2 || maxY > viewport.height * 1.2;
  if (!appearsRawAxisSpace) {
    return events;
  }

  return events.map((event) => {
    const normalizedX = event.x !== undefined ? normalizeCoordinate(event.x, maxX, viewport.width) : undefined;
    const normalizedY = event.y !== undefined ? normalizeCoordinate(event.y, maxY, viewport.height) : undefined;
    const normalizedGesture = event.gesture
      ? {
        ...event.gesture,
        ...(event.gesture.start
          ? {
            start: {
              x: normalizeCoordinate(event.gesture.start.x, maxX, viewport.width),
              y: normalizeCoordinate(event.gesture.start.y, maxY, viewport.height),
            },
          }
          : {}),
        ...(event.gesture.end
          ? {
            end: {
              x: normalizeCoordinate(event.gesture.end.x, maxX, viewport.width),
              y: normalizeCoordinate(event.gesture.end.y, maxY, viewport.height),
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
      normalizedPoint: normalizedX !== undefined && normalizedY !== undefined ? { x: normalizedX, y: normalizedY } : event.normalizedPoint,
    };
  });
}

async function maybeNormalizeEventsUsingSnapshotViewport(
  repoRoot: string,
  recordSessionId: string,
  events: ExtendedRawRecordedEvent[],
  fallbackSnapshotRef?: string,
): Promise<ExtendedRawRecordedEvent[]> {
  const snapshotRefs = await listSnapshotRefsForSession(repoRoot, recordSessionId);
  const candidateRefs = snapshotRefs.length > 0
    ? snapshotRefs
    : (fallbackSnapshotRef ? [fallbackSnapshotRef] : []);
  for (const ref of candidateRefs) {
    const snapshotXml = await readFile(path.resolve(repoRoot, ref), "utf8").catch(() => "");
    if (!snapshotXml) {
      continue;
    }
    const viewport = deriveViewportSizeFromXml(snapshotXml);
    if (!viewport) {
      continue;
    }
    return normalizeEventsToViewport(events, viewport);
  }
  return events;
}

function mapMonotonicToIso(startedAt: string, eventMonotonicMs: number | undefined, anchorMonotonicMs: number | undefined): string {
  if (!eventMonotonicMs || !anchorMonotonicMs) {
    return new Date().toISOString();
  }
  const delta = Math.max(0, eventMonotonicMs - anchorMonotonicMs);
  return new Date(Date.parse(startedAt) + delta).toISOString();
}

async function readAndroidMonotonicMs(repoRoot: string, deviceId: string, dryRun?: boolean): Promise<number | undefined> {
  if (dryRun) {
    return undefined;
  }
  const uptime = await executeRunner(["adb", "-s", deviceId, "shell", "cat", "/proc/uptime"], repoRoot, process.env);
  if (uptime.exitCode !== 0) {
    return undefined;
  }
  const firstToken = uptime.stdout.trim().split(/\s+/)[0];
  if (!firstToken) {
    return undefined;
  }
  const seconds = Number.parseFloat(firstToken);
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  return Math.round(seconds * 1000);
}

async function enrichEventsWithSelectors(repoRoot: string, events: ExtendedRawRecordedEvent[]): Promise<ExtendedRawRecordedEvent[]> {
  const snapshotCache = new Map<string, string>();
  const enriched: ExtendedRawRecordedEvent[] = [];
  for (const event of events) {
    if (event.resolvedSelector || !event.uiSnapshotRef || event.x === undefined || event.y === undefined) {
      enriched.push(event);
      continue;
    }
    const snapshotAbsolutePath = path.resolve(repoRoot, event.uiSnapshotRef);
    let snapshotXml = snapshotCache.get(snapshotAbsolutePath);
    if (snapshotXml === undefined) {
      snapshotXml = await readFile(snapshotAbsolutePath, "utf8").catch(() => "");
      snapshotCache.set(snapshotAbsolutePath, snapshotXml);
    }
    const selector = snapshotXml.length > 0 ? resolveSelectorAtPoint(snapshotXml, event.x, event.y) : undefined;
    enriched.push({
      ...event,
      resolvedSelector: selector,
      normalizedPoint: event.x !== undefined && event.y !== undefined ? { x: event.x, y: event.y } : event.normalizedPoint,
    });
  }
  return enriched;
}

export async function startRecordSessionWithMaestro(input: StartRecordSessionInput): Promise<ToolResult<StartRecordSessionData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSessionId = `rec-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const platform = input.platform ?? "android";
  const resolvedAndroidDeviceId = platform === "android"
    ? await resolveAndroidRecordingDeviceId(repoRoot, input.deviceId, input.dryRun)
    : input.deviceId;
  if (platform !== "android") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
        data: {
          recordSessionId,
          sessionId: input.sessionId,
          platform,
          deviceId: input.deviceId ?? buildDefaultDeviceId(platform),
        appId: input.appId ?? buildDefaultAppId(platform),
        recordingProfile: input.recordingProfile ?? "default",
        status: "running",
        startedAt,
        captureChannels: ["input_events", "ui_snapshots", "app_context"],
        rawEventsPath: buildRecordEventsRelativePath(recordSessionId),
      },
      nextSuggestions: ["Android-first MVP currently supports passive capture only on Android."],
    };
  }

  if (!resolvedAndroidDeviceId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.deviceUnavailable,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId,
        sessionId: input.sessionId,
        platform,
        deviceId: "unknown",
        appId: input.appId ?? buildDefaultAppId(platform),
        recordingProfile: input.recordingProfile ?? "default",
        status: "cancelled",
        startedAt,
        captureChannels: ["input_events", "ui_snapshots", "app_context"],
        rawEventsPath: buildRecordEventsRelativePath(recordSessionId),
      },
      nextSuggestions: [
        "No online Android device detected. Connect a physical device or boot an emulator (adb devices must show state 'device'), then retry start_record_session.",
      ],
    };
  }

  const deviceId = resolvedAndroidDeviceId;
  const appId = input.appId ?? buildDefaultAppId(platform);
  const rawEventsRelativePath = buildRecordEventsRelativePath(recordSessionId);
  const rawEventsAbsolutePath = path.resolve(repoRoot, rawEventsRelativePath);
  await mkdir(path.dirname(rawEventsAbsolutePath), { recursive: true });
  const captureStartMonotonicMs = await readAndroidMonotonicMs(repoRoot, deviceId, input.dryRun);

  let pid: number | undefined;
  let snapshotPid: number | undefined;
  if (!input.dryRun) {
    const shellCommand = `adb -s ${shellEscape(deviceId)} shell getevent -lt > ${shellEscape(rawEventsAbsolutePath)} 2>&1`;
    pid = spawnDetachedShell(shellCommand, repoRoot, process.env);
    if (!pid) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          recordSessionId,
          sessionId: input.sessionId,
          platform,
          deviceId,
          appId,
          recordingProfile: input.recordingProfile ?? "default",
          status: "cancelled",
          startedAt,
          captureChannels: ["input_events", "ui_snapshots", "app_context"],
          rawEventsPath: rawEventsRelativePath,
        },
        nextSuggestions: ["Failed to start adb getevent capture. Verify adb/device connectivity and retry."],
      };
    }

    const snapshotDirRelativePath = path.posix.join("artifacts", "record-snapshots", recordSessionId);
    const snapshotDirAbsolutePath = path.resolve(repoRoot, snapshotDirRelativePath);
    await mkdir(snapshotDirAbsolutePath, { recursive: true });
    const snapshotLoop = `while true; do ts=$(date +%s%3N); remote=/sdcard/${recordSessionId}-$ts.xml; local_path=${snapshotDirAbsolutePath}/${recordSessionId}-$ts.xml; adb -s ${deviceId} shell uiautomator dump $remote >/dev/null 2>&1; adb -s ${deviceId} pull $remote $local_path >/dev/null 2>&1; adb -s ${deviceId} shell rm $remote >/dev/null 2>&1; sleep 0.7; done`;
    snapshotPid = spawnDetachedShell(snapshotLoop, repoRoot, process.env);
  }

  const persisted = await persistStartedRecordSession(repoRoot, {
    recordSessionId,
    sessionId: input.sessionId,
    platform,
    deviceId,
    appId,
    recordingProfile: input.recordingProfile ?? "default",
    startedAt,
    captureChannels: ["input_events", "ui_snapshots", "app_context"],
    rawEventsPath: rawEventsRelativePath,
    pid,
    ...(captureStartMonotonicMs !== undefined ? { captureStartMonotonicMs } : {}),
    ...(snapshotPid ? { snapshotPid } : {}),
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [persisted.relativePath, rawEventsRelativePath],
    data: {
      recordSessionId,
      sessionId: input.sessionId,
      platform,
      deviceId,
      appId,
      recordingProfile: input.recordingProfile ?? "default",
      status: "running",
      startedAt,
      captureChannels: ["input_events", "ui_snapshots", "app_context"],
      rawEventsPath: rawEventsRelativePath,
      pid,
    },
    nextSuggestions: [
      "Perform manual interactions on device/emulator, then call end_record_session with the returned recordSessionId.",
    ],
  };
}

export async function getRecordSessionStatusWithMaestro(input: GetRecordSessionStatusInput): Promise<ToolResult<RecordSessionStatusData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSession = await loadRecordSession(repoRoot, input.recordSessionId);
  if (!recordSession) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.recordSessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId: input.recordSessionId,
        sessionId: "unknown",
        platform: "android",
        deviceId: "unknown",
        status: "cancelled",
        startedAt: new Date(0).toISOString(),
        rawEventCount: 0,
        recordedStepCount: 0,
        rawEventsPath: buildRecordEventsRelativePath(input.recordSessionId),
        warnings: ["Record session does not exist."],
      },
      nextSuggestions: ["Start a new record session before querying status."],
    };
  }

  const [events, steps] = await Promise.all([
    listRawRecordedEvents(repoRoot, input.recordSessionId),
    loadRecordedSteps(repoRoot, input.recordSessionId),
  ]);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: recordSession.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [buildRecordSessionRelativePath(input.recordSessionId), recordSession.rawEventsPath],
    data: {
      recordSessionId: recordSession.recordSessionId,
      sessionId: recordSession.sessionId,
      platform: recordSession.platform,
      deviceId: recordSession.deviceId,
      appId: recordSession.appId,
      status: recordSession.status,
      startedAt: recordSession.startedAt,
      endedAt: recordSession.endedAt,
      rawEventCount: events.length,
      recordedStepCount: steps.length,
      rawEventsPath: recordSession.rawEventsPath,
      flowPath: recordSession.flowPath,
      warnings: recordSession.warnings,
    },
    nextSuggestions: recordSession.status === "running"
      ? ["Continue manual interaction, then call end_record_session to export flow."]
      : [],
  };
}

export async function endRecordSessionWithMaestro(input: EndRecordSessionInput): Promise<ToolResult<EndRecordSessionData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSession = await loadRecordSession(repoRoot, input.recordSessionId);
  if (!recordSession) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.recordSessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId: input.recordSessionId,
        status: "cancelled",
        endedAt: new Date().toISOString(),
        report: {
          stepCount: 0,
          warnings: ["Record session does not exist."],
          confidenceSummary: { high: 0, medium: 0, low: 0 },
          reviewRequired: true,
        },
      },
      nextSuggestions: ["Start a new record session and retry end_record_session."],
    };
  }

  if (recordSession.pid && recordSession.status === "running" && !input.dryRun) {
    try {
      process.kill(recordSession.pid, "SIGTERM");
    } catch (error) {
      void error;
    }
  }

  const snapshotProcessId = (recordSession as PersistedRecordSession & { snapshotPid?: number }).snapshotPid;
  if (snapshotProcessId && !input.dryRun) {
    try {
      process.kill(snapshotProcessId, "SIGTERM");
    } catch (error) {
      void error;
    }
  }

  

  let capturedEvents = await listRawRecordedEvents(repoRoot, input.recordSessionId) as ExtendedRawRecordedEvent[];
  const contextSnapshot = await captureAndroidContextSnapshot({
    repoRoot,
    recordSessionId: input.recordSessionId,
    deviceId: recordSession.deviceId,
    bucketId: "end",
    dryRun: input.dryRun,
  });
  if (!input.dryRun && capturedEvents.length === 0) {
    const absolutePath = path.resolve(repoRoot, recordSession.rawEventsPath);
    const rawContent = await readFile(absolutePath, "utf8").catch(() => "");
    const parsed = parseRawInputEvents(rawContent);
    const snapshotRefs = await listSnapshotRefsForSession(repoRoot, input.recordSessionId);
    const fallbackSnapshotRefs = contextSnapshot.uiSnapshotRef ? [contextSnapshot.uiSnapshotRef] : [];
    const resolvedSnapshotRefs = snapshotRefs.length > 0 ? snapshotRefs : fallbackSnapshotRefs;
    const snapshotCandidates: SnapshotCandidate[] = resolvedSnapshotRefs
      .map((ref) => {
        const capturedAtMs = parseSnapshotCapturedAtMs(ref);
        return capturedAtMs !== undefined ? { ref, capturedAtMs } : undefined;
      })
      .filter((candidate): candidate is SnapshotCandidate => candidate !== undefined)
      .sort((left, right) => left.capturedAtMs - right.capturedAtMs);
    const anchorMonotonicMs = (recordSession as PersistedRecordSession & { captureStartMonotonicMs?: number }).captureStartMonotonicMs
      ?? parsed.find((event) => event.eventMonotonicMs > 0)?.eventMonotonicMs;
    const normalized: ExtendedRawRecordedEvent[] = parsed.map((event, index) => {
      const mappedTimestamp = mapMonotonicToIso(recordSession.startedAt, event.eventMonotonicMs, anchorMonotonicMs);
      const snapshotRef = chooseNearestSnapshotRef(mappedTimestamp, snapshotCandidates)
        ?? resolvedSnapshotRefs[Math.min(index, Math.max(0, resolvedSnapshotRefs.length - 1))];
      return {
      eventId: `${input.recordSessionId}-${index + 1}`,
      recordSessionId: input.recordSessionId,
      timestamp: mappedTimestamp,
      eventMonotonicMs: event.eventMonotonicMs,
      eventType: event.type,
      x: event.x,
      y: event.y,
      gesture: event.gesture,
      normalizedPoint: event.x !== undefined && event.y !== undefined ? { x: event.x, y: event.y } : undefined,
      textDelta: event.textDelta,
      rawLine: event.rawLine,
      foregroundApp: contextSnapshot.foregroundApp ?? recordSession.appId,
      uiSnapshotRef: snapshotRef,
      };
    });
    const viewportNormalized = await maybeNormalizeEventsUsingSnapshotViewport(
      repoRoot,
      input.recordSessionId,
      normalized,
      contextSnapshot.uiSnapshotRef,
    );
    const enrichedNormalized = await enrichEventsWithSelectors(repoRoot, viewportNormalized);
    if (normalized.length > 0) {
      await persistRawRecordedEvents(repoRoot, input.recordSessionId, enrichedNormalized as RawRecordedEvent[]);
      capturedEvents = enrichedNormalized;
    }
  } else {
    const viewportNormalized = await maybeNormalizeEventsUsingSnapshotViewport(
      repoRoot,
      input.recordSessionId,
      capturedEvents,
      contextSnapshot.uiSnapshotRef,
    );
    capturedEvents = await enrichEventsWithSelectors(repoRoot, viewportNormalized);
  }

  const mapped = mapRawEventsToRecordedSteps(input.recordSessionId, capturedEvents, {
    defaultAppId: recordSession.appId,
    includeAutoWaitStep: true,
  });
  await persistRecordedSteps(repoRoot, input.recordSessionId, mapped.steps);

  let flowPath: string | undefined;
  let replayDryRun: EndRecordSessionData["report"]["replayDryRun"];
  const warnings = [...mapped.warnings, ...contextSnapshot.warnings];
  if (input.autoExport !== false) {
    const targetFlowPath = input.outputPath ?? path.posix.join("flows", "samples", "generated", `${input.recordSessionId}-${Date.now()}.yaml`);
    const absoluteFlowPath = path.resolve(repoRoot, targetFlowPath);
    await mkdir(path.dirname(absoluteFlowPath), { recursive: true });
    const rendered = renderRecordedStepsAsFlow({
      appId: recordSession.appId ?? "com.example.app",
      includeLaunchStep: input.includeLaunchStep !== false,
      steps: mapped.steps,
    });
    warnings.push(...rendered.warnings);
    await writeFile(absoluteFlowPath, rendered.yaml, "utf8");
    flowPath = targetFlowPath;

    if (input.runReplayDryRun) {
      const { runFlowWithMaestro } = await import("./index.js");
      const replayResult = await runFlowWithMaestro({
        sessionId: recordSession.sessionId,
        platform: recordSession.platform,
        flowPath,
        dryRun: true,
        deviceId: recordSession.deviceId,
        appId: recordSession.appId,
      });
      replayDryRun = {
        status: replayResult.status,
        reasonCode: replayResult.reasonCode,
      };
    }
  }

  const confidenceSummary = mapped.steps.reduce(
    (acc, step) => {
      acc[step.confidence] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const endedAt = new Date().toISOString();
  await persistRecordSessionState(repoRoot, input.recordSessionId, {
    status: "ended",
    endedAt,
    flowPath,
    warnings,
    pid: undefined,
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: recordSession.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [
      buildRecordSessionRelativePath(input.recordSessionId),
      recordSession.rawEventsPath,
      buildRecordedStepsRelativePath(input.recordSessionId),
      ...(flowPath ? [flowPath] : []),
    ],
    data: {
      recordSessionId: input.recordSessionId,
      status: "ended",
      endedAt,
      report: {
        flowPath,
        stepCount: mapped.steps.length,
        warnings,
        confidenceSummary,
        reviewRequired: confidenceSummary.low > 0 || warnings.length > 0,
        replayDryRun,
      },
    },
    nextSuggestions: flowPath
      ? [`Replay with run_flow and flowPath='${flowPath}'.`]
      : ["No flow was exported. Ensure meaningful user interaction happened during recording."],
  };
}

export async function cancelRecordSessionWithMaestro(input: CancelRecordSessionInput): Promise<ToolResult<CancelRecordSessionData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSession = await loadRecordSession(repoRoot, input.recordSessionId);
  if (!recordSession) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.recordSessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId: input.recordSessionId,
        cancelled: false,
        status: "cancelled",
      },
      nextSuggestions: ["Record session not found."],
    };
  }

  if (recordSession.pid && recordSession.status === "running") {
    try {
      process.kill(recordSession.pid, "SIGTERM");
    } catch (error) {
      void error;
    }
  }

  const endedAt = new Date().toISOString();
  await persistRecordSessionState(repoRoot, input.recordSessionId, {
    status: "cancelled",
    endedAt,
    warnings: [...recordSession.warnings, "Recording was cancelled by user."],
    pid: undefined,
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: recordSession.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [buildRecordSessionRelativePath(input.recordSessionId), recordSession.rawEventsPath],
    data: {
      recordSessionId: input.recordSessionId,
      cancelled: true,
      status: "cancelled",
      endedAt,
    },
    nextSuggestions: ["Start a new record session when you are ready to capture another flow."],
  };
}

export const recordingRuntimeInternals = {
  parseAdbDeviceEntries,
  choosePreferredAndroidDeviceId,
  parseRawInputEvents,
  deriveViewportSizeFromXml,
  normalizeEventsToViewport,
  parseSnapshotCapturedAtMs,
  chooseNearestSnapshotRef,
  mapMonotonicToIso,
};
