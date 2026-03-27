import { parseAllDocuments } from "yaml";
import type { ActionIntent, RecordedStep, RecordedStepConfidence, ReplayProgressSummary } from "@mobile-e2e-mcp/contracts";

export interface ReplayStep {
  replayStepId: string;
  stepNumber: number;
  source: "recorded_step" | "flow_import";
  sourceRef?: string;
  actionType: ActionIntent["actionType"] | "tap";
  actionIntent?: ActionIntent;
  confidence: RecordedStepConfidence;
  warnings: string[];
  dependency: {
    previousStepRequired: boolean;
    checkpointEligible: boolean;
  };
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

export function buildReplayStepsFromFlowYaml(flowContent: string): ReplayStep[] {
  const documents = parseAllDocuments(flowContent).map((doc) => doc.toJSON());
  const parsed = documents.find((value) => Array.isArray(value));
  if (!Array.isArray(parsed)) {
    return [];
  }

  const steps: ReplayStep[] = [];

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
      steps.push({
        replayStepId: `replay-step-${stepNumber}`,
        stepNumber,
        source: "flow_import",
        actionType: point ? "tap" : "tap_element",
        actionIntent: point
          ? undefined
          : {
              actionType: "tap_element",
              identifier: asString(item.tapOn.identifier),
              resourceId: asString(item.tapOn.id),
              text: asString(item.tapOn.text),
            },
        confidence: point ? "medium" : "high",
        warnings: point ? ["Coordinate tap imported from flow YAML."] : [],
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
  }

  return steps;
}
