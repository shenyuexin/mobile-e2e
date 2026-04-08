import { parseAllDocuments } from "yaml";
import { readFile } from "node:fs/promises";
import { resolveRepoPath } from "./harness-config.js";
import { listActionRecordsForSession } from "@mobile-e2e-mcp/core";
import type {
  FlowStepValidation,
  InspectUiQuery,
  Platform,
  QueryUiInput,
  RunnerProfile,
  ToolResult,
  ValidateFlowData,
  ValidateFlowInput,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { queryUiWithMaestroTool } from "./ui-inspection-tools.js";

interface FlowValidationStep {
  stepIndex: number;
  stepType: string;
  selector?: InspectUiQuery;
  resourceId?: string;
  /** Steps that don't interact with the UI tree (launch, back, home, etc.) */
  isNonInteractive: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractSelector(step: Record<string, unknown>): InspectUiQuery | undefined {
  // tapOn
  if (isRecord(step.tapOn)) {
    const id = asString(step.tapOn.id);
    const text = asString(step.tapOn.text);
    if (id || text) return { resourceId: id, text };
  }
  // inputText — requires a prior tapOn, no selector in this step itself
  if (typeof step.inputText === "string") {
    return undefined;
  }
  // assertVisible
  if (isRecord(step.assertVisible)) {
    const id = asString(step.assertVisible.id);
    const text = asString(step.assertVisible.text);
    if (id || text) return { resourceId: id, text };
  }
  // assertNotVisible
  if (isRecord(step.assertNotVisible)) {
    const id = asString(step.assertNotVisible.id);
    const text = asString(step.assertNotVisible.text);
    if (id || text) return { resourceId: id, text };
  }
  return undefined;
}

function parseFlowStepsFromYaml(yamlContent: string): FlowValidationStep[] {
  const documents = parseAllDocuments(yamlContent).map((doc) => doc.toJSON());
  const parsed = documents.find((value) => Array.isArray(value));
  if (!Array.isArray(parsed)) {
    return [];
  }

  const steps: FlowValidationStep[] = [];

  for (const [index, item] of parsed.entries()) {
    if (!isRecord(item)) {
      continue;
    }

    const stepIndex = index + 1;

    if (isRecord(item.launchApp)) {
      steps.push({ stepIndex, stepType: "launch_app", isNonInteractive: true });
      continue;
    }

    if (isRecord(item.tapOn)) {
      const selector = extractSelector(item);
      steps.push({
        stepIndex,
        stepType: "tap_element",
        selector,
        resourceId: selector?.resourceId,
        isNonInteractive: false,
      });
      continue;
    }

    if (typeof item.inputText === "string") {
      steps.push({ stepIndex, stepType: "type_into_element", isNonInteractive: true });
      continue;
    }

    if (isRecord(item.assertVisible)) {
      const selector = extractSelector(item);
      steps.push({
        stepIndex,
        stepType: "wait_for_ui",
        selector,
        resourceId: selector?.resourceId,
        isNonInteractive: false,
      });
      continue;
    }

    if (isRecord(item.assertNotVisible)) {
      const selector = extractSelector(item);
      steps.push({
        stepIndex,
        stepType: "assert_not_visible",
        selector,
        resourceId: selector?.resourceId,
        isNonInteractive: false,
      });
      continue;
    }

    // skip non-UI-interaction steps gracefully
    const commandName = Object.keys(item)[0] ?? "unknown";
    steps.push({ stepIndex, stepType: commandName, isNonInteractive: true });
  }

  return steps;
}

async function buildStepsFromSessionRecords(
  repoRoot: string,
  sessionId: string,
): Promise<FlowValidationStep[]> {
  const records = await listActionRecordsForSession(repoRoot, sessionId);
  const steps: FlowValidationStep[] = [];

  for (const [index, record] of records.entries()) {
    const intent = record.intent;
    if (!intent) continue;

    const stepIndex = index + 1;
    const actionType = intent.actionType;

    if (actionType === "launch_app") {
      steps.push({ stepIndex, stepType: "launch_app", isNonInteractive: true });
      continue;
    }

    if (actionType === "tap_element") {
      const selector: InspectUiQuery = {};
      if (intent.resourceId) selector.resourceId = intent.resourceId;
      if (intent.text) selector.text = intent.text;
      if (intent.contentDesc) selector.contentDesc = intent.contentDesc;
      steps.push({
        stepIndex,
        stepType: "tap_element",
        selector: Object.keys(selector).length > 0 ? selector : undefined,
        resourceId: intent.resourceId,
        isNonInteractive: false,
      });
      continue;
    }

    if (actionType === "type_into_element") {
      steps.push({ stepIndex, stepType: "type_into_element", isNonInteractive: true });
      continue;
    }

    if (actionType === "wait_for_ui") {
      const selector: InspectUiQuery = {};
      if (intent.resourceId) selector.resourceId = intent.resourceId;
      if (intent.text) selector.text = intent.text;
      if (intent.contentDesc) selector.contentDesc = intent.contentDesc;
      steps.push({
        stepIndex,
        stepType: "wait_for_ui",
        selector: Object.keys(selector).length > 0 ? selector : undefined,
        resourceId: intent.resourceId,
        isNonInteractive: false,
      });
      continue;
    }

    steps.push({ stepIndex, stepType: actionType, isNonInteractive: true });
  }

  return steps;
}

async function validateStepAgainstCurrentUi(
  step: FlowValidationStep,
  platform: Platform,
  runnerProfile: RunnerProfile,
  sessionId: string,
  deviceId: string | undefined,
  harnessConfigPath: string | undefined,
): Promise<FlowStepValidation> {
  const base: Omit<FlowStepValidation, "status" | "reason" | "suggestion"> = {
    stepIndex: step.stepIndex,
    stepType: step.stepType,
    resourceId: step.resourceId,
  };

  // Non-interactive steps (launch, back, home, type after tap, etc.) — warn only
  if (step.isNonInteractive) {
    return { ...base, status: "warn", reason: "Non-interactive step; cannot validate via UI tree query.", suggestion: "Ensure app state is correct before this step." };
  }

  // No selector — cannot validate deterministically
  if (!step.selector) {
    return { ...base, status: "warn", reason: "No resolvable selector for dry-run validation.", suggestion: "Add resourceId, text, or contentDesc to the step selector." };
  }

  // Interactive step with selector — query the current UI tree
  try {
    const queryInput: QueryUiInput = {
      sessionId,
      platform,
      runnerProfile,
      harnessConfigPath,
      deviceId,
      resourceId: step.selector.resourceId,
      text: step.selector.text,
      contentDesc: step.selector.contentDesc,
      className: step.selector.className,
      clickable: step.selector.clickable,
      limit: step.selector.limit ?? 10,
      dryRun: true,
    };

    const queryResult = await queryUiWithMaestroTool(queryInput);

    const matchCount = queryResult.data.result?.totalMatches ?? 0;

    if (matchCount === 0) {
      return {
        ...base,
        status: "fail",
        reason: `Selector matched 0 elements in current UI tree.`,
        suggestion: `Verify the element still exists: ${JSON.stringify(step.selector)}`,
      };
    }

    if (matchCount === 1) {
      return { ...base, status: "pass" };
    }

    // Multiple matches — ambiguous but not broken
    return {
      ...base,
      status: "warn",
      reason: `Selector matched ${matchCount} elements (ambiguous).`,
      suggestion: "Narrow the selector to target a single element.",
    };
  } catch (error) {
    return {
      ...base,
      status: "fail",
      reason: `UI query failed: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: "Ensure the app is launched and on the expected screen before this step.",
    };
  }
}

export async function validateFlow(input: ValidateFlowInput): Promise<ToolResult<ValidateFlowData>> {
  const startTime = Date.now();

  if (!input.sessionId && !input.flowPath) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId ?? `validate-flow-${Date.now()}`,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        valid: false,
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: [],
        warnedSteps: [],
        overallConfidence: 0,
        validationSummary: "No flow source provided. Pass sessionId or flowPath.",
      },
      nextSuggestions: ["Provide sessionId to validate recorded session flow, or flowPath to validate a Maestro YAML file."],
    };
  }

  const repoRoot = resolveRepoPath();
  let flowSteps: FlowValidationStep[] = [];

  // Load flow steps from either source
  if (input.flowPath) {
    const absoluteFlowPath = input.flowPath.startsWith("/") ? input.flowPath : `${repoRoot}/${input.flowPath}`;
    const yamlContent = await readFile(absoluteFlowPath, "utf8");
    flowSteps = parseFlowStepsFromYaml(yamlContent);
  } else if (input.sessionId) {
    flowSteps = await buildStepsFromSessionRecords(repoRoot, input.sessionId);
  }

  if (flowSteps.length === 0) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId ?? `validate-flow-${Date.now()}`,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        valid: false,
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: [],
        warnedSteps: [],
        overallConfidence: 0,
        validationSummary: "No validation steps found in the flow.",
      },
      nextSuggestions: ["Ensure the session has action records or the flow file contains valid Maestro steps."],
    };
  }

  // For dry-run validation against current UI, we need a live session context
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? "phase1";
  const sessionId = input.sessionId ?? `validate-flow-${Date.now()}`;
  const deviceId = input.deviceId;
  const harnessConfigPath = input.harnessConfigPath;

  const stepValidations: FlowStepValidation[] = [];

  // Without platform, we can only do structural validation (no UI tree queries)
  if (!platform) {
    for (const step of flowSteps) {
      const base: Omit<FlowStepValidation, "status" | "reason" | "suggestion"> = {
        stepIndex: step.stepIndex,
        stepType: step.stepType,
        resourceId: step.resourceId,
      };
      if (step.isNonInteractive) {
        stepValidations.push({ ...base, status: "warn", reason: "Non-interactive step; cannot validate without platform context.", suggestion: "Provide platform to enable UI tree validation." });
      } else if (!step.selector) {
        stepValidations.push({ ...base, status: "warn", reason: "No resolvable selector for dry-run validation.", suggestion: "Add resourceId, text, or contentDesc to the step selector." });
      } else {
        stepValidations.push({ ...base, status: "warn", reason: "Platform not provided; skipping UI tree validation.", suggestion: "Provide platform to validate elements against current UI." });
      }
    }
  } else {
    for (const step of flowSteps) {
      const result = await validateStepAgainstCurrentUi(step, platform, runnerProfile, sessionId, deviceId, harnessConfigPath);
      stepValidations.push(result);
    }
  }

  const failedSteps = stepValidations.filter((s) => s.status === "fail");
  const warnedSteps = stepValidations.filter((s) => s.status === "warn");
  const passedSteps = stepValidations.filter((s) => s.status === "pass");

  const totalSteps = flowSteps.length;
  const passedCount = passedSteps.length;
  const failedCount = failedSteps.length;
  const warnedCount = warnedSteps.length;
  const overallConfidence = totalSteps > 0 ? Math.round((passedCount / totalSteps) * 100) : 0;
  const isValid = failedCount === 0;

  let validationSummary: string;
  if (isValid && warnedCount === 0) {
    validationSummary = `All ${totalSteps} steps validated successfully.`;
  } else if (isValid) {
    validationSummary = `Flow is valid with ${warnedCount} warning(s). ${passedCount} passed, ${warnedCount} warned, 0 failed.`;
  } else {
    validationSummary = `Flow validation failed: ${passedCount} passed, ${warnedCount} warned, ${failedCount} failed.`;
  }

  return {
    status: isValid ? "success" : "failed",
    reasonCode: isValid ? REASON_CODES.ok : REASON_CODES.adapterError,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      valid: isValid,
      totalSteps,
      passedSteps: passedCount,
      failedSteps,
      warnedSteps,
      overallConfidence,
      validationSummary,
    },
    nextSuggestions: isValid
      ? ["Flow is safe to export. Run export_session_flow to generate Maestro YAML."]
      : failedSteps.slice(0, 3).map((s) => `Step ${s.stepIndex} (${s.stepType}): ${s.reason}`),
  };
}
