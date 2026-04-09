import { ACTION_TYPES, type ActionType } from "@mobile-e2e-mcp/contracts";
import type { ActionIntent, RawRecordedEvent, RecordedStep, RecordedStepConfidence } from "@mobile-e2e-mcp/contracts";

export interface RecordingMappingOptions {
  defaultAppId?: string;
  includeAutoWaitStep?: boolean;
  dedupeTapWindowMs?: number;
  typeChunkGapMs?: number;
}

export interface RecordingMappingResult {
  steps: RecordedStep[];
  warnings: string[];
}

export interface RenderedRecordedFlow {
  yaml: string;
  warnings: string[];
  confidenceSummary: {
    high: number;
    medium: number;
    low: number;
  };
}

type ExtendedActionIntent = ActionIntent & { identifier?: string };

function parseTimestampMillis(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveTargetFromIntent(intent: ActionIntent | undefined): { identifier?: string; id?: string; text?: string } | undefined {
  if (!intent) {
    return undefined;
  }
  const extendedIntent = intent as ExtendedActionIntent;
  if (extendedIntent.identifier) return { identifier: extendedIntent.identifier };
  if (intent.resourceId) return { id: intent.resourceId };
  if (intent.text && !isSnapshotPath(intent.text)) return { text: intent.text };
  if (intent.contentDesc && !isSnapshotPath(intent.contentDesc)) return { text: intent.contentDesc };
  return undefined;
}

function isSnapshotPath(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return value.includes("artifacts/record-snapshots/") || value.endsWith(".xml") || value.endsWith(".json");
}

function buildIntentFromEventSelector(event: RawRecordedEvent, actionType: ActionIntent["actionType"]): ActionIntent | undefined {
  const selector = (event as RawRecordedEvent & {
    resolvedSelector?: { identifier?: string; resourceId?: string; text?: string; value?: string; contentDesc?: string; className?: string };
  }).resolvedSelector;
  if (!selector) {
    return undefined;
  }
  if (isSnapshotPath(selector.text) || isSnapshotPath(selector.contentDesc)) {
    return undefined;
  }
  if (!selector.identifier && !selector.resourceId && !selector.text && !selector.value && !selector.contentDesc) {
    return undefined;
  }
  return {
    actionType,
    ...(selector.identifier ? { identifier: selector.identifier } : {}),
    resourceId: selector.resourceId,
    text: selector.text ?? selector.value,
    contentDesc: selector.contentDesc,
    className: selector.className,
  };
}

function escapeYaml(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
}

function isLikelySystemKeyboardDescriptor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized.startsWith("<bkshidkeyboarddevice:")) {
    return false;
  }
  return normalized.includes("senderid:")
    && normalized.includes("transport:")
    && normalized.includes("layout:")
    && normalized.includes("standardtype:");
}

function shouldAutoInsertWaitStep(actionType: ActionType): boolean {
  return actionType === ACTION_TYPES.tapElement || actionType === ACTION_TYPES.typeIntoElement;
}

function isWeakTapIntent(intent: ActionIntent): boolean {
  const extendedIntent = intent as ExtendedActionIntent;
  if (extendedIntent.identifier) {
    const normalized = extendedIntent.identifier.toLowerCase();
    if (normalized.includes("window") || normalized.includes("application")) {
      return true;
    }
    return false;
  }
  const resourceId = intent.resourceId;
  if (!resourceId && !intent.contentDesc) {
    return true;
  }
  if (!resourceId) {
    return false;
  }
  if (resourceId === "android:id/content" || resourceId === "android:id/navigationBarBackground") {
    return true;
  }
  if (resourceId.endsWith(":id/nav_host_fragment_content_main")) {
    return true;
  }
  return false;
}

function isInputLikeIntent(intent: ActionIntent | undefined): boolean {
  if (!intent) {
    return false;
  }
  const extendedIntent = intent as ExtendedActionIntent;
  const className = intent.className?.toLowerCase();
  const identifier = extendedIntent.identifier?.toLowerCase();
  const resourceId = intent.resourceId?.toLowerCase();
  const text = intent.text?.toLowerCase();
  const contentDesc = intent.contentDesc?.toLowerCase();

  const containsInputHint = (value: string | undefined): boolean =>
  {
    if (!value) {
      return false;
    }
    return value.includes("input")
      || value.includes("field")
      || value.includes("text")
      || value.includes("email")
      || value.includes("password")
      || value.includes("search")
      || value.includes("username")
      || value.includes("phone");
  };

  return className === "edittext"
    || className === "textfield"
    || className === "securetextfield"
    || containsInputHint(className)
    || containsInputHint(identifier)
    || containsInputHint(resourceId)
    || containsInputHint(text)
    || containsInputHint(contentDesc);
}

