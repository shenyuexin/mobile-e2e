import type { ReplayProgressSummary, ReplayStepStatus } from "@mobile-e2e-mcp/contracts";

function dedupeSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function updateReplayProgress(
  progress: ReplayProgressSummary,
  stepNumber: number,
  status: ReplayStepStatus,
): ReplayProgressSummary {
  const removeFromRemaining = progress.remainingSteps.filter((value) => value !== stepNumber);
  const next: ReplayProgressSummary = {
    ...progress,
    completedSteps: [...progress.completedSteps],
    partialSteps: [...progress.partialSteps],
    failedSteps: [...progress.failedSteps],
    skippedSteps: [...progress.skippedSteps],
    remainingSteps: removeFromRemaining,
  };

  if (status === "success") {
    next.completedSteps = dedupeSorted([...progress.completedSteps, stepNumber]);
    next.lastSuccessfulStepNumber = stepNumber;
  } else if (status === "partial") {
    next.partialSteps = dedupeSorted([...progress.partialSteps, stepNumber]);
  } else if (status === "failed") {
    next.failedSteps = dedupeSorted([...progress.failedSteps, stepNumber]);
    next.firstFailedStepNumber ??= stepNumber;
  } else if (status === "skipped") {
    next.skippedSteps = dedupeSorted([...progress.skippedSteps, stepNumber]);
  }

  return next;
}
