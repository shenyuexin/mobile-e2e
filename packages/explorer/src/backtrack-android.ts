import type { BacktrackLadderContext } from "./backtrack-core.js";
import { tryCancelCloseFamily, tryDialogControlFamily } from "./backtrack-core.js";

export async function runAndroidBacktrackLadder(ctx: BacktrackLadderContext): Promise<boolean> {
  const affordance = await ctx.detectBackAffordance();

  if (await ctx.tryNavigateBack("navigate_back:system_back")) {
    return true;
  }

  if (await tryCancelCloseFamily(ctx)) {
    return true;
  }

  if (await tryDialogControlFamily(ctx)) {
    return true;
  }

  if (await ctx.tryPointBandBack(affordance.navBarFrame)) {
    return true;
  }

  if (await ctx.tryTopBarBackCandidates()) {
    return true;
  }

  if (await ctx.tryScreenSummaryBackAffordance()) {
    return true;
  }

  if (await ctx.tryNavBarCoordinateBack()) {
    return true;
  }

  await ctx.logBackFailureEvidence();
  ctx.logWarn(
    `all Android strategies failed for parentTitle="${ctx.parentTitle ?? "<none>"}" ` +
    `(system_back -> cancel/close/dialog -> nav points/buttons)`,
  );
  return false;
}
