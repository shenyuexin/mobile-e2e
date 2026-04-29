import { hashUiStructure } from "./page-registry.js";
import type { Frame, PageSnapshot } from "./types.js";

function normalizeNavText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeTitleForMatch(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function isLikelyBundleId(value: string): boolean {
  return value.includes(".") && !value.includes(" ");
}

export function findAncestorFrameIndex(
  stack: Frame[],
  snapshot: Pick<PageSnapshot, "screenId" | "screenTitle" | "appId">,
): number {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const sameScreen = stack[index].state.screenId === snapshot.screenId;
    const sameAppIdentity =
      snapshot.appId === undefined ||
      stack[index].appId === undefined ||
      stack[index].appId === snapshot.appId;
    if (sameScreen && sameAppIdentity) {
      const snapshotTitle = normalizeNavText(snapshot.screenTitle);
      const frameTitle = normalizeNavText(stack[index].state.screenTitle);
      if (snapshotTitle && frameTitle && snapshotTitle !== frameTitle) {
        continue;
      }
      return index;
    }
  }

  if (snapshot.screenTitle && !isLikelyBundleId(snapshot.screenTitle)) {
    const normalizedSnapshotTitle = normalizeTitleForMatch(snapshot.screenTitle);
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const frameTitle = stack[index].state.screenTitle;
      if (frameTitle && !isLikelyBundleId(frameTitle) && normalizeTitleForMatch(frameTitle) === normalizedSnapshotTitle) {
        const sameAppIdentity =
          snapshot.appId === undefined ||
          stack[index].appId === undefined ||
          stack[index].appId === snapshot.appId;
        if (sameAppIdentity) {
          console.log(
            `[FRAME-RESUME] screenId drift detected: matched by title "${frameTitle}" at depth=${index} ` +
            `(snapshot screenId=${snapshot.screenId}, frame screenId=${stack[index].state.screenId})`,
          );
          return index;
        }
      }
    }
  }

  return -1;
}

export function reconcileStackToSnapshot(
  stack: Frame[],
  snapshot: PageSnapshot,
  targetAppId: string,
  options?: { allowRootReset?: boolean },
): Frame | undefined {
  if (stack.length === 0) {
    return undefined;
  }

  const ancestorFrameIndex = findAncestorFrameIndex(stack, snapshot);

  if (ancestorFrameIndex >= 0) {
    while (stack.length - 1 > ancestorFrameIndex) {
      stack.pop();
    }

    const resumedFrame = stack[ancestorFrameIndex];
    resumedFrame.state = {
      screenId: snapshot.screenId,
      screenTitle: snapshot.screenTitle,
      structureHash: hashUiStructure(snapshot.uiTree),
    };
    resumedFrame.appId = snapshot.appId ?? resumedFrame.appId ?? targetAppId;
    resumedFrame.isExternalApp = false;
    return resumedFrame;
  }

  if (snapshot.appId === targetAppId && options?.allowRootReset !== false) {
    console.log(
      `[FRAME-RESUME] No ancestor match for "${snapshot.screenTitle ?? snapshot.screenId}". ` +
      `Resetting to root frame (was ${stack.length} frames).`,
    );
    while (stack.length > 1) {
      stack.pop();
    }
    const rootFrame = stack[0];
    rootFrame.state = {
      screenId: snapshot.screenId,
      screenTitle: snapshot.screenTitle,
      structureHash: hashUiStructure(snapshot.uiTree),
    };
    rootFrame.appId = snapshot.appId ?? rootFrame.appId ?? targetAppId;
    rootFrame.isExternalApp = false;
    rootFrame.depth = 0;
    rootFrame.path = [];
    rootFrame.elementIndex = 0;
    rootFrame.elements = [];
    return rootFrame;
  }

  return undefined;
}
