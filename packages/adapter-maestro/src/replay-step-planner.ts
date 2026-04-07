import { parseAllDocuments } from "yaml";
import type { ActionIntent, RecordedStep, RecordedStepConfidence, ReplayProgressSummary } from "@mobile-e2e-mcp/contracts";

export interface ReplayStep {
  replayStepId: string;
  stepNumber: number;
  source: "recorded_step" | "flow_import";
  sourceRef?: string;
  actionType:
    | ActionIntent["actionType"]
    | "tap"
    | "swipe"
    | "back"
    | "home"
    | "hide_keyboard"
    | "stop_app"
    | "clear_state"
    | "assert_not_visible"
    | "run_sub_flow";
  actionIntent?: ActionIntent;
  confidence: RecordedStepConfidence;
  warnings: string[];
  dependency: {
    previousStepRequired: boolean;
    checkpointEligible: boolean;
  };
}

export interface UnsupportedReplayFlowCommand {
  stepNumber: number;
  command: string;
}

export interface ReplayFlowImportPlan {
  steps: ReplayStep[];
  unsupportedCommands: UnsupportedReplayFlowCommand[];
}

export function buildInitialReplayProgress(totalSteps: number): ReplayProgressSummary {
  return {
    totalSteps,
    completedSteps: [],
    partialSteps: [],
    failedSteps: [],
    skippedSteps: [],
    remainingSteps: totalSteps > 0 ? Array.from({ length: totalSteps }, (_, index) => index + 1) : [],
  };
}

export function buildReplayStepsFromRecordedSteps(steps: RecordedStep[]): ReplayStep[] {
  return steps.map((step) => ({
    replayStepId: `replay-step-${step.stepNumber}`,
    stepNumber: step.stepNumber,
    source: "recorded_step",
    actionType: step.actionType,
    actionIntent: step.actionIntent,
    confidence: step.confidence,
    warnings: step.warnings ?? [],
    dependency: {
      previousStepRequired: true,
      checkpointEligible: step.actionType !== "wait_for_ui",
    },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parsePoint(value: string | undefined): { x: number; y: number } | undefined {
  if (!value) {
    return undefined;
  }
  const [x, y] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  return { x, y };
}

export function buildReplayPlanFromFlowYaml(flowContent: string): ReplayFlowImportPlan {
  const documents = parseAllDocuments(flowContent).map((doc) => doc.toJSON());
  const parsed = documents.find((value) => Array.isArray(value));
  if (!Array.isArray(parsed)) {
    return { steps: [], unsupportedCommands: [] };
  }

  const steps: ReplayStep[] = [];
  const unsupportedCommands: UnsupportedReplayFlowCommand[] = [];

  for (const [index, item] of parsed.entries()) {
    if (!isRecord(item)) {
      continue;
    }

    const stepNumber = index + 1;
    if (isRecord(item.launchApp)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "launch_app",
        actionIntent: {
          actionType: "launch_app",
          appId: asString(item.launchApp.appId),
        },
        confidence: "high",
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (isRecord(item.tapOn)) {
      const point = parsePoint(asString(item.tapOn.point));
      if (point) {
        steps.push({
          replayStepId: `replay-step-${stepNumber}`,
          stepNumber,
          source: "flow_import",
          actionType: "tap" as const,
          actionIntent: {
            actionType: "tap" as const,
            point,
          } as unknown as ActionIntent,
          confidence: "high" as const,
          warnings: ["Coordinate-based tap is device-resolution dependent."],
          dependency: { previousStepRequired: true, checkpointEligible: true },
        });
        continue;
      }
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "tap_element",
        actionIntent: {
          actionType: "tap_element",
          identifier: asString(item.tapOn.identifier),
          resourceId: asString(item.tapOn.id),
          text: asString(item.tapOn.text),
        },
        confidence: "high",
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (typeof item.inputText === "string") {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "type_into_element",
        actionIntent: {
          actionType: "type_into_element",
          value: item.inputText,
        },
        confidence: "medium",
        warnings: ["Imported inputText relies on the currently focused element."],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (isRecord(item.assertVisible)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "wait_for_ui",
        actionIntent: {
          actionType: "wait_for_ui",
          identifier: asString(item.assertVisible.identifier),
          resourceId: asString(item.assertVisible.id),
          text: asString(item.assertVisible.text),
        },
        confidence: "high",
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: false },
      });
      continue;
    }

    if (isRecord(item.assertNotVisible)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "assert_not_visible" as const,
        actionIntent: {
          actionType: "assert_not_visible" as const,
          identifier: asString(item.assertNotVisible.identifier),
          resourceId: asString(item.assertNotVisible.id),
          text: asString(item.assertNotVisible.text),
        } as unknown as ActionIntent,
        confidence: "high" as const,
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: false },
      });
      continue;
    }

    if (isRecord(item.runFlow)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "run_sub_flow" as const,
        actionIntent: { actionType: "run_sub_flow" as const, flowPath: asString(item.runFlow.file) } as unknown as ActionIntent,
        confidence: "medium" as const,
        warnings: ["runFlow requires loading and inlining a sub-flow file."],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (isRecord(item.swipe)) {
      const start = parsePoint(asString(item.swipe.start));
      const end = parsePoint(asString(item.swipe.end));
      if (start && end) {
        steps.push({
          replayStepId: `replay-step-${stepNumber}`,
          stepNumber,
          source: "flow_import",
          actionType: "swipe" as const,
          actionIntent: {
            actionType: "swipe" as const,
            point: start,
            endPoint: end,
            durationMs: Number(item.swipe.duration) || 300,
          } as unknown as ActionIntent,
          confidence: "high" as const,
          warnings: [],
          dependency: { previousStepRequired: true, checkpointEligible: true },
        });
        continue;
      }
    }

    if (item.back === true || item.back === "" || isRecord(item.back)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "back" as const,
        actionIntent: { actionType: "back" as const } as unknown as ActionIntent,
        confidence: "high" as const,
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (item.home === true || item.home === "" || isRecord(item.home)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "home" as const,
        actionIntent: { actionType: "home" as const } as unknown as ActionIntent,
        confidence: "high" as const,
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (item.hideKeyboard === true || item.hideKeyboard === "" || isRecord(item.hideKeyboard)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "hide_keyboard" as const,
        actionIntent: { actionType: "hide_keyboard" as const } as unknown as ActionIntent,
        confidence: "medium" as const,
        warnings: ["hideKeyboard maps to KEYCODE_BACK; may not dismiss all keyboard types."],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (isRecord(item.stopApp)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "stop_app" as const,
        actionIntent: { actionType: "stop_app" as const, appId: asString(item.stopApp.appId) } as unknown as ActionIntent,
        confidence: "high" as const,
        warnings: [],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    if (isRecord(item.clearState)) {
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: "clear_state" as const,
        actionIntent: { actionType: "clear_state" as const, appId: asString(item.clearState.appId) } as unknown as ActionIntent,
        confidence: "high" as const,
        warnings: ["clearState clears all app data, including login state."],
        dependency: { previousStepRequired: true, checkpointEligible: true },
      });
      continue;
    }

    const command = Object.keys(item)[0] ?? "unknown";
    unsupportedCommands.push({ stepNumber, command });
  }

  return { steps, unsupportedCommands };
}

export function buildReplayStepsFromFlowYaml(flowContent: string): ReplayStep[] {
  return buildReplayPlanFromFlowYaml(flowContent).steps;
}
