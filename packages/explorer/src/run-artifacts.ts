import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { generateRunId } from "./report/summary.js";

export interface RunArtifactsPaths {
  runId: string;
  runDir: string;
  logPath: string;
}

export function prepareRunArtifacts(outputDir: string): RunArtifactsPaths {
  const existingRunId = process.env.EXPLORER_RUN_ID?.trim();
  const runId = existingRunId || generateRunId();

  process.env.EXPLORER_RUN_ID = runId;

  const runDir = join(outputDir, runId);
  mkdirSync(runDir, { recursive: true });

  return {
    runId,
    runDir,
    logPath: join(runDir, "log.txt"),
  };
}