function toStep(
  stepNumber: number,
  event: RawRecordedEvent,
  actionType: RecordedStep["actionType"],
  confidence: RecordedStepConfidence,
  reason: string,
  actionIntent?: ActionIntent,
): RecordedStep {
  return {
    stepNumber,
    eventId: event.eventId,
    timestamp: event.timestamp,
    actionType,
    actionIntent,
    x: event.x,
    y: event.y,
    confidence,
    reason,
    warnings: confidence === "low" ? ["Low confidence semantic mapping."] : [],
  };
}

export function mapRawEventsToRecordedSteps(
  recordSessionId: string,
  events: RawRecordedEvent[],
  options: RecordingMappingOptions = {},
): RecordingMappingResult {
  const includeAutoWaitStep = options.includeAutoWaitStep ?? true;
  const dedupeTapWindowMs = options.dedupeTapWindowMs ?? 300;
  const typeChunkGapMs = options.typeChunkGapMs ?? 1200;
  const warnings: string[] = [];
  const sorted = events.slice().sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const steps: RecordedStep[] = [];
  let stepNumber = 0;
  let lastTap: { x?: number; y?: number; timestampMs: number } | undefined;
  let lastInputIntent: ActionIntent | undefined;

  for (let index = 0; index < sorted.length; index += 1) {
    const event = sorted[index];
    let mappedStep: RecordedStep | undefined;

    if (event.eventType === "tap") {
      const timestampMs = parseTimestampMillis(event.timestamp);
      if (
        lastTap
        && event.x !== undefined
        && event.y !== undefined
        && lastTap.x === event.x
        && lastTap.y === event.y
        && timestampMs - lastTap.timestampMs <= dedupeTapWindowMs
      ) {
        warnings.push(`Deduplicated noisy tap event '${event.eventId}'.`);
        continue;
      }
      lastTap = { x: event.x, y: event.y, timestampMs };

      stepNumber += 1;
      if (event.x === undefined || event.y === undefined) {
        mappedStep = toStep(stepNumber, event, ACTION_TYPES.tap, "low", "Tap recorded without stable coordinates; degraded to coordinate tap fallback.");
      } else {
        const tapIntent = buildIntentFromEventSelector(event, ACTION_TYPES.tapElement);
        if (tapIntent && !isWeakTapIntent(tapIntent)) {
        mappedStep = toStep(
          stepNumber,
          event,
          ACTION_TYPES.tapElement,
          (tapIntent as ExtendedActionIntent).identifier || tapIntent.resourceId ? "high" : "medium",
          "Tap mapped to tap_element from resolved selector context.",
          tapIntent,
        );
          lastInputIntent = isInputLikeIntent(tapIntent) ? tapIntent : undefined;
        } else {
        mappedStep = toStep(stepNumber, event, ACTION_TYPES.tap, "medium", "Tap mapped as coordinate fallback due to weak or missing selector context.");
          lastInputIntent = undefined;
        }
      }
    } else if (event.eventType === "type") {
      if (!event.textDelta || event.textDelta.trim().length === 0) {
        warnings.push(`Type event '${event.eventId}' skipped due to empty textDelta.`);
        continue;
      }
      let value = event.textDelta;
      let lookahead = index + 1;
      let previousTimestampMs = parseTimestampMillis(event.timestamp);
      while (lookahead < sorted.length && sorted[lookahead]?.eventType === "type" && sorted[lookahead]?.textDelta) {
        const nextTimestampMs = parseTimestampMillis(sorted[lookahead]?.timestamp);
        if (nextTimestampMs > 0 && previousTimestampMs > 0 && (nextTimestampMs - previousTimestampMs) > typeChunkGapMs) {
          break;
        }
        const delta = sorted[lookahead]?.textDelta ?? "";
        if (delta === "\t" || delta === "\n") {
          lookahead += 1;
          break;
        }
        value += delta;
        previousTimestampMs = nextTimestampMs;
        lookahead += 1;
      }
      index = lookahead - 1;
      if (value.trim().length === 0) {
        warnings.push(`Type event '${event.eventId}' resolved to delimiter-only chunk and was skipped.`);
        continue;
      }
      const typeIntent = buildIntentFromEventSelector(event, ACTION_TYPES.typeIntoElement) ?? lastInputIntent;
      stepNumber += 1;
      mappedStep = toStep(
        stepNumber,
        event,
        ACTION_TYPES.typeIntoElement,
        ((typeIntent as ExtendedActionIntent | undefined)?.identifier || typeIntent?.resourceId) ? "high" : typeIntent ? "medium" : "low",
        "Input event mapped to type_into_element from aggregated text chunks.",
        {
          ...(typeIntent ?? { actionType: ACTION_TYPES.typeIntoElement }),
          actionType: ACTION_TYPES.typeIntoElement,
          value,
        },
      );
    } else if (event.eventType === "swipe") {
      lastInputIntent = undefined;
      const gesture = (event as RawRecordedEvent & { gesture?: { start?: { x: number; y: number }; end?: { x: number; y: number }; durationMs?: number } }).gesture;
      const startX = gesture?.start?.x ?? event.x;
      const startY = gesture?.start?.y ?? event.y;
      const endX = gesture?.end?.x;
      const endY = gesture?.end?.y;
      if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
        warnings.push(`Swipe event '${event.eventId}' skipped due to incomplete coordinates.`);
        continue;
      }
      stepNumber += 1;
      mappedStep = toStep(
        stepNumber,
        event,
        ACTION_TYPES.swipe as RecordedStep["actionType"],
        "medium",
        "Swipe mapped from touch trajectory.",
        ({
          actionType: ACTION_TYPES.swipe as ActionIntent["actionType"],
          startX,
          startY,
          endX,
          endY,
          durationMs: gesture?.durationMs ?? 250,
        } as ActionIntent),
      );
    } else if (event.eventType === "app_switch" || event.eventType === "home") {
      lastInputIntent = undefined;
      stepNumber += 1;
      const appId = event.foregroundApp ?? options.defaultAppId;
      mappedStep = toStep(
        stepNumber,
        event,
        ACTION_TYPES.launchApp,
        appId ? "medium" : "low",
        "Foreground app transition mapped to launch_app.",
        {
          actionType: ACTION_TYPES.launchApp,
          appId,
        },
      );
    } else if (event.eventType === "back") {
      lastInputIntent = undefined;
      stepNumber += 1;
      const waitIntent = buildIntentFromEventSelector(event, ACTION_TYPES.waitForUi);
      mappedStep = toStep(
        stepNumber,
        event,
        ACTION_TYPES.waitForUi,
        waitIntent ? "medium" : "low",
        "Back key event mapped to wait_for_ui stabilization step.",
        waitIntent
          ? { ...waitIntent, actionType: ACTION_TYPES.waitForUi, timeoutMs: 3000 }
          : { actionType: ACTION_TYPES.waitForUi, timeoutMs: 3000 },
      );
    } else {
      warnings.push(`Event '${event.eventId}' with type '${event.eventType}' is not mapped in MVP.`);
      continue;
    }

    steps.push(mappedStep);
    const autoWaitTarget = resolveTargetFromIntent(mappedStep.actionIntent);
    if (includeAutoWaitStep && shouldAutoInsertWaitStep(mappedStep.actionType) && autoWaitTarget) {
      stepNumber += 1;
      steps.push({
        stepNumber,
        eventId: `${recordSessionId}-auto-wait-${stepNumber}`,
        timestamp: mappedStep.timestamp,
        actionType: ACTION_TYPES.waitForUi,
        actionIntent: {
          actionType: ACTION_TYPES.waitForUi,
          timeoutMs: 3000,
          ...(autoWaitTarget.identifier ? { identifier: autoWaitTarget.identifier } : {}),
          text: autoWaitTarget.text,
          resourceId: autoWaitTarget.id,
        },
        confidence: "medium",
        reason: "Auto-inserted wait_for_ui after actionable step to stabilize replay.",
        warnings: [],
      });
    }
  }

  return { steps, warnings };
}

