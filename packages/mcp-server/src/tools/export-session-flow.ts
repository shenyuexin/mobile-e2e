import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { listActionRecordsForSession, loadSessionRecord } from "@mobile-e2e-mcp/core";
import type { ActionIntent, ExportSessionFlowData, ExportSessionFlowInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES, TOOL_NAMES } from "@mobile-e2e-mcp/contracts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type MaestroStep =
  | { launchApp: { appId: string; clearState?: boolean } }
  | { tapOn: { id?: string; text?: string } }
  | { inputText: string }
  | { assertVisible: { id?: string; text?: string } };

function resolveTapTarget(intent: ActionIntent): { id?: string; text?: string } | undefined {
  if (intent.resourceId) return { id: intent.resourceId };
  if (intent.text) return { text: intent.text };
  if (intent.contentDesc) return { text: intent.contentDesc };
  return undefined;
}

function toMaestroSteps(intent: ActionIntent, appId: string): { steps: MaestroStep[]; warnings: string[] } {
  if (intent.actionType === TOOL_NAMES.launchApp) {
    return { steps: [{ launchApp: { appId: intent.appId ?? appId, clearState: false } }], warnings: [] };
  }

  if (intent.actionType === TOOL_NAMES.tapElement) {
    const tapOn = resolveTapTarget(intent);
    if (!tapOn) {
      return { steps: [], warnings: ["tap_element skipped: no resourceId/text/contentDesc available."] };
    }
    return { steps: [{ tapOn }], warnings: [] };
  }

  if (intent.actionType === TOOL_NAMES.typeIntoElement) {
    const tapOn = resolveTapTarget(intent);
    if (!tapOn) {
      return { steps: [], warnings: ["type_into_element skipped: no resourceId/text/contentDesc available."] };
    }
    return {
      steps: [
        { tapOn },
        { inputText: intent.value ?? "" },
      ],
      warnings: [],
    };
  }

  if (intent.actionType === TOOL_NAMES.waitForUi) {
    const target = resolveTapTarget(intent);
    if (!target) {
      return { steps: [], warnings: ["wait_for_ui skipped: no resourceId/text/contentDesc available."] };
    }
    return { steps: [{ assertVisible: target }], warnings: [] };
  }

  return { steps: [], warnings: ["terminate_app skipped: no Maestro equivalent step emitted in exported flow."] };
}

function renderStep(step: MaestroStep): string[] {
  if ("inputText" in step) {
    return [`- inputText: "${step.inputText.replaceAll('"', '\\"')}"`];
  }
  if ("tapOn" in step) {
    const lines = ["- tapOn:"];
    if (step.tapOn.id) lines.push(`    id: "${step.tapOn.id}"`);
    if (step.tapOn.text) lines.push(`    text: "${step.tapOn.text.replaceAll('"', '\\"')}"`);
    return lines;
  }
  if ("assertVisible" in step) {
    const lines = ["- assertVisible:"];
    if (step.assertVisible.id) lines.push(`    id: "${step.assertVisible.id}"`);
    if (step.assertVisible.text) lines.push(`    text: "${step.assertVisible.text.replaceAll('"', '\\"')}"`);
    return lines;
  }
  return [
    "- launchApp:",
    `    appId: "${step.launchApp.appId}"`,
    `    clearState: ${step.launchApp.clearState ? "true" : "false"}`,
  ];
}

export async function exportSessionFlow(input: ExportSessionFlowInput): Promise<ToolResult<ExportSessionFlowData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const records = await listActionRecordsForSession(repoRoot, input.sessionId);
  if (records.length === 0) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        outputPath: input.outputPath ?? "",
        stepCount: 0,
        skippedCount: 0,
        warnings: ["No action records found for this session."],
        preview: "",
      },
      nextSuggestions: ["Run perform_action_with_evidence first to generate action records for this session."],
    };
  }

  const session = await loadSessionRecord(repoRoot, input.sessionId);
  const defaultAppId = session?.session.appId ?? "com.example.app";
  const relativeOutputPath = input.outputPath ?? path.posix.join("flows", "samples", "generated", `${input.sessionId}-${Date.now()}.yaml`);
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  const warnings: string[] = [];
  const steps: MaestroStep[] = [];

  if (input.includeLaunchStep !== false) {
    steps.push({ launchApp: { appId: defaultAppId, clearState: false } });
  }

  for (const record of records.slice().reverse()) {
    const intent = record.intent;
    if (!intent) {
      warnings.push(`Action ${record.actionId} skipped: missing persisted intent.`);
      continue;
    }
    const mapped = toMaestroSteps(intent, defaultAppId);
    warnings.push(...mapped.warnings.map((item) => `${record.actionId}: ${item}`));
    steps.push(...mapped.steps);
  }

  if (steps.length === 0) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        outputPath: relativeOutputPath,
        stepCount: 0,
        skippedCount: warnings.length,
        warnings,
        preview: "",
      },
      nextSuggestions: ["No replayable actions were exported. Ensure action records contain tap/type/wait/launch intents."],
    };
  }

  const lines: string[] = [`appId: "${defaultAppId}"`, "---"];
  for (const step of steps) {
    lines.push(...renderStep(step));
  }
  const yamlContent = `${lines.join("\n")}\n`;

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, yamlContent, "utf8");

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [relativeOutputPath],
    data: {
      outputPath: relativeOutputPath,
      stepCount: steps.length,
      skippedCount: warnings.length,
      warnings,
      preview: lines.slice(0, 12).join("\n"),
    },
    nextSuggestions: [
      `Replay with run_flow using flowPath='${relativeOutputPath}'.`,
    ],
  };
}
