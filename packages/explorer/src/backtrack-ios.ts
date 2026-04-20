import type { BacktrackLadderContext } from "./backtrack-core.js";
import { tryCancelCloseFamily, tryDialogControlFamily, trySelectorFamily } from "./backtrack-core.js";

export async function runIosBacktrackLadder(ctx: BacktrackLadderContext): Promise<boolean> {
  const affordance = await ctx.detectBackAffordance();
  const isDialogLike = affordance.isDialogLike === true;

  if (await trySelectorFamily(ctx, affordance)) {
    return true;
  }

  if (!isDialogLike && await ctx.tryPointBandBack(affordance.navBarFrame)) {
    return true;
  }

  if (await tryCancelCloseFamily(ctx)) {
    return true;
  }

  if (await tryDialogControlFamily(ctx)) {
    return true;
  }

  if (await ctx.tryTopBarBackCandidates()) {
    return true;
  }

  if (await ctx.tryScreenSummaryBackAffordance()) {
    return true;
  }

  if (await ctx.tryNavigateBack("navigate_back:edge_swipe", { iosStrategy: "edge_swipe" })) {
    return true;
  }

  if (isDialogLike && await ctx.tryPointBandBack(affordance.navBarFrame)) {
    return true;
  }

  if (await ctx.tryNavBarCoordinateBack()) {
    return true;
  }

  await ctx.logBackFailureEvidence();
  ctx.logWarn(
    `all iOS strategies failed for parentTitle="${ctx.parentTitle ?? "<none>"}" ` +
    `(${isDialogLike ? "selector -> cancel/dialog -> topbar/summary -> edge_swipe -> point-band" : "selector -> point-band -> cancel/dialog -> topbar/summary -> edge_swipe -> nav points"})`,
  );
  return false;
}