export function renderRecordedStepsAsFlow(params: {
  appId: string;
  includeLaunchStep: boolean;
  steps: RecordedStep[];
}): RenderedRecordedFlow {
  const lines: string[] = [`appId: "${escapeYaml(params.appId)}"`, "---"];
  const warnings: string[] = [];
  const confidenceSummary = { high: 0, medium: 0, low: 0 };

  if (params.includeLaunchStep) {
    lines.push("- launchApp:");
    lines.push(`    appId: "${escapeYaml(params.appId)}"`);
    lines.push("    clearState: false");
  }

  for (const step of params.steps) {
    confidenceSummary[step.confidence] += 1;
    if (step.actionType === ACTION_TYPES.launchApp) {
      const appId = step.actionIntent?.appId ?? params.appId;
      lines.push("- launchApp:");
      lines.push(`    appId: "${escapeYaml(appId)}"`);
      lines.push("    clearState: false");
      continue;
    }

    if (step.actionType === ACTION_TYPES.tapElement) {
      const target = resolveTargetFromIntent(step.actionIntent);
      if (target?.identifier || target?.id || target?.text) {
        lines.push("- tapOn:");
        if (target.identifier) lines.push(`    identifier: "${escapeYaml(target.identifier)}"`);
        if (target.id) lines.push(`    id: "${escapeYaml(target.id)}"`);
        if (target.text) lines.push(`    text: "${escapeYaml(target.text)}"`);
        continue;
      }
      if (step.x !== undefined && step.y !== undefined) {
        lines.push("- tapOn:");
        lines.push(`    point: "${String(step.x)},${String(step.y)}"`);
        warnings.push(`Step ${String(step.stepNumber)} tap_element exported as coordinate fallback.`);
        continue;
      }
      warnings.push(`Step ${String(step.stepNumber)} tap_element skipped due to missing selector and coordinates.`);
      continue;
    }

    if (step.actionType === ACTION_TYPES.tap) {
      if (step.x === undefined || step.y === undefined) {
        warnings.push(`Step ${String(step.stepNumber)} tap skipped due to missing coordinates.`);
        continue;
      }
      lines.push("- tapOn:");
      lines.push(`    point: "${String(step.x)},${String(step.y)}"`);
      continue;
    }

    if (step.actionType === ACTION_TYPES.typeIntoElement) {
      const value = step.actionIntent?.value ?? "";
      const target = resolveTargetFromIntent(step.actionIntent);
      if (target?.identifier || target?.id || target?.text) {
        lines.push("- tapOn:");
        if (target.identifier) lines.push(`    identifier: "${escapeYaml(target.identifier)}"`);
        if (target.id) lines.push(`    id: "${escapeYaml(target.id)}"`);
        if (target.text) lines.push(`    text: "${escapeYaml(target.text)}"`);
      }
      if (isLikelySystemKeyboardDescriptor(value)) {
        warnings.push(`Step ${String(step.stepNumber)} type_into_element dropped non-user keyboard descriptor payload.`);
        continue;
      }
      lines.push(`- inputText: "${escapeYaml(value)}"`);
      continue;
    }

    if ((step.actionType as string) === ACTION_TYPES.swipe) {
      const swipeIntent = step.actionIntent as (ActionIntent & {
        startX?: number;
        startY?: number;
        endX?: number;
        endY?: number;
        durationMs?: number;
      }) | undefined;
      const startX = swipeIntent?.startX;
      const startY = swipeIntent?.startY;
      const endX = swipeIntent?.endX;
      const endY = swipeIntent?.endY;
      const duration = swipeIntent?.durationMs ?? 250;
      if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
        warnings.push(`Step ${String(step.stepNumber)} swipe skipped due to missing trajectory coordinates.`);
        continue;
      }
      lines.push("- swipe:");
      lines.push(`    start: "${String(startX)},${String(startY)}"`);
      lines.push(`    end: "${String(endX)},${String(endY)}"`);
      lines.push(`    duration: ${String(duration)}`);
      continue;
    }

    if (step.actionType === ACTION_TYPES.waitForUi) {
      const target = resolveTargetFromIntent(step.actionIntent);
      if (!target?.identifier && !target?.id && !target?.text) {
        warnings.push(`Step ${String(step.stepNumber)} wait_for_ui has no target and was skipped.`);
        continue;
      }
      lines.push("- assertVisible:");
      if (target.identifier) lines.push(`    identifier: "${escapeYaml(target.identifier)}"`);
      if (target.id) lines.push(`    id: "${escapeYaml(target.id)}"`);
      if (target.text) lines.push(`    text: "${escapeYaml(target.text)}"`);
      continue;
    }

    warnings.push(`Step ${String(step.stepNumber)} action '${step.actionType}' not exportable in MVP.`);
  }

  return {
    yaml: `${lines.join("\n")}\n`,
    warnings,
    confidenceSummary,
  };
}
