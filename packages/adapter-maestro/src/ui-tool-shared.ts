import path from "node:path";
import type { Platform, QueryUiInput, QueryUiSelector, RunnerProfile } from "@mobile-e2e-mcp/contracts";
import { normalizeQueryUiSelector } from "./ui-model.js";

interface UiSelectorLikeInput {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
  limit?: number;
}

export function buildUiQuery(input: UiSelectorLikeInput) {
  return normalizeQueryUiSelector({
    resourceId: input.resourceId,
    contentDesc: input.contentDesc,
    text: input.text,
    className: input.className,
    clickable: input.clickable,
    limit: input.limit,
  });
}

export function buildPlatformUiDumpOutputPath(params: {
  sessionId: string;
  runnerProfile: string;
  platform: Platform;
  outputPath?: string;
}): string {
  if (params.outputPath) {
    return params.outputPath;
  }
  const extension = params.platform === "android" ? "xml" : "json";
  return path.posix.join(
    "artifacts",
    "ui-dumps",
    params.sessionId,
    `${params.platform}-${params.runnerProfile}.${extension}`,
  );
}

export function buildUnknownUiDumpOutputPath(params: {
  sessionId: string;
  runnerProfile: string;
  outputPath?: string;
}): string {
  return params.outputPath
    ?? path.posix.join(
      "artifacts",
      "ui-dumps",
      params.sessionId,
      `unknown-${params.runnerProfile}.json`,
    );
}

export function buildMissingPlatformSuggestion(toolName: string): string {
  return `Provide platform explicitly, or call ${toolName} with an active sessionId so MCP can resolve platform from session context.`;
}

/**
 * Build the options object for iOS hierarchy snapshot capture.
 *
 * Eliminates the repeated object literal across inspect_ui, query_ui,
 * resolve_ui_target, and wait_for_ui iOS branches.
 */
export function buildIosSnapshotOptions(
  base: {
    sessionId: string;
    runnerProfile: RunnerProfile;
    harnessConfigPath?: string;
    deviceId: string;
    outputPath?: string;
  },
  query?: QueryUiSelector,
): QueryUiInput {
  return {
    sessionId: base.sessionId,
    platform: "ios",
    runnerProfile: base.runnerProfile,
    harnessConfigPath: base.harnessConfigPath,
    deviceId: base.deviceId,
    outputPath: base.outputPath,
    dryRun: false,
    ...query,
  };
}
